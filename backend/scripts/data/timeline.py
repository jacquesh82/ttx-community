"""Timeline seed functions.

Imports constants from app.constants.timeline (single source of truth)
and provides tenant setup helpers for the CLI.
"""
import json

from sqlalchemy import select

from app.database import async_session_factory
from app.models import Tenant, TenantConfiguration
from app.models.tenant import TenantStatus
from app.constants.timeline import (
    TIMELINE_DEFAULT_INJECT_TYPES_FORMATS,
    TIMELINE_DEFAULT_SOURCE_IDS,
)


CLASSIQUE_PHASES_ENABLED = {
    "Détection",
    "Qualification",
    "Alerte",
    "Activation de la cellule de crise",
    "Analyse de situation",
    "Décisions stratégiques",
    "Endiguement",
    "Remédiation technique",
    "Clôture de crise",
}

_ALL_PHASES = [
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


async def ensure_default_tenant() -> Tenant:
    """Crée le tenant par défaut si absent."""
    print("\n🏠 Création du tenant par défaut...")
    async with async_session_factory() as session:
        result = await session.execute(select(Tenant).where(Tenant.slug == "default"))
        existing = result.scalar_one_or_none()
        if existing:
            print("  ⏭️  Tenant 'default' existe déjà")
            return existing
        tenant = Tenant(
            slug="default",
            name="Default",
            status=TenantStatus.ACTIVE,
            is_active=True,
        )
        session.add(tenant)
        await session.commit()
        await session.refresh(tenant)
        print("  ✅ Tenant 'default' créé")
        return tenant


async def ensure_default_timeline_configuration(tenant: Tenant) -> None:
    """Seed timeline-related tenant overrides if absent.

    Keeps existing values untouched and only fills missing keys.
    """
    print("\n🧭 Initialisation des presets Timeline par défaut...")
    async with async_session_factory() as session:
        result = await session.execute(
            select(TenantConfiguration).where(TenantConfiguration.tenant_id == tenant.id)
        )
        config = result.scalar_one_or_none()
        if not config:
            config = TenantConfiguration(
                tenant_id=tenant.id,
                organization_name=tenant.name or "Organisation",
            )
            session.add(config)
            await session.flush()

        overlay = dict(config.legacy_app_config_overrides or {})

        default_phases = [
            {"name": name, "enabled": name in CLASSIQUE_PHASES_ENABLED}
            for name in _ALL_PHASES
        ]

        defaults = {
            "default_phases_preset": "classique",
            "default_phases_config": json.dumps(default_phases, ensure_ascii=False),
            "timeline_phase_type_format_config": json.dumps(
                TIMELINE_DEFAULT_INJECT_TYPES_FORMATS, ensure_ascii=False
            ),
            "timeline_sources_config": json.dumps(TIMELINE_DEFAULT_SOURCE_IDS, ensure_ascii=False),
            "timeline_sources_custom_config": json.dumps([], ensure_ascii=False),
        }

        changed = False
        for key, value in defaults.items():
            if key not in overlay or overlay.get(key) in (None, ""):
                overlay[key] = value
                changed = True

        if changed:
            config.legacy_app_config_overrides = overlay
            await session.commit()
            print("  ✅ Presets Timeline appliqués")
        else:
            print("  ⏭️  Presets Timeline déjà présents")
