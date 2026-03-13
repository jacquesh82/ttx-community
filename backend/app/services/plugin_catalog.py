"""Plugin catalog service backed by PostgreSQL enum + plugin_configurations."""
import logging
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.plugin import (
    PluginConfiguration,
    get_plugin_config_fallback,
    plugin_type_enum,
)


LEGACY_PLUGIN_TYPE_ALIASES: dict[str, str] = {
    "social_network": "social_internal",
    "email": "mailbox",
}

logger = logging.getLogger(__name__)


def normalize_plugin_type(value: object) -> str:
    """Normalize plugin type input and convert known legacy aliases."""
    if value is None:
        return ""
    normalized = str(value).strip().lower()
    return LEGACY_PLUGIN_TYPE_ALIASES.get(normalized, normalized)


def _raw_plugin_type(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


async def get_plugin_enum_values(db: AsyncSession) -> list[str]:
    """Return enum labels for PostgreSQL type plugin_type ordered by enumsortorder."""
    if db.bind is not None and db.bind.dialect.name != "postgresql":
        # Fallback for non-Postgres execution environments.
        return list(plugin_type_enum.enums)

    def _dedupe(values: list[str]) -> list[str]:
        seen: set[str] = set()
        deduped: list[str] = []
        for value in values:
            if value in seen:
                continue
            seen.add(value)
            deduped.append(value)
        return deduped

    async def _read_enum_labels(enum_name: str) -> list[str]:
        result = await db.execute(
            text(
                """
                SELECT e.enumlabel
                FROM pg_type t
                JOIN pg_enum e ON e.enumtypid = t.oid
                WHERE t.typname = :enum_name
                ORDER BY e.enumsortorder
                """
            ),
            {"enum_name": enum_name},
        )
        return [str(row[0]).strip() for row in result.all() if str(row[0]).strip()]

    enum_candidates: list[str] = ["plugin_type", "plugintype"]
    enum_values: list[str] = []

    for enum_name in enum_candidates:
        labels = await _read_enum_labels(enum_name)
        if labels:
            enum_values.extend(labels)

    if enum_values:
        return _dedupe(enum_values)

    # Try to discover the enum name from table columns (legacy schemas may differ).
    try:
        column_enum_result = await db.execute(
            text(
                """
                SELECT DISTINCT c.udt_name
                FROM information_schema.columns c
                WHERE c.table_schema = current_schema()
                  AND c.column_name = 'plugin_type'
                  AND c.table_name IN ('exercise_plugins', 'plugin_configurations')
                  AND c.udt_name IS NOT NULL
                """
            )
        )
        discovered_enum_names = [str(row[0]).strip() for row in column_enum_result.all() if str(row[0]).strip()]
        for enum_name in discovered_enum_names:
            labels = await _read_enum_labels(enum_name)
            if labels:
                enum_values.extend(labels)
    except SQLAlchemyError:
        logger.exception("Unable to discover enum labels from information_schema for plugin_type")

    if enum_values:
        return _dedupe(enum_values)

    # Last resort: infer from existing rows when enum metadata is unavailable.
    try:
        values_from_rows: list[str] = []
        exercise_plugins_exists = await db.execute(
            text("SELECT to_regclass('public.exercise_plugins') IS NOT NULL")
        )
        if bool(exercise_plugins_exists.scalar()):
            rows = await db.execute(text("SELECT DISTINCT lower(plugin_type::text) FROM exercise_plugins"))
            values_from_rows.extend(str(row[0]).strip() for row in rows.all() if row[0])

        plugin_configs_exists = await db.execute(
            text("SELECT to_regclass('public.plugin_configurations') IS NOT NULL")
        )
        if bool(plugin_configs_exists.scalar()):
            rows = await db.execute(text("SELECT DISTINCT lower(plugin_type::text) FROM plugin_configurations"))
            values_from_rows.extend(str(row[0]).strip() for row in rows.all() if row[0])

        if values_from_rows:
            logger.warning("Falling back to plugin types discovered from existing rows")
            return _dedupe(values_from_rows)
    except SQLAlchemyError:
        logger.exception("Unable to infer plugin enum values from plugin tables")

    # Absolute fallback keeps API operational even if DB enum metadata is absent.
    logger.warning("Falling back to model-declared plugin_type enum values")
    return _dedupe([str(value).strip() for value in plugin_type_enum.enums if str(value).strip()])


# Plugin types that exist in the PG enum but should no longer appear in the UI.
HIDDEN_PLUGIN_TYPES: set[str] = {"gov_channel", "anssi_channel"}


async def get_canonical_plugin_types(db: AsyncSession) -> list[str]:
    """Return plugin types from DB while hiding legacy aliases when canonical values exist."""
    enum_values = await get_plugin_enum_values(db)
    normalized_values = [str(value).strip().lower() for value in enum_values if str(value).strip()]
    normalized_set = set(normalized_values)
    canonical_types: list[str] = []
    seen: set[str] = set()

    for raw_value in normalized_values:
        mapped_value = LEGACY_PLUGIN_TYPE_ALIASES.get(raw_value)
        if mapped_value and mapped_value in normalized_set:
            candidate = mapped_value
        else:
            candidate = raw_value
        if candidate not in seen and candidate not in HIDDEN_PLUGIN_TYPES:
            seen.add(candidate)
            canonical_types.append(candidate)

    return canonical_types


def _invalid_plugin_type_error(value: object, valid_values: list[str]) -> HTTPException:
    return HTTPException(
        status_code=400,
        detail=f"Invalid plugin type: {value}. Valid values: {valid_values}",
    )


async def validate_plugin_type(db: AsyncSession, value: object) -> str:
    """Validate plugin type against DB catalog and return canonical value."""
    valid_values = await get_canonical_plugin_types(db)
    normalized = normalize_plugin_type(value)
    if normalized and normalized in valid_values:
        return normalized

    raw_value = _raw_plugin_type(value)
    if raw_value and raw_value in valid_values:
        return raw_value

    raise _invalid_plugin_type_error(value, valid_values)


async def validate_plugin_types(db: AsyncSession, values: list[object]) -> list[str]:
    """Validate multiple plugin types and return normalized canonical unique list."""
    validated: list[str] = []
    seen: set[str] = set()
    for value in values:
        plugin_type = await validate_plugin_type(db, value)
        if plugin_type in seen:
            continue
        seen.add(plugin_type)
        validated.append(plugin_type)
    return validated


async def get_plugin_config_map(db: AsyncSession) -> dict[str, PluginConfiguration]:
    """Return plugin configurations indexed by plugin_type."""
    result = await db.execute(
        select(PluginConfiguration).order_by(PluginConfiguration.sort_order, PluginConfiguration.id)
    )
    configs = result.scalars().all()
    config_map: dict[str, PluginConfiguration] = {}
    for config in configs:
        canonical_type = normalize_plugin_type(config.plugin_type)
        config_map.setdefault(canonical_type, config)
    return config_map


def get_plugin_metadata(
    plugin_type: str,
    config: PluginConfiguration | None,
    fallback_sort_order: int | None = None,
) -> dict[str, Any]:
    """Return normalized metadata for a plugin type."""
    if config is not None:
        return {
            "plugin_type": plugin_type,
            "name": config.name,
            "description": config.description or "",
            "icon": config.icon,
            "color": config.color,
            "default_enabled": config.default_enabled,
            "coming_soon": config.coming_soon,
            "sort_order": config.sort_order,
        }

    fallback = get_plugin_config_fallback(plugin_type, sort_order=fallback_sort_order)
    return {
        "plugin_type": plugin_type,
        "name": fallback["name"],
        "description": fallback["description"],
        "icon": fallback["icon"],
        "color": fallback["color"],
        "default_enabled": fallback["default_enabled"],
        "coming_soon": fallback["coming_soon"],
        "sort_order": fallback["sort_order"],
    }


async def ensure_plugin_configurations(db: AsyncSession) -> dict[str, PluginConfiguration]:
    """Ensure each canonical plugin type has one config row."""
    canonical_types = await get_canonical_plugin_types(db)
    config_map = await get_plugin_config_map(db)
    created_any = False

    for index, plugin_type in enumerate(canonical_types, start=1):
        if plugin_type in config_map:
            continue
        fallback = get_plugin_config_fallback(plugin_type, sort_order=index)
        config = PluginConfiguration(
            plugin_type=plugin_type,
            name=str(fallback["name"]),
            description=str(fallback["description"]),
            icon=str(fallback["icon"]),
            color=str(fallback["color"]),
            default_enabled=bool(fallback["default_enabled"]),
            coming_soon=bool(fallback["coming_soon"]),
            sort_order=int(fallback["sort_order"]),
        )
        db.add(config)
        config_map[plugin_type] = config
        created_any = True

    if created_any:
        await db.flush()
        config_map = await get_plugin_config_map(db)

    return config_map
