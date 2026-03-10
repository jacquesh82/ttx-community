"""Auto-seed initial data on first startup."""
import json

from sqlalchemy import select

from app.database import async_session_factory
from app.models import Tenant, TenantConfiguration, TenantStatus, User, UserRole
from app.utils.security import hash_password


from app.constants.timeline import TIMELINE_DEFAULT_INJECT_TYPES_FORMATS as DEFAULT_TIMELINE_TYPES_FORMATS


async def seed_initial_data() -> None:
    """Create default tenant and admin user if they don't exist.

    Idempotent: safe to call on every startup.
    """
    async with async_session_factory() as session:
        # -- Default tenant --------------------------------------------------
        result = await session.execute(
            select(Tenant).where(Tenant.slug == "default")
        )
        tenant = result.scalar_one_or_none()
        if not tenant:
            tenant = Tenant(
                slug="default",
                name="Default",
                status=TenantStatus.ACTIVE,
                is_active=True,
            )
            session.add(tenant)
            await session.flush()
            print("[seed] Default tenant created")

        # -- Admin user ------------------------------------------------------
        result = await session.execute(
            select(User).where(
                User.tenant_id == tenant.id,
                User.role == UserRole.ADMIN,
            ).limit(1)
        )
        admin = result.scalar_one_or_none()
        if not admin:
            session.add(User(
                username="admin",
                email="admin@ttx.local",
                password_hash=hash_password("Admin123!"),
                role=UserRole.ADMIN,
                is_active=True,
                tenant_id=tenant.id,
            ))
            print("[seed] Admin user created  →  admin / Admin123!")
            print("[seed] WARNING: change the default password before going to production!")

        # -- Tenant configuration defaults ----------------------------------
        result = await session.execute(
            select(TenantConfiguration).where(TenantConfiguration.tenant_id == tenant.id)
        )
        tenant_config = result.scalar_one_or_none()
        if not tenant_config:
            tenant_config = TenantConfiguration(
                tenant_id=tenant.id,
                organization_name=tenant.name,
            )
            session.add(tenant_config)
            await session.flush()
            print("[seed] Default tenant configuration created")

        overlay = tenant_config.legacy_app_config_overrides or {}
        timeline_defaults = json.dumps(DEFAULT_TIMELINE_TYPES_FORMATS, ensure_ascii=False)
        updated_overlay = False
        if not overlay.get("timeline_phase_type_format_config"):
            overlay["timeline_phase_type_format_config"] = timeline_defaults
            updated_overlay = True
        if not overlay.get("default_phases_preset"):
            overlay["default_phases_preset"] = "classique"
            updated_overlay = True
        if updated_overlay:
            tenant_config.legacy_app_config_overrides = overlay
            print("[seed] Timeline default inject types initialized")

        await session.commit()
