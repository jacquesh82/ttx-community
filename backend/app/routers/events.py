"""Events router – unified timeline of all exercise activity in CrisisLab."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
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
    """Single timeline event recorded during a CrisisLab exercise."""
    id: int = Field(description="Unique event identifier", examples=[42])
    exercise_id: int = Field(description="Exercise this event belongs to", examples=[1])
    type: EventType = Field(
        description="Category of the event (exercise lifecycle, inject, mail, etc.)",
        examples=["inject_sent"],
    )
    entity_type: Optional[str] = Field(
        default=None,
        description="Type of the domain object involved (e.g. injects, mails)",
        examples=["injects"],
    )
    entity_id: Optional[int] = Field(
        default=None,
        description="ID of the domain object involved",
        examples=[5],
    )
    actor_type: EventActorType = Field(
        description="Who or what triggered the event",
        examples=["user"],
    )
    actor_id: Optional[int] = Field(
        default=None,
        description="ID of the acting user (null for system events)",
        examples=[3],
    )
    actor_label: Optional[str] = Field(
        default=None,
        description="Human-readable label for the actor",
        examples=["Marie Laurent (animateur)"],
    )
    payload: Optional[dict] = Field(
        default=None,
        description="Arbitrary JSON payload with event-specific details",
        examples=[{"inject_title": "Alerte ransomware CYBER-STORM 2024", "channel": "mail"}],
    )
    ts: datetime = Field(description="Wall-clock timestamp when the event was recorded")
    exercise_time: Optional[datetime] = Field(
        default=None,
        description="In-exercise simulated time (may differ from wall-clock during accelerated play)",
    )

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "id": 42,
                "exercise_id": 1,
                "type": "inject_sent",
                "entity_type": "injects",
                "entity_id": 5,
                "actor_type": "user",
                "actor_id": 3,
                "actor_label": "Marie Laurent (animateur)",
                "payload": {
                    "inject_title": "Alerte ransomware CYBER-STORM 2024",
                    "channel": "mail",
                },
                "ts": "2024-11-14T10:32:00Z",
                "exercise_time": "2024-11-14T10:32:00Z",
            }
        },
    }


class EventListResponse(BaseModel):
    """Paginated list of timeline events."""
    events: list[EventResponse]
    total: int = Field(description="Total events matching the query", examples=[128])
    page: int = Field(description="Current page number (1-based)", examples=[1])
    page_size: int = Field(description="Maximum items per page", examples=[50])


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
    """List timeline events across exercises in the current tenant.

    Returns a reverse-chronological paginated list. Supports filtering by:
    - `exercise_id` – restrict to a single exercise
    - `type` – event category (e.g. `inject_sent`, `exercise_started`)
    - `entity_type` / `entity_id` – events related to a specific domain object
    - `since` – only events after this ISO-8601 timestamp (useful for polling)

    **Auth:** any authenticated user.
    """
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
    """Retrieve a single timeline event by its ID.

    Returns the full event payload including actor details and simulated
    exercise time.

    **Auth:** any authenticated user.
    """
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
