"""Tenant service helpers (resolution, config/wallet bootstrap, singleton fallback)."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppConfiguration, Tenant, TenantConfiguration


async def get_tenant_by_slug(db: AsyncSession, slug: str) -> Tenant | None:
    result = await db.execute(select(Tenant).where(Tenant.slug == slug))
    return result.scalar_one_or_none()


async def get_or_create_tenant_configuration(
    db: AsyncSession,
    *,
    tenant_id: int,
    seed_from_app_config: bool = False,
    tenant_name: str | None = None,
) -> TenantConfiguration:
    result = await db.execute(select(TenantConfiguration).where(TenantConfiguration.tenant_id == tenant_id))
    config = result.scalar_one_or_none()
    if config:
        return config

    tenant = None
    if tenant_name is None:
        tenant_result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
        tenant = tenant_result.scalar_one_or_none()
        tenant_name = tenant.name if tenant else None

    app_config = None
    if seed_from_app_config:
        app_result = await db.execute(select(AppConfiguration).where(AppConfiguration.id == 1))
        app_config = app_result.scalar_one_or_none()

    config = TenantConfiguration(
        tenant_id=tenant_id,
        organization_name=(tenant_name or (app_config.organization_name if app_config else "Organisation")),
        organization_logo_url=(app_config.organization_logo_url if app_config else None),
        organization_description=(app_config.organization_description if app_config else None),
        organization_reference_url=(app_config.organization_reference_url if app_config else None),
        organization_keywords=(app_config.organization_keywords if app_config else None),
    )
    db.add(config)
    await db.flush()
    return config


async def get_tenant_configuration_or_fallback(
    db: AsyncSession,
    *,
    tenant_id: int | None,
) -> TenantConfiguration | AppConfiguration | None:
    if tenant_id is not None:
        result = await db.execute(select(TenantConfiguration).where(TenantConfiguration.tenant_id == tenant_id))
        tenant_cfg = result.scalar_one_or_none()
        if tenant_cfg:
            return tenant_cfg
    app_result = await db.execute(select(AppConfiguration).where(AppConfiguration.id == 1))
    return app_result.scalar_one_or_none()
