"""CrisisLab Exercises router.

Provides CRUD operations and lifecycle management (start, pause, end, restart)
for crisis-simulation exercises such as ransomware, cyber-attack, or IT-outage
scenarios.
"""
import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import String, delete, select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db_session
from app.models import Exercise, ExerciseTeam, ExerciseUser, Inject, ExercisePlugin, PluginConfiguration, Team, Event, EventType, EventActorType, ExercisePhase
from app.models.exercise import ExerciseStatus
from app.models.user import UserRole
from app.schemas.exercise import (
    ExerciseCreate, ExerciseResponse, ExerciseUpdate, ExerciseListResponse, ExerciseStats,
    ExercisePluginResponse, PluginInfoResponse
)
from app.routers.auth import require_auth, require_role
from app.services.tenant_service import get_or_create_tenant_configuration
from app.services.plugin_catalog import (
    ensure_plugin_configurations,
    get_canonical_plugin_types,
    get_plugin_metadata,
    normalize_plugin_type,
    validate_plugin_type,
    validate_plugin_types,
)
from app.services.scheduler import inject_scheduler
from app.services.websocket_manager import ws_manager
from app.utils.tenancy import TenantRequestContext, require_tenant_context

# Default ordered list of phases used to seed new exercises.
DEFAULT_PHASE_NAMES = [
    "Détection",
    "Qualification",
    "Alerte",
    "Activation de la cellule de crise",
    "Analyse de situation",
    "Décisions stratégiques",
    "Endiguement",
    "Continuité d'activité (mode dégradé)",
    "Communication interne",
    "Communication externe (autorités, médias, partenaires)",
    "Remédiation technique",
    "Rétablissement progressif des services",
    "Surveillance renforcée",
    "Désescalade",
    "Clôture de crise",
    "RETEX (retour d'expérience)",
    "Plan d'actions correctives",
]

PHASE_PRESETS: dict[str, list[str]] = {
    "minimal": [
        "Détection",
        "Activation de la cellule de crise",
        "Remédiation technique",
        "Clôture de crise",
    ],
    "classique": [
        "Détection",
        "Qualification",
        "Alerte",
        "Activation de la cellule de crise",
        "Analyse de situation",
        "Décisions stratégiques",
        "Endiguement",
        "Remédiation technique",
        "Clôture de crise",
    ],
    "precis": [
        "Détection",
        "Qualification",
        "Alerte",
        "Activation de la cellule de crise",
        "Analyse de situation",
        "Décisions stratégiques",
        "Endiguement",
        "Continuité d'activité (mode dégradé)",
        "Communication interne",
        "Communication externe (autorités, médias, partenaires)",
        "Remédiation technique",
        "Clôture de crise",
        "RETEX (retour d'expérience)",
    ],
    "full": DEFAULT_PHASE_NAMES,
}
DEFAULT_EXERCISE_TYPE_OPTIONS = [
    {"value": "cyber", "label": "Cyber"},
    {"value": "it_outage", "label": "Panne IT"},
    {"value": "ransomware", "label": "Ransomware"},
    {"value": "mixed", "label": "Mixte"},
]
DEFAULT_EXERCISE_DURATION_OPTIONS = [4, 8, 24]
DEFAULT_EXERCISE_MATURITY_OPTIONS = [
    {"value": "beginner", "label": "Débutant"},
    {"value": "intermediate", "label": "Intermédiaire"},
    {"value": "expert", "label": "Expert"},
]
DEFAULT_EXERCISE_MODE_OPTIONS = [
    {"value": "real_time", "label": "Temps réel"},
    {"value": "compressed", "label": "Compressé"},
    {"value": "simulated", "label": "Simulé"},
]


def _sanitize_select_options_config(raw: object, *, fallback: list[dict[str, str]]) -> list[dict[str, str]]:
    parsed_rows: list[dict] = []
    if isinstance(raw, str) and raw.strip():
        try:
            payload = json.loads(raw)
            if isinstance(payload, list):
                parsed_rows = [row for row in payload if isinstance(row, dict)]
        except (TypeError, json.JSONDecodeError):
            parsed_rows = []

    normalized: list[dict[str, str]] = []
    seen_values: set[str] = set()
    for row in parsed_rows:
        value = str(row.get("value", "")).strip()
        label = str(row.get("label", "")).strip()
        if not value or not label or value in seen_values:
            continue
        seen_values.add(value)
        normalized.append({"value": value, "label": label})
    return normalized or fallback


def _sanitize_duration_options(raw: object) -> list[int]:
    parsed: list[int] = []
    if isinstance(raw, str) and raw.strip():
        try:
            payload = json.loads(raw)
            if isinstance(payload, list):
                for item in payload:
                    value: int | None = None
                    if isinstance(item, int):
                        value = item
                    elif isinstance(item, float) and item.is_integer():
                        value = int(item)
                    elif isinstance(item, str):
                        stripped = item.strip()
                        if stripped.isdigit():
                            value = int(stripped)
                    if value is None or value <= 0 or value in parsed:
                        continue
                    parsed.append(value)
        except (TypeError, json.JSONDecodeError):
            parsed = []
    return parsed or list(DEFAULT_EXERCISE_DURATION_OPTIONS)


def _resolve_socle_options(tenant_config) -> dict[str, object]:
    overlay = getattr(tenant_config, "legacy_app_config_overrides", None) or {}
    type_options = _sanitize_select_options_config(
        overlay.get("exercise_type_options_config"),
        fallback=DEFAULT_EXERCISE_TYPE_OPTIONS,
    )
    maturity_options = _sanitize_select_options_config(
        overlay.get("exercise_maturity_options_config"),
        fallback=DEFAULT_EXERCISE_MATURITY_OPTIONS,
    )
    mode_options = _sanitize_select_options_config(
        overlay.get("exercise_mode_options_config"),
        fallback=DEFAULT_EXERCISE_MODE_OPTIONS,
    )
    duration_options = _sanitize_duration_options(overlay.get("exercise_duration_options_config"))

    type_values = [item["value"] for item in type_options]
    maturity_values = [item["value"] for item in maturity_options]
    mode_values = [item["value"] for item in mode_options]
    duration_values = duration_options

    default_exercise_type = str(overlay.get("default_exercise_type") or "cyber").strip()
    if default_exercise_type not in type_values:
        default_exercise_type = type_values[0]

    default_maturity_level = str(overlay.get("default_maturity_level") or "intermediate").strip()
    if default_maturity_level not in maturity_values:
        default_maturity_level = maturity_values[0]

    default_exercise_mode = str(overlay.get("default_exercise_mode") or "real_time").strip()
    if default_exercise_mode not in mode_values:
        default_exercise_mode = mode_values[0]

    raw_duration = overlay.get("default_exercise_duration_hours")
    if isinstance(raw_duration, int):
        default_duration = raw_duration
    else:
        try:
            default_duration = int(raw_duration)
        except (TypeError, ValueError):
            default_duration = 4
    if default_duration not in duration_values:
        default_duration = duration_values[0]

    return {
        "exercise_type_options": type_options,
        "exercise_duration_options": duration_values,
        "exercise_maturity_options": maturity_options,
        "exercise_mode_options": mode_options,
        "default_exercise_type": default_exercise_type,
        "default_exercise_duration_hours": default_duration,
        "default_maturity_level": default_maturity_level,
        "default_exercise_mode": default_exercise_mode,
    }


def _validate_socle_value(value: str, allowed_values: list[str], field_name: str) -> None:
    if value not in allowed_values:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field_name}: '{value}' is not configured in Options > Exercices",
        )


def _parse_enabled_phase_names(raw: str | None) -> list[str]:
    """Return ordered enabled phase names from stored JSON config.

    Expected input is a JSON array of objects {"name": str, "enabled": bool}.
    Falls back to the full default list when parsing fails or no phase is enabled.
    """
    if not raw:
        return DEFAULT_PHASE_NAMES
    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, list):
            return DEFAULT_PHASE_NAMES
        enabled = [item.get("name") for item in parsed if isinstance(item, dict) and item.get("enabled")]
        # Keep the original order from storage; otherwise fall back to defaults.
        if [name for name in enabled if isinstance(name, str)]:
            return [name for name in enabled if isinstance(name, str)]
    except Exception:
        pass
    return DEFAULT_PHASE_NAMES


async def _seed_phases_for_exercise(
    db: AsyncSession,
    *,
    exercise: Exercise,
    tenant_id: int,
    phase_preset: str | None = None,
) -> None:
    """Create initial phases on exercise creation based on tenant presets."""
    if phase_preset and phase_preset in PHASE_PRESETS:
        names = PHASE_PRESETS[phase_preset]
    else:
        tenant_config = await get_or_create_tenant_configuration(db, tenant_id=tenant_id)
        overlay = getattr(tenant_config, "legacy_app_config_overrides", None) or {}
        names = None
        if isinstance(overlay, dict):
            stored_preset = overlay.get("default_phases_preset")
            if stored_preset == "custom":
                raw_custom = overlay.get("custom_phases_config")
                if raw_custom:
                    try:
                        parsed = json.loads(raw_custom)
                        if isinstance(parsed, list):
                            custom_names = [
                                item.get("name") for item in parsed
                                if isinstance(item, dict) and item.get("name")
                            ]
                            if custom_names:
                                names = custom_names
                    except Exception:
                        pass
            if names is None:
                names = _parse_enabled_phase_names(overlay.get("default_phases_config"))
        if names is None:
            names = _parse_enabled_phase_names(None)
    if not names:
        return

    total_minutes = max(10, (exercise.target_duration_hours or 1) * 60)
    slot = max(5, total_minutes // max(1, len(names)))

    phases = []
    for idx, name in enumerate(names):
        start = idx * slot
        end = total_minutes if idx == len(names) - 1 else (idx + 1) * slot
        phases.append(
            ExercisePhase(
                exercise_id=exercise.id,
                name=name,
                phase_order=idx + 1,
                start_offset_min=start,
                end_offset_min=end,
            )
        )

    db.add_all(phases)

router = APIRouter()


async def _get_exercise_in_tenant_or_404(
    db: AsyncSession,
    exercise_id: int,
    tenant_id: int,
    *,
    with_plugins: bool = False,
) -> Exercise:
    query = select(Exercise).where(
        Exercise.id == exercise_id,
        Exercise.tenant_id == tenant_id,
    )
    if with_plugins:
        query = query.options(selectinload(Exercise.plugins))
    result = await db.execute(query)
    exercise = result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return exercise


class ExerciseTeamResponse(BaseModel):
    """Team attached to a CrisisLab exercise.

    Represents a crisis-cell team participating in the exercise (e.g. IT,
    Communication, Direction Generale).
    """
    id: int = Field(description="Unique team identifier", examples=[1])
    name: str = Field(description="Display name of the team", examples=["Cellule IT"])
    description: Optional[str] = Field(default=None, description="Optional team description", examples=["Equipe technique en charge de la remediation"])
    color: str = Field(description="Hex colour used in the UI for this team", examples=["#3B82F6"])

    model_config = {"from_attributes": True, "json_schema_extra": {
        "example": {
            "id": 1,
            "name": "Cellule IT",
            "description": "Equipe technique en charge de la remediation",
            "color": "#3B82F6",
        }
    }}


class ExerciseTeamListResponse(BaseModel):
    """Paginated list of teams attached to a CrisisLab exercise."""
    teams: list[ExerciseTeamResponse] = Field(description="Teams currently attached to the exercise")

    model_config = {"json_schema_extra": {
        "example": {
            "teams": [
                {"id": 1, "name": "Cellule IT", "description": "Equipe technique en charge de la remediation", "color": "#3B82F6"},
                {"id": 2, "name": "Cellule Communication", "description": "Gestion de la communication de crise", "color": "#EF4444"},
            ]
        }
    }}


class ExerciseSelectOption(BaseModel):
    """Key/label pair used in CrisisLab exercise creation drop-downs."""
    value: str = Field(description="Machine-readable option key", examples=["ransomware"])
    label: str = Field(description="Human-readable label shown in the UI", examples=["Ransomware"])

    model_config = {"json_schema_extra": {
        "example": {
            "value": "ransomware",
            "label": "Ransomware",
        }
    }}


class ExerciseCreationOptionsResponse(BaseModel):
    """Available options and defaults for the CrisisLab exercise creation form.

    Returned to the frontend so it can populate drop-downs, radio buttons, and
    default values when an administrator creates a new exercise.
    """
    exercise_type_options: list[ExerciseSelectOption] = Field(description="Allowed exercise types (e.g. cyber, ransomware)")
    exercise_duration_options: list[int] = Field(description="Allowed target durations in hours", examples=[[4, 8, 24]])
    exercise_maturity_options: list[ExerciseSelectOption] = Field(description="Maturity-level choices for the exercised organisation")
    exercise_mode_options: list[ExerciseSelectOption] = Field(description="Execution mode choices (real-time, compressed, simulated)")
    default_exercise_type: str = Field(description="Pre-selected exercise type", examples=["ransomware"])
    default_exercise_duration_hours: int = Field(description="Pre-selected duration in hours", examples=[4])
    default_maturity_level: str = Field(description="Pre-selected maturity level", examples=["intermediate"])
    default_exercise_mode: str = Field(description="Pre-selected execution mode", examples=["real_time"])

    model_config = {"json_schema_extra": {
        "example": {
            "exercise_type_options": [
                {"value": "cyber", "label": "Cyber"},
                {"value": "ransomware", "label": "Ransomware"},
            ],
            "exercise_duration_options": [4, 8, 24],
            "exercise_maturity_options": [
                {"value": "beginner", "label": "Debutant"},
                {"value": "intermediate", "label": "Intermediaire"},
                {"value": "expert", "label": "Expert"},
            ],
            "exercise_mode_options": [
                {"value": "real_time", "label": "Temps reel"},
                {"value": "compressed", "label": "Compresse"},
            ],
            "default_exercise_type": "ransomware",
            "default_exercise_duration_hours": 4,
            "default_maturity_level": "intermediate",
            "default_exercise_mode": "real_time",
        }
    }}


def _build_plugin_response(
    plugin: ExercisePlugin,
    config_map: dict[str, PluginConfiguration],
) -> ExercisePluginResponse:
    """Build ExercisePluginResponse from ExercisePlugin model."""
    canonical_plugin_type = normalize_plugin_type(plugin.plugin_type)
    info = get_plugin_metadata(canonical_plugin_type, config_map.get(canonical_plugin_type))
    return ExercisePluginResponse(
        plugin_type=canonical_plugin_type,
        enabled=plugin.enabled,
        configuration=plugin.configuration,
        info=PluginInfoResponse(
            type=canonical_plugin_type,
            name=str(info.get("name", canonical_plugin_type)),
            description=str(info.get("description", "")),
            icon=str(info.get("icon", "Box")),
            color=str(info.get("color", "gray")),
            default_enabled=bool(info.get("default_enabled", False)),
            coming_soon=bool(info.get("coming_soon", False)),
            sort_order=int(info.get("sort_order", 0)),
        )
    )


def _build_exercise_response(
    exercise: Exercise,
    config_map: dict[str, PluginConfiguration],
) -> ExerciseResponse:
    """Build ExerciseResponse with plugins from Exercise model."""
    plugins = [_build_plugin_response(p, config_map) for p in exercise.plugins]
    return ExerciseResponse(
        id=exercise.id,
        name=exercise.name,
        description=exercise.description,
        status=exercise.status.value,  # Serialize enum as string
        time_multiplier=exercise.time_multiplier,
        exercise_type=exercise.exercise_type,
        target_duration_hours=exercise.target_duration_hours,
        maturity_level=exercise.maturity_level,
        mode=exercise.mode,
        planned_date=exercise.planned_date,
        business_objective=exercise.business_objective,
        technical_objective=exercise.technical_objective,
        lead_organizer_user_id=exercise.lead_organizer_user_id,
        started_at=exercise.started_at,
        ended_at=exercise.ended_at,
        created_by=exercise.created_by,
        created_at=exercise.created_at,
        updated_at=exercise.updated_at,
        plugins=plugins,
        timeline_configured=exercise.timeline_configured,
    )


@router.get("/creation-options", response_model=ExerciseCreationOptionsResponse)
async def get_exercise_creation_options(
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    tenant_config = await get_or_create_tenant_configuration(
        db,
        tenant_id=tenant_ctx.tenant.id,
        tenant_name=tenant_ctx.tenant.name,
    )
    resolved = _resolve_socle_options(tenant_config)
    return ExerciseCreationOptionsResponse(
        exercise_type_options=[ExerciseSelectOption(**item) for item in resolved["exercise_type_options"]],
        exercise_duration_options=resolved["exercise_duration_options"],
        exercise_maturity_options=[ExerciseSelectOption(**item) for item in resolved["exercise_maturity_options"]],
        exercise_mode_options=[ExerciseSelectOption(**item) for item in resolved["exercise_mode_options"]],
        default_exercise_type=resolved["default_exercise_type"],
        default_exercise_duration_hours=resolved["default_exercise_duration_hours"],
        default_maturity_level=resolved["default_maturity_level"],
        default_exercise_mode=resolved["default_exercise_mode"],
    )


@router.get("", response_model=ExerciseListResponse)
async def list_exercises(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[ExerciseStatus] = None,
    search: Optional[str] = None,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    current_user = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """List all CrisisLab exercises visible to the current user.

    Returns a paginated list of exercises for the current tenant.
    Supports optional filtering by status (draft, running, paused, completed,
    archived) and free-text search on the exercise name.
    Non-admin users only see exercises they participate in.
    """
    query = select(Exercise).where(Exercise.tenant_id == tenant_ctx.tenant.id)
    count_query = select(func.count(Exercise.id)).where(Exercise.tenant_id == tenant_ctx.tenant.id)
    
    # Non-admin users see only exercises they're part of
    if current_user.role not in (UserRole.ADMIN, UserRole.ANIMATEUR, UserRole.OBSERVATEUR):
        # TODO: Filter by user's team participation
        pass
    
    # Apply filters
    if status:
        query = query.where(Exercise.status == status)
        count_query = count_query.where(Exercise.status == status)
    if search:
        search_pattern = f"%{search}%"
        query = query.where(Exercise.name.ilike(search_pattern))
        count_query = count_query.where(Exercise.name.ilike(search_pattern))
    
    # Get total count
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # Paginate
    offset = (page - 1) * page_size
    query = query.options(selectinload(Exercise.plugins)).order_by(Exercise.created_at.desc()).offset(offset).limit(page_size)
    
    result = await db.execute(query)
    exercises = result.scalars().all()
    config_map = await ensure_plugin_configurations(db)
    
    return ExerciseListResponse(
        exercises=[_build_exercise_response(e, config_map) for e in exercises],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=ExerciseResponse, status_code=201)
async def create_exercise(
    exercise_data: ExerciseCreate,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new CrisisLab exercise (admin / animateur only).

    Initialises the exercise with the provided metadata (name, type, duration,
    maturity level, mode), seeds default timeline phases from the tenant
    configuration, and creates plugin entries for all registered channels.
    Values for type, duration, maturity, and mode are validated against the
    tenant-level options configured in *Options > Exercices*.
    """
    tenant_config = await get_or_create_tenant_configuration(
        db,
        tenant_id=tenant_ctx.tenant.id,
        tenant_name=tenant_ctx.tenant.name,
    )
    resolved_options = _resolve_socle_options(tenant_config)
    _validate_socle_value(
        exercise_data.exercise_type,
        [item["value"] for item in resolved_options["exercise_type_options"]],
        "exercise_type",
    )
    _validate_socle_value(
        exercise_data.maturity_level,
        [item["value"] for item in resolved_options["exercise_maturity_options"]],
        "maturity_level",
    )
    _validate_socle_value(
        exercise_data.mode,
        [item["value"] for item in resolved_options["exercise_mode_options"]],
        "mode",
    )
    if exercise_data.target_duration_hours not in resolved_options["exercise_duration_options"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid target_duration_hours: '{exercise_data.target_duration_hours}' is not configured in Options > Exercices",
        )

    exercise = Exercise(
        tenant_id=tenant_ctx.tenant.id,
        name=exercise_data.name,
        description=exercise_data.description,
        time_multiplier=exercise_data.time_multiplier,
        exercise_type=exercise_data.exercise_type,
        target_duration_hours=exercise_data.target_duration_hours,
        maturity_level=exercise_data.maturity_level,
        mode=exercise_data.mode,
        planned_date=exercise_data.planned_date,
        business_objective=exercise_data.business_objective,
        technical_objective=exercise_data.technical_objective,
        lead_organizer_user_id=exercise_data.lead_organizer_user_id,
        created_by=current_user.id,
    )
    db.add(exercise)
    await db.flush()
    
    # Add teams if provided
    if exercise_data.team_ids:
        for team_id in exercise_data.team_ids:
            team_check = await db.execute(
                select(Team.id).where(Team.id == team_id, Team.tenant_id == tenant_ctx.tenant.id)
            )
            if team_check.scalar_one_or_none() is None:
                raise HTTPException(status_code=404, detail=f"Team not found: {team_id}")
            exercise_team = ExerciseTeam(exercise_id=exercise.id, team_id=team_id)
            db.add(exercise_team)
    
    canonical_plugin_types = await get_canonical_plugin_types(db)
    config_map = await ensure_plugin_configurations(db)

    # Add plugins
    # Determine which plugins to enable
    if exercise_data.enabled_plugins is not None:
        enabled_plugins = set(await validate_plugin_types(db, list(exercise_data.enabled_plugins)))
    else:
        enabled_plugins = {
            plugin_type
            for index, plugin_type in enumerate(canonical_plugin_types, start=1)
            if get_plugin_metadata(
                plugin_type,
                config_map.get(plugin_type),
                fallback_sort_order=index,
            )["default_enabled"]
        }
    
    # Create all plugin entries from canonical DB values
    for plugin_type in canonical_plugin_types:
        plugin_entry = ExercisePlugin(
            exercise_id=exercise.id,
            plugin_type=plugin_type,
            enabled=plugin_type in enabled_plugins,
        )
        db.add(plugin_entry)

    # Seed phases using tenant preset/config
    await _seed_phases_for_exercise(
        db,
        exercise=exercise,
        tenant_id=tenant_ctx.tenant.id,
        phase_preset=exercise_data.phase_preset,
    )

    await db.commit()
    await db.refresh(exercise)
    
    # Reload with plugins relationship
    result = await db.execute(
        select(Exercise)
        .options(selectinload(Exercise.plugins))
        .where(Exercise.id == exercise.id, Exercise.tenant_id == tenant_ctx.tenant.id)
    )
    exercise = result.scalar_one()
    config_map = await ensure_plugin_configurations(db)
    
    return _build_exercise_response(exercise, config_map)


@router.get("/{exercise_id}", response_model=ExerciseResponse)
async def get_exercise(
    exercise_id: int,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """Retrieve a single CrisisLab exercise by its ID.

    Returns the full exercise object including its enabled/disabled plugin
    configuration. Raises 404 if the exercise does not exist or does not
    belong to the current tenant.
    """
    result = await db.execute(
        select(Exercise)
        .options(selectinload(Exercise.plugins))
        .where(Exercise.id == exercise_id, Exercise.tenant_id == tenant_ctx.tenant.id)
    )
    exercise = result.scalar_one_or_none()
    
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    
    config_map = await ensure_plugin_configurations(db)
    return _build_exercise_response(exercise, config_map)


@router.get("/{exercise_id}/teams", response_model=ExerciseTeamListResponse)
async def list_exercise_teams(
    exercise_id: int,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """List all crisis-cell teams attached to a CrisisLab exercise.

    Returns every team currently linked to the exercise, ordered
    alphabetically by name. Useful for populating participant-assignment
    drop-downs.
    """
    exercise_result = await db.execute(
        select(Exercise.id).where(Exercise.id == exercise_id, Exercise.tenant_id == tenant_ctx.tenant.id)
    )
    if exercise_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Exercise not found")

    result = await db.execute(
        select(Team)
        .join(ExerciseTeam, ExerciseTeam.team_id == Team.id)
        .where(ExerciseTeam.exercise_id == exercise_id, Team.tenant_id == tenant_ctx.tenant.id)
        .order_by(Team.name.asc())
    )
    teams = result.scalars().all()
    return ExerciseTeamListResponse(teams=[ExerciseTeamResponse.model_validate(team) for team in teams])


@router.post("/{exercise_id}/teams/{team_id}", response_model=ExerciseTeamResponse, status_code=201)
async def attach_team_to_exercise(
    exercise_id: int,
    team_id: int,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Attach an existing team to a CrisisLab exercise.

    Links a previously-created team (e.g. *Cellule IT*, *Direction Generale*)
    to the exercise so that participants can be assigned to it.
    Returns 409 if the team is already attached.
    """
    await _get_exercise_in_tenant_or_404(db, exercise_id, tenant_ctx.tenant.id)

    team_result = await db.execute(
        select(Team).where(Team.id == team_id, Team.tenant_id == tenant_ctx.tenant.id)
    )
    team = team_result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    link_result = await db.execute(
        select(ExerciseTeam).where(
            ExerciseTeam.exercise_id == exercise_id,
            ExerciseTeam.team_id == team_id,
        )
    )
    if link_result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Team already attached to this exercise")

    db.add(ExerciseTeam(exercise_id=exercise_id, team_id=team_id))
    await db.commit()
    return ExerciseTeamResponse.model_validate(team)


@router.delete("/{exercise_id}/teams/{team_id}")
async def detach_team_from_exercise(
    exercise_id: int,
    team_id: int,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Detach a team from a CrisisLab exercise.

    Removes the link between the team and the exercise. Fails with 400 if
    any participants are still assigned to the team -- reassign or remove
    them first.
    """
    await _get_exercise_in_tenant_or_404(db, exercise_id, tenant_ctx.tenant.id)
    team_result = await db.execute(
        select(Team.id).where(Team.id == team_id, Team.tenant_id == tenant_ctx.tenant.id)
    )
    if team_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Team not found")

    link_result = await db.execute(
        select(ExerciseTeam).where(
            ExerciseTeam.exercise_id == exercise_id,
            ExerciseTeam.team_id == team_id,
        )
    )
    exercise_team = link_result.scalar_one_or_none()
    if not exercise_team:
        raise HTTPException(status_code=404, detail="Team is not attached to this exercise")

    assigned_count_result = await db.execute(
        select(func.count(ExerciseUser.id)).where(
            ExerciseUser.exercise_id == exercise_id,
            ExerciseUser.team_id == team_id,
        )
    )
    assigned_count = assigned_count_result.scalar() or 0
    if assigned_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot detach team: {assigned_count} participant(s) are still assigned to it",
        )

    await db.delete(exercise_team)
    await db.commit()
    return {"message": "Team detached from exercise"}


@router.put("/{exercise_id}", response_model=ExerciseResponse)
async def update_exercise(
    exercise_id: int,
    exercise_data: ExerciseUpdate,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Update a CrisisLab exercise (admin / animateur only).

    Accepts a partial payload -- only the fields present in the request body
    are modified. Socle values (type, duration, maturity, mode) are validated
    against the tenant-level configuration before being persisted.
    """
    exercise = await _get_exercise_in_tenant_or_404(
        db,
        exercise_id,
        tenant_ctx.tenant.id,
        with_plugins=True,
    )
    tenant_config = await get_or_create_tenant_configuration(
        db,
        tenant_id=tenant_ctx.tenant.id,
        tenant_name=tenant_ctx.tenant.name,
    )
    resolved_options = _resolve_socle_options(tenant_config)
    
    if exercise_data.name is not None:
        exercise.name = exercise_data.name
    if exercise_data.description is not None:
        exercise.description = exercise_data.description
    if exercise_data.time_multiplier is not None:
        exercise.time_multiplier = exercise_data.time_multiplier
    if exercise_data.exercise_type is not None:
        _validate_socle_value(
            exercise_data.exercise_type,
            [item["value"] for item in resolved_options["exercise_type_options"]],
            "exercise_type",
        )
        exercise.exercise_type = exercise_data.exercise_type
    if exercise_data.target_duration_hours is not None:
        if exercise_data.target_duration_hours not in resolved_options["exercise_duration_options"]:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid target_duration_hours: '{exercise_data.target_duration_hours}' is not configured in Options > Exercices",
            )
        exercise.target_duration_hours = exercise_data.target_duration_hours
    if exercise_data.maturity_level is not None:
        _validate_socle_value(
            exercise_data.maturity_level,
            [item["value"] for item in resolved_options["exercise_maturity_options"]],
            "maturity_level",
        )
        exercise.maturity_level = exercise_data.maturity_level
    if exercise_data.mode is not None:
        _validate_socle_value(
            exercise_data.mode,
            [item["value"] for item in resolved_options["exercise_mode_options"]],
            "mode",
        )
        exercise.mode = exercise_data.mode
    if exercise_data.planned_date is not None:
        exercise.planned_date = exercise_data.planned_date
    if exercise_data.business_objective is not None:
        exercise.business_objective = exercise_data.business_objective
    if exercise_data.technical_objective is not None:
        exercise.technical_objective = exercise_data.technical_objective
    if exercise_data.lead_organizer_user_id is not None:
        exercise.lead_organizer_user_id = exercise_data.lead_organizer_user_id
    if exercise_data.status is not None:
        exercise.status = exercise_data.status
    if exercise_data.timeline_configured is not None:
        exercise.timeline_configured = exercise_data.timeline_configured

    await db.commit()
    await db.refresh(exercise)
    
    config_map = await ensure_plugin_configurations(db)
    return _build_exercise_response(exercise, config_map)


@router.post("/{exercise_id}/start")
async def start_exercise(
    exercise_id: int,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    current_user=Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Start or resume a CrisisLab exercise.

    Transitions the exercise from *draft* to *running* (first start) or from
    *paused* to *running* (resume). Starts the inject scheduler so that
    timed injects are dispatched according to the timeline, and broadcasts a
    WebSocket event to all connected clients.
    """
    exercise = await _get_exercise_in_tenant_or_404(db, exercise_id, tenant_ctx.tenant.id)

    if exercise.status == ExerciseStatus.DRAFT:
        # Starting from draft
        exercise.status = ExerciseStatus.RUNNING
        exercise.started_at = datetime.now(timezone.utc)
    elif exercise.status == ExerciseStatus.PAUSED:
        # Resuming from pause
        exercise.status = ExerciseStatus.RUNNING
    else:
        raise HTTPException(status_code=400, detail="Exercise can only be started from draft or resumed from paused state")

    db.add(Event(
        exercise_id=exercise_id,
        type=EventType.EXERCISE_STARTED,
        actor_type=EventActorType.USER,
        actor_id=current_user.id,
        actor_label=current_user.username,
        payload={"started_at": exercise.started_at.isoformat() if exercise.started_at else None},
    ))
    await db.commit()
    
    # Start the inject scheduler
    await inject_scheduler.start_exercise_scheduler(exercise_id)
    
    # Broadcast state change
    await ws_manager.broadcast_exercise_state(exercise_id, "started", {
        "started_at": exercise.started_at.isoformat() if exercise.started_at else None
    })
    
    return {"message": "Exercise started", "started_at": exercise.started_at}


@router.post("/{exercise_id}/restart")
async def restart_exercise(
    exercise_id: int,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    current_user=Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Restart a completed or archived CrisisLab exercise.

    Resets the exercise clock, clears the ended_at timestamp, and transitions
    the exercise back to *running*. A new EXERCISE_STARTED event is recorded
    with the ``restarted`` flag. The inject scheduler is re-started and a
    WebSocket notification is broadcast.
    """
    exercise = await _get_exercise_in_tenant_or_404(db, exercise_id, tenant_ctx.tenant.id)

    if exercise.status not in (ExerciseStatus.COMPLETED, ExerciseStatus.ARCHIVED):
        raise HTTPException(status_code=400, detail="Exercise can only be restarted from completed or archived state")

    # Reset exercise state
    exercise.status = ExerciseStatus.RUNNING
    exercise.started_at = datetime.now(timezone.utc)
    exercise.ended_at = None

    db.add(Event(
        exercise_id=exercise_id,
        type=EventType.EXERCISE_STARTED,
        actor_type=EventActorType.USER,
        actor_id=current_user.id,
        actor_label=current_user.username,
        payload={"started_at": exercise.started_at.isoformat(), "restarted": True},
    ))
    await db.commit()
    
    # Start the inject scheduler
    await inject_scheduler.start_exercise_scheduler(exercise_id)
    
    # Broadcast state change
    await ws_manager.broadcast_exercise_state(exercise_id, "restarted", {
        "started_at": exercise.started_at.isoformat() if exercise.started_at else None
    })
    
    return {"message": "Exercise restarted", "started_at": exercise.started_at}


@router.post("/{exercise_id}/pause")
async def pause_exercise(
    exercise_id: int,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    current_user=Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Pause a running CrisisLab exercise.

    Transitions the exercise from *running* to *paused*. The inject scheduler
    is stopped so no further timed injects fire until the exercise is resumed.
    A WebSocket notification is broadcast to all connected clients.
    """
    exercise = await _get_exercise_in_tenant_or_404(db, exercise_id, tenant_ctx.tenant.id)

    if exercise.status != ExerciseStatus.RUNNING:
        raise HTTPException(status_code=400, detail="Exercise can only be paused when running")

    exercise.status = ExerciseStatus.PAUSED

    db.add(Event(
        exercise_id=exercise_id,
        type=EventType.EXERCISE_PAUSED,
        actor_type=EventActorType.USER,
        actor_id=current_user.id,
        actor_label=current_user.username,
    ))
    await db.commit()
    
    # Stop the inject scheduler
    await inject_scheduler.stop_exercise_scheduler(exercise_id)
    
    # Broadcast state change
    await ws_manager.broadcast_exercise_state(exercise_id, "paused")
    
    return {"message": "Exercise paused"}


@router.post("/{exercise_id}/end")
async def end_exercise(
    exercise_id: int,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    current_user=Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """End a CrisisLab exercise (running or paused).

    Marks the exercise as *completed*, records the ended_at timestamp, and
    logs the total elapsed duration in minutes. The inject scheduler is
    stopped and a WebSocket notification is broadcast.
    """
    exercise = await _get_exercise_in_tenant_or_404(db, exercise_id, tenant_ctx.tenant.id)

    if exercise.status not in (ExerciseStatus.RUNNING, ExerciseStatus.PAUSED):
        raise HTTPException(status_code=400, detail="Exercise can only be ended when running or paused")

    exercise.status = ExerciseStatus.COMPLETED
    exercise.ended_at = datetime.now(timezone.utc)

    elapsed_min = None
    if exercise.started_at:
        elapsed_min = int((exercise.ended_at - exercise.started_at).total_seconds() / 60)
    db.add(Event(
        exercise_id=exercise_id,
        type=EventType.EXERCISE_ENDED,
        actor_type=EventActorType.USER,
        actor_id=current_user.id,
        actor_label=current_user.username,
        payload={
            "ended_at": exercise.ended_at.isoformat(),
            "duration_min": elapsed_min,
        },
    ))
    await db.commit()
    
    # Stop the inject scheduler
    await inject_scheduler.stop_exercise_scheduler(exercise_id)
    
    # Broadcast state change
    await ws_manager.broadcast_exercise_state(exercise_id, "ended", {
        "ended_at": exercise.ended_at.isoformat() if exercise.ended_at else None
    })
    
    return {"message": "Exercise ended", "ended_at": exercise.ended_at}


@router.get("/{exercise_id}/stats", response_model=ExerciseStats)
async def get_exercise_stats(
    exercise_id: int,
    _: any = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Retrieve real-time statistics for a CrisisLab exercise.

    Returns inject counts (total, sent, pending), message/tweet/decision
    counters, and the average participant score. Useful for animateur
    dashboards and post-exercise debriefing.
    """
    exercise = await _get_exercise_in_tenant_or_404(db, exercise_id, tenant_ctx.tenant.id)
    
    # Count injects
    injects_result = await db.execute(
        select(func.count(Inject.id)).where(Inject.exercise_id == exercise_id)
    )
    total_injects = injects_result.scalar() or 0
    
    sent_injects_result = await db.execute(
        select(func.count(Inject.id)).where(
            Inject.exercise_id == exercise_id,
            Inject.status == "sent"
        )
    )
    sent_injects = sent_injects_result.scalar() or 0
    
    # TODO: Count messages, tweets, decisions when those models are implemented
    
    return ExerciseStats(
        exercise_id=exercise_id,
        total_injects=total_injects,
        sent_injects=sent_injects,
        pending_injects=total_injects - sent_injects,
        total_messages=0,
        total_tweets=0,
        total_decisions=0,
        average_score=None,
    )


@router.delete("/{exercise_id}")
async def delete_exercise(
    exercise_id: int,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Permanently delete a CrisisLab exercise (admin only).

    Cascade-deletes all related data (injects, events, participant
    assignments, plugins). This action is irreversible.
    """
    exercise = await _get_exercise_in_tenant_or_404(db, exercise_id, tenant_ctx.tenant.id)

    await db.delete(exercise)
    await db.commit()
    
    return {"message": "Exercise deleted successfully"}


@router.get("/plugins/available", response_model=list[PluginInfoResponse])
async def get_available_plugins(
    _: any = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """List all available CrisisLab simulation plugins.

    Returns every registered communication-channel plugin (e.g. mail, SMS,
    social media, TV live, press) with its metadata, icon, colour, and
    whether it is enabled by default. Used by the exercise-creation form to
    let the organiser pick which channels to activate.
    """
    plugins = []
    canonical_plugin_types = await get_canonical_plugin_types(db)
    config_map = await ensure_plugin_configurations(db)

    for index, plugin_type in enumerate(canonical_plugin_types, start=1):
        info = get_plugin_metadata(
            plugin_type,
            config_map.get(plugin_type),
            fallback_sort_order=index,
        )
        plugins.append(PluginInfoResponse(
            type=plugin_type,
            name=str(info.get("name", plugin_type)),
            description=str(info.get("description", "")),
            icon=str(info.get("icon", "Box")),
            color=str(info.get("color", "gray")),
            default_enabled=bool(info.get("default_enabled", False)),
            coming_soon=bool(info.get("coming_soon", False)),
            sort_order=int(info.get("sort_order", index)),
        ))
    return sorted(plugins, key=lambda plugin: (plugin.sort_order, plugin.type))


@router.put("/{exercise_id}/plugins/{plugin_type}", response_model=ExercisePluginResponse)
async def toggle_plugin(
    exercise_id: int,
    plugin_type: str,
    enabled: bool = Query(..., description="Whether to enable or disable the plugin"),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Enable or disable a simulation plugin for a CrisisLab exercise.

    Toggles the given plugin (identified by its canonical type, e.g. ``mail``,
    ``sms``, ``social``) on or off for the specified exercise. Plugins can
    only be modified while the exercise is still in *draft* status.
    """
    # Validate and normalize plugin_type from DB enum values.
    plugin_type = await validate_plugin_type(db, plugin_type)
    
    # Check exercise exists
    exercise = await _get_exercise_in_tenant_or_404(db, exercise_id, tenant_ctx.tenant.id)
    
    # Check if exercise is already running
    if exercise.status not in (ExerciseStatus.DRAFT,):
        raise HTTPException(
            status_code=400, 
            detail="Plugins can only be modified when exercise is in draft status"
        )
    
    # Find or create plugin entry
    result = await db.execute(
        select(ExercisePlugin).where(
            ExercisePlugin.exercise_id == exercise_id,
            func.lower(ExercisePlugin.plugin_type.cast(String)) == plugin_type
        )
    )
    plugin = result.scalar_one_or_none()
    
    if plugin:
        if normalize_plugin_type(plugin.plugin_type) != plugin_type:
            plugin.plugin_type = plugin_type
        plugin.enabled = enabled
    else:
        plugin = ExercisePlugin(
            exercise_id=exercise_id,
            plugin_type=plugin_type,
            enabled=enabled,
        )
        db.add(plugin)
    
    await db.commit()
    await db.refresh(plugin)
    config_map = await ensure_plugin_configurations(db)
    
    return _build_plugin_response(plugin, config_map)
