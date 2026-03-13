"""Inject scheduler for automatic delivery during exercises."""
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional, Set
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models import Inject, Delivery, Exercise, Event, Decision, InjectTriggerRule, ExerciseUser, ExerciseTeam
from app.models.inject import InjectStatus, InjectType, DeliveryStatus, AudienceKind
from app.models.exercise import ExerciseStatus
from app.models.event import EventType, EventActorType, EventAudience
from app.models.exercise_user import ExerciseRole
from app.models.crisis_management import TriggerMode
from app.services.websocket_manager import ws_manager


class InjectScheduler:
    """Manages scheduled inject delivery for running exercises."""
    
    def __init__(self):
        # exercise_id -> asyncio.Task
        self._tasks: Dict[int, asyncio.Task] = {}
        # exercise_id -> set of inject_ids already scheduled
        self._scheduled_injects: Dict[int, Set[int]] = {}
    
    async def start_exercise_scheduler(self, exercise_id: int):
        """Start the scheduler for an exercise."""
        if exercise_id in self._tasks:
            return  # Already running
        
        self._scheduled_injects[exercise_id] = set()
        task = asyncio.create_task(self._run_scheduler(exercise_id))
        self._tasks[exercise_id] = task
    
    async def stop_exercise_scheduler(self, exercise_id: int):
        """Stop the scheduler for an exercise."""
        if exercise_id in self._tasks:
            self._tasks[exercise_id].cancel()
            try:
                await self._tasks[exercise_id]
            except asyncio.CancelledError:
                pass
            del self._tasks[exercise_id]
        
        if exercise_id in self._scheduled_injects:
            del self._scheduled_injects[exercise_id]
    
    async def _run_scheduler(self, exercise_id: int):
        """Main scheduler loop for an exercise."""
        while True:
            try:
                async with async_session_factory() as db:
                    # Check if exercise is still running
                    result = await db.execute(
                        select(Exercise).where(Exercise.id == exercise_id)
                    )
                    exercise = result.scalar_one_or_none()
                    
                    if not exercise or exercise.status != ExerciseStatus.RUNNING:
                        break
                    
                    # Calculate exercise time
                    now = datetime.now(timezone.utc)
                    elapsed = now - exercise.started_at
                    time_multiplier = float(exercise.time_multiplier)
                    exercise_minutes = (elapsed.total_seconds() / 60) * time_multiplier
                    
                    # Find injects that should be sent
                    await self._process_pending_injects(db, exercise, exercise_minutes)
                    
                    await db.commit()
                
                # Check every second
                await asyncio.sleep(1)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Scheduler error for exercise {exercise_id}: {e}")
                await asyncio.sleep(5)  # Wait before retrying
        
        # Cleanup
        if exercise_id in self._tasks:
            del self._tasks[exercise_id]
        if exercise_id in self._scheduled_injects:
            del self._scheduled_injects[exercise_id]
    
    async def _process_pending_injects(self, db: AsyncSession, exercise: Exercise, exercise_minutes: float):
        """Process injects that should be sent based on trigger rules."""
        exercise_id = exercise.id

        result = await db.execute(
            select(Inject).where(
                Inject.exercise_id == exercise_id,
                Inject.status == InjectStatus.DRAFT,
            )
        )
        injects = result.scalars().all()

        rules_result = await db.execute(
            select(InjectTriggerRule).where(InjectTriggerRule.exercise_id == exercise_id)
        )
        rules_by_inject = {r.inject_id: r for r in rules_result.scalars().all()}

        for inject in injects:
            if inject.id not in self._scheduled_injects.get(exercise_id, set()):
                rule = rules_by_inject.get(inject.id)
                if await self._should_send_inject(db, exercise, inject, rule, exercise_minutes):
                    await self._send_inject(db, exercise, inject)

    async def _should_send_inject(
        self,
        db: AsyncSession,
        exercise: Exercise,
        inject: Inject,
        rule: Optional[InjectTriggerRule],
        exercise_minutes: float,
    ) -> bool:
        """Evaluate whether an inject should be sent now."""
        now = datetime.now(timezone.utc)
        if not rule:
            if inject.time_offset is not None:
                return inject.time_offset <= int(exercise_minutes)
            if inject.scheduled_at is not None:
                return inject.scheduled_at <= now
            return False

        if rule.trigger_mode == TriggerMode.MANUAL:
            return False

        if rule.trigger_mode == TriggerMode.AUTO:
            if inject.time_offset is not None:
                return inject.time_offset <= int(exercise_minutes)
            if inject.scheduled_at is not None:
                return inject.scheduled_at <= now
            return False

        expression = rule.expression or {}
        return await self._evaluate_condition_expression(db, exercise.id, expression)

    async def _evaluate_condition_expression(self, db: AsyncSession, exercise_id: int, expression: dict) -> bool:
        """Evaluate simple JSON condition expressions for conditional triggers."""
        metric = expression.get("metric")
        op = expression.get("op", ">=")
        value = expression.get("value", 1)

        current_value = 0
        if metric == "decisions_count":
            current_value = (
                await db.execute(select(func.count(Decision.id)).where(Decision.exercise_id == exercise_id))
            ).scalar() or 0
        elif metric == "sent_injects_count":
            current_value = (
                await db.execute(
                    select(func.count(Inject.id)).where(Inject.exercise_id == exercise_id, Inject.status == InjectStatus.SENT)
                )
            ).scalar() or 0
        elif metric == "treated_deliveries_count":
            current_value = (
                await db.execute(
                    select(func.count(Delivery.id))
                    .join(Inject, Inject.id == Delivery.inject_id)
                    .where(Inject.exercise_id == exercise_id, Delivery.status == DeliveryStatus.TREATED)
                )
            ).scalar() or 0
        elif metric == "event_count":
            event_type = expression.get("event_type")
            query = select(func.count(Event.id)).where(Event.exercise_id == exercise_id)
            if event_type:
                try:
                    query = query.where(Event.type == EventType(event_type))
                except ValueError:
                    return False
            current_value = (await db.execute(query)).scalar() or 0
        else:
            return False

        if op == ">=":
            return current_value >= value
        if op == ">":
            return current_value > value
        if op == "==":
            return current_value == value
        if op == "<=":
            return current_value <= value
        if op == "<":
            return current_value < value
        return False
    
    async def _send_inject(self, db: AsyncSession, exercise: Exercise, inject: Inject):
        """Send an inject and create deliveries."""
        exercise_id = exercise.id
        now = datetime.now(timezone.utc)
        
        # Update inject status
        inject.status = InjectStatus.SENT
        inject.sent_at = now
        
        # Calculate scheduled_at from time_offset if not set
        if inject.time_offset is not None and not inject.scheduled_at:
            time_multiplier = float(exercise.time_multiplier)
            offset_seconds = inject.time_offset * 60 * time_multiplier
            inject.scheduled_at = exercise.started_at + timedelta(seconds=offset_seconds)
        
        # Create deliveries based on audiences (fallback to all teams)
        deliveries = inject.deliveries
        if not deliveries:
            team_ids, user_ids = await self._compute_delivery_targets(db, exercise_id, inject.audiences)
            if not team_ids and not user_ids:
                teams_result = await db.execute(
                    select(ExerciseTeam).where(ExerciseTeam.exercise_id == exercise_id)
                )
                team_ids = {et.team_id for et in teams_result.scalars().all()}

            for team_id in team_ids:
                db.add(
                    Delivery(
                        inject_id=inject.id,
                        target_team_id=team_id,
                        status=DeliveryStatus.DELIVERED,
                        delivered_at=now,
                    )
                )
            for user_id in user_ids:
                db.add(
                    Delivery(
                        inject_id=inject.id,
                        target_user_id=user_id,
                        status=DeliveryStatus.DELIVERED,
                        delivered_at=now,
                    )
                )
            await db.flush()
        
        # Create event
        event = Event(
            exercise_id=exercise_id,
            type=EventType.INJECT_SENT,
            entity_type="inject",
            entity_id=inject.id,
            actor_type=EventActorType.SYSTEM,
            payload={
                "inject_id": inject.id,
                "inject_type": inject.type.value,
                "title": inject.title,
                "time_offset": inject.time_offset,
            }
        )
        db.add(event)
        await db.flush()

        # Mirror inject audiences to event audiences
        for aud in inject.audiences or []:
            db.add(EventAudience(event_id=event.id, kind=aud.kind, value=aud.value))
        
        # Mark as scheduled to avoid duplicate sends
        if exercise_id not in self._scheduled_injects:
            self._scheduled_injects[exercise_id] = set()
        self._scheduled_injects[exercise_id].add(inject.id)
        
        # Broadcast via WebSocket
        await ws_manager.broadcast_inject_sent(
            exercise_id=exercise_id,
            inject_data={
                "id": inject.id,
                "type": inject.type.value,
                "title": inject.title,
                "description": inject.description,
                "content": inject.content,
                "time_offset": inject.time_offset,
                "sent_at": inject.sent_at.isoformat(),
            },
            audiences=[{"kind": aud.kind.value, "value": aud.value} for aud in inject.audiences] if inject.audiences else None,
        )
        
        print(f"[Scheduler] Sent inject {inject.id} '{inject.title}' for exercise {exercise_id} at T+{inject.time_offset}min")
    
    async def _compute_delivery_targets(self, db: AsyncSession, exercise_id: int, audiences):
        """Compute target team_ids and user_ids based on audiences."""
        team_ids: set[int] = set()
        user_ids: set[int] = set()

        if not audiences:
            return team_ids, user_ids

        for aud in audiences:
            if aud.kind == AudienceKind.TEAM:
                try:
                    team_ids.add(int(aud.value))
                except (TypeError, ValueError):
                    continue
            elif aud.kind == AudienceKind.USER:
                try:
                    user_ids.add(int(aud.value))
                except (TypeError, ValueError):
                    continue
            elif aud.kind == AudienceKind.ROLE:
                role_val = str(aud.value)
                if role_val in (ExerciseRole.JOUEUR.value, "participant"):
                    result = await db.execute(
                        select(ExerciseUser).where(
                            ExerciseUser.exercise_id == exercise_id,
                            ExerciseUser.role == ExerciseRole.JOUEUR,
                        )
                    )
                    for eu in result.scalars().all():
                        if eu.team_id:
                            team_ids.add(eu.team_id)
                        else:
                            user_ids.add(eu.user_id)
                elif role_val == ExerciseRole.ANIMATEUR.value:
                    continue
                elif role_val == ExerciseRole.OBSERVATEUR.value:
                    continue
            elif aud.kind == AudienceKind.TAG:
                continue
        return team_ids, user_ids

    def is_running(self, exercise_id: int) -> bool:
        """Check if scheduler is running for an exercise."""
        return exercise_id in self._tasks


# Global instance
inject_scheduler = InjectScheduler()
