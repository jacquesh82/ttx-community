"""WebSocket router for real-time communication."""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Query
from sqlalchemy import select

from app.database import get_db_session
from app.models import Exercise, ExerciseUser, ExerciseRole, UserRole, WsAuthTicketScope
from app.models.exercise import ExerciseStatus
from app.services.websocket_manager import ws_manager
from app.routers.auth import authenticate_ws_with_ticket

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/exercise/{exercise_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    exercise_id: int,
    ticket: str = Query(...),
):
    """WebSocket endpoint for real-time exercise updates.
    
    Query params:
    - ticket: short-lived WS auth ticket
    
    The connection receives messages of types:
    - inject:sent - An inject was sent
    - inject:received - An inject was received by the user
    - event:new - A new event in the timeline
    - exercise:started - Exercise started
    - exercise:paused - Exercise paused
    - exercise:ended - Exercise ended
    """
    try:
        tenant_ctx, _session, user = await authenticate_ws_with_ticket(
            websocket=websocket,
            ticket_id=ticket,
            expected_scope=WsAuthTicketScope.EXERCISE_UPDATES,
            expected_exercise_id=exercise_id,
        )
    except HTTPException:
        return
    
    # Verify exercise exists and user has access
    exercise_user = None
    team_id = None
    role_value = None

    async for db in get_db_session():
        result = await db.execute(
            select(Exercise).where(
                Exercise.id == exercise_id,
                Exercise.tenant_id == tenant_ctx.tenant.id,
            )
        )
        exercise = result.scalar_one_or_none()
        
        if not exercise:
            await websocket.close(code=4004, reason="Exercise not found")
            return
        
        # Check if user is assigned to this exercise
        eu_result = await db.execute(
            select(ExerciseUser).where(
                ExerciseUser.exercise_id == exercise_id,
                ExerciseUser.user_id == user.id
            )
        )
        exercise_user = eu_result.scalar_one_or_none()
        if exercise_user:
            team_id = exercise_user.team_id
            role_value = exercise_user.role.value
        else:
            # Fallback to global role for admins/animateurs/observateurs
            if user.role in (UserRole.ADMIN, UserRole.ANIMATEUR):
                role_value = ExerciseRole.ANIMATEUR.value
            elif user.role == UserRole.OBSERVATEUR:
                role_value = ExerciseRole.OBSERVATEUR.value
            else:
                role_value = None
        break

    if role_value is None:
        await websocket.close(code=4003, reason="Access denied")
        return
    
    # Connect
    await ws_manager.connect(websocket, exercise_id, user.id, role_value, team_id, tenant_id=tenant_ctx.tenant.id)
    
    try:
        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connected",
            "exercise_id": exercise_id,
            "user_id": user.id,
        })
        
        # Keep connection alive and handle incoming messages
        while True:
            try:
                # Wait for any message from client (ping/pong, etc.)
                data = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=30.0
                )
                
                # Handle ping
                if data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                
            except asyncio.TimeoutError:
                # Send ping to keep connection alive
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception:
                    break
            
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        ws_manager.disconnect(websocket, exercise_id, user.id, role_value, team_id, tenant_id=tenant_ctx.tenant.id)


import asyncio  # Import here to avoid circular import issues
