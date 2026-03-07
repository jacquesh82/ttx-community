"""Injects router."""
from __future__ import annotations
import csv
import io
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db_session
from app.models import Inject, Delivery, Exercise, Team, InjectMedia, Media, ExerciseUser, ExerciseTeam, Event
from app.models.inject import (
    InjectType, InjectStatus, DeliveryStatus, TimelineType,
    InjectCategory, InjectChannel, TargetAudience, TestedCompetence, PressureLevel,
    parse_inject_type, accepted_inject_type_values, AudienceKind, InjectAudience, InjectDataFormat
)
from app.models.exercise import ExerciseStatus
from app.models.event import EventType, EventActorType, EventAudience
from app.models.exercise_user import ExerciseRole
from app.models.user import UserRole
from app.routers.auth import require_auth, require_role
from app.services.inject_bank_schema import (
    SchemaValidationException,
    get_timeline_inject_schema,
    validate_schema_payload,
)
from app.services.websocket_manager import ws_manager
from app.utils.tenancy import TenantRequestContext, require_tenant_context

router = APIRouter()

INJECT_TYPE_TO_BANK_KIND: dict[str, str] = {
    "mail": "mail",
    "twitter": "social_post",
    "tv": "video",
    "decision": "scenario",
    "score": "chronogram",
    "system": "directory",
}


async def _get_exercise_in_tenant_or_404(
    db: AsyncSession,
    exercise_id: int,
    tenant_id: int,
) -> Exercise:
    result = await db.execute(
        select(Exercise).where(
            Exercise.id == exercise_id,
            Exercise.tenant_id == tenant_id,
        )
    )
    exercise = result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return exercise


async def _load_inject_with_audiences(
    db: AsyncSession,
    inject_id: int,
    *,
    tenant_id: int | None = None,
) -> Inject:
    """Reload inject with eager-loaded audiences to avoid async lazy-load during serialization."""
    query = select(Inject).options(selectinload(Inject.audiences)).where(Inject.id == inject_id)
    if tenant_id is not None:
        query = query.join(Exercise, Exercise.id == Inject.exercise_id).where(Exercise.tenant_id == tenant_id)
    result = await db.execute(query)
    inject = result.scalar_one_or_none()
    if not inject:
        raise HTTPException(status_code=404, detail="Inject not found")
    return inject


async def _get_inject_in_tenant_or_404(
    db: AsyncSession,
    inject_id: int,
    tenant_id: int,
    *,
    with_audiences: bool = False,
) -> Inject:
    if with_audiences:
        return await _load_inject_with_audiences(db, inject_id, tenant_id=tenant_id)
    result = await db.execute(
        select(Inject)
        .join(Exercise, Exercise.id == Inject.exercise_id)
        .where(
            Inject.id == inject_id,
            Exercise.tenant_id == tenant_id,
        )
    )
    inject = result.scalar_one_or_none()
    if not inject:
        raise HTTPException(status_code=404, detail="Inject not found")
    return inject


async def _get_media_in_tenant_or_404(
    db: AsyncSession,
    media_id: int,
    tenant_id: int,
) -> Media:
    result = await db.execute(
        select(Media).where(
            Media.id == media_id,
            Media.tenant_id == tenant_id,
        )
    )
    media = result.scalar_one_or_none()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    return media


async def _replace_inject_audiences(db: AsyncSession, inject_id: int, audiences: list[AudienceTarget]):
    """Replace audiences for an inject."""
    await db.execute(delete(InjectAudience).where(InjectAudience.inject_id == inject_id))
    for aud in audiences:
        db.add(InjectAudience(inject_id=inject_id, kind=aud.kind, value=str(aud.value)))
    await db.flush()


async def _compute_delivery_targets(
    db: AsyncSession,
    exercise_id: int,
    audiences: list[AudienceTarget] | None,
    target_user_ids: list[int] | None = None,
    target_team_ids: list[int] | None = None,
) -> tuple[set[int], set[int]]:
    """Compute team_ids and user_ids for deliveries based on audiences and explicit targets."""
    team_ids: set[int] = set(target_team_ids or [])
    user_ids: set[int] = set(target_user_ids or [])

    if audiences:
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
                    # informational only
                    continue
                elif role_val == ExerciseRole.OBSERVATEUR.value:
                    continue
            elif aud.kind == AudienceKind.TAG:
                # Not implemented yet
                continue

    if not team_ids and not user_ids and not audiences:
        # Fallback: all teams
        teams_result = await db.execute(
            select(ExerciseTeam).where(ExerciseTeam.exercise_id == exercise_id)
        )
        team_ids = {et.team_id for et in teams_result.scalars().all()}

    # Enforce exercise membership for explicit or audience-derived targets.
    if team_ids:
        valid_teams_result = await db.execute(
            select(ExerciseTeam.team_id).where(
                ExerciseTeam.exercise_id == exercise_id,
                ExerciseTeam.team_id.in_(team_ids),
            )
        )
        team_ids = {row[0] for row in valid_teams_result.fetchall()}
    if user_ids:
        valid_users_result = await db.execute(
            select(ExerciseUser.user_id).where(
                ExerciseUser.exercise_id == exercise_id,
                ExerciseUser.user_id.in_(user_ids),
            )
        )
        user_ids = {row[0] for row in valid_users_result.fetchall()}

    return team_ids, user_ids


def _audiences_payload(inject: Inject) -> list[dict] | None:
    return [{"kind": aud.kind.value, "value": aud.value} for aud in (inject.audiences or [])] or None


def _validate_timeline_payload_or_400(payload: dict, *, row: int | None = None) -> None:
    try:
        validate_schema_payload("timeline_inject", payload)
    except SchemaValidationException as exc:
        prefix = f"Row {row}: " if row is not None else ""
        raise HTTPException(status_code=400, detail=f"{prefix}{exc.path} - {exc.message}") from exc


def _inject_to_timeline_schema_payload(inject: Inject) -> dict:
    inject_type = inject.type.value if hasattr(inject.type, "value") else str(inject.type)
    inject_status = inject.status.value if hasattr(inject.status, "value") else str(inject.status)
    timeline_type = inject.timeline_type.value if hasattr(inject.timeline_type, "value") else str(inject.timeline_type)
    payload = {
        "exercise_id": inject.exercise_id,
        "custom_id": inject.custom_id,
        "title": inject.title,
        "type": inject_type,
        "kind": INJECT_TYPE_TO_BANK_KIND.get(inject_type, "other"),
        "status": inject_status,
        "timeline_type": timeline_type,
        "time_offset": inject.time_offset,
        "duration_min": inject.duration_min,
        "phase_id": inject.phase_id,
        "description": inject.description,
        "data_format": inject.data_format,
        "content": inject.content or {},
        "scheduled_at": inject.scheduled_at.isoformat() if inject.scheduled_at else None,
        "is_surprise": bool(getattr(inject, "is_surprise", False)),
        "audiences": _audiences_payload(inject) or [],
        "category": inject.inject_category.value if getattr(inject, "inject_category", None) else None,
        "summary": None,
        "source_url": None,
        "payload": {},
        "tags": [],
    }
    return {key: value for key, value in payload.items() if value is not None}


def _inject_create_to_timeline_schema_payload(inject_data: "InjectCreate") -> dict:
    inject_type = inject_data.type.value if hasattr(inject_data.type, "value") else str(inject_data.type)
    status_value = InjectStatus.DRAFT.value
    payload = {
        "exercise_id": inject_data.exercise_id,
        "custom_id": inject_data.custom_id,
        "title": inject_data.title,
        "type": inject_type,
        "kind": INJECT_TYPE_TO_BANK_KIND.get(inject_type, "other"),
        "status": status_value,
        "timeline_type": (inject_data.timeline_type or TimelineType.BUSINESS).value,
        "time_offset": inject_data.time_offset,
        "duration_min": inject_data.duration_min or 15,
        "phase_id": inject_data.phase_id,
        "description": inject_data.description,
        "data_format": inject_data.data_format.value if hasattr(inject_data.data_format, "value") else str(inject_data.data_format),
        "content": inject_data.content or {},
        "scheduled_at": inject_data.scheduled_at.isoformat() if inject_data.scheduled_at else None,
        "is_surprise": bool(inject_data.is_surprise or False),
        "target_user_ids": inject_data.target_user_ids or [],
        "target_team_ids": inject_data.target_team_ids or [],
        "audiences": [
            {
                "kind": aud.kind.value if hasattr(aud.kind, "value") else str(aud.kind),
                "value": str(aud.value),
            }
            for aud in (inject_data.audiences or [])
        ],
        "category": inject_data.inject_category.value if inject_data.inject_category else None,
        "summary": None,
        "source_url": None,
        "payload": {},
        "tags": [],
    }
    return {key: value for key, value in payload.items() if value is not None}


def _apply_update_payload_to_timeline_schema_payload(base_payload: dict, update_payload: dict) -> dict:
    merged = dict(base_payload)
    for field in (
        "custom_id",
        "title",
        "description",
        "data_format",
        "scheduled_at",
        "status",
        "timeline_type",
        "is_surprise",
        "time_offset",
        "duration_min",
        "phase_id",
    ):
        if field in update_payload:
            merged[field] = update_payload[field]
    if "content" in update_payload:
        merged["content"] = update_payload["content"] or {}
    if "audiences" in update_payload:
        merged["audiences"] = update_payload["audiences"] or []
    if "inject_category" in update_payload:
        merged["category"] = update_payload["inject_category"]
    return merged


async def _create_inject_created_event(
    db: AsyncSession,
    inject: Inject,
    actor_id: int | None,
    actor_label: str | None,
):
    event = Event(
        exercise_id=inject.exercise_id,
        type=EventType.INJECT_CREATED,
        entity_type="inject",
        entity_id=inject.id,
        actor_type=EventActorType.USER if actor_id else EventActorType.SYSTEM,
        actor_id=actor_id,
        actor_label=actor_label,
        payload={
            "inject_id": inject.id,
            "inject_type": inject.type.value,
            "title": inject.title,
            "time_offset": inject.time_offset,
            "is_surprise": bool(getattr(inject, "is_surprise", False)),
        },
    )
    db.add(event)
    await db.flush()
    for aud in inject.audiences or []:
        db.add(EventAudience(event_id=event.id, kind=aud.kind, value=aud.value))
    return event


async def _broadcast_inject_created(inject: Inject):
    await ws_manager.broadcast_inject_created(
        exercise_id=inject.exercise_id,
        inject_data={
            "id": inject.id,
            "type": inject.type.value,
            "title": inject.title,
            "description": inject.description,
            "content": inject.content,
            "time_offset": inject.time_offset,
            "status": inject.status.value,
            "timeline_type": inject.timeline_type.value if hasattr(inject.timeline_type, "value") else inject.timeline_type,
            "is_surprise": bool(getattr(inject, "is_surprise", False)),
            "created_at": inject.created_at.isoformat() if inject.created_at else None,
        },
        audiences=_audiences_payload(inject),
    )


async def _send_inject_now(db: AsyncSession, inject: Inject):
    if inject.status == InjectStatus.SENT:
        raise HTTPException(status_code=400, detail="Inject already sent")

    inject.status = InjectStatus.SENT
    inject.sent_at = datetime.now(timezone.utc)
    now = inject.sent_at

    deliveries_result = await db.execute(select(Delivery).where(Delivery.inject_id == inject.id))
    deliveries = deliveries_result.scalars().all()
    if not deliveries:
        team_ids, user_ids = await _compute_delivery_targets(
            db,
            exercise_id=inject.exercise_id,
            audiences=[AudienceTarget(kind=a.kind, value=a.value) for a in (inject.audiences or [])],
        )
        for team_id in team_ids:
            db.add(Delivery(inject_id=inject.id, target_team_id=team_id))
        for user_id in user_ids:
            db.add(Delivery(inject_id=inject.id, target_user_id=user_id))
        await db.flush()
        deliveries_result = await db.execute(select(Delivery).where(Delivery.inject_id == inject.id))
        deliveries = deliveries_result.scalars().all()

    for delivery in deliveries:
        delivery.status = DeliveryStatus.DELIVERED
        delivery.delivered_at = now

    event = Event(
        exercise_id=inject.exercise_id,
        type=EventType.INJECT_SENT,
        entity_type="inject",
        entity_id=inject.id,
        actor_type=EventActorType.SYSTEM,
        payload={
            "inject_id": inject.id,
            "inject_type": inject.type.value,
            "title": inject.title,
            "time_offset": inject.time_offset,
            "is_surprise": bool(getattr(inject, "is_surprise", False)),
        }
    )
    db.add(event)
    await db.flush()
    for aud in inject.audiences or []:
        db.add(EventAudience(event_id=event.id, kind=aud.kind, value=aud.value))

    await db.commit()

    await ws_manager.broadcast_inject_sent(
        exercise_id=inject.exercise_id,
        inject_data={
            "id": inject.id,
            "type": inject.type.value,
            "title": inject.title,
            "description": inject.description,
            "content": inject.content,
            "time_offset": inject.time_offset,
            "sent_at": inject.sent_at.isoformat(),
            "status": inject.status.value,
            "timeline_type": inject.timeline_type.value if hasattr(inject.timeline_type, "value") else inject.timeline_type,
            "is_surprise": bool(getattr(inject, "is_surprise", False)),
        },
        audiences=_audiences_payload(inject),
    )
    await ws_manager.broadcast_event(inject.exercise_id, event, audiences=_audiences_payload(inject))

    return {"message": "Inject sent", "sent_at": inject.sent_at}


@router.get("/types")
async def get_inject_types():
    """Get all available inject types from the enum."""
    return {"types": [t.value for t in InjectType]}


class TimelineInjectSchemaResponse(BaseModel):
    """Timeline inject JSON schema payload."""

    json_schema: dict = Field(serialization_alias="schema")
    model_config = {"populate_by_name": True}


@router.get("/schema/timeline", response_model=TimelineInjectSchemaResponse)
async def get_timeline_inject_import_schema(
    _: any = Depends(require_auth),
):
    """Return JSON schema used to validate timeline inject payloads."""
    return TimelineInjectSchemaResponse(json_schema=get_timeline_inject_schema())


# Schemas
class InjectBase(BaseModel):
    """Base inject schema."""
    title: str
    description: Optional[str] = None
    type: InjectType
    data_format: InjectDataFormat = InjectDataFormat.TEXT
    content: dict
    scheduled_at: Optional[datetime] = None

    @field_validator("type", mode="before")
    @classmethod
    def _normalize_type(cls, value):
        # Handle both string values and enum objects
        if hasattr(value, 'value'):  # It's an enum object
            return value.value
        return parse_inject_type(value)

class AudienceTarget(BaseModel):
    """Audience target for an inject/event."""
    kind: AudienceKind
    value: str | int

    @field_validator("value", mode="before")
    @classmethod
    def _stringify(cls, v):
        return str(v)

    model_config = {"from_attributes": True}


class InjectCreate(InjectBase):
    """Schema for creating an inject."""
    exercise_id: int
    custom_id: Optional[str] = None
    timeline_type: Optional[TimelineType] = TimelineType.BUSINESS
    is_surprise: Optional[bool] = False
    inject_category: Optional[InjectCategory] = None
    channel: Optional[InjectChannel] = None
    target_audience: Optional[TargetAudience] = None
    pedagogical_objective: Optional[str] = None
    tested_competence: Optional[TestedCompetence] = None
    pressure_level: Optional[PressureLevel] = None
    dependency_ids: Optional[list[int]] = None
    time_offset: Optional[int] = None  # Minutes from T+0
    duration_min: Optional[int] = 15  # Duration in minutes, default 15
    phase_id: Optional[int] = None
    target_user_ids: Optional[list[int]] = None
    target_team_ids: Optional[list[int]] = None
    audiences: list[AudienceTarget] = []


class InjectUpdate(BaseModel):
    """Schema for updating an inject."""
    title: Optional[str] = None
    description: Optional[str] = None
    content: Optional[dict] = None
    data_format: Optional[InjectDataFormat] = None
    scheduled_at: Optional[datetime] = None
    status: Optional[InjectStatus] = None
    custom_id: Optional[str] = None
    timeline_type: Optional[TimelineType] = None
    is_surprise: Optional[bool] = None
    inject_category: Optional[InjectCategory] = None
    channel: Optional[InjectChannel] = None
    target_audience: Optional[TargetAudience] = None
    pedagogical_objective: Optional[str] = None
    tested_competence: Optional[TestedCompetence] = None
    pressure_level: Optional[PressureLevel] = None
    dependency_ids: Optional[list[int]] = None
    time_offset: Optional[int] = None
    duration_min: Optional[int] = None
    phase_id: Optional[int] = None
    audiences: Optional[list[AudienceTarget]] = None


class InjectResponse(InjectBase):
    """Schema for inject response."""
    id: int
    exercise_id: int
    custom_id: Optional[str] = None
    timeline_type: TimelineType = TimelineType.BUSINESS
    is_surprise: bool = False
    inject_category: Optional[InjectCategory] = None
    channel: Optional[InjectChannel] = None
    target_audience: Optional[TargetAudience] = None
    pedagogical_objective: Optional[str] = None
    tested_competence: Optional[TestedCompetence] = None
    pressure_level: Optional[PressureLevel] = None
    dependency_ids: Optional[list[int]] = None
    time_offset: Optional[int] = None
    duration_min: int = 15
    phase_id: Optional[int] = None
    status: InjectStatus
    sent_at: Optional[datetime]
    created_by: Optional[int]
    created_at: datetime
    updated_at: datetime
    audiences: list[AudienceTarget] = []

    @field_validator("type", mode="before")
    @classmethod
    def _normalize_type(cls, value):
        # If already an InjectType enum, extract its value string
        if isinstance(value, InjectType):
            return value.value
        # Handle other enum-like objects with a .value attribute
        if hasattr(value, 'value'):
            return value.value
        return parse_inject_type(value)

    model_config = {"from_attributes": True}


class InjectListResponse(BaseModel):
    """Schema for list of injects."""
    injects: list[InjectResponse]
    total: int
    page: int
    page_size: int


class DeliveryResponse(BaseModel):
    """Schema for delivery response."""
    id: int
    inject_id: int
    target_user_id: Optional[int]
    target_team_id: Optional[int]
    status: DeliveryStatus
    delivered_at: Optional[datetime]
    opened_at: Optional[datetime]
    first_reply_at: Optional[datetime]

    model_config = {"from_attributes": True}


@router.get("", response_model=InjectListResponse)
async def list_injects(
    exercise_id: Optional[int] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    type: Optional[InjectType] = None,
    status: Optional[InjectStatus] = None,
    _: any = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """List injects."""
    query = (
        select(Inject)
        .options(selectinload(Inject.audiences))
        .join(Exercise, Exercise.id == Inject.exercise_id)
        .where(Exercise.tenant_id == tenant_ctx.tenant.id)
    )
    count_query = (
        select(func.count(Inject.id))
        .join(Exercise, Exercise.id == Inject.exercise_id)
        .where(Exercise.tenant_id == tenant_ctx.tenant.id)
    )
    
    if exercise_id:
        await _get_exercise_in_tenant_or_404(db, exercise_id, tenant_ctx.tenant.id)
        query = query.where(Inject.exercise_id == exercise_id)
        count_query = count_query.where(Inject.exercise_id == exercise_id)
    if type:
        query = query.where(Inject.type == type)
        count_query = count_query.where(Inject.type == type)
    if status:
        query = query.where(Inject.status == status)
        count_query = count_query.where(Inject.status == status)
    
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    offset = (page - 1) * page_size
    query = query.order_by(Inject.scheduled_at.asc().nulls_last()).offset(offset).limit(page_size)
    
    result = await db.execute(query)
    injects = result.scalars().all()
    
    return InjectListResponse(
        injects=[InjectResponse.model_validate(i) for i in injects],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=InjectResponse, status_code=201)
async def create_inject(
    inject_data: InjectCreate,
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new inject (admin/animateur only)."""
    _validate_timeline_payload_or_400(_inject_create_to_timeline_schema_payload(inject_data))

    # Verify exercise exists and is in correct state
    exercise = await _get_exercise_in_tenant_or_404(db, inject_data.exercise_id, tenant_ctx.tenant.id)
    
    inject = Inject(
        exercise_id=inject_data.exercise_id,
        type=inject_data.type,
        title=inject_data.title,
        description=inject_data.description,
        content=inject_data.content,
        scheduled_at=inject_data.scheduled_at,
        custom_id=inject_data.custom_id,
        timeline_type=inject_data.timeline_type or TimelineType.BUSINESS,
        is_surprise=bool(inject_data.is_surprise or False),
        inject_category=inject_data.inject_category,
        channel=inject_data.channel,
        data_format=inject_data.data_format,
        target_audience=inject_data.target_audience,
        pedagogical_objective=inject_data.pedagogical_objective,
        tested_competence=inject_data.tested_competence,
        pressure_level=inject_data.pressure_level,
        dependency_ids=inject_data.dependency_ids,
        time_offset=inject_data.time_offset,
        duration_min=inject_data.duration_min or 15,
        phase_id=inject_data.phase_id,
        created_by=current_user.id,
    )
    db.add(inject)
    await db.flush()

    # Persist audiences
    await _replace_inject_audiences(db, inject.id, inject_data.audiences or [])

    # Create deliveries from audiences + explicit targets
    team_ids, user_ids = await _compute_delivery_targets(
        db,
        exercise_id=inject_data.exercise_id,
        audiences=inject_data.audiences,
        target_user_ids=inject_data.target_user_ids,
        target_team_ids=inject_data.target_team_ids,
    )
    for team_id in team_ids:
        db.add(Delivery(inject_id=inject.id, target_team_id=team_id))
    for user_id in user_ids:
        db.add(Delivery(inject_id=inject.id, target_user_id=user_id))
    
    await db.commit()
    inject = await _load_inject_with_audiences(db, inject.id, tenant_id=tenant_ctx.tenant.id)
    created_event = await _create_inject_created_event(
        db,
        inject,
        actor_id=getattr(current_user, "id", None),
        actor_label=getattr(current_user, "username", None),
    )
    await db.commit()
    await ws_manager.broadcast_event(inject.exercise_id, created_event, audiences=_audiences_payload(inject))
    await _broadcast_inject_created(inject)
    return InjectResponse.model_validate(inject)


@router.get("/{inject_id}", response_model=InjectResponse)
async def get_inject(
    inject_id: int,
    _: any = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Get an inject by ID."""
    inject = await _get_inject_in_tenant_or_404(db, inject_id, tenant_ctx.tenant.id, with_audiences=True)
    return InjectResponse.model_validate(inject)


@router.put("/{inject_id}", response_model=InjectResponse)
async def update_inject(
    inject_id: int,
    inject_data: InjectUpdate,
    _: any = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Update an inject (admin/animateur only)."""
    inject = await _get_inject_in_tenant_or_404(db, inject_id, tenant_ctx.tenant.id, with_audiences=True)
    
    if inject.status == InjectStatus.SENT:
        raise HTTPException(status_code=400, detail="Cannot update a sent inject")

    base_payload = _inject_to_timeline_schema_payload(inject)
    update_payload_json = inject_data.model_dump(exclude_unset=True, mode="json")
    merged_payload = _apply_update_payload_to_timeline_schema_payload(base_payload, update_payload_json)
    _validate_timeline_payload_or_400(merged_payload)
    
    if inject_data.title is not None:
        inject.title = inject_data.title
    if inject_data.description is not None:
        inject.description = inject_data.description
    if inject_data.content is not None:
        inject.content = inject_data.content
    if inject_data.scheduled_at is not None:
        inject.scheduled_at = inject_data.scheduled_at
    if inject_data.status is not None:
        inject.status = inject_data.status
    if inject_data.custom_id is not None:
        inject.custom_id = inject_data.custom_id
    if inject_data.timeline_type is not None:
        inject.timeline_type = inject_data.timeline_type
    if inject_data.is_surprise is not None:
        inject.is_surprise = inject_data.is_surprise
    if inject_data.inject_category is not None:
        inject.inject_category = inject_data.inject_category
    if inject_data.channel is not None:
        inject.channel = inject_data.channel
    if inject_data.data_format is not None:
        inject.data_format = inject_data.data_format
    if inject_data.target_audience is not None:
        inject.target_audience = inject_data.target_audience
    if inject_data.pedagogical_objective is not None:
        inject.pedagogical_objective = inject_data.pedagogical_objective
    if inject_data.tested_competence is not None:
        inject.tested_competence = inject_data.tested_competence
    if inject_data.pressure_level is not None:
        inject.pressure_level = inject_data.pressure_level
    if inject_data.dependency_ids is not None:
        inject.dependency_ids = inject_data.dependency_ids
    if inject_data.time_offset is not None:
        inject.time_offset = inject_data.time_offset
    if inject_data.duration_min is not None:
        inject.duration_min = inject_data.duration_min
    if inject_data.phase_id is not None:
        inject.phase_id = inject_data.phase_id
    if inject_data.audiences is not None:
        await _replace_inject_audiences(db, inject_id, inject_data.audiences)
        await db.execute(delete(Delivery).where(Delivery.inject_id == inject_id))
        team_ids, user_ids = await _compute_delivery_targets(
            db,
            exercise_id=inject.exercise_id,
            audiences=inject_data.audiences,
        )
        for team_id in team_ids:
            db.add(Delivery(inject_id=inject.id, target_team_id=team_id))
        for user_id in user_ids:
            db.add(Delivery(inject_id=inject.id, target_user_id=user_id))
    
    await db.commit()
    inject = await _load_inject_with_audiences(db, inject.id, tenant_id=tenant_ctx.tenant.id)
    return InjectResponse.model_validate(inject)


@router.post("/{inject_id}/send")
async def send_inject(
    inject_id: int,
    _: any = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Send an inject immediately."""
    inject = await _get_inject_in_tenant_or_404(db, inject_id, tenant_ctx.tenant.id, with_audiences=True)
    return await _send_inject_now(db, inject)


@router.post("/{inject_id}/schedule")
async def schedule_inject(
    inject_id: int,
    scheduled_at: datetime,
    _: any = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Schedule an inject for later."""
    inject = await _get_inject_in_tenant_or_404(db, inject_id, tenant_ctx.tenant.id)
    
    if inject.status == InjectStatus.SENT:
        raise HTTPException(status_code=400, detail="Cannot schedule a sent inject")
    
    inject.scheduled_at = scheduled_at
    inject.status = InjectStatus.SCHEDULED
    
    await db.commit()
    
    return {"message": "Inject scheduled", "scheduled_at": inject.scheduled_at}


@router.post("/{inject_id}/cancel")
async def cancel_inject(
    inject_id: int,
    _: any = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Cancel an inject."""
    inject = await _get_inject_in_tenant_or_404(db, inject_id, tenant_ctx.tenant.id)
    
    if inject.status == InjectStatus.SENT:
        raise HTTPException(status_code=400, detail="Cannot cancel a sent inject")
    
    inject.status = InjectStatus.CANCELLED
    
    await db.commit()
    
    return {"message": "Inject cancelled"}


@router.delete("/{inject_id}")
async def delete_inject(
    inject_id: int,
    _: any = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Delete an inject (admin/animateur only)."""
    inject = await _get_inject_in_tenant_or_404(db, inject_id, tenant_ctx.tenant.id)
    
    await db.delete(inject)
    await db.commit()
    
    return {"message": "Inject deleted successfully"}


@router.get("/{inject_id}/deliveries", response_model=list[DeliveryResponse])
async def get_inject_deliveries(
    inject_id: int,
    _: any = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Get deliveries for an inject."""
    inject = await _get_inject_in_tenant_or_404(db, inject_id, tenant_ctx.tenant.id)
    
    deliveries_result = await db.execute(
        select(Delivery).where(Delivery.inject_id == inject_id)
    )
    
    return [DeliveryResponse.model_validate(d) for d in deliveries_result.scalars().all()]


# === CSV Import ===

class CSVImportResult(BaseModel):
    """Result of CSV import."""
    success: int
    errors: list[dict]
    injects: list[InjectResponse]


class InjectCreateWithOffset(BaseModel):
    """Schema for creating an inject with time_offset."""
    title: str
    description: Optional[str] = None
    type: InjectType
    content: dict
    time_offset: Optional[int] = None  # Minutes from T+0
    scheduled_at: Optional[datetime] = None
    target_team_names: Optional[list[str]] = None  # Team names instead of IDs

    @field_validator("type", mode="before")
    @classmethod
    def _normalize_type(cls, value):
        return parse_inject_type(value)


@router.post("/import-csv", response_model=CSVImportResult, status_code=201)
async def import_injects_csv(
    exercise_id: int = Query(..., description="Exercise ID"),
    file: UploadFile = File(...),
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Import injects from CSV file.
    
    Expected CSV columns:
    - type: inject type or inject-bank kind (e.g. mail, twitter, tv, decision, score, system, message, social_post, video, document)
    - title: Inject title (required)
    - description: Optional description
    - content: JSON content or plain text
    - time_offset: Minutes from exercise start (T+0), e.g., 0, 30, 60, 120
    - target_teams: Comma-separated team names
    
    Example CSV:
    type,title,description,content,time_offset,target_teams
    mail,Urgent Communication,Crisis alert,"{""body"": ""Crisis situation..."", ""subject"": ""Alert""}",0,Team Alpha
    tv,News Flash,Breaking news,Breaking: Major incident reported,30,
    """
    # Verify exercise exists
    await _get_exercise_in_tenant_or_404(db, exercise_id, tenant_ctx.tenant.id)
    
    # Read and parse CSV
    content = await file.read()
    try:
        text = content.decode('utf-8')
    except UnicodeDecodeError:
        try:
            text = content.decode('latin-1')
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="Could not decode file as UTF-8 or Latin-1")
    
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV file is empty or has no headers")
    
    # Required columns
    required = {'type', 'title'}
    if not required.issubset(set(reader.fieldnames)):
        missing = required - set(reader.fieldnames)
        raise HTTPException(status_code=400, detail=f"Missing required columns: {missing}")
    
    # Get teams for this exercise for name resolution
    from app.models import ExerciseTeam
    teams_result = await db.execute(
        select(Team)
        .join(ExerciseTeam, ExerciseTeam.team_id == Team.id)
        .where(ExerciseTeam.exercise_id == exercise_id)
    )
    teams_by_name = {t.name.lower(): t.id for t in teams_result.scalars().all()}
    
    created_injects = []
    errors = []
    row_num = 1  # Header is row 0
    
    for row in reader:
        row_num += 1
        try:
            # Parse type
            try:
                inject_type = parse_inject_type(row.get('type'))
            except ValueError:
                errors.append({
                    "row": row_num,
                    "error": f"Invalid type '{row.get('type')}'. Must be one of: {accepted_inject_type_values()}"
                })
                continue
            
            # Parse title
            title = row['title'].strip()
            if not title:
                errors.append({"row": row_num, "error": "Title is required"})
                continue
            
            # Parse description
            description = row.get('description', '').strip() or None
            
            # Parse content (JSON or plain text)
            content_str = row.get('content', '{}').strip()
            try:
                import json
                if content_str.startswith('{') or content_str.startswith('['):
                    content = json.loads(content_str)
                else:
                    # Plain text -> store as {"text": "..."}
                    content = {"text": content_str}
            except json.JSONDecodeError:
                content = {"text": content_str}
            
            # Parse time_offset (minutes from T+0)
            time_offset = None
            time_offset_str = row.get('time_offset', '').strip()
            if time_offset_str:
                try:
                    time_offset = int(time_offset_str)
                except ValueError:
                    errors.append({"row": row_num, "error": f"Invalid time_offset '{time_offset_str}'. Must be integer (minutes)."})
                    continue
            
            # Parse target teams
            target_team_ids = []
            teams_str = row.get('target_teams', '').strip()
            if teams_str:
                for team_name in teams_str.split(','):
                    team_name = team_name.strip().lower()
                    if team_name in teams_by_name:
                        target_team_ids.append(teams_by_name[team_name])
                    else:
                        errors.append({
                            "row": row_num,
                            "error": f"Team '{team_name}' not found in exercise"
                        })
                        target_team_ids = []
                        break

                if any("error" in err and err.get("row") == row_num for err in errors):
                    continue
            
            # Create inject
            timeline_payload = {
                "exercise_id": exercise_id,
                "title": title,
                "type": inject_type.value if hasattr(inject_type, "value") else str(inject_type),
                "kind": INJECT_TYPE_TO_BANK_KIND.get(
                    inject_type.value if hasattr(inject_type, "value") else str(inject_type),
                    "other",
                ),
                "status": InjectStatus.DRAFT.value,
                "timeline_type": TimelineType.BUSINESS.value,
                "time_offset": time_offset,
                "duration_min": 15,
                "description": description,
                "data_format": "text",
                "content": content,
                "scheduled_at": None,
                "is_surprise": False,
                "target_team_ids": target_team_ids,
                "target_user_ids": [],
                "audiences": [],
                "payload": {},
                "tags": [],
            }
            _validate_timeline_payload_or_400(timeline_payload, row=row_num)

            inject = Inject(
                exercise_id=exercise_id,
                type=inject_type,
                title=title,
                description=description,
                content=content,
                time_offset=time_offset,
                created_by=current_user.id,
            )
            db.add(inject)
            await db.flush()  # Get the ID
            
            # Create deliveries for target teams
            for team_id in target_team_ids:
                delivery = Delivery(
                    inject_id=inject.id,
                    target_team_id=team_id,
                )
                db.add(delivery)
            
            created_injects.append(inject)
            
        except Exception as e:
            errors.append({"row": row_num, "error": str(e)})

    if errors:
        await db.rollback()
        first = errors[0]
        if "row" in first and "error" in first:
            detail = f"Import rejected (row {first['row']}): {first['error']}"
        else:
            detail = "Import rejected: invalid CSV payload"
        raise HTTPException(status_code=400, detail=detail)

    await db.commit()
    serialized_injects = [
        InjectResponse.model_validate(
            await _load_inject_with_audiences(db, i.id, tenant_id=tenant_ctx.tenant.id)
        )
        for i in created_injects
    ]

    return CSVImportResult(
        success=len(created_injects),
        errors=errors,
        injects=serialized_injects
    )


@router.get("/template/csv")
async def get_csv_template():
    """Download CSV template for inject import."""
    template = """type,title,description,content,time_offset,target_teams
mail,Urgent Communication,Crisis alert message,"{""subject"": ""Alert"", ""body"": ""Crisis situation developing...""}",0,Team Alpha
tv,News Flash,Breaking news segment,Breaking: Major incident reported at downtown location,30,
twitter,Social Media Post,Official statement,"We are aware of the situation and responding accordingly.",45,
decision,Critical Decision Required,Choose response strategy,"{""options"": [""Option A"", ""Option B""]}",60,Team Alpha
"""
    from fastapi.responses import Response
    return Response(
        content=template,
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=inject_template.csv"
        }
    )


# === Inject Media Management ===

class InjectMediaResponse(BaseModel):
    """Schema for inject-media association."""
    id: int
    inject_id: int
    media_id: int
    position: int
    created_at: datetime
    
    model_config = {"from_attributes": True}


class AddMediaRequest(BaseModel):
    """Request to add media to inject."""
    media_id: int
    position: Optional[int] = 0


@router.get("/{inject_id}/media", response_model=list[InjectMediaResponse])
async def get_inject_media(
    inject_id: int,
    _: any = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Get media attached to an inject."""
    inject = await _get_inject_in_tenant_or_404(db, inject_id, tenant_ctx.tenant.id)
    
    media_result = await db.execute(
        select(InjectMedia)
        .where(InjectMedia.inject_id == inject_id)
        .order_by(InjectMedia.position)
    )
    
    return [InjectMediaResponse.model_validate(m) for m in media_result.scalars().all()]


@router.post("/{inject_id}/media", response_model=InjectMediaResponse, status_code=201)
async def add_media_to_inject(
    inject_id: int,
    data: AddMediaRequest,
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Attach a media to an inject."""
    # Verify inject exists and is not sent
    inject = await _get_inject_in_tenant_or_404(db, inject_id, tenant_ctx.tenant.id)
    
    if inject.status == InjectStatus.SENT:
        raise HTTPException(status_code=400, detail="Cannot modify media on a sent inject")
    
    # Verify media exists
    media = await _get_media_in_tenant_or_404(db, data.media_id, tenant_ctx.tenant.id)
    
    # Check if already attached
    existing = await db.execute(
        select(InjectMedia).where(
            InjectMedia.inject_id == inject_id,
            InjectMedia.media_id == data.media_id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Media already attached to this inject")
    
    # Get max position if not specified
    if data.position == 0:
        max_pos = await db.execute(
            select(func.max(InjectMedia.position)).where(InjectMedia.inject_id == inject_id)
        )
        max_pos_val = max_pos.scalar() or -1
        position = max_pos_val + 1
    else:
        position = data.position
    
    # Create association
    association = InjectMedia(
        inject_id=inject_id,
        media_id=data.media_id,
        position=position,
    )
    db.add(association)
    await db.commit()
    await db.refresh(association)
    
    return InjectMediaResponse.model_validate(association)


@router.delete("/{inject_id}/media/{media_id}")
async def remove_media_from_inject(
    inject_id: int,
    media_id: int,
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Remove a media from an inject."""
    # Verify inject exists and is not sent
    inject = await _get_inject_in_tenant_or_404(db, inject_id, tenant_ctx.tenant.id)
    
    if inject.status == InjectStatus.SENT:
        raise HTTPException(status_code=400, detail="Cannot modify media on a sent inject")
    
    # Find and delete association
    result = await db.execute(
        select(InjectMedia).where(
            InjectMedia.inject_id == inject_id,
            InjectMedia.media_id == media_id
        )
    )
    association = result.scalar_one_or_none()
    
    if not association:
        raise HTTPException(status_code=404, detail="Media not attached to this inject")
    
    await db.delete(association)
    await db.commit()
    
    return {"message": "Media removed from inject"}


@router.put("/{inject_id}/media/reorder")
async def reorder_inject_media(
    inject_id: int,
    media_ids: list[int],
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Reorder media attached to an inject.
    
    Provide a list of media IDs in the desired order.
    """
    # Verify inject exists and is not sent
    inject = await _get_inject_in_tenant_or_404(db, inject_id, tenant_ctx.tenant.id)
    
    if inject.status == InjectStatus.SENT:
        raise HTTPException(status_code=400, detail="Cannot modify media on a sent inject")
    
    # Update positions
    for position, media_id in enumerate(media_ids):
        result = await db.execute(
            select(InjectMedia).where(
                InjectMedia.inject_id == inject_id,
                InjectMedia.media_id == media_id
            )
        )
        association = result.scalar_one_or_none()
        if association:
            association.position = position
    
    await db.commit()
    
    return {"message": "Media reordered"}
