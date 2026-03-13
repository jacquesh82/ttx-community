"""
CrisisLab crisis-management domain endpoints.

Covers the full exercise lifecycle: scenario authoring, phase definition,
escalation-axis configuration, inject trigger rules, live dashboard and
real-time control, post-exercise evaluation KPIs, RETEX report generation
and export, as well as bulk import of exercise components from JSON files
or the inject bank.
"""
from datetime import datetime, timezone
from io import BytesIO
import json
import re
import secrets
import unicodedata
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import String, select, func, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db_session
from app.models import (
    Exercise,
    ExerciseTeam,
    ExerciseUser,
    Team,
    Inject,
    Delivery,
    Event,
    Decision,
    Score,
    ExerciseScenario,
    ExerciseEscalationAxis,
    ExercisePhase,
    InjectTriggerRule,
    ExerciseMetricSnapshot,
    RetexReport,
    EscalationAxisType,
    TriggerMode,
    InjectStatus,
    DeliveryStatus,
    EventType,
    EventActorType,
    InjectType,
    ExerciseRole,
    InjectCategory,
    InjectChannel,
    TargetAudience,
    TestedCompetence,
    PressureLevel,
    InjectBankItem,
    InjectBankKind,
    InjectBankStatus,
    ExercisePlugin,
    ParticipantCapability,
    InjectVisibilityScope,
    TVChannel,
    TVSegment,
    TVSegmentStatus,
    ChatMessage,
    ChatRoom,
)
from app.models.webmail import Conversation, Message, ReadReceipt
from app.models.exercise import ExerciseStatus
from app.models.inject import parse_inject_type, TimelineType, InjectDataFormat, InjectAudience
from app.models.user import User, UserRole
from app.routers.auth import require_auth, require_role
from app.routers.injects import (
    AudienceTarget,
    _compute_delivery_targets,
    _replace_inject_audiences,
    _load_inject_with_audiences,
    _create_inject_created_event,
    _broadcast_inject_created,
    _send_inject_now,
)
from app.services.plugin_catalog import get_canonical_plugin_types, normalize_plugin_type
from app.services.scheduler import inject_scheduler
from app.services.websocket_manager import ws_manager
from app.utils.security import hash_password
from app.utils.tenancy import current_tenant_id_var

router = APIRouter(prefix="/exercises", tags=["crisis-management (CrisisLab)"])


async def _shift_phase_orders(
    db: AsyncSession,
    *,
    exercise_id: int,
    starting_from: int,
) -> None:
    """
    Make room for a phase at `starting_from` by shifting existing orders up by 1.
    Processed in descending order to avoid transient unique conflicts.
    """
    # Two-step bump avoids transient unique collisions on (exercise_id, phase_order).
    await db.execute(
        update(ExercisePhase)
        .where(
            ExercisePhase.exercise_id == exercise_id,
            ExercisePhase.phase_order >= starting_from,
        )
        .values(phase_order=ExercisePhase.phase_order + 10000)
    )
    await db.execute(
        update(ExercisePhase)
        .where(
            ExercisePhase.exercise_id == exercise_id,
            ExercisePhase.phase_order >= starting_from + 10000,
        )
        .values(phase_order=ExercisePhase.phase_order - 9999)
    )


async def _move_phase_to_order(
    db: AsyncSession,
    *,
    phase: ExercisePhase,
    new_order: int,
) -> None:
    """Move a phase to a new order while preserving uniqueness throughout flushes."""
    current_order = phase.phase_order
    if new_order == current_order:
        return

    # Park target phase on a temporary unique order before shifting neighbors.
    phase.phase_order = -phase.id
    await db.flush()

    if new_order < current_order:
        await db.execute(
            update(ExercisePhase)
            .where(
                ExercisePhase.exercise_id == phase.exercise_id,
                ExercisePhase.id != phase.id,
                ExercisePhase.phase_order >= new_order,
                ExercisePhase.phase_order < current_order,
            )
            .values(phase_order=ExercisePhase.phase_order + 10000)
        )
        await db.execute(
            update(ExercisePhase)
            .where(
                ExercisePhase.exercise_id == phase.exercise_id,
                ExercisePhase.id != phase.id,
                ExercisePhase.phase_order >= new_order + 10000,
                ExercisePhase.phase_order < current_order + 10000,
            )
            .values(phase_order=ExercisePhase.phase_order - 9999)
        )
    else:
        await db.execute(
            update(ExercisePhase)
            .where(
                ExercisePhase.exercise_id == phase.exercise_id,
                ExercisePhase.id != phase.id,
                ExercisePhase.phase_order > current_order,
                ExercisePhase.phase_order <= new_order,
            )
            .values(phase_order=ExercisePhase.phase_order + 10000)
        )
        await db.execute(
            update(ExercisePhase)
            .where(
                ExercisePhase.exercise_id == phase.exercise_id,
                ExercisePhase.id != phase.id,
                ExercisePhase.phase_order > current_order + 10000,
                ExercisePhase.phase_order <= new_order + 10000,
            )
            .values(phase_order=ExercisePhase.phase_order - 10001)
        )

    await db.flush()
    phase.phase_order = new_order


class ScenarioPayload(BaseModel):
    """Exercise scenario definition — narrative context and pedagogical framing."""

    strategic_intent: Optional[str] = Field(default=None, description="High-level goal the exercise is designed to test", examples=["Valider la capacit\u00e9 de Duval Industries \u00e0 contenir un ransomware et communiquer sous pression m\u00e9diatique"])
    initial_context: Optional[str] = Field(default=None, description="Background context shared with all participants at exercise start", examples=["Duval Industries est un groupe industriel de 4 500 salari\u00e9s sp\u00e9cialis\u00e9 dans la fabrication de composants a\u00e9ronautiques."])
    initial_situation: Optional[str] = Field(default=None, description="Opening situation description that kicks off the exercise", examples=["Lundi 9h12 \u2014 Le SOC d\u00e9tecte un chiffrement massif de fichiers sur le site de Nantes. L\u2019extension .locked appara\u00eet sur plus de 2 000 fichiers en 15 minutes."])
    implicit_hypotheses: Optional[str] = Field(default=None, description="Unstated assumptions the scenario relies on")
    hidden_brief: Optional[str] = Field(default=None, description="Confidential brief visible only to animateurs (hidden from players)")
    pedagogical_objectives: list[str] = Field(default_factory=list, description="Learning objectives for participants", examples=[["Tester l\u2019activation de la cellule de crise", "Valider les proc\u00e9dures de confinement r\u00e9seau", "\u00c9valuer la communication de crise externe"]])
    evaluation_criteria: list[str] = Field(default_factory=list, description="Criteria used to evaluate participant performance")
    stress_factors: list[str] = Field(default_factory=list, description="Deliberate stress elements injected into the scenario", examples=[["Pression m\u00e9diatique forte", "D\u00e9lai r\u00e9glementaire ANSSI 72h", "Indisponibilit\u00e9 du DSI"]])

    model_config = {
        "json_schema_extra": {
            "example": {
                "strategic_intent": "Valider la capacit\u00e9 de Duval Industries \u00e0 contenir un ransomware et communiquer sous pression m\u00e9diatique",
                "initial_context": "Duval Industries est un groupe industriel de 4 500 salari\u00e9s sp\u00e9cialis\u00e9 dans la fabrication de composants a\u00e9ronautiques.",
                "initial_situation": "Lundi 9h12 \u2014 Le SOC d\u00e9tecte un chiffrement massif de fichiers sur le site de Nantes.",
                "implicit_hypotheses": "Le PCA informatique n\u2019a pas \u00e9t\u00e9 test\u00e9 depuis 18 mois.",
                "hidden_brief": "L\u2019attaquant dispose d\u2019un acc\u00e8s persistant via le VPN fournisseur depuis 3 semaines.",
                "pedagogical_objectives": ["Tester l\u2019activation de la cellule de crise", "Valider les proc\u00e9dures de confinement r\u00e9seau"],
                "evaluation_criteria": ["D\u00e9lai d\u2019activation < 30 min", "Communication ANSSI dans les 72h"],
                "stress_factors": ["Pression m\u00e9diatique forte", "Indisponibilit\u00e9 du DSI"],
            }
        }
    }


class EscalationAxisPayload(BaseModel):
    """An escalation axis measuring crisis intensity on a specific dimension."""

    axis_type: EscalationAxisType = Field(description="Axis category (TECHNICAL, COMMUNICATION, LEGAL, POLITICAL, MEDIA, etc.)", examples=["TECHNICAL"])
    intensity: int = Field(default=1, ge=1, le=10, description="Current intensity level (1 = low, 10 = critical)", examples=[8])
    notes: Optional[str] = Field(default=None, description="Free-text notes explaining the intensity rating", examples=["Chiffrement actif sur 3 sites, exfiltration confirm\u00e9e"])

    model_config = {
        "json_schema_extra": {
            "example": {
                "axis_type": "TECHNICAL",
                "intensity": 8,
                "notes": "Chiffrement actif sur 3 sites, exfiltration confirm\u00e9e",
            }
        }
    }


class PhasePayload(BaseModel):
    """An exercise phase — a named time window in the crisis timeline."""

    name: str = Field(..., min_length=1, max_length=150, description="Phase display name", examples=["D\u00e9tection & Alerte"])
    description: Optional[str] = Field(default=None, description="Detailed description of phase objectives", examples=["Identification de l\u2019incident par le SOC et premi\u00e8re qualification"])
    phase_order: int = Field(..., ge=0, le=1000, description="Sort order (0-based)")
    start_offset_min: Optional[int] = Field(default=None, description="Phase start time as offset from exercise start (minutes)", examples=[0])
    end_offset_min: Optional[int] = Field(default=None, description="Phase end time as offset from exercise start (minutes)", examples=[30])

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "D\u00e9tection & Alerte",
                "description": "Identification de l\u2019incident par le SOC et premi\u00e8re qualification",
                "phase_order": 0,
                "start_offset_min": 0,
                "end_offset_min": 30,
            }
        }
    }


class TriggerRulePayload(BaseModel):
    """A trigger rule linking an inject to automatic or conditional dispatch."""

    inject_id: int = Field(description="ID of the inject this rule applies to")
    trigger_mode: TriggerMode = Field(default=TriggerMode.AUTO, description="Dispatch mode — AUTO (time-based) or MANUAL (animateur-triggered)", examples=["auto"])
    expression: Optional[dict] = Field(default=None, description="Optional conditional expression for rule evaluation (JSON logic)")

    model_config = {
        "json_schema_extra": {
            "example": {
                "inject_id": 15,
                "trigger_mode": "auto",
                "expression": None,
            }
        }
    }


class PluginPayload(BaseModel):
    """Configuration for an exercise plugin (e.g. simulated TV channel, press feed)."""

    plugin_type: str = Field(description="Canonical plugin type identifier", examples=["tv_channel"])
    enabled: bool = Field(description="Whether the plugin is active for this exercise")
    configuration: Optional[dict] = Field(default=None, description="Plugin-specific configuration (JSON object)")


class LiveActionPayload(BaseModel):
    """Payload for a real-time control action on a running exercise."""

    action: str = Field(description="Action name — pause, resume, speed, manual_inject, rewind, broadcast, hot_edit", examples=["pause"])
    payload: dict = Field(default_factory=dict, description="Action-specific parameters (e.g. {multiplier: 2} for speed)")

    model_config = {
        "json_schema_extra": {
            "example": {
                "action": "speed",
                "payload": {"multiplier": 2.0},
            }
        }
    }


class LiveSurpriseInjectPayload(BaseModel):
    """Payload for creating a surprise inject during a live exercise."""

    title: str = Field(..., min_length=1, max_length=255, description="Inject title", examples=["Fuite de donn\u00e9es sur le dark web"])
    description: Optional[str] = Field(default=None, description="Inject description for animateurs")
    type: str = Field(description="Inject type identifier", examples=["mail"])
    timeline_type: TimelineType = Field(description="Which timeline the inject belongs to (business or technical)")
    content: dict | str = Field(description="Inject content — JSON object or plain text")
    audiences: list[AudienceTarget] = Field(default_factory=list, min_length=1, description="Target audiences for delivery")
    dispatch_mode: str = Field(..., pattern="^(immediate|planned)$", description="Dispatch mode — 'immediate' or 'planned'", examples=["immediate"])
    planned_time_offset: Optional[int] = Field(default=None, ge=0, description="Exercise-time offset in minutes (required if planned)")
    duration_min: Optional[int] = Field(default=15, ge=1, le=600, description="Expected duration in minutes")
    channel: Optional[InjectChannel] = Field(default=None, description="Communication channel for this inject")
    inject_category: Optional[InjectCategory] = Field(default=None, description="Inject category")
    pressure_level: Optional[PressureLevel] = Field(default=None, description="Pressure level applied by this inject")


class BankSelectionPayload(BaseModel):
    """Explicit selection of inject-bank items to import into an exercise."""

    item_ids: list[int] = Field(default_factory=list, min_length=1, max_length=500, description="List of inject-bank item IDs to import")


SUPPORTED_IMPORT_COMPONENTS = {
    "socle",
    "scenario",
    "actors",
    "timeline",
    "injects",
    "plugins",
    "full",
}


async def _get_exercise_or_404(exercise_id: int, db: AsyncSession) -> Exercise:
    query = select(Exercise).where(Exercise.id == exercise_id)
    tenant_id = current_tenant_id_var.get()
    if tenant_id is not None:
        query = query.where(Exercise.tenant_id == tenant_id)
    result = await db.execute(query)
    exercise = result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return exercise


@router.get("/{exercise_id}/scenario")
async def get_scenario(
    exercise_id: int,
    current_user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """Retrieve the scenario definition for a CrisisLab exercise.

    Returns the full narrative context (strategic intent, initial situation,
    pedagogical objectives, stress factors, etc.).  The `hidden_brief` field
    is redacted for non-animateur roles.
    """
    await _get_exercise_or_404(exercise_id, db)
    result = await db.execute(select(ExerciseScenario).where(ExerciseScenario.exercise_id == exercise_id))
    scenario = result.scalar_one_or_none()
    if not scenario:
        return {"exercise_id": exercise_id, **ScenarioPayload().model_dump()}

    payload = ScenarioPayload(
        strategic_intent=scenario.strategic_intent,
        initial_context=scenario.initial_context,
        initial_situation=scenario.initial_situation,
        implicit_hypotheses=scenario.implicit_hypotheses,
        hidden_brief=scenario.hidden_brief,
        pedagogical_objectives=scenario.pedagogical_objectives or [],
        evaluation_criteria=scenario.evaluation_criteria or [],
        stress_factors=scenario.stress_factors or [],
    ).model_dump()
    if current_user.role not in (UserRole.ADMIN, UserRole.ANIMATEUR):
        payload["hidden_brief"] = None
    return {"exercise_id": exercise_id, **payload}


@router.put("/{exercise_id}/scenario")
async def upsert_scenario(
    exercise_id: int,
    data: ScenarioPayload,
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Create or update the scenario for a CrisisLab exercise.

    Idempotent — creates the scenario record on first call, updates it on
    subsequent calls.  Requires animateur or admin role.
    """
    await _get_exercise_or_404(exercise_id, db)
    result = await db.execute(select(ExerciseScenario).where(ExerciseScenario.exercise_id == exercise_id))
    scenario = result.scalar_one_or_none()
    if not scenario:
        scenario = ExerciseScenario(exercise_id=exercise_id)
        db.add(scenario)

    scenario.strategic_intent = data.strategic_intent
    scenario.initial_context = data.initial_context
    scenario.initial_situation = data.initial_situation
    scenario.implicit_hypotheses = data.implicit_hypotheses
    scenario.hidden_brief = data.hidden_brief
    scenario.pedagogical_objectives = data.pedagogical_objectives
    scenario.evaluation_criteria = data.evaluation_criteria
    scenario.stress_factors = data.stress_factors
    await db.commit()
    return {"message": "Scenario saved", "exercise_id": exercise_id}


@router.get("/{exercise_id}/escalation-axes")
async def list_escalation_axes(
    exercise_id: int,
    _: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """List all escalation axes for an exercise.

    Returns axes such as TECHNICAL, COMMUNICATION, LEGAL, POLITICAL,
    and MEDIA with their current intensity ratings (1-10).
    """
    await _get_exercise_or_404(exercise_id, db)
    result = await db.execute(
        select(ExerciseEscalationAxis).where(ExerciseEscalationAxis.exercise_id == exercise_id).order_by(ExerciseEscalationAxis.id)
    )
    axes = result.scalars().all()
    return axes


@router.post("/{exercise_id}/escalation-axes", status_code=201)
async def create_escalation_axis(
    exercise_id: int,
    data: EscalationAxisPayload,
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Add a new escalation axis to the exercise (e.g. TECHNICAL at intensity 8)."""
    await _get_exercise_or_404(exercise_id, db)
    axis = ExerciseEscalationAxis(exercise_id=exercise_id, axis_type=data.axis_type, intensity=data.intensity, notes=data.notes)
    db.add(axis)
    await db.commit()
    await db.refresh(axis)
    return axis


@router.put("/{exercise_id}/escalation-axes/{axis_id}")
async def update_escalation_axis(
    exercise_id: int,
    axis_id: int,
    data: EscalationAxisPayload,
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Update an escalation axis intensity or notes."""
    result = await db.execute(
        select(ExerciseEscalationAxis).where(
            ExerciseEscalationAxis.id == axis_id,
            ExerciseEscalationAxis.exercise_id == exercise_id,
        )
    )
    axis = result.scalar_one_or_none()
    if not axis:
        raise HTTPException(status_code=404, detail="Escalation axis not found")
    axis.axis_type = data.axis_type
    axis.intensity = data.intensity
    axis.notes = data.notes
    await db.commit()
    return axis


@router.delete("/{exercise_id}/escalation-axes/{axis_id}", status_code=204)
async def delete_escalation_axis(
    exercise_id: int,
    axis_id: int,
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Remove an escalation axis from the exercise."""
    result = await db.execute(
        select(ExerciseEscalationAxis).where(
            ExerciseEscalationAxis.id == axis_id,
            ExerciseEscalationAxis.exercise_id == exercise_id,
        )
    )
    axis = result.scalar_one_or_none()
    if not axis:
        raise HTTPException(status_code=404, detail="Escalation axis not found")
    await db.delete(axis)
    await db.commit()
    return Response(status_code=204)


@router.get("/{exercise_id}/phases")
async def list_phases(
    exercise_id: int,
    _: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """List exercise phases ordered by phase_order.

    Typical phases for CYBER-STORM 2024: *Detection & Alerte*,
    *Qualification & Activation*, *Confinement & Reponse*, *Remediation*,
    *Post-incident & RETEX*.
    """
    await _get_exercise_or_404(exercise_id, db)
    result = await db.execute(select(ExercisePhase).where(ExercisePhase.exercise_id == exercise_id).order_by(ExercisePhase.phase_order))
    return result.scalars().all()


@router.post("/{exercise_id}/phases", status_code=201)
async def create_phase(
    exercise_id: int,
    data: PhasePayload,
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new exercise phase at the given order position.

    Existing phases at or after the requested `phase_order` are shifted up
    automatically.  Returns 409 on concurrent order conflict.
    """
    await _get_exercise_or_404(exercise_id, db)
    await _shift_phase_orders(db, exercise_id=exercise_id, starting_from=data.phase_order)
    await db.flush()
    phase = ExercisePhase(
        exercise_id=exercise_id,
        name=data.name,
        description=data.description,
        phase_order=data.phase_order,
        start_offset_min=data.start_offset_min,
        end_offset_min=data.end_offset_min,
    )
    db.add(phase)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        # Defensive fallback if concurrent insert slipped through check.
        raise HTTPException(status_code=409, detail="phase_order already used for this exercise")
    await db.refresh(phase)
    return phase


@router.put("/{exercise_id}/phases/{phase_id}")
async def update_phase(
    exercise_id: int,
    phase_id: int,
    data: PhasePayload,
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Update a phase name, description, time offsets, or reorder it."""
    result = await db.execute(select(ExercisePhase).where(ExercisePhase.id == phase_id, ExercisePhase.exercise_id == exercise_id))
    phase = result.scalar_one_or_none()
    if not phase:
        raise HTTPException(status_code=404, detail="Phase not found")
    if data.phase_order != phase.phase_order:
        await _move_phase_to_order(db, phase=phase, new_order=data.phase_order)
    phase.name = data.name
    phase.description = data.description
    phase.phase_order = data.phase_order
    phase.start_offset_min = data.start_offset_min
    phase.end_offset_min = data.end_offset_min
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="phase_order already used for this exercise")
    return phase


@router.delete("/{exercise_id}/phases/{phase_id}", status_code=204)
async def delete_phase(
    exercise_id: int,
    phase_id: int,
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Delete an exercise phase.  Injects referencing this phase are not removed."""
    result = await db.execute(select(ExercisePhase).where(ExercisePhase.id == phase_id, ExercisePhase.exercise_id == exercise_id))
    phase = result.scalar_one_or_none()
    if not phase:
        raise HTTPException(status_code=404, detail="Phase not found")
    await db.delete(phase)
    await db.commit()
    return Response(status_code=204)


@router.get("/{exercise_id}/inject-triggers")
async def list_inject_triggers(
    exercise_id: int,
    _: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """List all inject trigger rules for an exercise.

    Trigger rules control how injects are dispatched: automatically at a
    time offset, or manually by the animateur.
    """
    await _get_exercise_or_404(exercise_id, db)
    result = await db.execute(select(InjectTriggerRule).where(InjectTriggerRule.exercise_id == exercise_id).order_by(InjectTriggerRule.id))
    return result.scalars().all()


@router.post("/{exercise_id}/inject-triggers", status_code=201)
async def create_or_update_trigger(
    exercise_id: int,
    data: TriggerRulePayload,
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Create or update a trigger rule for an inject (upsert by inject_id)."""
    inject_result = await db.execute(select(Inject).where(Inject.id == data.inject_id, Inject.exercise_id == exercise_id))
    inject = inject_result.scalar_one_or_none()
    if not inject:
        raise HTTPException(status_code=404, detail="Inject not found in exercise")

    result = await db.execute(select(InjectTriggerRule).where(InjectTriggerRule.inject_id == data.inject_id))
    rule = result.scalar_one_or_none()
    if not rule:
        rule = InjectTriggerRule(exercise_id=exercise_id, inject_id=data.inject_id)
        db.add(rule)
    rule.trigger_mode = data.trigger_mode
    rule.expression = data.expression
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/{exercise_id}/inject-triggers/{rule_id}", status_code=204)
async def delete_trigger(
    exercise_id: int,
    rule_id: int,
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Delete an inject trigger rule."""
    result = await db.execute(select(InjectTriggerRule).where(InjectTriggerRule.id == rule_id, InjectTriggerRule.exercise_id == exercise_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Trigger rule not found")
    await db.delete(rule)
    await db.commit()
    return Response(status_code=204)


def _compute_virtual_now_min(exercise: Exercise) -> int:
    if not exercise.started_at:
        return 0
    now = datetime.now(timezone.utc)
    elapsed_real_min = max((now - exercise.started_at).total_seconds() / 60.0, 0.0)
    multiplier = float(exercise.time_multiplier or 1)
    return max(int(elapsed_real_min * multiplier), 0)


def _normalize_content_preview(content: dict | None) -> dict:
    if not isinstance(content, dict):
        return {}
    preview = {}
    for key in ("text", "subject", "body", "title", "message"):
        value = content.get(key)
        if isinstance(value, str) and value:
            preview[key] = value[:200]
    return preview


def _target_summary_for_inject(inject: Inject, team_names: dict[int, str]) -> str:
    audiences = getattr(inject, "audiences", None) or []
    if audiences:
        labels: list[str] = []
        for aud in audiences[:3]:
            if aud.kind.value == "team":
                try:
                    labels.append(team_names.get(int(aud.value), f"Equipe {aud.value}"))
                except (TypeError, ValueError):
                    labels.append(str(aud.value))
            else:
                labels.append(f"{aud.kind.value}:{aud.value}")
        if len(audiences) > 3:
            labels.append(f"+{len(audiences) - 3}")
        return ", ".join(labels)

    deliveries = getattr(inject, "deliveries", None) or []
    team_ids = sorted({d.target_team_id for d in deliveries if d.target_team_id is not None})
    if team_ids:
        return ", ".join(team_names.get(team_id, f"Equipe {team_id}") for team_id in team_ids[:3]) + (f" +{len(team_ids)-3}" if len(team_ids) > 3 else "")
    return "Aucun ciblage"


def _serialize_live_timeline_item(inject: Inject, team_names: dict[int, str]) -> dict:
    timeline_type = inject.timeline_type.value if hasattr(inject.timeline_type, "value") else str(inject.timeline_type)
    status = inject.status.value if hasattr(inject.status, "value") else str(inject.status)
    audiences = [
        {"kind": aud.kind.value if hasattr(aud.kind, "value") else str(aud.kind), "value": aud.value}
        for aud in (getattr(inject, "audiences", None) or [])
    ]
    return {
        "id": inject.id,
        "title": inject.title,
        "type": inject.type.value if hasattr(inject.type, "value") else str(inject.type),
        "status": status,
        "timeline_type": timeline_type,
        "is_surprise": bool(getattr(inject, "is_surprise", False)),
        "time_offset": inject.time_offset,
        "duration_min": inject.duration_min,
        "sent_at": inject.sent_at.isoformat() if inject.sent_at else None,
        "created_at": inject.created_at.isoformat() if inject.created_at else None,
        "phase_id": inject.phase_id,
        "target_summary": _target_summary_for_inject(inject, team_names),
        "audiences": audiences,
        "badge": "SURPRISE" if bool(getattr(inject, "is_surprise", False)) else None,
        "meta": {
            "description": inject.description,
            "content_preview": _normalize_content_preview(inject.content),
        },
    }


@router.get("/{exercise_id}/live-dashboard")
async def get_live_dashboard(
    exercise_id: int,
    _: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """Retrieve the live dashboard state for a running CrisisLab exercise.

    Returns the exercise clock, business/technical/realtime inject
    timelines, team delivery stats, live event log, real-time KPI
    indicators (stress, saturation, communication, technical mastery),
    and WebSocket connection count.
    """
    exercise = await _get_exercise_or_404(exercise_id, db)

    timeline_result = await db.execute(
        select(Event).where(Event.exercise_id == exercise_id).order_by(Event.ts.desc()).limit(50)
    )
    events = timeline_result.scalars().all()

    team_stats_result = await db.execute(
        select(
            Delivery.target_team_id,
            func.count(Delivery.id).label("total"),
            func.count(Delivery.id).filter(Delivery.status == DeliveryStatus.TREATED).label("treated"),
        )
        .join(Inject, Inject.id == Delivery.inject_id)
        .where(Inject.exercise_id == exercise_id, Delivery.target_team_id.isnot(None))
        .group_by(Delivery.target_team_id)
    )
    team_stats_rows = team_stats_result.all()

    team_names = {}
    if team_stats_rows:
        ids = [row.target_team_id for row in team_stats_rows if row.target_team_id is not None]
        teams_result = await db.execute(select(Team).where(Team.id.in_(ids)))
        for t in teams_result.scalars().all():
            team_names[t.id] = t.name

    metrics_result = await db.execute(
        select(ExerciseMetricSnapshot)
        .where(ExerciseMetricSnapshot.exercise_id == exercise_id)
        .order_by(ExerciseMetricSnapshot.ts.desc())
        .limit(1)
    )
    metric = metrics_result.scalar_one_or_none()
    metrics = {
        "stress": float(metric.stress) if metric else 0.0,
        "saturation": float(metric.saturation) if metric else 0.0,
        "communication_external": float(metric.communication_external) if metric else 0.0,
        "technical_mastery": float(metric.technical_mastery) if metric else 0.0,
    }

    injects_result = await db.execute(
        select(Inject)
        .options(selectinload(Inject.audiences), selectinload(Inject.deliveries))
        .where(Inject.exercise_id == exercise_id)
        .order_by(Inject.created_at.desc())
    )
    injects = injects_result.scalars().all()

    exercise_teams_result = await db.execute(
        select(Team)
        .join(ExerciseTeam, ExerciseTeam.team_id == Team.id)
        .where(ExerciseTeam.exercise_id == exercise_id)
    )
    for team in exercise_teams_result.scalars().all():
        team_names[team.id] = team.name

    normalized_injects = [_serialize_live_timeline_item(inject, team_names) for inject in injects]
    business = sorted(
        [item for item in normalized_injects if item["timeline_type"] == TimelineType.BUSINESS.value],
        key=lambda item: ((item["time_offset"] if item["time_offset"] is not None else 10**9), item["created_at"] or ""),
    )
    technical = sorted(
        [item for item in normalized_injects if item["timeline_type"] == TimelineType.TECHNICAL.value],
        key=lambda item: ((item["time_offset"] if item["time_offset"] is not None else 10**9), item["created_at"] or ""),
    )
    realtime = sorted(
        [item for item in normalized_injects if item["is_surprise"]],
        key=lambda item: item["created_at"] or "",
        reverse=True,
    )
    virtual_now_min = _compute_virtual_now_min(exercise)

    return {
        "exercise_id": exercise_id,
        "status": exercise.status.value,
        "time_multiplier": str(exercise.time_multiplier),
        "clock": {
            "exercise_status": exercise.status.value,
            "started_at": exercise.started_at.isoformat() if exercise.started_at else None,
            "time_multiplier": str(exercise.time_multiplier),
            "virtual_now_min": virtual_now_min,
            "real_now": datetime.now(timezone.utc).isoformat(),
        },
        "timelines": {
            "business": business,
            "technical": technical,
            "realtime": realtime,
        },
        "ws_connection_count": ws_manager.get_exercise_connection_count(exercise_id),
        "timeline_live": events,
        "teams_state": [
            {
                "team_id": row.target_team_id,
                "team_name": team_names.get(row.target_team_id, f"Team {row.target_team_id}"),
                "total": row.total,
                "treated": row.treated,
            }
            for row in team_stats_rows
        ],
        "indicators": metrics,
    }


@router.post("/{exercise_id}/live/surprise-injects", status_code=201)
async def create_live_surprise_inject(
    exercise_id: int,
    data: LiveSurpriseInjectPayload,
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Create and optionally dispatch a surprise inject during a live exercise.

    Surprise injects are unscripted events added by animateurs to test
    participant reactivity (e.g. a sudden data-leak discovery).  Supports
    `immediate` dispatch (sent now) or `planned` dispatch (scheduled at a
    future exercise-time offset).
    """
    exercise = await _get_exercise_or_404(exercise_id, db)
    virtual_now_min = _compute_virtual_now_min(exercise)

    if not data.audiences:
        raise HTTPException(status_code=400, detail="At least one audience is required")
    if data.dispatch_mode == "planned":
        if data.planned_time_offset is None:
            raise HTTPException(status_code=400, detail="planned_time_offset is required for planned dispatch")
        if data.planned_time_offset < virtual_now_min:
            raise HTTPException(status_code=400, detail="planned_time_offset must be >= current exercise time")

    content_payload = data.content
    if isinstance(content_payload, str):
        text = content_payload.strip()
        if not text:
            content_payload = {"text": ""}
        else:
            try:
                parsed = json.loads(text)
                content_payload = parsed if isinstance(parsed, dict) else {"text": text}
            except json.JSONDecodeError:
                content_payload = {"text": text}

    inject = Inject(
        exercise_id=exercise_id,
        title=data.title,
        description=data.description,
        type=parse_inject_type(data.type),
        timeline_type=data.timeline_type,
        is_surprise=True,
        content=content_payload if isinstance(content_payload, dict) else {"text": str(content_payload)},
        data_format=InjectDataFormat.TEXT.value,
        duration_min=data.duration_min or 15,
        time_offset=(data.planned_time_offset if data.dispatch_mode == "planned" else virtual_now_min),
        status=InjectStatus.SCHEDULED if data.dispatch_mode == "planned" else InjectStatus.DRAFT,
        created_by=current_user.id,
        channel=data.channel,
        inject_category=data.inject_category,
        pressure_level=data.pressure_level,
    )
    db.add(inject)
    await db.flush()

    await _replace_inject_audiences(db, inject.id, data.audiences)
    team_ids, user_ids = await _compute_delivery_targets(
        db,
        exercise_id=exercise_id,
        audiences=data.audiences,
    )
    for team_id in team_ids:
        db.add(Delivery(inject_id=inject.id, target_team_id=team_id))
    for user_id in user_ids:
        db.add(Delivery(inject_id=inject.id, target_user_id=user_id))

    await db.commit()
    inject = await _load_inject_with_audiences(db, inject.id)

    created_event = await _create_inject_created_event(
        db,
        inject,
        actor_id=current_user.id,
        actor_label=current_user.username,
    )
    await db.commit()
    await ws_manager.broadcast_event(
        inject.exercise_id,
        created_event,
        audiences=[{"kind": aud.kind.value, "value": aud.value} for aud in (inject.audiences or [])] or None,
    )
    await _broadcast_inject_created(inject)

    send_result = None
    if data.dispatch_mode == "immediate":
        inject = await _load_inject_with_audiences(db, inject.id)
        send_result = await _send_inject_now(db, inject)
        inject = await _load_inject_with_audiences(db, inject.id)

    return {
        "message": "Surprise inject created",
        "dispatch_mode": data.dispatch_mode,
        "inject": {
            "id": inject.id,
            "status": inject.status.value,
            "is_surprise": True,
            "timeline_type": inject.timeline_type.value if hasattr(inject.timeline_type, "value") else str(inject.timeline_type),
        },
        "send_result": send_result,
    }


@router.post("/{exercise_id}/live/actions")
async def execute_live_action(
    exercise_id: int,
    data: LiveActionPayload,
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Execute a real-time control action on a running exercise.

    Supported actions: `pause`, `resume`, `speed` (change time multiplier),
    `manual_inject` (force-send an inject), `rewind` (shift start time),
    `broadcast`, `hot_edit`.  Each action is logged as an event and broadcast
    via WebSocket.
    """
    exercise = await _get_exercise_or_404(exercise_id, db)
    action = data.action.strip().lower()

    if action == "pause":
        exercise.status = ExerciseStatus.PAUSED
        await inject_scheduler.stop_exercise_scheduler(exercise_id)
    elif action == "resume":
        if exercise.status == ExerciseStatus.DRAFT:
            exercise.started_at = datetime.now(timezone.utc)
        exercise.status = ExerciseStatus.RUNNING
        await inject_scheduler.start_exercise_scheduler(exercise_id)
    elif action == "speed":
        multiplier = float(data.payload.get("multiplier", 1.0))
        if multiplier <= 0 or multiplier > 10:
            raise HTTPException(status_code=400, detail="multiplier must be in ]0, 10]")
        exercise.time_multiplier = multiplier
    elif action == "manual_inject":
        inject_id = int(data.payload.get("inject_id", 0))
        result = await db.execute(
            select(Inject)
            .options(selectinload(Inject.audiences))
            .where(Inject.id == inject_id, Inject.exercise_id == exercise_id)
        )
        inject = result.scalar_one_or_none()
        if not inject:
            raise HTTPException(status_code=404, detail="Inject not found")
        await _send_inject_now(db, inject)
    elif action == "rewind":
        minutes = int(data.payload.get("minutes", 0))
        if minutes < 0 or minutes > 120:
            raise HTTPException(status_code=400, detail="minutes must be between 0 and 120")
        if exercise.started_at:
            from datetime import timedelta
            exercise.started_at = exercise.started_at + timedelta(minutes=minutes)
    elif action in ("broadcast", "hot_edit"):
        pass
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported action: {data.action}")

    event = Event(
        exercise_id=exercise_id,
        type=EventType.NOTE_ADDED,
        actor_type=EventActorType.USER,
        actor_id=current_user.id,
        actor_label=current_user.username,
        payload={"action": action, "payload": data.payload},
    )
    db.add(event)
    await db.commit()
    await ws_manager.broadcast_exercise_state(exercise_id, action, {"payload": data.payload})
    return {"message": "Action applied", "action": action}


def _compute_kpis(
    exercise: Exercise,
    total_injects: int,
    sent_injects: int,
    treated_deliveries: int,
    total_deliveries: int,
    decisions_count: int,
    reaction_time_avg_min: float = 0.0,
    business_total: int = 0,
    business_sent: int = 0,
    technical_total: int = 0,
    technical_sent: int = 0,
    surprise_sent: int = 0,
    mail_opened_count: int = 0,
    chat_messages_count: int = 0,
):
    now = datetime.now(timezone.utc)
    started_at = exercise.started_at or now
    elapsed_minutes = max(int((now - started_at).total_seconds() / 60), 0)
    activation_minutes = elapsed_minutes if exercise.status != ExerciseStatus.DRAFT else 0
    communication_quality = round((treated_deliveries / total_deliveries) * 100, 2) if total_deliveries > 0 else 0.0
    escalation_quality = min(100.0, decisions_count * 10.0)
    treatment_rate_pct = round(treated_deliveries / total_deliveries * 100, 1) if total_deliveries > 0 else 0.0
    business_completion_pct = round(business_sent / business_total * 100, 1) if business_total > 0 else 0.0
    technical_completion_pct = round(technical_sent / technical_total * 100, 1) if technical_total > 0 else 0.0
    mail_read_rate_pct = round(mail_opened_count / total_deliveries * 100, 1) if total_deliveries > 0 else 0.0

    return {
        "cell_activation_minutes": activation_minutes,
        "communication_quality_score": communication_quality,
        "decisions_taken": decisions_count,
        "hierarchical_escalation_score": escalation_quality,
        "injects_total": total_injects,
        "injects_sent": sent_injects,
        # Réactivité
        "reaction_time_avg_min": reaction_time_avg_min,
        "mail_read_rate_pct": mail_read_rate_pct,
        # Complétion
        "treatment_rate_pct": treatment_rate_pct,
        "business_completion_pct": business_completion_pct,
        "technical_completion_pct": technical_completion_pct,
        # Engagement
        "surprise_injects_count": surprise_sent,
        "chat_activity_count": chat_messages_count,
    }


def _timeline_stats(injects: list) -> dict:
    """Compute delivery stats for a list of injects."""
    all_deliveries = [d for i in injects for d in (i.deliveries or [])]
    total_del = len(all_deliveries)
    treated = sum(1 for d in all_deliveries if d.status == DeliveryStatus.TREATED)
    treated_pct = round(treated / total_del * 100, 1) if total_del > 0 else 0.0
    reaction_times = []
    for d in all_deliveries:
        if d.opened_at and d.delivered_at:
            mins = (d.opened_at - d.delivered_at).total_seconds() / 60
            if mins >= 0:
                reaction_times.append(mins)
    avg_reaction = round(sum(reaction_times) / len(reaction_times), 1) if reaction_times else 0.0
    return {"treated_pct": treated_pct, "avg_reaction_min": avg_reaction}


@router.get("/{exercise_id}/evaluation")
async def get_evaluation(
    exercise_id: int,
    _: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """Compute comprehensive post-exercise evaluation metrics.

    Returns KPIs (activation time, communication quality, treatment rate,
    reaction times), per-inject delivery statistics, decision log, scoring
    history, simulator interaction counts (mail, chat, TV), and both ideal
    and real timelines for side-by-side comparison.
    """
    exercise = await _get_exercise_or_404(exercise_id, db)
    started_at = exercise.started_at

    # ── Phases ───────────────────────────────────────────────────────────────
    phases = (
        await db.execute(select(ExercisePhase).where(ExercisePhase.exercise_id == exercise_id).order_by(ExercisePhase.phase_order))
    ).scalars().all()

    def _phase_for_offset(offset_min):
        if offset_min is None:
            return None
        for p in phases:
            if p.start_offset_min is not None and p.end_offset_min is not None:
                if p.start_offset_min <= offset_min < p.end_offset_min:
                    return p.name
        return None

    # ── Injects with deliveries ───────────────────────────────────────────────
    all_injects = (await db.execute(
        select(Inject)
        .options(selectinload(Inject.deliveries))
        .where(Inject.exercise_id == exercise_id)
        .order_by(Inject.time_offset.asc().nulls_last(), Inject.created_at.asc())
    )).scalars().all()

    business_injects = [i for i in all_injects if hasattr(i.timeline_type, "value") and i.timeline_type.value == "business"]
    technical_injects = [i for i in all_injects if hasattr(i.timeline_type, "value") and i.timeline_type.value == "technical"]
    surprise_injects = [i for i in all_injects if bool(getattr(i, "is_surprise", False))]

    total_injects = len(all_injects)
    sent_injects = sum(1 for i in all_injects if i.status == InjectStatus.SENT)

    # Aggregate delivery stats
    all_deliveries_flat = [d for i in all_injects for d in (i.deliveries or [])]
    total_deliveries = len(all_deliveries_flat)
    treated_deliveries = sum(1 for d in all_deliveries_flat if d.status == DeliveryStatus.TREATED)

    # Global reaction time avg
    all_reaction_times = []
    for d in all_deliveries_flat:
        if d.opened_at and d.delivered_at:
            mins = (d.opened_at - d.delivered_at).total_seconds() / 60
            if mins >= 0:
                all_reaction_times.append(mins)
    reaction_time_avg_min = round(sum(all_reaction_times) / len(all_reaction_times), 1) if all_reaction_times else 0.0

    # ── Decisions ─────────────────────────────────────────────────────────────
    decisions = (await db.execute(
        select(Decision).where(Decision.exercise_id == exercise_id).order_by(Decision.decided_at.asc())
    )).scalars().all()
    decisions_count = len(decisions)

    decision_detail = []
    for d in decisions:
        offset_min = int((d.decided_at - started_at).total_seconds() / 60) if started_at and d.decided_at else None
        decision_detail.append({
            "id": d.id,
            "title": d.title,
            "decided_at": d.decided_at.isoformat() if d.decided_at else None,
            "offset_min": offset_min,
            "team_id": d.team_id,
            "phase_name": _phase_for_offset(offset_min),
        })

    # ── Scores ────────────────────────────────────────────────────────────────
    scores = (await db.execute(
        select(Score).where(Score.exercise_id == exercise_id).order_by(Score.scored_at.asc())
    )).scalars().all()
    scores_detail = [
        {
            "category": s.category,
            "score": float(s.score),
            "max_score": float(s.max_score),
            "scored_at": s.scored_at.isoformat() if s.scored_at else None,
            "team_id": s.team_id,
            "comment": s.comment,
        }
        for s in scores
    ]

    # ── Simulator interactions ─────────────────────────────────────────────────
    mail_opened_count = (await db.execute(
        select(func.count(ReadReceipt.message_id))
        .join(Message, Message.id == ReadReceipt.message_id)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(Conversation.exercise_id == exercise_id)
    )).scalar() or 0

    mail_replied_count = (await db.execute(
        select(func.count(Message.id))
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(
            Conversation.exercise_id == exercise_id,
            Message.parent_message_id.isnot(None),
            Message.author_type == "user",
        )
    )).scalar() or 0

    chat_messages_count = (await db.execute(
        select(func.count(ChatMessage.id))
        .join(ChatRoom, ChatRoom.id == ChatMessage.room_id)
        .where(
            ChatRoom.exercise_id == exercise_id,
            ChatMessage.author_type != "system",
        )
    )).scalar() or 0

    tv_segments = (await db.execute(
        select(TVSegment)
        .join(TVChannel, TVChannel.id == TVSegment.channel_id)
        .where(
            TVChannel.exercise_id == exercise_id,
            TVSegment.actual_start.isnot(None),
        )
    )).scalars().all()
    tv_segments_count = len(tv_segments)
    tv_total_duration_min = sum(
        int((s.actual_end - s.actual_start).total_seconds() / 60)
        for s in tv_segments
        if s.actual_end and s.actual_start
    )

    # ── Injects detail ────────────────────────────────────────────────────────
    injects_detail = []
    for inject in all_injects:
        deliveries = inject.deliveries or []
        delivery_count = len(deliveries)
        opened_count = sum(1 for d in deliveries if d.opened_at is not None)
        treated_count = sum(1 for d in deliveries if d.status == DeliveryStatus.TREATED)
        rt_list = [
            (d.opened_at - d.delivered_at).total_seconds() / 60
            for d in deliveries if d.opened_at and d.delivered_at and (d.opened_at - d.delivered_at).total_seconds() >= 0
        ]
        tt_list = [
            (d.treated_at - d.delivered_at).total_seconds() / 60
            for d in deliveries if d.treated_at and d.delivered_at and (d.treated_at - d.delivered_at).total_seconds() >= 0
        ]
        tl_value = inject.timeline_type.value if hasattr(inject.timeline_type, "value") else str(inject.timeline_type)
        status_value = inject.status.value if hasattr(inject.status, "value") else str(inject.status)
        injects_detail.append({
            "id": inject.id,
            "title": inject.title,
            "timeline_type": tl_value,
            "is_surprise": bool(getattr(inject, "is_surprise", False)),
            "time_offset": inject.time_offset,
            "sent_at": inject.sent_at.isoformat() if inject.sent_at else None,
            "status": status_value,
            "phase_id": inject.phase_id,
            "phase_name": _phase_for_offset(inject.time_offset),
            "delivery_count": delivery_count,
            "opened_count": opened_count,
            "treated_count": treated_count,
            "avg_reaction_min": round(sum(rt_list) / len(rt_list), 1) if rt_list else None,
            "avg_treatment_min": round(sum(tt_list) / len(tt_list), 1) if tt_list else None,
        })

    # ── KPIs ──────────────────────────────────────────────────────────────────
    kpis = _compute_kpis(
        exercise,
        total_injects,
        sent_injects,
        treated_deliveries,
        total_deliveries,
        decisions_count,
        reaction_time_avg_min=reaction_time_avg_min,
        business_total=len(business_injects),
        business_sent=sum(1 for i in business_injects if i.status == InjectStatus.SENT),
        technical_total=len(technical_injects),
        technical_sent=sum(1 for i in technical_injects if i.status == InjectStatus.SENT),
        surprise_sent=sum(1 for i in surprise_injects if i.status == InjectStatus.SENT),
        mail_opened_count=mail_opened_count,
        chat_messages_count=chat_messages_count,
    )

    # ── Events timeline ───────────────────────────────────────────────────────
    events = (await db.execute(
        select(Event).where(Event.exercise_id == exercise_id).order_by(Event.ts.asc()).limit(300)
    )).scalars().all()

    return {
        "exercise_id": exercise_id,
        "kpis": kpis,
        "started_at": started_at.isoformat() if started_at else None,
        "ideal_timeline": [
            {
                "phase": p.name,
                "start_offset_min": p.start_offset_min,
                "end_offset_min": p.end_offset_min,
            }
            for p in phases
        ],
        "real_timeline": [
            {
                "event_id": e.id,
                "type": e.type.value,
                "ts": e.ts,
                "payload": e.payload,
                "offset_min": int((e.ts - started_at).total_seconds() / 60) if started_at and e.ts else None,
            }
            for e in events
        ],
        "injects_by_timeline": {
            "business": {
                "total": len(business_injects),
                "sent": sum(1 for i in business_injects if i.status == InjectStatus.SENT),
                **_timeline_stats(business_injects),
            },
            "technical": {
                "total": len(technical_injects),
                "sent": sum(1 for i in technical_injects if i.status == InjectStatus.SENT),
                **_timeline_stats(technical_injects),
            },
            "surprise": {
                "total": len(surprise_injects),
                "sent": sum(1 for i in surprise_injects if i.status == InjectStatus.SENT),
            },
        },
        "simulator_interactions": {
            "mail_opened_count": mail_opened_count,
            "mail_replied_count": mail_replied_count,
            "chat_messages_count": chat_messages_count,
            "tv_segments_count": tv_segments_count,
            "tv_total_duration_min": tv_total_duration_min,
        },
        "decisions": decision_detail,
        "scores": scores_detail,
        "injects_detail": injects_detail,
    }


@router.post("/{exercise_id}/retex/generate")
async def generate_retex(
    exercise_id: int,
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR, UserRole.OBSERVATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Generate a RETEX (post-exercise feedback) report.

    Computes evaluation KPIs and persists a `RetexReport` record.
    Available to admin, animateur, and observateur roles.
    """
    exercise = await _get_exercise_or_404(exercise_id, db)
    evaluation = await get_evaluation(exercise_id=exercise_id, _=current_user, db=db)
    summary = (
        f"RETEX {exercise.name} - decisions={evaluation['kpis']['decisions_taken']} "
        f"communication={evaluation['kpis']['communication_quality_score']}"
    )
    report = RetexReport(
        exercise_id=exercise_id,
        generated_by=current_user.id,
        summary=summary,
        kpis=evaluation["kpis"],
        report_metadata={"generated_at": datetime.now(timezone.utc).isoformat()},
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return {"message": "RETEX generated", "report_id": report.id, "kpis": report.kpis}


@router.get("/{exercise_id}/retex/export.json")
async def export_retex_json(
    exercise_id: int,
    _: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """Export the most recent RETEX report as a downloadable JSON file."""
    await _get_exercise_or_404(exercise_id, db)
    result = await db.execute(select(RetexReport).where(RetexReport.exercise_id == exercise_id).order_by(RetexReport.created_at.desc()))
    report = result.scalars().first()
    if not report:
        raise HTTPException(status_code=404, detail="No RETEX report generated")
    payload = {
        "report_id": report.id,
        "exercise_id": report.exercise_id,
        "summary": report.summary,
        "kpis": report.kpis,
        "metadata": report.report_metadata,
        "created_at": report.created_at.isoformat(),
    }
    return Response(
        content=json.dumps(payload, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="retex_{exercise_id}.json"'},
    )


def _simple_pdf_bytes(title: str, lines: list[str]) -> bytes:
    sanitized_lines = [line.replace("(", "[").replace(")", "]") for line in lines]
    text_lines = "\\n".join(sanitized_lines[:30])
    stream = f"BT /F1 12 Tf 40 760 Td ({title}) Tj T* ({text_lines}) Tj ET"
    pdf = (
        "%PDF-1.4\n"
        "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
        "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
        "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n"
        "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n"
        f"5 0 obj << /Length {len(stream)} >> stream\n{stream}\nendstream endobj\n"
        "xref\n0 6\n0000000000 65535 f \n"
        "0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n"
        "0000000241 00000 n \n0000000311 00000 n \n"
        "trailer << /Size 6 /Root 1 0 R >>\nstartxref\n430\n%%EOF"
    )
    return pdf.encode("latin-1", errors="ignore")


@router.get("/{exercise_id}/retex/export.pdf")
async def export_retex_pdf(
    exercise_id: int,
    _: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """Export the most recent RETEX report as a downloadable PDF file."""
    await _get_exercise_or_404(exercise_id, db)
    result = await db.execute(select(RetexReport).where(RetexReport.exercise_id == exercise_id).order_by(RetexReport.created_at.desc()))
    report = result.scalars().first()
    if not report:
        raise HTTPException(status_code=404, detail="No RETEX report generated")
    lines = [
        f"Report: {report.id}",
        f"Summary: {report.summary or 'n/a'}",
        f"KPIs: {json.dumps(report.kpis or {}, ensure_ascii=True)}",
        f"Created: {report.created_at.isoformat()}",
    ]
    pdf_bytes = _simple_pdf_bytes(f"RETEX Exercise {exercise_id}", lines)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="retex_{exercise_id}.pdf"'},
    )


@router.get("/{exercise_id}/retex/export.anssi.json")
async def export_retex_anssi_json(
    exercise_id: int,
    _: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """Export the RETEX report in ANSSI-compatible JSON format (stub v1).

    Produces a JSON structure aligned with the French ANSSI exercise
    reporting framework.
    """
    await _get_exercise_or_404(exercise_id, db)
    result = await db.execute(select(RetexReport).where(RetexReport.exercise_id == exercise_id).order_by(RetexReport.created_at.desc()))
    report = result.scalars().first()
    if not report:
        raise HTTPException(status_code=404, detail="No RETEX report generated")
    payload = {
        "format": "anssi-compatible-v1-stub",
        "exercise_id": exercise_id,
        "report_id": report.id,
        "summary": report.summary,
        "kpis": report.kpis,
        "generated_at": report.created_at.isoformat(),
    }
    return Response(
        content=json.dumps(payload, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="retex_{exercise_id}_anssi.json"'},
    )


def _normalize_phase_name(name: str) -> str:
    return " ".join(name.strip().lower().split())


def _normalize_team_name(name: str) -> str:
    return " ".join(name.strip().lower().split())


def _safe_int(value, default=None):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _safe_str(value: object) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _extract_actor_rows(data) -> list:
    """Normalize actor payloads from multiple import shapes."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        # Check for common keys that contain actor lists
        for key in ["actors", "contacts", "directory", "users", "people", "participants", "entries", "members", "annuaire"]:
            if isinstance(data.get(key), list):
                return data.get(key, [])
        # Check for nested metadata.annuaire structure (common in inject bank directories)
        if isinstance(data.get("metadata"), dict):
            metadata = data.get("metadata", {})
            if isinstance(metadata.get("annuaire"), list):
                return metadata.get("annuaire", [])
        # Check if the dict itself looks like a single actor
        if {"name", "email", "username", "role", "exercise_role", "participant_role", "display_name", "full_name", "nom", "login"} & set(data.keys()):
            return [data]
    return []


def _slugify_identifier(value: str, fallback: str = "acteur") -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "_", ascii_text).strip("._-").lower()
    return slug or fallback


async def _find_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    result = await db.execute(select(User).where(func.lower(User.email) == email.lower()))
    return result.scalar_one_or_none()


async def _find_user_by_username(db: AsyncSession, username: str) -> Optional[User]:
    result = await db.execute(select(User).where(func.lower(User.username) == username.lower()))
    return result.scalar_one_or_none()


async def _build_unique_username(db: AsyncSession, base: str) -> str:
    base_clean = _slugify_identifier(base)[:50] or "acteur"
    candidate = base_clean
    suffix = 1
    while await _find_user_by_username(db, candidate):
        suffix_text = f"_{suffix}"
        candidate = f"{base_clean[:max(1, 50 - len(suffix_text))]}{suffix_text}"
        suffix += 1
    return candidate


async def _build_unique_email(db: AsyncSession, local_part: str, domain: str = "import.local") -> str:
    local_clean = _slugify_identifier(local_part)[:64] or "acteur"
    candidate_local = local_clean
    suffix = 1
    while await _find_user_by_email(db, f"{candidate_local}@{domain}"):
        suffix_text = f".{suffix}"
        candidate_local = f"{local_clean[:max(1, 64 - len(suffix_text))]}{suffix_text}"
        suffix += 1
    return f"{candidate_local}@{domain}"


def _extract_actor_name(actor: dict) -> Optional[str]:
    """Extract actor name from various possible field names."""
    return (
        _safe_str(actor.get("name"))
        or _safe_str(actor.get("nom"))
        or _safe_str(actor.get("display_name"))
        or _safe_str(actor.get("full_name"))
        or _safe_str(actor.get("displayName"))
        or _safe_str(actor.get("fullName"))
        or _safe_str(actor.get("first_name"))
        or _safe_str(actor.get("lastName"))
        or _safe_str(actor.get("lastname"))
        or _safe_str(actor.get("prenom"))
    )


async def _resolve_or_create_user_for_actor(actor: dict, db: AsyncSession, summary: dict) -> Optional[User]:
    user_id = _safe_int(actor.get("user_id"))
    if user_id:
        user_result = await db.execute(select(User).where(User.id == user_id))
        existing_user = user_result.scalar_one_or_none()
        if existing_user:
            return existing_user

    email = _safe_str(actor.get("email"))
    if email:
        existing_by_email = await _find_user_by_email(db, email)
        if existing_by_email:
            return existing_by_email

    # Support both 'username' and 'login' fields
    username = _safe_str(actor.get("username")) or _safe_str(actor.get("login"))
    if username:
        existing_by_username = await _find_user_by_username(db, username)
        if existing_by_username:
            return existing_by_username

    actor_name = _extract_actor_name(actor)
    if not any((email, username, actor_name)):
        summary["actors_skipped"] = summary.get("actors_skipped", 0) + 1
        return None

    base_username = username or actor_name or (email.split("@")[0] if email else "acteur")
    unique_username = await _build_unique_username(db, base_username)
    unique_email = (email.lower() if email else await _build_unique_email(db, unique_username))

    raw_password = _safe_str(actor.get("password")) or f"Tmp-{secrets.token_urlsafe(10)}"
    user = User(
        email=unique_email,
        username=unique_username,
        password_hash=hash_password(raw_password),
        role=UserRole.PARTICIPANT,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    summary["users_created"] = summary.get("users_created", 0) + 1
    return user


async def _upsert_imported_actors(
    *,
    exercise_id: int,
    actors: list,
    current_user: User,
    db: AsyncSession,
    summary: dict,
    team_rename_map: Optional[dict[str, str]] = None,
) -> None:
    if not isinstance(actors, list):
        return

    existing_result = await db.execute(
        select(ExerciseUser)
        .where(ExerciseUser.exercise_id == exercise_id)
    )
    by_user_id = {eu.user_id: eu for eu in existing_result.scalars().all()}

    exercise_teams_result = await db.execute(
        select(Team)
        .join(ExerciseTeam, ExerciseTeam.team_id == Team.id)
        .where(ExerciseTeam.exercise_id == exercise_id)
    )
    exercise_teams = exercise_teams_result.scalars().all()
    exercise_teams_by_id = {team.id: team for team in exercise_teams}
    exercise_teams_by_name = {
        _normalize_team_name(team.name): team
        for team in exercise_teams
        if team.name
    }

    all_teams_result = await db.execute(select(Team))
    all_teams = all_teams_result.scalars().all()
    all_teams_by_name = {
        _normalize_team_name(team.name): team
        for team in all_teams
        if team.name
    }

    rename_lookup: dict[str, str] = {}
    if isinstance(team_rename_map, dict):
        for source_name, target_name in team_rename_map.items():
            source_clean = _safe_str(source_name)
            target_clean = _safe_str(target_name)
            if source_clean and target_clean:
                rename_lookup[_normalize_team_name(source_clean)] = target_clean

    for actor in actors:
        if not isinstance(actor, dict):
            continue

        user = await _resolve_or_create_user_for_actor(actor, db, summary)
        if user is None:
            continue

        role = _parse_enum(
            ExerciseRole,
            actor.get("role") or actor.get("exercise_role") or actor.get("participant_role"),
            ExerciseRole.JOUEUR,
        )
        team_id = _safe_int(actor.get("team_id"))
        team_name = (
            _safe_str(actor.get("team_name"))
            or _safe_str(actor.get("team"))
            or _safe_str(actor.get("equipe"))
        )
        organization = actor.get("organization")
        # Support multiple function field names: real_function, function, fonction
        real_function_value = (
            actor.get("real_function") if "real_function" in actor
            else actor.get("function") if "function" in actor
            else actor.get("fonction") if "fonction" in actor
            else None
        )

        if team_id:
            team_result = await db.execute(select(Team).where(Team.id == team_id))
            team = team_result.scalar_one_or_none()
            if team:
                if team.id not in exercise_teams_by_id:
                    db.add(ExerciseTeam(exercise_id=exercise_id, team_id=team.id))
                    await db.flush()
                    exercise_teams_by_id[team.id] = team
                    exercise_teams_by_name[_normalize_team_name(team.name)] = team
                    summary["teams_attached"] = summary.get("teams_attached", 0) + 1
            else:
                team_id = None
        elif team_name:
            source_team_name = team_name
            source_key = _normalize_team_name(source_team_name)
            rename_target = rename_lookup.get(source_key)

            if source_key in all_teams_by_name and not rename_target:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "TEAM_NAME_CONFLICT",
                        "component": "actors",
                        "team_name": source_team_name,
                        "message": f"L'équipe '{source_team_name}' existe déjà. Veuillez la renommer pour l'import.",
                    },
                )

            final_team_name = rename_target or source_team_name
            final_key = _normalize_team_name(final_team_name)

            if final_key in all_teams_by_name:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "TEAM_NAME_CONFLICT",
                        "component": "actors",
                        "team_name": final_team_name,
                        "message": f"L'équipe '{final_team_name}' existe déjà. Veuillez choisir un autre nom pour l'import.",
                    },
                )
            else:
                new_team = Team(name=final_team_name)
                db.add(new_team)
                await db.flush()
                db.add(ExerciseTeam(exercise_id=exercise_id, team_id=new_team.id))
                await db.flush()
                all_teams_by_name[final_key] = new_team
                exercise_teams_by_id[new_team.id] = new_team
                exercise_teams_by_name[final_key] = new_team
                team_id = new_team.id
                summary["teams_created"] = summary.get("teams_created", 0) + 1

        eu = by_user_id.get(user.id)
        if eu is None:
            eu = ExerciseUser(
                exercise_id=exercise_id,
                user_id=user.id,
                role=role,
                team_id=team_id,
                organization=organization,
                real_function=real_function_value,
                assigned_by=current_user.id,
            )
            db.add(eu)
            await db.flush()
            by_user_id[user.id] = eu
            summary["actors_created"] = summary.get("actors_created", 0) + 1
        else:
            eu.role = role
            eu.team_id = team_id
            if "organization" in actor:
                eu.organization = organization
            if "real_function" in actor or "function" in actor or "fonction" in actor:
                eu.real_function = real_function_value
            summary["actors_updated"] = summary.get("actors_updated", 0) + 1

        if any(k in actor for k in ("can_social", "can_tv", "can_mail", "visibility_scope")):
            cap_result = await db.execute(
                select(ParticipantCapability).where(ParticipantCapability.exercise_user_id == eu.id)
            )
            cap = cap_result.scalar_one_or_none()
            if cap is None:
                cap = ParticipantCapability(
                    exercise_id=exercise_id,
                    exercise_user_id=eu.id,
                    can_social=True,
                    can_tv=True,
                    can_mail=True,
                    visibility_scope=InjectVisibilityScope.TEAM_ONLY,
                )
                db.add(cap)
            if "can_social" in actor:
                cap.can_social = bool(actor.get("can_social"))
            if "can_tv" in actor:
                cap.can_tv = bool(actor.get("can_tv"))
            if "can_mail" in actor:
                cap.can_mail = bool(actor.get("can_mail"))
            if "visibility_scope" in actor and actor.get("visibility_scope"):
                parsed_scope = _parse_enum(InjectVisibilityScope, str(actor.get("visibility_scope")))
                if parsed_scope:
                    cap.visibility_scope = parsed_scope


def _inject_bank_kind_from_inject_type(inject_type: InjectType) -> InjectBankKind:
    if inject_type == InjectType.MAIL:
        return InjectBankKind.MAIL
    if inject_type == InjectType.TWITTER:
        return InjectBankKind.SOCIAL_POST
    if inject_type == InjectType.TV:
        return InjectBankKind.VIDEO
    if inject_type == InjectType.DECISION:
        return InjectBankKind.IDEA
    return InjectBankKind.OTHER


def _parse_enum(enum_type, value, default=None):
    if value is None:
        return default
    try:
        return enum_type(value)
    except Exception:
        return default


def _normalize_socle_string(value: object) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _normalize_plugin_type(value: object, valid_plugin_types: set[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = normalize_plugin_type(value)
    if normalized in valid_plugin_types:
        return normalized
    raw_value = str(value).strip().lower()
    if raw_value in valid_plugin_types:
        return raw_value
    return None


async def _upsert_plugin(
    db: AsyncSession,
    exercise_id: int,
    plugin_type: str,
    enabled: bool,
    configuration: Optional[dict] = None,
) -> None:
    result = await db.execute(
        select(ExercisePlugin).where(
            ExercisePlugin.exercise_id == exercise_id,
            func.lower(ExercisePlugin.plugin_type.cast(String)) == plugin_type,
        )
    )
    plugin = result.scalar_one_or_none()
    if plugin is None:
        plugin = ExercisePlugin(
            exercise_id=exercise_id,
            plugin_type=plugin_type,
            enabled=enabled,
            configuration=configuration,
        )
        db.add(plugin)
        return

    if normalize_plugin_type(plugin.plugin_type) != plugin_type:
        plugin.plugin_type = plugin_type
    plugin.enabled = enabled
    if configuration is not None:
        plugin.configuration = configuration


@router.post("/{exercise_id}/imports/{component}")
async def import_exercise_component(
    exercise_id: int,
    component: str,
    file: UploadFile = File(...),
    team_rename_map: Optional[str] = Form(default=None),
    update_inject_bank: bool = Query(default=False),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Import structured JSON for one exercise component.

    Upload a JSON file to populate a specific component of the exercise:
    `socle` (base config), `scenario`, `actors` (crisis directory),
    `timeline`, `injects`, `plugins`, or `full` (all-in-one).
    Existing data is merged non-destructively.
    """
    component = component.strip().lower()
    if component not in SUPPORTED_IMPORT_COMPONENTS:
        raise HTTPException(status_code=400, detail=f"Unsupported import component: {component}")

    await _get_exercise_or_404(exercise_id, db)

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty import file")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON import file") from exc

    summary = {
        "component": component,
        "exercise_id": exercise_id,
        "updated_exercise_fields": 0,
        "scenario_fields_updated": 0,
        "axes_created": 0,
        "axes_updated": 0,
        "actors_created": 0,
        "actors_updated": 0,
        "actors_skipped": 0,
        "users_created": 0,
        "phases_created": 0,
        "phases_updated": 0,
        "triggers_upserted": 0,
        "injects_created": 0,
        "plugins_upserted": 0,
        "inject_bank_created": 0,
        "teams_created": 0,
        "teams_attached": 0,
    }
    parsed_team_rename_map: Optional[dict[str, str]] = None
    if team_rename_map:
        try:
            candidate = json.loads(team_rename_map)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid team_rename_map JSON") from exc
        if not isinstance(candidate, dict):
            raise HTTPException(status_code=400, detail="team_rename_map must be a JSON object")
        parsed_team_rename_map = {str(k): str(v) for k, v in candidate.items()}
    valid_plugin_types = set(await get_canonical_plugin_types(db))

    async def apply_socle(data: dict):
        if not isinstance(data, dict):
            return
        exercise = await _get_exercise_or_404(exercise_id, db)
        fields = [
            "name",
            "description",
            "time_multiplier",
            "exercise_type",
            "target_duration_hours",
            "maturity_level",
            "mode",
            "planned_date",
            "lead_organizer_user_id",
        ]
        for field in fields:
            if field not in data:
                continue
            value = data[field]
            if value is None:
                continue
            setattr(exercise, field, value)
            summary["updated_exercise_fields"] += 1

    async def apply_scenario(data: dict):
        if not isinstance(data, dict):
            return
        scenario_data = data.get("scenario", data)
        axes_data = data.get("axes", [])

        result = await db.execute(select(ExerciseScenario).where(ExerciseScenario.exercise_id == exercise_id))
        scenario = result.scalar_one_or_none()
        if not scenario:
            scenario = ExerciseScenario(exercise_id=exercise_id)
            db.add(scenario)

        for field in [
            "strategic_intent",
            "initial_context",
            "initial_situation",
            "implicit_hypotheses",
            "hidden_brief",
            "pedagogical_objectives",
            "evaluation_criteria",
            "stress_factors",
        ]:
            if field in scenario_data:
                setattr(scenario, field, scenario_data[field])
                summary["scenario_fields_updated"] += 1

        if isinstance(axes_data, list):
            existing_result = await db.execute(
                select(ExerciseEscalationAxis).where(ExerciseEscalationAxis.exercise_id == exercise_id)
            )
            existing = {axis.axis_type.value: axis for axis in existing_result.scalars().all()}
            for axis_item in axes_data:
                if not isinstance(axis_item, dict) or "axis_type" not in axis_item:
                    continue
                axis_type = str(axis_item["axis_type"])
                intensity = _safe_int(axis_item.get("intensity"), 1) or 1
                notes = axis_item.get("notes")
                if axis_type in existing:
                    existing[axis_type].intensity = intensity
                    existing[axis_type].notes = notes
                    summary["axes_updated"] += 1
                else:
                    db.add(
                        ExerciseEscalationAxis(
                            exercise_id=exercise_id,
                            axis_type=EscalationAxisType(axis_type),
                            intensity=intensity,
                            notes=notes,
                        )
                    )
                    summary["axes_created"] += 1

    async def apply_actors(data):
        actors = _extract_actor_rows(data)
        await _upsert_imported_actors(
            exercise_id=exercise_id,
            actors=actors,
            current_user=current_user,
            db=db,
            summary=summary,
            team_rename_map=parsed_team_rename_map,
        )

    async def apply_timeline(data):
        if not isinstance(data, dict):
            return
        phases_data = data.get("phases", [])
        triggers_data = data.get("triggers", [])

        existing_result = await db.execute(
            select(ExercisePhase).where(ExercisePhase.exercise_id == exercise_id)
        )
        existing_phases = {
            _normalize_phase_name(phase.name): phase for phase in existing_result.scalars().all()
        }
        max_order = max([phase.phase_order for phase in existing_phases.values()], default=0)

        if isinstance(phases_data, list):
            for phase_item in phases_data:
                if not isinstance(phase_item, dict) or not phase_item.get("name"):
                    continue
                normalized = _normalize_phase_name(str(phase_item["name"]))
                if normalized in existing_phases:
                    phase = existing_phases[normalized]
                    if "description" in phase_item:
                        phase.description = phase_item.get("description")
                    if "start_offset_min" in phase_item:
                        phase.start_offset_min = _safe_int(phase_item.get("start_offset_min"))
                    if "end_offset_min" in phase_item:
                        phase.end_offset_min = _safe_int(phase_item.get("end_offset_min"))
                    if "phase_order" in phase_item and _safe_int(phase_item.get("phase_order")) is not None:
                        phase.phase_order = _safe_int(phase_item.get("phase_order"))
                    summary["phases_updated"] += 1
                else:
                    max_order += 1
                    db.add(
                        ExercisePhase(
                            exercise_id=exercise_id,
                            name=str(phase_item["name"]),
                            description=phase_item.get("description"),
                            phase_order=_safe_int(phase_item.get("phase_order"), max_order) or max_order,
                            start_offset_min=_safe_int(phase_item.get("start_offset_min")),
                            end_offset_min=_safe_int(phase_item.get("end_offset_min")),
                        )
                    )
                    summary["phases_created"] += 1

        if isinstance(triggers_data, list):
            for trigger_item in triggers_data:
                if not isinstance(trigger_item, dict):
                    continue
                inject_id = _safe_int(trigger_item.get("inject_id"))
                if not inject_id:
                    continue
                inject_result = await db.execute(
                    select(Inject).where(Inject.id == inject_id, Inject.exercise_id == exercise_id)
                )
                inject = inject_result.scalar_one_or_none()
                if not inject:
                    continue
                rule_result = await db.execute(select(InjectTriggerRule).where(InjectTriggerRule.inject_id == inject_id))
                rule = rule_result.scalar_one_or_none()
                if rule is None:
                    rule = InjectTriggerRule(exercise_id=exercise_id, inject_id=inject_id)
                    db.add(rule)
                if trigger_item.get("trigger_mode"):
                    rule.trigger_mode = TriggerMode(str(trigger_item["trigger_mode"]))
                if "expression" in trigger_item:
                    rule.expression = trigger_item.get("expression")
                summary["triggers_upserted"] += 1

    async def apply_injects(data):
        injects_data = data.get("injects", data) if isinstance(data, dict) else data
        if not isinstance(injects_data, list):
            return

        phase_result = await db.execute(select(ExercisePhase).where(ExercisePhase.exercise_id == exercise_id))
        phase_by_name = {_normalize_phase_name(phase.name): phase.id for phase in phase_result.scalars().all()}

        for inject_item in injects_data:
            if not isinstance(inject_item, dict):
                continue
            title = inject_item.get("title")
            if not title:
                continue
            inject_type = parse_inject_type(inject_item.get("type"))
            phase_id = _safe_int(inject_item.get("phase_id"))
            phase_name = inject_item.get("phase_name")
            if not phase_id and isinstance(phase_name, str):
                phase_id = phase_by_name.get(_normalize_phase_name(phase_name))

            inject = Inject(
                exercise_id=exercise_id,
                type=inject_type,
                title=str(title),
                description=inject_item.get("description"),
                content=inject_item.get("content") if isinstance(inject_item.get("content"), dict) else {},
                custom_id=inject_item.get("custom_id"),
                inject_category=_parse_enum(InjectCategory, inject_item.get("inject_category")),
                channel=_parse_enum(InjectChannel, inject_item.get("channel")),
                target_audience=_parse_enum(TargetAudience, inject_item.get("target_audience")),
                pedagogical_objective=inject_item.get("pedagogical_objective"),
                tested_competence=_parse_enum(TestedCompetence, inject_item.get("tested_competence")),
                pressure_level=_parse_enum(PressureLevel, inject_item.get("pressure_level")),
                dependency_ids=inject_item.get("dependency_ids"),
                time_offset=_safe_int(inject_item.get("time_offset")),
                phase_id=phase_id,
                created_by=current_user.id,
            )
            db.add(inject)
            await db.flush()
            summary["injects_created"] += 1

            if update_inject_bank:
                db.add(
                    InjectBankItem(
                        title=inject.title,
                        kind=_inject_bank_kind_from_inject_type(inject.type),
                        status=InjectBankStatus.READY,
                        data_format=getattr(inject, "data_format", "text") or "text",
                        category=(inject.inject_category.value if inject.inject_category else None),
                        summary=inject.description,
                        content=json.dumps(inject.content, ensure_ascii=False),
                        payload={
                            "source": "exercise-import",
                            "exercise_id": exercise_id,
                            "inject_id": inject.id,
                            "inject_type": inject.type.value,
                        },
                        tags=["exercise-import", inject.type.value],
                        created_by=current_user.id,
                    )
                )
                summary["inject_bank_created"] += 1

    async def apply_plugins(data):
        if not isinstance(data, dict):
            return
        plugins_data = data.get("plugins", data)
        if not isinstance(plugins_data, list):
            return

        for plugin_item in plugins_data:
            if isinstance(plugin_item, str):
                plugin_type = _normalize_plugin_type(plugin_item, valid_plugin_types)
                if not plugin_type:
                    continue
                enabled = True
                configuration = None
            elif isinstance(plugin_item, dict):
                plugin_type = _normalize_plugin_type(plugin_item.get("plugin_type"), valid_plugin_types)
                if not plugin_type:
                    continue
                enabled = bool(plugin_item.get("enabled", True))
                configuration = plugin_item.get("configuration")
            else:
                continue

            await _upsert_plugin(db, exercise_id, plugin_type, enabled, configuration)
            summary["plugins_upserted"] += 1

    if component == "full":
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail="Full import expects an object payload")
        await apply_socle(payload.get("socle", {}))
        await apply_scenario(payload.get("scenario", {}))
        await apply_actors(payload.get("actors", []))
        await apply_timeline(payload.get("timeline", {}))
        await apply_injects(payload.get("injects", []))
        await apply_plugins(payload.get("plugins", []))
    elif component == "socle":
        await apply_socle(payload)
    elif component == "scenario":
        await apply_scenario(payload)
    elif component == "actors":
        await apply_actors(payload)
    elif component == "timeline":
        await apply_timeline(payload)
    elif component == "injects":
        await apply_injects(payload)
    elif component == "plugins":
        await apply_plugins(payload)

    await db.commit()
    return {"message": "Import completed", "summary": summary}


def _inject_type_from_bank_kind(kind: InjectBankKind) -> InjectType:
    if kind == InjectBankKind.MAIL:
        return InjectType.MAIL
    if kind == InjectBankKind.SOCIAL_POST:
        return InjectType.TWITTER
    if kind in (InjectBankKind.VIDEO, InjectBankKind.IMAGE):
        return InjectType.TV
    if kind == InjectBankKind.IDEA:
        return InjectType.DECISION
    return InjectType.SYSTEM


@router.post("/{exercise_id}/imports/{component}/from-bank")
async def import_exercise_component_from_bank(
    exercise_id: int,
    component: str,
    kind: InjectBankKind = Query(...),
    category: Optional[str] = Query(default=None),
    limit: int = Query(default=25, ge=1, le=200),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Import a component from inject-bank items filtered by kind and category.

    Queries the inject bank for matching items and converts them into
    exercise-level resources (injects, scenario elements, etc.).
    """
    component = component.strip().lower()
    if component not in SUPPORTED_IMPORT_COMPONENTS:
        raise HTTPException(status_code=400, detail=f"Unsupported bank import component: {component}")

    await _get_exercise_or_404(exercise_id, db)

    query = select(InjectBankItem).where(InjectBankItem.kind == kind)
    if category:
        query = query.where(InjectBankItem.category == category)
    query = query.where(InjectBankItem.status != InjectBankStatus.ARCHIVED).order_by(InjectBankItem.updated_at.desc()).limit(limit)
    result = await db.execute(query)
    items = result.scalars().all()
    if not items:
        raise HTTPException(status_code=404, detail="No inject bank items found for this filter")

    summary = {
        "component": component,
        "kind": kind.value,
        "items_used": len(items),
        "scenario_fields_updated": 0,
        "axes_created": 0,
        "actors_created": 0,
        "actors_updated": 0,
        "actors_skipped": 0,
        "users_created": 0,
        "phases_created": 0,
        "injects_created": 0,
    }
    valid_plugin_types = set(await get_canonical_plugin_types(db))

    if component in {"socle", "full"}:
        exercise = await _get_exercise_or_404(exercise_id, db)
        primary = items[0]
        payload = primary.payload if isinstance(primary.payload, dict) else {}
        socle_data = payload.get("socle") if isinstance(payload.get("socle"), dict) else payload
        if isinstance(socle_data, dict):
            if not exercise.name and socle_data.get("name"):
                exercise.name = str(socle_data.get("name"))
                summary["scenario_fields_updated"] += 1
            if not exercise.description and socle_data.get("description"):
                exercise.description = str(socle_data.get("description"))
                summary["scenario_fields_updated"] += 1
            if not exercise.exercise_type and socle_data.get("exercise_type"):
                parsed_type = _normalize_socle_string(socle_data.get("exercise_type"))
                if parsed_type:
                    exercise.exercise_type = parsed_type
                    summary["scenario_fields_updated"] += 1
            if not exercise.maturity_level and socle_data.get("maturity_level"):
                parsed_maturity = _normalize_socle_string(socle_data.get("maturity_level"))
                if parsed_maturity:
                    exercise.maturity_level = parsed_maturity
                    summary["scenario_fields_updated"] += 1
            if not exercise.mode and socle_data.get("mode"):
                parsed_mode = _normalize_socle_string(socle_data.get("mode"))
                if parsed_mode:
                    exercise.mode = parsed_mode
                    summary["scenario_fields_updated"] += 1
            if not exercise.target_duration_hours and _safe_int(socle_data.get("target_duration_hours")):
                exercise.target_duration_hours = _safe_int(socle_data.get("target_duration_hours"))
                summary["scenario_fields_updated"] += 1

    if component in {"scenario", "full"}:
        primary = items[0]
        scenario_result = await db.execute(select(ExerciseScenario).where(ExerciseScenario.exercise_id == exercise_id))
        scenario = scenario_result.scalar_one_or_none()
        if not scenario:
            scenario = ExerciseScenario(exercise_id=exercise_id)
            db.add(scenario)
        if not scenario.strategic_intent:
            scenario.strategic_intent = primary.summary or primary.title
            summary["scenario_fields_updated"] += 1
        if not scenario.initial_context:
            scenario.initial_context = primary.content or primary.summary or primary.title
            summary["scenario_fields_updated"] += 1
        payload = primary.payload if isinstance(primary.payload, dict) else {}
        axes = payload.get("axes", [])
        if isinstance(axes, list):
            existing_axes = (
                await db.execute(select(ExerciseEscalationAxis).where(ExerciseEscalationAxis.exercise_id == exercise_id))
            ).scalars().all()
            existing_axis_types = {axis.axis_type.value for axis in existing_axes}
            for axis_item in axes:
                if not isinstance(axis_item, dict):
                    continue
                axis_type = axis_item.get("axis_type")
                if not axis_type or axis_type in existing_axis_types:
                    continue
                parsed_axis_type = _parse_enum(EscalationAxisType, axis_type)
                if not parsed_axis_type:
                    continue
                db.add(
                    ExerciseEscalationAxis(
                        exercise_id=exercise_id,
                        axis_type=parsed_axis_type,
                        intensity=_safe_int(axis_item.get("intensity"), 1) or 1,
                        notes=axis_item.get("notes"),
                    )
                )
                summary["axes_created"] += 1

    if component in {"timeline", "full"}:
        existing_phases = (
            await db.execute(select(ExercisePhase).where(ExercisePhase.exercise_id == exercise_id))
        ).scalars().all()
        existing_phase_names = {_normalize_phase_name(p.name) for p in existing_phases}
        max_order = max([p.phase_order for p in existing_phases], default=0)

        for item in items:
            payload = item.payload if isinstance(item.payload, dict) else {}
            phases = payload.get("phases")
            phase_candidates = phases if isinstance(phases, list) else [{"name": item.title}]
            for phase_item in phase_candidates:
                if not isinstance(phase_item, dict):
                    continue
                name = str(phase_item.get("name") or "").strip()
                if not name:
                    continue
                normalized = _normalize_phase_name(name)
                if normalized in existing_phase_names:
                    continue
                max_order += 1
                db.add(
                    ExercisePhase(
                        exercise_id=exercise_id,
                        name=name,
                        description=phase_item.get("description"),
                        phase_order=_safe_int(phase_item.get("phase_order"), max_order) or max_order,
                        start_offset_min=_safe_int(phase_item.get("start_offset_min")),
                        end_offset_min=_safe_int(phase_item.get("end_offset_min")),
                    )
                )
                existing_phase_names.add(normalized)
                summary["phases_created"] += 1

    if component in {"injects", "full"}:
        for item in items:
            content_payload = {}
            if isinstance(item.payload, dict):
                content_payload = item.payload
            elif item.content:
                try:
                    content_payload = json.loads(item.content)
                except Exception:
                    content_payload = {"text": item.content}
            elif item.summary:
                content_payload = {"text": item.summary}

            db.add(
                Inject(
                    exercise_id=exercise_id,
                    type=_inject_type_from_bank_kind(item.kind),
                    title=item.title,
                    description=item.summary,
                    content=content_payload,
                    created_by=current_user.id,
                )
            )
            summary["injects_created"] += 1

    if component in {"actors", "full"}:
        aggregated_actors: list[dict] = []
        for item in items:
            payload = item.payload if isinstance(item.payload, dict) else {}
            actors = _extract_actor_rows(payload)
            aggregated_actors.extend([actor for actor in actors if isinstance(actor, dict)])

        await _upsert_imported_actors(
            exercise_id=exercise_id,
            actors=aggregated_actors,
            current_user=current_user,
            db=db,
            summary=summary,
        )

    if component in {"plugins", "full"}:
        for item in items:
            payload = item.payload if isinstance(item.payload, dict) else {}
            plugins = payload.get("plugins", payload)
            if not isinstance(plugins, list):
                continue

            for plugin_item in plugins:
                if isinstance(plugin_item, str):
                    plugin_type = _normalize_plugin_type(plugin_item, valid_plugin_types)
                    enabled = True
                    configuration = None
                elif isinstance(plugin_item, dict):
                    plugin_type = _normalize_plugin_type(plugin_item.get("plugin_type"), valid_plugin_types)
                    enabled = bool(plugin_item.get("enabled", True))
                    configuration = plugin_item.get("configuration")
                else:
                    plugin_type = None
                    enabled = False
                    configuration = None
                if not plugin_type:
                    continue

                await _upsert_plugin(db, exercise_id, plugin_type, enabled, configuration)
                summary["scenario_fields_updated"] += 1

    await db.commit()
    return {"message": "Bank import completed", "summary": summary}


@router.post("/{exercise_id}/imports/{component}/from-bank-selection")
async def import_exercise_component_from_bank_selection(
    exercise_id: int,
    component: str,
    payload: BankSelectionPayload,
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Import a component from an explicit selection of inject-bank items.

    Unlike the filtered `/from-bank` endpoint, this accepts a list of
    specific item IDs chosen by the user.
    """
    component = component.strip().lower()
    if component not in SUPPORTED_IMPORT_COMPONENTS:
        raise HTTPException(status_code=400, detail=f"Unsupported bank import component: {component}")

    await _get_exercise_or_404(exercise_id, db)

    item_ids = list(dict.fromkeys(payload.item_ids))
    result = await db.execute(
        select(InjectBankItem).where(
            InjectBankItem.id.in_(item_ids),
            InjectBankItem.status != InjectBankStatus.ARCHIVED,
        )
    )
    items = result.scalars().all()
    if not items:
        raise HTTPException(status_code=404, detail="No inject bank items found for this selection")

    summary = {
        "component": component,
        "kind": "selection",
        "items_used": len(items),
        "scenario_fields_updated": 0,
        "axes_created": 0,
        "actors_created": 0,
        "actors_updated": 0,
        "actors_skipped": 0,
        "users_created": 0,
        "phases_created": 0,
        "injects_created": 0,
    }
    valid_plugin_types = set(await get_canonical_plugin_types(db))

    if component in {"socle", "full"}:
        exercise = await _get_exercise_or_404(exercise_id, db)
        primary = items[0]
        payload_data = primary.payload if isinstance(primary.payload, dict) else {}
        socle_data = payload_data.get("socle") if isinstance(payload_data.get("socle"), dict) else payload_data
        if isinstance(socle_data, dict):
            if not exercise.name and socle_data.get("name"):
                exercise.name = str(socle_data.get("name"))
                summary["scenario_fields_updated"] += 1
            if not exercise.description and socle_data.get("description"):
                exercise.description = str(socle_data.get("description"))
                summary["scenario_fields_updated"] += 1
            if not exercise.exercise_type and socle_data.get("exercise_type"):
                parsed_type = _normalize_socle_string(socle_data.get("exercise_type"))
                if parsed_type:
                    exercise.exercise_type = parsed_type
                    summary["scenario_fields_updated"] += 1
            if not exercise.maturity_level and socle_data.get("maturity_level"):
                parsed_maturity = _normalize_socle_string(socle_data.get("maturity_level"))
                if parsed_maturity:
                    exercise.maturity_level = parsed_maturity
                    summary["scenario_fields_updated"] += 1
            if not exercise.mode and socle_data.get("mode"):
                parsed_mode = _normalize_socle_string(socle_data.get("mode"))
                if parsed_mode:
                    exercise.mode = parsed_mode
                    summary["scenario_fields_updated"] += 1
            if not exercise.target_duration_hours and _safe_int(socle_data.get("target_duration_hours")):
                exercise.target_duration_hours = _safe_int(socle_data.get("target_duration_hours"))
                summary["scenario_fields_updated"] += 1

    if component in {"scenario", "full"}:
        primary = items[0]
        scenario_result = await db.execute(select(ExerciseScenario).where(ExerciseScenario.exercise_id == exercise_id))
        scenario = scenario_result.scalar_one_or_none()
        if not scenario:
            scenario = ExerciseScenario(exercise_id=exercise_id)
            db.add(scenario)
        if not scenario.strategic_intent:
            scenario.strategic_intent = primary.summary or primary.title
            summary["scenario_fields_updated"] += 1
        if not scenario.initial_context:
            scenario.initial_context = primary.content or primary.summary or primary.title
            summary["scenario_fields_updated"] += 1
        payload_data = primary.payload if isinstance(primary.payload, dict) else {}
        axes = payload_data.get("axes", [])
        if isinstance(axes, list):
            existing_axes = (
                await db.execute(select(ExerciseEscalationAxis).where(ExerciseEscalationAxis.exercise_id == exercise_id))
            ).scalars().all()
            existing_axis_types = {axis.axis_type.value for axis in existing_axes}
            for axis_item in axes:
                if not isinstance(axis_item, dict):
                    continue
                axis_type = axis_item.get("axis_type")
                if not axis_type or axis_type in existing_axis_types:
                    continue
                parsed_axis_type = _parse_enum(EscalationAxisType, axis_type)
                if not parsed_axis_type:
                    continue
                db.add(
                    ExerciseEscalationAxis(
                        exercise_id=exercise_id,
                        axis_type=parsed_axis_type,
                        intensity=_safe_int(axis_item.get("intensity"), 1) or 1,
                        notes=axis_item.get("notes"),
                    )
                )
                summary["axes_created"] += 1

    if component in {"timeline", "full"}:
        existing_phases = (
            await db.execute(select(ExercisePhase).where(ExercisePhase.exercise_id == exercise_id))
        ).scalars().all()
        existing_phase_names = {_normalize_phase_name(p.name) for p in existing_phases}
        max_order = max([p.phase_order for p in existing_phases], default=0)

        for item in items:
            payload_data = item.payload if isinstance(item.payload, dict) else {}
            phases = payload_data.get("phases")
            phase_candidates = phases if isinstance(phases, list) else [{"name": item.title}]
            for phase_item in phase_candidates:
                if not isinstance(phase_item, dict):
                    continue
                name = str(phase_item.get("name") or "").strip()
                if not name:
                    continue
                normalized = _normalize_phase_name(name)
                if normalized in existing_phase_names:
                    continue
                max_order += 1
                db.add(
                    ExercisePhase(
                        exercise_id=exercise_id,
                        name=name,
                        description=phase_item.get("description"),
                        phase_order=_safe_int(phase_item.get("phase_order"), max_order) or max_order,
                        start_offset_min=_safe_int(phase_item.get("start_offset_min")),
                        end_offset_min=_safe_int(phase_item.get("end_offset_min")),
                    )
                )
                existing_phase_names.add(normalized)
                summary["phases_created"] += 1

    if component in {"injects", "full"}:
        for item in items:
            content_payload = {}
            if isinstance(item.payload, dict):
                content_payload = item.payload
            elif item.content:
                try:
                    content_payload = json.loads(item.content)
                except Exception:
                    content_payload = {"text": item.content}
            elif item.summary:
                content_payload = {"text": item.summary}

            db.add(
                Inject(
                    exercise_id=exercise_id,
                    type=_inject_type_from_bank_kind(item.kind),
                    title=item.title,
                    description=item.summary,
                    content=content_payload,
                    created_by=current_user.id,
                )
            )
            summary["injects_created"] += 1

    if component in {"actors", "full"}:
        aggregated_actors: list[dict] = []
        for item in items:
            payload_data = item.payload if isinstance(item.payload, dict) else {}
            actors = _extract_actor_rows(payload_data)
            aggregated_actors.extend([actor for actor in actors if isinstance(actor, dict)])

        await _upsert_imported_actors(
            exercise_id=exercise_id,
            actors=aggregated_actors,
            current_user=current_user,
            db=db,
            summary=summary,
        )

    if component in {"plugins", "full"}:
        for item in items:
            payload_data = item.payload if isinstance(item.payload, dict) else {}
            plugins = payload_data.get("plugins", payload_data)
            if not isinstance(plugins, list):
                continue

            for plugin_item in plugins:
                if isinstance(plugin_item, str):
                    plugin_type = _normalize_plugin_type(plugin_item, valid_plugin_types)
                    enabled = True
                    configuration = None
                elif isinstance(plugin_item, dict):
                    plugin_type = _normalize_plugin_type(plugin_item.get("plugin_type"), valid_plugin_types)
                    enabled = bool(plugin_item.get("enabled", True))
                    configuration = plugin_item.get("configuration")
                else:
                    plugin_type = None
                    enabled = False
                    configuration = None
                if not plugin_type:
                    continue

                await _upsert_plugin(db, exercise_id, plugin_type, enabled, configuration)
                summary["scenario_fields_updated"] += 1

    await db.commit()
    return {"message": "Bank selection import completed", "summary": summary}


@router.get("/{exercise_id}/actors/orgchart")
async def get_orgchart(
    exercise_id: int,
    _: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """Retrieve the organizational chart for exercise participants.

    Returns all exercise users with their role, team assignment,
    organization, and function — structured as a flat node list suitable
    for rendering an org chart in the UI.
    """
    await _get_exercise_or_404(exercise_id, db)
    rows = (
        await db.execute(
            select(ExerciseUser, Team)
            .outerjoin(Team, Team.id == ExerciseUser.team_id)
            .where(ExerciseUser.exercise_id == exercise_id)
            .order_by(ExerciseUser.role, ExerciseUser.id)
        )
    ).all()
    nodes = []
    for eu, team in rows:
        nodes.append(
            {
                "exercise_user_id": eu.id,
                "user_id": eu.user_id,
                "role": eu.role.value,
                "team_id": eu.team_id,
                "team_name": team.name if team else None,
                "organization": eu.organization,
                "real_function": eu.real_function,
            }
        )
    return {"exercise_id": exercise_id, "nodes": nodes}
