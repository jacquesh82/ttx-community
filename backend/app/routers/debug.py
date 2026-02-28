"""Debug router for development testing - DISABLED IN PRODUCTION."""
import os
import asyncio
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.models import Exercise, Inject, WsAuthTicketScope
from app.routers.auth import authenticate_ws_with_ticket
from app.utils.tenancy import current_tenant_id_var

# Only enable in development mode
DEBUG_ENABLED = os.getenv("ENVIRONMENT", "development").lower() in ("development", "dev", "local")

router = APIRouter(prefix="/debug", tags=["debug"])


# Schemas
class DebugExerciseSummary(BaseModel):
    id: int
    name: str
    status: str
    created_at: str

    class Config:
        from_attributes = True


class DebugInjectSummary(BaseModel):
    id: int
    title: str
    type: str
    status: str
    time_offset: Optional[int] = None
    duration_min: Optional[int] = None
    description: Optional[str] = None
    content: Optional[dict] = None
    timeline_type: Optional[str] = None
    audiences: List[dict] = []

    class Config:
        from_attributes = True


class DebugTimelineResponse(BaseModel):
    exercise_id: int
    exercise_name: str
    injects: List[DebugInjectSummary]


class DebugEventMessage(BaseModel):
    type: str
    exercise_id: int
    virtual_time: float
    event: Optional[dict] = None
    timestamp: str


# WebSocket connection manager for debug
class DebugConnectionManager:
    def __init__(self):
        self._connections: List[WebSocket] = []
        self._metadata: dict = {}  # websocket -> {"team_id": str|None, "role": str|None}

    async def connect(self, websocket: WebSocket, team_id: Optional[str] = None, role: Optional[str] = None):
        await websocket.accept()
        self._connections.append(websocket)
        self._metadata[id(websocket)] = {"team_id": team_id, "role": role}
        print(f"[Debug WS] Connected (team_id={team_id}, role={role}). Total: {len(self._connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self._connections:
            self._connections.remove(websocket)
        self._metadata.pop(id(websocket), None)
        print(f"[Debug WS] Disconnected. Total connections: {len(self._connections)}")

    async def broadcast(self, message: dict):
        disconnected = []
        for websocket in self._connections:
            try:
                await websocket.send_json(message)
            except Exception as e:
                print(f"[Debug WS] Error sending: {e}")
                disconnected.append(websocket)
        for ws in disconnected:
            self.disconnect(ws)

    async def broadcast_targeted(self, message: dict, audiences: Optional[List[dict]]):
        """Filter by team/role if audiences provided, otherwise broadcast to all."""
        if not audiences:
            await self.broadcast(message)
            return

        targets = []
        for ws in self._connections:
            meta = self._metadata.get(id(ws), {})
            for aud in audiences:
                kind = aud.get("kind")
                value = str(aud.get("value", ""))
                if kind == "team" and meta.get("team_id") == value:
                    targets.append(ws)
                    break
                elif kind == "role" and meta.get("role") == value:
                    targets.append(ws)
                    break
                elif kind == "user":
                    # No user_id tracking in debug → include to be safe
                    targets.append(ws)
                    break

        # Fallback: if no targeted match found, broadcast to all
        send_list = targets if targets else self._connections
        disconnected = []
        for ws in send_list:
            try:
                await ws.send_json(message)
            except Exception as e:
                print(f"[Debug WS] Error sending targeted: {e}")
                disconnected.append(ws)
        for ws in disconnected:
            self.disconnect(ws)

    def get_connection_count(self) -> int:
        return len(self._connections)


# Global instance
debug_ws_manager = DebugConnectionManager()


def check_debug_enabled():
    """Raise 404 if debug endpoints are disabled (production)."""
    if not DEBUG_ENABLED:
        raise HTTPException(status_code=404, detail="Debug endpoints disabled in production")


@router.get("/exercises", response_model=List[DebugExerciseSummary])
async def list_exercises():
    """List exercises for the current tenant (debug purposes)."""
    check_debug_enabled()

    async for db in get_db_session():
        query = select(Exercise).order_by(Exercise.created_at.desc()).limit(50)
        tenant_id = current_tenant_id_var.get()
        if tenant_id is not None:
            query = query.where(Exercise.tenant_id == tenant_id)
        result = await db.execute(query)
        exercises = result.scalars().all()

        return [
            DebugExerciseSummary(
                id=e.id,
                name=e.name,
                status=e.status.value if hasattr(e.status, 'value') else str(e.status),
                created_at=e.created_at.isoformat() if e.created_at else "",
            )
            for e in exercises
        ]

    return []


@router.get("/exercises/{exercise_id}/timeline", response_model=DebugTimelineResponse)
async def get_exercise_timeline(exercise_id: int):
    """Get the timeline (injects) for an exercise."""
    check_debug_enabled()
    
    async for db in get_db_session():
        # Get exercise
        query = select(Exercise).where(Exercise.id == exercise_id)
        tenant_id = current_tenant_id_var.get()
        if tenant_id is not None:
            query = query.where(Exercise.tenant_id == tenant_id)
        result = await db.execute(query)
        exercise = result.scalar_one_or_none()
        
        if not exercise:
            raise HTTPException(status_code=404, detail="Exercise not found")
        
        # Get injects ordered by time_offset (with audiences eagerly loaded)
        result = await db.execute(
            select(Inject)
            .options(selectinload(Inject.audiences))
            .where(Inject.exercise_id == exercise_id)
            .order_by(Inject.time_offset.asc())
        )
        injects = result.scalars().all()

        return DebugTimelineResponse(
            exercise_id=exercise.id,
            exercise_name=exercise.name,
            injects=[
                DebugInjectSummary(
                    id=i.id,
                    title=i.title,
                    type=i.type.value if hasattr(i.type, 'value') else str(i.type),
                    status=i.status.value if hasattr(i.status, 'value') else str(i.status),
                    time_offset=i.time_offset,
                    duration_min=i.duration_min,
                    description=i.description,
                    content=i.content,
                    timeline_type=i.timeline_type,
                    audiences=[{"kind": a.kind.value, "value": a.value} for a in (i.audiences or [])],
                )
                for i in injects
            ]
        )
    
    raise HTTPException(status_code=404, detail="Database session error")


@router.get("/status")
async def get_debug_status():
    """Check if debug mode is enabled."""
    return {
        "enabled": DEBUG_ENABLED,
        "environment": os.getenv("ENVIRONMENT", "development"),
        "ws_connections": debug_ws_manager.get_connection_count(),
    }


@router.websocket("/ws/events")
async def debug_events_websocket(
    websocket: WebSocket,
    ticket: str = Query(...),
    team_id: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
):
    """WebSocket endpoint for debug events broadcast.

    - Emitter connects and sends events
    - Receivers connect and receive events
    - Optional team_id / role query params tag the connection for audience-aware filtering
    """
    if not DEBUG_ENABLED:
        await websocket.close(code=4004, reason="Debug disabled in production")
        return

    try:
        await authenticate_ws_with_ticket(
            websocket=websocket,
            ticket_id=ticket,
            expected_scope=WsAuthTicketScope.DEBUG_EVENTS,
            expected_exercise_id=None,
        )
    except HTTPException:
        return

    await debug_ws_manager.connect(websocket, team_id=team_id, role=role)

    try:
        # Send connection confirmation with identity echo
        await websocket.send_json({
            "type": "connected",
            "message": "Connected to debug events stream",
            "identity": {"team_id": team_id, "role": role},
            "client_count": debug_ws_manager.get_connection_count(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        while True:
            try:
                # Wait for messages from client
                data = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=30.0
                )

                # Handle different message types
                msg_type = data.get("type")

                if msg_type == "ping":
                    await websocket.send_json({
                        "type": "pong",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

                elif msg_type == "event":
                    # Broadcast event with audience-aware filtering
                    event_data = data.get("event", {})
                    audiences = event_data.get("audiences") or None
                    await debug_ws_manager.broadcast_targeted(
                        {
                            "type": "event",
                            "exercise_id": data.get("exercise_id"),
                            "virtual_time": data.get("virtual_time"),
                            "event": event_data,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        },
                        audiences if audiences else None,
                    )

                elif msg_type == "state_update":
                    # State updates always go to all clients (no audience filter)
                    await debug_ws_manager.broadcast({
                        "type": "state_update",
                        "exercise_id": data.get("exercise_id"),
                        "state": data.get("state"),
                        "virtual_time": data.get("virtual_time"),
                        "speed": data.get("speed"),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

            except asyncio.TimeoutError:
                # Send ping to keep connection alive
                try:
                    await websocket.send_json({
                        "type": "ping",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                except Exception:
                    break

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[Debug WS] Error: {e}")
    finally:
        debug_ws_manager.disconnect(websocket)
