"""Placeholder resolution for prompt templates.

Usage:
    text = "Bienvenue chez {{organization_name}} (domaine: {{mail_domain}})"
    resolved = await resolve_placeholders(text, tenant_id=1, db=session)

    # With exercise context:
    text = "Exercice {{exercise.name}} — {{scenario.initial_context}}"
    resolved = await resolve_placeholders(text, tenant_id=1, db=session, exercise_id=42)
"""
import json
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.tenant_service import get_or_create_tenant_configuration
from app.models import DEFAULT_APP_CONFIG


_PLACEHOLDER_RE = re.compile(r"\{\{([\w.]+)\}\}")

# Fields eligible for placeholder substitution (tenant/app config).
PLACEHOLDER_FIELDS = frozenset([
    "organization_name",
    "organization_description",
    "organization_sector",
    "organization_keywords",
    "organization_tech_stack",
    "organization_reference_url",
    "windows_domain",
    "public_domain",
    "mail_domain",
    "internal_ip_ranges",
    "dmz_ip_ranges",
    "domain_controllers",
    "server_naming_examples",
    "technological_dependencies",
    "cloud_providers",
    "critical_applications",
    "bia_processes",
    "smtp_host",
    "smtp_from",
    "smtp_user",
    "default_exercise_type",
    "default_maturity_level",
    "default_exercise_mode",
])

# Mapping from dotted placeholder keys to model attributes.
_EXERCISE_FIELD_MAP = {
    "exercise.name": "name",
    "exercise.description": "description",
    "exercise.type": "exercise_type",
    "exercise.maturity_level": "maturity_level",
    "exercise.mode": "exercise_mode",
    "exercise.duration_hours": "duration_hours",
    "exercise.location": "location",
    "exercise.business_objective": "business_objective",
    "exercise.technical_objective": "technical_objective",
}

_SCENARIO_FIELD_MAP = {
    "scenario.strategic_intent": "strategic_intent",
    "scenario.initial_context": "initial_context",
    "scenario.initial_situation": "initial_situation",
    "scenario.implicit_hypotheses": "implicit_hypotheses",
    "scenario.hidden_brief": "hidden_brief",
    "scenario.pedagogical_objectives": "pedagogical_objectives",
    "scenario.evaluation_criteria": "evaluation_criteria",
    "scenario.stress_factors": "stress_factors",
}


def _json_list_to_str(val) -> str | None:
    """Convert a JSON list to a comma-separated string."""
    if val is None:
        return None
    if isinstance(val, str):
        try:
            val = json.loads(val)
        except (json.JSONDecodeError, TypeError):
            return val
    if isinstance(val, list):
        return ", ".join(str(v) for v in val)
    return str(val)


async def _load_exercise_values(
    db: AsyncSession, exercise_id: int
) -> dict[str, str]:
    """Load exercise + scenario placeholder values."""
    from app.models.exercise import Exercise
    from app.models.crisis_management import ExerciseScenario, ExercisePhase

    values: dict[str, str] = {}

    result = await db.execute(select(Exercise).where(Exercise.id == exercise_id))
    exercise = result.scalars().first()
    if not exercise:
        return values

    for placeholder_key, attr in _EXERCISE_FIELD_MAP.items():
        val = getattr(exercise, attr, None)
        if val is not None:
            values[placeholder_key] = str(val)

    # Scenario
    result = await db.execute(
        select(ExerciseScenario).where(ExerciseScenario.exercise_id == exercise_id)
    )
    scenario = result.scalars().first()
    if scenario:
        for placeholder_key, attr in _SCENARIO_FIELD_MAP.items():
            val = getattr(scenario, attr, None)
            if attr in ("pedagogical_objectives", "evaluation_criteria", "stress_factors"):
                val = _json_list_to_str(val)
            if val is not None:
                values[placeholder_key] = str(val)

    # Phases
    result = await db.execute(
        select(ExercisePhase)
        .where(ExercisePhase.exercise_id == exercise_id)
        .order_by(ExercisePhase.phase_order)
    )
    phases = result.scalars().all()
    if phases:
        values["phases.list"] = ", ".join(p.name for p in phases)

    return values


async def resolve_placeholders(
    text: str,
    *,
    tenant_id: int,
    db: AsyncSession,
    tenant_name: str | None = None,
    exercise_id: int | None = None,
    inject_data: dict[str, str] | None = None,
) -> str:
    """Replace ``{{field_name}}`` tokens in *text* with current config values.

    Args:
        exercise_id: If provided, exercise/scenario/phase placeholders are resolved.
        inject_data: Optional dict with inject-level values
            (keys: ``inject.title``, ``inject.description``, etc.).

    Unknown placeholders are left untouched.
    """
    if "{{" not in text:
        return text

    tenant_cfg = await get_or_create_tenant_configuration(
        db, tenant_id=tenant_id, tenant_name=tenant_name
    )

    # Build lookup: tenant fields + legacy overlay + defaults
    values: dict[str, str] = {}
    for field in PLACEHOLDER_FIELDS:
        val = getattr(tenant_cfg, field, None)
        if val is None:
            overlay = (tenant_cfg.legacy_app_config_overrides or {})
            val = overlay.get(field)
        if val is None:
            val = DEFAULT_APP_CONFIG.get(field)
        if val is not None:
            values[field] = str(val)

    # Exercise/scenario context
    if exercise_id is not None:
        values.update(await _load_exercise_values(db, exercise_id))

    # Inject context
    if inject_data:
        values.update(inject_data)

    def _replace(match: re.Match) -> str:
        key = match.group(1)
        return values.get(key, match.group(0))

    return _PLACEHOLDER_RE.sub(_replace, text)
