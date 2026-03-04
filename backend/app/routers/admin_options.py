"""Admin options router for plugin and app configuration."""
from datetime import datetime, timezone
from typing import List
import json
import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.models import (
    AppConfiguration,
    DEFAULT_APP_CONFIG,
    PluginConfiguration,
    TenantConfiguration,
    TenantPluginConfiguration,
    ApiKey,
)
from app.models.user import UserRole
from app.routers.auth import require_role
from app.services.tenant_service import (
    get_or_create_tenant_configuration,
)
from app.services.plugin_catalog import (
    ensure_plugin_configurations,
    get_canonical_plugin_types,
    get_plugin_metadata,
    normalize_plugin_type,
    validate_plugin_type,
)
from app.utils.tenancy import TenantRequestContext, get_tenant_context, require_tenant_context


router = APIRouter()


# ============== Public Configuration Endpoint ==============

class PublicConfigurationResponse(BaseModel):
    """Public configuration response (organization branding only)."""
    organization_name: str
    organization_logo_url: str | None
    tenant_slug: str | None = None


@router.get("/public/config", response_model=PublicConfigurationResponse)
async def get_public_configuration(
    tenant_ctx: TenantRequestContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Get public organization configuration (no auth required)."""
    if tenant_ctx.tenant:
        tenant_cfg = await get_or_create_tenant_configuration(
            db,
            tenant_id=tenant_ctx.tenant.id,
            tenant_name=tenant_ctx.tenant.name,
            seed_from_app_config=False,
        )
        organization_name = (tenant_cfg.organization_name or "").strip() or tenant_ctx.tenant.name
        organization_logo_url = tenant_cfg.organization_logo_url
    else:
        config = await _get_or_create_app_config(db)
        organization_name = config.organization_name
        organization_logo_url = config.organization_logo_url

    return PublicConfigurationResponse(
        organization_name=organization_name,
        organization_logo_url=organization_logo_url,
        tenant_slug=(tenant_ctx.tenant.slug if tenant_ctx.tenant else tenant_ctx.tenant_slug),
    )


# ============== App Configuration Models ==============

class AppConfigurationResponse(BaseModel):
    """Response model for app configuration."""
    organization_name: str
    organization_logo_url: str | None
    organization_description: str | None
    organization_reference_url: str | None
    organization_keywords: str | None
    default_exercise_duration_hours: int
    default_time_multiplier: int
    default_maturity_level: str
    default_exercise_mode: str
    enable_tv_plugin: bool
    enable_social_plugin: bool
    enable_welcome_kits: bool
    enable_scoring: bool
    session_timeout_minutes: int
    max_login_attempts: int
    password_min_length: int
    smtp_enabled: bool
    smtp_host: str | None
    smtp_port: int | None
    smtp_user: str | None
    smtp_from: str | None
    simulator_inject_mapping: str | None
    default_phases_config: str | None = None
    default_phases_preset: str | None = None
    timeline_phase_type_format_config: str | None = None
    timeline_sources_config: str | None = None
    timeline_sources_custom_config: str | None = None

    class Config:
        from_attributes = True


class AppConfigurationUpdate(BaseModel):
    """Update model for app configuration."""
    organization_name: str | None = None
    organization_logo_url: str | None = None
    organization_description: str | None = None
    organization_reference_url: str | None = None
    organization_keywords: str | None = None
    default_exercise_duration_hours: int | None = None
    default_time_multiplier: int | None = None
    default_maturity_level: str | None = None
    default_exercise_mode: str | None = None
    enable_tv_plugin: bool | None = None
    enable_social_plugin: bool | None = None
    enable_welcome_kits: bool | None = None
    enable_scoring: bool | None = None
    session_timeout_minutes: int | None = None
    max_login_attempts: int | None = None
    password_min_length: int | None = None
    smtp_enabled: bool | None = None
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_user: str | None = None
    smtp_from: str | None = None
    simulator_inject_mapping: str | None = None
    default_phases_config: str | None = None
    default_phases_preset: str | None = None
    timeline_phase_type_format_config: str | None = None
    timeline_sources_config: str | None = None
    timeline_sources_custom_config: str | None = None


# ============== Plugin Configuration Models ==============

class PluginConfigurationResponse(BaseModel):
    """Response model for plugin configuration."""
    plugin_type: str
    name: str
    description: str | None
    icon: str
    color: str
    default_enabled: bool
    coming_soon: bool
    sort_order: int

    class Config:
        from_attributes = True


class PluginConfigurationUpdate(BaseModel):
    """Update model for plugin configuration."""
    name: str | None = None
    description: str | None = None
    icon: str | None = None
    color: str | None = None
    default_enabled: bool | None = None
    coming_soon: bool | None = None
    sort_order: int | None = None


class OptionsExportResponse(BaseModel):
    """Export model for full options payload."""
    exported_at: datetime
    app_configuration: AppConfigurationResponse
    plugins: List[PluginConfigurationResponse]


class OptionsImportPayload(BaseModel):
    """Import model for full options payload."""
    app_configuration: AppConfigurationUpdate | None = None
    plugins: List[PluginConfigurationResponse] | None = None


# ============== Helper Functions ==============

TENANT_NATIVE_CONFIG_FIELDS = {
    "organization_name",
    "organization_logo_url",
    "organization_description",
    "organization_reference_url",
    "organization_keywords",
}

APP_CONFIG_RESPONSE_FIELDS = set(AppConfigurationResponse.model_fields.keys())

TIMELINE_ALLOWED_FORMATS = {"TXT", "AUDIO", "VIDEO", "IMAGE"}
DEFAULT_TIMELINE_PHASE_TYPE_FORMAT_CONFIG = [
    {"type": "Mail", "formats": ["TXT"], "simulator": "mail"},
    {"type": "SMS", "formats": ["TXT", "IMAGE"], "simulator": "sms"},
    {"type": "Call", "formats": ["AUDIO"], "simulator": "tel"},
    {"type": "Social network", "formats": ["TXT", "VIDEO", "IMAGE"], "simulator": "social"},
    {"type": "TV", "formats": ["VIDEO"], "simulator": "tv"},
    {"type": "Document", "formats": ["TXT", "IMAGE"], "simulator": "mail"},
    {"type": "Annuaire de crise", "formats": ["TXT"], "simulator": None},
    {"type": "Scenario", "formats": ["TXT"], "simulator": None},
]
DEFAULT_TIMELINE_TYPE_KEYS = {item["type"].lower() for item in DEFAULT_TIMELINE_PHASE_TYPE_FORMAT_CONFIG}


def _normalize_timeline_format_value(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    upper = value.strip().upper()
    if upper in {"TEXT", "TXT"}:
        return "TXT"
    if upper in TIMELINE_ALLOWED_FORMATS:
        return upper
    return None


def _sanitize_timeline_phase_type_format_config(raw: str | None) -> str:
    parsed_rows: list[dict] = []
    if isinstance(raw, str) and raw.strip():
        try:
            payload = json.loads(raw)
            if isinstance(payload, list):
                parsed_rows = [row for row in payload if isinstance(row, dict)]
        except (TypeError, json.JSONDecodeError):
            parsed_rows = []

    by_type: dict[str, dict] = {}
    for row in parsed_rows:
        row_type = str(row.get("type", "")).strip()
        if not row_type:
            continue
        key = row_type.lower()
        if key not in DEFAULT_TIMELINE_TYPE_KEYS or key in by_type:
            continue
        by_type[key] = row

    normalized: list[dict] = []
    for default_row in DEFAULT_TIMELINE_PHASE_TYPE_FORMAT_CONFIG:
        key = default_row["type"].lower()
        source = by_type.get(key, {})
        raw_formats = source.get("formats")
        formats: list[str] = []
        if isinstance(raw_formats, list):
            for raw_format in raw_formats:
                normalized_format = _normalize_timeline_format_value(raw_format)
                if normalized_format and normalized_format not in formats:
                    formats.append(normalized_format)
        if not formats:
            formats = list(default_row["formats"])

        simulator = source.get("simulator") if isinstance(source.get("simulator"), str) else default_row["simulator"]
        normalized.append(
            {
                "type": default_row["type"],
                "formats": formats,
                "simulator": simulator,
            }
        )

    return json.dumps(normalized, ensure_ascii=False)


def _tenant_overlay_payload(config) -> dict:
    raw = getattr(config, "legacy_app_config_overrides", None) or {}
    if not isinstance(raw, dict):
        return {}
    return {
        key: value
        for key, value in raw.items()
        if key in APP_CONFIG_RESPONSE_FIELDS and key not in TENANT_NATIVE_CONFIG_FIELDS
    }

def _to_response(config: PluginConfiguration) -> PluginConfigurationResponse:
    canonical_type = normalize_plugin_type(config.plugin_type)
    return PluginConfigurationResponse(
        plugin_type=canonical_type,
        name=config.name,
        description=config.description,
        icon=config.icon,
        color=config.color,
        default_enabled=config.default_enabled,
        coming_soon=config.coming_soon,
        sort_order=config.sort_order,
    )


def _plugin_metadata_to_response(plugin_type: str, metadata: dict) -> PluginConfigurationResponse:
    return PluginConfigurationResponse(
        plugin_type=plugin_type,
        name=str(metadata["name"]),
        description=str(metadata.get("description") or ""),
        icon=str(metadata["icon"]),
        color=str(metadata["color"]),
        default_enabled=bool(metadata["default_enabled"]),
        coming_soon=bool(metadata["coming_soon"]),
        sort_order=int(metadata["sort_order"]),
    )


def _merge_plugin_metadata_with_tenant_override(
    *,
    plugin_type: str,
    base_config: PluginConfiguration | None,
    override: TenantPluginConfiguration | None,
    fallback_sort_order: int,
) -> dict:
    metadata = get_plugin_metadata(plugin_type, base_config, fallback_sort_order=fallback_sort_order)
    if override is None:
        return metadata

    if override.name is not None:
        metadata["name"] = override.name
    if override.description is not None:
        metadata["description"] = override.description
    if override.icon is not None:
        metadata["icon"] = override.icon
    if override.color is not None:
        metadata["color"] = override.color
    if override.default_enabled is not None:
        metadata["default_enabled"] = override.default_enabled
    if override.coming_soon is not None:
        metadata["coming_soon"] = override.coming_soon
    if override.sort_order is not None:
        metadata["sort_order"] = override.sort_order
    return metadata


async def _get_tenant_plugin_override_map(
    db: AsyncSession,
    *,
    tenant_id: int,
) -> dict[str, TenantPluginConfiguration]:
    result = await db.execute(
        select(TenantPluginConfiguration)
        .where(TenantPluginConfiguration.tenant_id == tenant_id)
        .order_by(TenantPluginConfiguration.id.asc())
    )
    overrides = result.scalars().all()
    override_map: dict[str, TenantPluginConfiguration] = {}
    for override in overrides:
        canonical_type = normalize_plugin_type(override.plugin_type)
        override_map.setdefault(canonical_type, override)
    return override_map


async def _list_tenant_plugin_configurations(
    db: AsyncSession,
    *,
    tenant_id: int,
) -> list[PluginConfigurationResponse]:
    canonical_types = await get_canonical_plugin_types(db)
    base_config_map = await ensure_plugin_configurations(db)
    override_map = await _get_tenant_plugin_override_map(db, tenant_id=tenant_id)
    responses: list[PluginConfigurationResponse] = []

    for index, plugin_type in enumerate(canonical_types, start=1):
        metadata = _merge_plugin_metadata_with_tenant_override(
            plugin_type=plugin_type,
            base_config=base_config_map.get(plugin_type),
            override=override_map.get(plugin_type),
            fallback_sort_order=index,
        )
        responses.append(_plugin_metadata_to_response(plugin_type, metadata))

    return sorted(responses, key=lambda response: (response.sort_order, response.plugin_type))


async def _update_tenant_plugin_configuration(
    db: AsyncSession,
    *,
    tenant_id: int,
    plugin_type: str,
    data: PluginConfigurationUpdate,
) -> PluginConfigurationResponse:
    plugin_type = await validate_plugin_type(db, plugin_type)
    base_config_map = await ensure_plugin_configurations(db)
    base_config = base_config_map.get(plugin_type)
    if not base_config:
        raise HTTPException(status_code=404, detail="Plugin configuration not found")

    result = await db.execute(
        select(TenantPluginConfiguration).where(
            TenantPluginConfiguration.tenant_id == tenant_id,
            TenantPluginConfiguration.plugin_type == plugin_type,
        )
    )
    override = result.scalar_one_or_none()
    if override is None:
        override = TenantPluginConfiguration(
            tenant_id=tenant_id,
            plugin_type=plugin_type,
        )
        db.add(override)
        await db.flush()

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if hasattr(override, key):
            setattr(override, key, value)

    await db.commit()
    await db.refresh(override)

    metadata = _merge_plugin_metadata_with_tenant_override(
        plugin_type=plugin_type,
        base_config=base_config,
        override=override,
        fallback_sort_order=int(base_config.sort_order or 0),
    )
    return _plugin_metadata_to_response(plugin_type, metadata)


async def _reset_tenant_plugin_configurations(
    db: AsyncSession,
    *,
    tenant_id: int,
) -> list[PluginConfigurationResponse]:
    from sqlalchemy import delete

    await db.execute(
        delete(TenantPluginConfiguration).where(TenantPluginConfiguration.tenant_id == tenant_id)
    )
    await db.commit()
    return await _list_tenant_plugin_configurations(db, tenant_id=tenant_id)


def _app_config_to_response(config: AppConfiguration) -> AppConfigurationResponse:
    return AppConfigurationResponse(
        organization_name=config.organization_name,
        organization_logo_url=config.organization_logo_url,
        organization_description=config.organization_description,
        organization_reference_url=config.organization_reference_url,
        organization_keywords=config.organization_keywords,
        default_exercise_duration_hours=config.default_exercise_duration_hours,
        default_time_multiplier=config.default_time_multiplier,
        default_maturity_level=config.default_maturity_level,
        default_exercise_mode=config.default_exercise_mode,
        enable_tv_plugin=config.enable_tv_plugin,
        enable_social_plugin=config.enable_social_plugin,
        enable_welcome_kits=config.enable_welcome_kits,
        enable_scoring=config.enable_scoring,
        session_timeout_minutes=config.session_timeout_minutes,
        max_login_attempts=config.max_login_attempts,
        password_min_length=config.password_min_length,
        smtp_enabled=config.smtp_enabled,
        smtp_host=config.smtp_host,
        smtp_port=config.smtp_port,
        smtp_user=config.smtp_user,
        smtp_from=config.smtp_from,
        simulator_inject_mapping=config.simulator_inject_mapping,
    )


def _tenant_merged_app_config_to_response(
    *,
    tenant_config,
    tenant_name: str | None,
    singleton_app_config: AppConfiguration | None = None,
) -> AppConfigurationResponse:
    payload = dict(DEFAULT_APP_CONFIG)
    if tenant_name:
        payload["organization_name"] = tenant_name

    # Heuristic: some tenant rows were previously seeded from the singleton app config.
    # If the tenant config still matches the singleton and has no overlay, avoid leaking
    # another tenant's branding/settings in the tenant options response.
    looks_inherited_seed = False
    if singleton_app_config is not None and tenant_name:
        no_overlay = not bool(getattr(tenant_config, "legacy_app_config_overrides", None))
        name_matches_singleton = (
            (getattr(tenant_config, "organization_name", None) or "").strip()
            == (singleton_app_config.organization_name or "").strip()
        )
        tenant_name_differs = (
            (tenant_name or "").strip()
            and (tenant_name or "").strip() != (getattr(tenant_config, "organization_name", None) or "").strip()
        )
        looks_inherited_seed = bool(no_overlay and name_matches_singleton and tenant_name_differs)

    # Native tenant-config fields.
    for field in TENANT_NATIVE_CONFIG_FIELDS:
        if hasattr(tenant_config, field):
            value = getattr(tenant_config, field)
            if (
                looks_inherited_seed
                and singleton_app_config is not None
                and hasattr(singleton_app_config, field)
                and value == getattr(singleton_app_config, field)
            ):
                # Keep the tenant-local default payload for inherited singleton values.
                continue
            payload[field] = value

    # Transitional tenant overrides for fields not yet modeled explicitly.
    payload.update(_tenant_overlay_payload(tenant_config))
    payload["timeline_phase_type_format_config"] = _sanitize_timeline_phase_type_format_config(
        payload.get("timeline_phase_type_format_config")
    )
    return AppConfigurationResponse(**payload)


async def _get_tenant_app_configuration_response(
    db: AsyncSession,
    *,
    tenant_id: int,
    tenant_name: str | None = None,
) -> AppConfigurationResponse:
    singleton_app_config = await _get_or_create_app_config(db)
    tenant_config = await get_or_create_tenant_configuration(db, tenant_id=tenant_id, tenant_name=tenant_name)
    return _tenant_merged_app_config_to_response(
        tenant_config=tenant_config,
        tenant_name=tenant_name,
        singleton_app_config=singleton_app_config,
    )


async def _update_tenant_app_configuration(
    db: AsyncSession,
    *,
    tenant_id: int,
    data: AppConfigurationUpdate,
    tenant_name: str | None = None,
) -> AppConfigurationResponse:
    singleton_app_config = await _get_or_create_app_config(db)  # reference for transition cleanup only
    tenant_config = await get_or_create_tenant_configuration(db, tenant_id=tenant_id, tenant_name=tenant_name)

    update_data = data.model_dump(exclude_unset=True)
    if "timeline_phase_type_format_config" in update_data:
        update_data["timeline_phase_type_format_config"] = _sanitize_timeline_phase_type_format_config(
            update_data.get("timeline_phase_type_format_config")
        )

    # Apply typed tenant config fields.
    for field in TENANT_NATIVE_CONFIG_FIELDS:
        if field in update_data:
            setattr(tenant_config, field, update_data.pop(field))

    # Store remaining app-config fields in the tenant overlay (tenant-scoped, no singleton write).
    overlay = _tenant_overlay_payload(tenant_config)
    for key, value in update_data.items():
        if key in APP_CONFIG_RESPONSE_FIELDS:
            overlay[key] = value
    tenant_config.legacy_app_config_overrides = overlay or None

    await db.commit()
    await db.refresh(tenant_config)
    return _tenant_merged_app_config_to_response(
        tenant_config=tenant_config,
        tenant_name=tenant_name,
        singleton_app_config=singleton_app_config,
    )


async def _get_or_create_app_config(db: AsyncSession) -> AppConfiguration:
    """Get the singleton app configuration or create it if missing."""
    result = await db.execute(select(AppConfiguration).where(AppConfiguration.id == 1))
    config = result.scalar_one_or_none()
    if not config:
        config = AppConfiguration(
            id=1,
            organization_name="Organisation",
            default_exercise_duration_hours=4,
            default_time_multiplier=1,
            default_maturity_level="intermediate",
            default_exercise_mode="real_time",
            enable_tv_plugin=True,
            enable_social_plugin=True,
            enable_welcome_kits=True,
            enable_scoring=False,
            session_timeout_minutes=60,
            max_login_attempts=5,
            password_min_length=8,
            smtp_enabled=False,
        )
        db.add(config)
        await db.commit()
        await db.refresh(config)
    return config


# ============== App Configuration Endpoints ==============

@router.get("/config", response_model=AppConfigurationResponse)
async def get_app_configuration(
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Get the application configuration (admin only)."""
    return await _get_tenant_app_configuration_response(
        db,
        tenant_id=tenant_ctx.tenant.id,
        tenant_name=tenant_ctx.tenant.name,
    )


@router.put("/config", response_model=AppConfigurationResponse)
async def update_app_configuration(
    data: AppConfigurationUpdate,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Update the application configuration (admin only)."""
    return await _update_tenant_app_configuration(
        db,
        tenant_id=tenant_ctx.tenant.id,
        tenant_name=tenant_ctx.tenant.name,
        data=data,
    )


# ============== Plugin Configuration Endpoints ==============

@router.get("/plugins", response_model=List[PluginConfigurationResponse])
async def list_plugin_configurations(
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """List all plugin configurations (admin only)."""
    return await _list_tenant_plugin_configurations(db, tenant_id=tenant_ctx.tenant.id)


@router.put("/plugins/{plugin_type}", response_model=PluginConfigurationResponse)
async def update_plugin_configuration(
    plugin_type: str,
    data: PluginConfigurationUpdate,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Update a plugin configuration (admin only)."""
    return await _update_tenant_plugin_configuration(
        db,
        tenant_id=tenant_ctx.tenant.id,
        plugin_type=plugin_type,
        data=data,
    )


@router.post("/plugins/reset", response_model=List[PluginConfigurationResponse])
async def reset_plugin_configurations(
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Reset plugin configuration overrides for current tenant (admin only)."""
    return await _reset_tenant_plugin_configurations(db, tenant_id=tenant_ctx.tenant.id)


@router.get("/config/export", response_model=OptionsExportResponse)
async def export_options_configuration(
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Export full options configuration (app config + plugins)."""
    app_config = await _get_tenant_app_configuration_response(
        db,
        tenant_id=tenant_ctx.tenant.id,
        tenant_name=tenant_ctx.tenant.name,
    )
    plugins = await _list_tenant_plugin_configurations(db, tenant_id=tenant_ctx.tenant.id)
    return OptionsExportResponse(
        exported_at=datetime.now(timezone.utc),
        app_configuration=app_config,
        plugins=plugins,
    )


# ============== API Key Endpoints ==============

class ApiKeyCreateRequest(BaseModel):
    name: str


class ApiKeyItem(BaseModel):
    id: int
    name: str
    key_preview: str
    is_active: bool
    created_at: datetime
    last_used_at: datetime | None = None


class ApiKeyCreatedResponse(BaseModel):
    """Returned once at creation — includes the full plaintext key."""
    id: int
    name: str
    key: str
    key_preview: str
    is_active: bool
    created_at: datetime


@router.get("/api-keys", response_model=List[ApiKeyItem])
async def list_api_keys(
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """List all API keys (admin only)."""
    result = await db.execute(select(ApiKey).order_by(ApiKey.created_at.desc()))
    keys = result.scalars().all()
    return [
        ApiKeyItem(
            id=k.id,
            name=k.name,
            key_preview=k.key[:8] + "..." + k.key[-4:],
            is_active=k.is_active,
            created_at=k.created_at,
            last_used_at=k.last_used_at,
        )
        for k in keys
    ]


@router.post("/api-keys", response_model=ApiKeyCreatedResponse)
async def create_api_key(
    data: ApiKeyCreateRequest,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new named API key (admin only). The plaintext key is returned only once."""
    new_key = "ttx_" + secrets.token_urlsafe(32)
    api_key_obj = ApiKey(name=data.name.strip() or "Clé sans nom", key=new_key)
    db.add(api_key_obj)
    await db.commit()
    await db.refresh(api_key_obj)
    return ApiKeyCreatedResponse(
        id=api_key_obj.id,
        name=api_key_obj.name,
        key=new_key,
        key_preview=new_key[:8] + "..." + new_key[-4:],
        is_active=api_key_obj.is_active,
        created_at=api_key_obj.created_at,
    )


@router.delete("/api-keys/{key_id}")
async def revoke_api_key(
    key_id: int,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Revoke (delete) an API key by id (admin only)."""
    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id))
    api_key_obj = result.scalar_one_or_none()
    if not api_key_obj:
        raise HTTPException(status_code=404, detail="API key not found")
    await db.delete(api_key_obj)
    await db.commit()
    return {"deleted": True}


@router.post("/config/import", response_model=OptionsExportResponse)
async def import_options_configuration(
    payload: OptionsImportPayload,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Import full options configuration (app config + plugins)."""
    if payload.app_configuration is not None:
        await _update_tenant_app_configuration(
            db,
            tenant_id=tenant_ctx.tenant.id,
            tenant_name=tenant_ctx.tenant.name,
            data=payload.app_configuration,
        )

    if payload.plugins:
        for plugin in payload.plugins:
            plugin_type = await validate_plugin_type(db, plugin.plugin_type)
            await _update_tenant_plugin_configuration(
                db,
                tenant_id=tenant_ctx.tenant.id,
                plugin_type=plugin_type,
                data=PluginConfigurationUpdate(
                    name=plugin.name,
                    description=plugin.description,
                    icon=plugin.icon,
                    color=plugin.color,
                    default_enabled=plugin.default_enabled,
                    coming_soon=plugin.coming_soon,
                    sort_order=plugin.sort_order,
                ),
            )

    app_config = await _get_tenant_app_configuration_response(
        db,
        tenant_id=tenant_ctx.tenant.id,
        tenant_name=tenant_ctx.tenant.name,
    )
    plugins = await _list_tenant_plugin_configurations(db, tenant_id=tenant_ctx.tenant.id)
    return OptionsExportResponse(
        exported_at=datetime.now(timezone.utc),
        app_configuration=app_config,
        plugins=plugins,
    )
