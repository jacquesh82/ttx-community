"""WebSocket manager for real-time notifications."""
import asyncio
import json
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set
from fastapi import WebSocket
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Event, EventType


class ConnectionManager:
    """Manages WebSocket connections per exercise."""
    
    def __init__(self):
        # (tenant_id, exercise_id) -> set of WebSocket connections
        self._connections: Dict[tuple[int | None, int], Set[WebSocket]] = {}
        # user_id -> set of WebSocket connections (for user-specific messages)
        self._user_connections: Dict[int, Set[WebSocket]] = {}
        # (tenant_id, exercise_id) -> role -> sockets
        self._exercise_roles: Dict[tuple[int | None, int], Dict[str, Set[WebSocket]]] = {}
        # (tenant_id, exercise_id) -> team_id -> sockets
        self._exercise_teams: Dict[tuple[int | None, int], Dict[int, Set[WebSocket]]] = {}

    def _exercise_key(self, exercise_id: int, tenant_id: int | None = None) -> tuple[int | None, int]:
        return (tenant_id, exercise_id)

    def _matching_exercise_keys(self, exercise_id: int, tenant_id: int | None = None) -> list[tuple[int | None, int]]:
        if tenant_id is not None:
            return [self._exercise_key(exercise_id, tenant_id)]
        return [key for key in self._connections.keys() if key[1] == exercise_id]
    
    async def connect(
        self,
        websocket: WebSocket,
        exercise_id: int,
        user_id: Optional[int] = None,
        role: Optional[str] = None,
        team_id: Optional[int] = None,
        tenant_id: Optional[int] = None,
    ):
        """Accept and register a WebSocket connection."""
        await websocket.accept()

        key = self._exercise_key(exercise_id, tenant_id)
        self._connections.setdefault(key, set()).add(websocket)
        
        if user_id is not None:
            self._user_connections.setdefault(user_id, set()).add(websocket)
        if role:
            self._exercise_roles.setdefault(key, {}).setdefault(role, set()).add(websocket)
        if team_id is not None:
            self._exercise_teams.setdefault(key, {}).setdefault(team_id, set()).add(websocket)
    
    def disconnect(
        self,
        websocket: WebSocket,
        exercise_id: int,
        user_id: Optional[int] = None,
        role: Optional[str] = None,
        team_id: Optional[int] = None,
        tenant_id: Optional[int] = None,
    ):
        """Remove a WebSocket connection."""
        key = self._exercise_key(exercise_id, tenant_id)
        if key in self._connections:
            self._connections[key].discard(websocket)
            if not self._connections[key]:
                del self._connections[key]
        
        if user_id is not None and user_id in self._user_connections:
            self._user_connections[user_id].discard(websocket)
            if not self._user_connections[user_id]:
                del self._user_connections[user_id]

        if role and key in self._exercise_roles:
            self._exercise_roles[key].get(role, set()).discard(websocket)
            if role in self._exercise_roles.get(key, {}) and not self._exercise_roles[key][role]:
                del self._exercise_roles[key][role]
            if key in self._exercise_roles and not self._exercise_roles[key]:
                del self._exercise_roles[key]

        if team_id is not None and key in self._exercise_teams:
            self._exercise_teams[key].get(team_id, set()).discard(websocket)
            if team_id in self._exercise_teams.get(key, {}) and not self._exercise_teams[key][team_id]:
                del self._exercise_teams[key][team_id]
            if key in self._exercise_teams and not self._exercise_teams[key]:
                del self._exercise_teams[key]
    
    async def broadcast_to_exercise(self, exercise_id: int, message: dict, tenant_id: int | None = None):
        """Broadcast a message to all connections for an exercise."""
        for key in self._matching_exercise_keys(exercise_id, tenant_id):
            sockets = self._connections.get(key)
            if sockets:
                await self._send_to_set(sockets, message)
    
    async def send_to_user(self, user_id: int, message: dict):
        """Send a message to all connections of a specific user."""
        if user_id not in self._user_connections:
            return

        await self._send_to_set(self._user_connections[user_id], message)

    async def broadcast_to_audience(
        self,
        exercise_id: int,
        audiences: Optional[List[dict]],
        message: dict,
        fallback_all: bool = True,
        tenant_id: int | None = None,
    ):
        """Broadcast a message filtered by audience; fallback to all if requested."""
        if not audiences:
            if fallback_all:
                await self.broadcast_to_exercise(exercise_id, message, tenant_id=tenant_id)
            return

        target_sockets: Set[WebSocket] = set()

        key = self._exercise_key(exercise_id, tenant_id)
        role_map = self._exercise_roles.get(key, {})
        team_map = self._exercise_teams.get(key, {})

        for aud in audiences:
            kind = aud.get("kind")
            value = aud.get("value")
            if not kind or value is None:
                continue
            if kind == "role":
                sockets = role_map.get(str(value), set())
                target_sockets.update(sockets)
            elif kind == "team":
                try:
                    team_id = int(value)
                except (TypeError, ValueError):
                    continue
                sockets = team_map.get(team_id, set())
                target_sockets.update(sockets)
            elif kind == "user":
                try:
                    user_id = int(value)
                except (TypeError, ValueError):
                    continue
                sockets = self._user_connections.get(user_id, set())
                target_sockets.update(sockets)
            elif kind == "tag":
                # Tags not yet implemented; ignore.
                continue

        if target_sockets:
            await self._send_to_set(target_sockets, message)
        elif fallback_all:
            await self.broadcast_to_exercise(exercise_id, message, tenant_id=tenant_id)

    async def broadcast_inject_sent(
        self,
        exercise_id: int,
        inject_data: dict,
        audiences: Optional[List[dict]] = None,
        tenant_id: int | None = None,
    ):
        """Broadcast an inject notification."""
        message = {
            "type": "inject:sent",
            "exercise_id": exercise_id,
            "data": inject_data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        await self.broadcast_to_audience(exercise_id, audiences, message, fallback_all=True, tenant_id=tenant_id)

    async def broadcast_inject_created(
        self,
        exercise_id: int,
        inject_data: dict,
        audiences: Optional[List[dict]] = None,
        tenant_id: int | None = None,
    ):
        """Broadcast an inject creation notification."""
        message = {
            "type": "inject:created",
            "exercise_id": exercise_id,
            "data": inject_data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await self.broadcast_to_audience(exercise_id, audiences, message, fallback_all=True, tenant_id=tenant_id)
    
    async def broadcast_event(
        self,
        exercise_id: int,
        event: Event,
        audiences: Optional[List[dict]] = None,
        tenant_id: int | None = None,
    ):
        """Broadcast an event to the exercise."""
        message = {
            "type": "event:new",
            "exercise_id": exercise_id,
            "data": {
                "id": event.id,
                "type": event.type.value,
                "entity_type": event.entity_type,
                "entity_id": event.entity_id,
                "actor_type": event.actor_type.value,
                "actor_label": event.actor_label,
                "payload": event.payload,
                "ts": event.ts.isoformat() if event.ts else None,
                "exercise_time": event.exercise_time.isoformat() if event.exercise_time else None,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        audiences_payload = audiences
        if audiences_payload is None and hasattr(event, "audiences") and event.audiences is not None:
            audiences_payload = [{"kind": a.kind.value, "value": a.value} for a in event.audiences]
        await self.broadcast_to_audience(
            exercise_id,
            audiences_payload,
            message,
            fallback_all=True,
            tenant_id=tenant_id,
        )
    
    async def broadcast_exercise_state(self, exercise_id: int, state: str, data: dict = None, tenant_id: int | None = None):
        """Broadcast exercise state change."""
        message = {
            "type": f"exercise:{state}",
            "exercise_id": exercise_id,
            "data": data or {},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await self.broadcast_to_exercise(exercise_id, message, tenant_id=tenant_id)
    
    def get_exercise_connection_count(self, exercise_id: int, tenant_id: int | None = None) -> int:
        """Get the number of connections for an exercise."""
        if tenant_id is not None:
            return len(self._connections.get(self._exercise_key(exercise_id, tenant_id), set()))
        return sum(len(sockets) for key, sockets in self._connections.items() if key[1] == exercise_id)

    async def _send_to_set(self, sockets: Set[WebSocket], message: dict):
        """Send to a set of sockets with cleanup."""
        disconnected = set()
        for websocket in list(sockets):
            try:
                await websocket.send_json(message)
            except Exception:
                disconnected.add(websocket)
        for ws in disconnected:
            sockets.discard(ws)


# Global instance
ws_manager = ConnectionManager()
