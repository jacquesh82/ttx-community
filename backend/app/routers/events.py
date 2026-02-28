"""Events router for timeline."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.models import Event, Exercise
from app.models.event import EventType, EventActorType
from app.routers.auth import require_auth
from app.utils.tenancy import TenantRequestContext, require_tenant_context

router = APIRouter()


async def _ensure_exercise_in_tenant(
    db: AsyncSession,
    exercise_id: int,
    tenant_id: int,
) -> None:
    result = await db.execute(
        select(Exercise.id).where(
            Exercise.id == exercise_id,
            Exercise.tenant_id == tenant_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Exercise not found")


# Schemas
class EventResponse(BaseModel):
    """Schema for event response."""
    id: int
    exercise_id: int
    type: EventType
    entity_type: Optional[str]
    entity_id: Optional[int]
    actor_type: EventActorType
    actor_id: Optional[int]
    actor_label: Optional[str]
    payload: Optional[dict]
    ts: datetime
    exercise_time: Optional[datetime]

    model_config = {"from_attributes": True}


class EventListResponse(BaseModel):
    """Schema for list of events."""
    events: list[EventResponse]
    total: int
    page: int
    page_size: int


@router.get("", response_model=EventListResponse)
async def list_events(
    exercise_id: Optional[int] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    type: Optional[EventType] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    since: Optional[datetime] = None,
    _: any = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """List events for timeline."""
    query = select(Event).join(Exercise, Exercise.id == Event.exercise_id).where(
        Exercise.tenant_id == tenant_ctx.tenant.id
    )
    count_query = select(func.count(Event.id)).join(Exercise, Exercise.id == Event.exercise_id).where(
        Exercise.tenant_id == tenant_ctx.tenant.id
    )
    
    if exercise_id:
        await _ensure_exercise_in_tenant(db, exercise_id, tenant_ctx.tenant.id)
        query = query.where(Event.exercise_id == exercise_id)
        count_query = count_query.where(Event.exercise_id == exercise_id)
    if type:
        query = query.where(Event.type == type)
        count_query = count_query.where(Event.type == type)
    if entity_type:
        query = query.where(Event.entity_type == entity_type)
        count_query = count_query.where(Event.entity_type == entity_type)
    if entity_id:
        query = query.where(Event.entity_id == entity_id)
        count_query = count_query.where(Event.entity_id == entity_id)
    if since:
        query = query.where(Event.ts > since)
        count_query = count_query.where(Event.ts > since)
    
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    offset = (page - 1) * page_size
    query = query.order_by(Event.ts.desc()).offset(offset).limit(page_size)
    
    result = await db.execute(query)
    events = result.scalars().all()
    
    return EventListResponse(
        events=[EventResponse.model_validate(e) for e in events],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{event_id}", response_model=EventResponse)
async def get_event(
    event_id: int,
    _: any = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Get an event by ID."""
    result = await db.execute(
        select(Event)
        .join(Exercise, Exercise.id == Event.exercise_id)
        .where(
            Event.id == event_id,
            Exercise.tenant_id == tenant_ctx.tenant.id,
        )
    )
    event = result.scalar_one_or_none()
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    return EventResponse.model_validate(event)


# Service function for creating events
async def create_event(
    db: AsyncSession,
    exercise_id: int,
    event_type: EventType,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    actor_type: EventActorType = EventActorType.SYSTEM,
    actor_id: Optional[int] = None,
    actor_label: Optional[str] = None,
    payload: Optional[dict] = None,
    exercise_time: Optional[datetime] = None,
) -> Event:
    """Create an event and add it to the timeline."""
    event = Event(
        exercise_id=exercise_id,
        type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_type=actor_type,
        actor_id=actor_id,
        actor_label=actor_label,
        payload=payload,
        exercise_time=exercise_time,
    )
    db.add(event)
    await db.flush()
    return event
