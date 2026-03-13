"""Inject bank router.

Manages the reusable library of inject templates (the "inject bank") in CrisisLab.
Injects are pre-authored crisis events (emails, SMS, social-media posts, TV segments,
phone calls, documents, system alerts) that animateurs drag into exercise timelines.
This router provides CRUD, search, statistics, import/export, and schema endpoints.
"""
import io
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator
from sqlalchemy import String, cast, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.models import Media, MediaVisibility
from app.models.inject_bank import InjectBankItem, InjectBankKind, InjectBankStatus
from app.models.user import UserRole
from app.routers.auth import require_auth, require_role
from app.services.inject_bank_schema import (
    SchemaValidationException,
    get_inject_bank_schema,
    validate_schema_payload,
)
from app.services.media_service import media_service
from app.utils.tenancy import TenantRequestContext, require_tenant_context

router = APIRouter()

INJECT_DATA_FORMATS = {"text", "audio", "video", "image"}
BANK_SCHEMA_FIELDS = {
    "custom_id",
    "title",
    "kind",
    "status",
    "category",
    "data_format",
    "summary",
    "content",
    "source_url",
    "payload",
    "tags",
}


def _normalize_data_format(value: str | None) -> str:
    if value is None:
        return "text"
    normalized = str(value).strip().lower()
    if normalized not in INJECT_DATA_FORMATS:
        raise ValueError(f"Invalid data_format value: {value}")
    return normalized



# Mapping for uppercase status values to lowercase enum values
_UPPERCASE_STATUS_MAP = {
    "DRAFT": InjectBankStatus.DRAFT,
    "READY": InjectBankStatus.READY,
    "ARCHIVED": InjectBankStatus.ARCHIVED,
    "VALIDATED": InjectBankStatus.READY,  # Map validated to ready
    "PLAYED": InjectBankStatus.ARCHIVED,  # Map played to archived
}


def _normalize_kind(value: InjectBankKind | str) -> InjectBankKind:
    """Normalize kind value. Canonical values are the JSON schema enum values."""
    if isinstance(value, InjectBankKind):
        return value
    if isinstance(value, str):
        try:
            return InjectBankKind(value.strip().lower())
        except ValueError:
            pass
    raise ValueError(f"Invalid kind value: {value!r}. Valid values: {[k.value for k in InjectBankKind]}")


def _normalize_status(value: InjectBankStatus | str) -> InjectBankStatus:
    """Normalize status value, handling both uppercase and lowercase strings."""
    if isinstance(value, InjectBankStatus):
        return value
    if isinstance(value, str):
        # Try uppercase mapping first (for both uppercase and lowercase input)
        upper_value = value.upper()
        if upper_value in _UPPERCASE_STATUS_MAP:
            return _UPPERCASE_STATUS_MAP[upper_value]
        # Try the value as-is in the map
        if value in _UPPERCASE_STATUS_MAP:
            return _UPPERCASE_STATUS_MAP[value]
        # Try converting to uppercase and creating enum
        try:
            return InjectBankStatus(upper_value)
        except ValueError:
            pass
        # Try the value as-is
        try:
            return InjectBankStatus(value)
        except ValueError:
            pass
    raise ValueError(f"Invalid status value: {value}")


def _normalize_legacy_bank_entry(raw_data: dict, *, for_update: bool = False) -> dict:
    """Normalize legacy/import payload into canonical inject-bank shape."""
    data = dict(raw_data)

    if "kind" not in data and "type" in data:
        data["kind"] = data.get("type")
    if "content" not in data and "description" in data:
        data["content"] = data.get("description")
    if "custom_id" not in data and "id" in data:
        data["custom_id"] = str(data.get("id"))

    if "kind" in data and data.get("kind") is not None:
        data["kind"] = _normalize_kind(data["kind"]).value
    if "status" in data and data.get("status") is not None:
        data["status"] = _normalize_status(data["status"]).value
    if "data_format" in data and data.get("data_format") is not None:
        data["data_format"] = _normalize_data_format(data["data_format"])

    content_value = data.get("content")
    if isinstance(content_value, dict):
        payload = data.get("payload", {})
        if not isinstance(payload, dict):
            payload = {}
        payload = {**payload, **content_value}
        data["payload"] = payload

        summary_parts: list[str] = []
        for text_field in ("headline", "article_body", "official_message", "official_statement"):
            field_value = content_value.get(text_field)
            if isinstance(field_value, str) and field_value.strip():
                summary_parts.append(field_value[:500])
        data["content"] = "\n\n".join(summary_parts) if summary_parts else None

        if not data.get("source_url"):
            url_value = content_value.get("url")
            if isinstance(url_value, str) and url_value.strip():
                data["source_url"] = url_value.strip()

    tags_value = data.get("tags")
    if isinstance(tags_value, str):
        data["tags"] = [tag.strip() for tag in tags_value.split(",") if tag.strip()]
    elif tags_value is None:
        data["tags"] = []

    payload_value = data.get("payload")
    if payload_value is None:
        data["payload"] = {}
    elif not isinstance(payload_value, dict):
        data["payload"] = {}

    if not for_update:
        data.setdefault("status", InjectBankStatus.DRAFT.value)
        data.setdefault("data_format", "text")
        data.setdefault("payload", {})
        data.setdefault("tags", [])

    normalized = {
        key: value
        for key, value in data.items()
        if key in BANK_SCHEMA_FIELDS and value is not None
    }
    return normalized


def _validate_bank_payload_or_400(payload: dict, *, item_index: int | None = None) -> None:
    try:
        validate_schema_payload("inject_bank", payload)
    except SchemaValidationException as exc:
        prefix = f"Element {item_index}: " if item_index is not None else ""
        raise HTTPException(status_code=400, detail=f"{prefix}{exc.path} - {exc.message}") from exc


def _bank_item_to_schema_instance(item: InjectBankItem) -> dict:
    payload = {
        "custom_id": item.custom_id,
        "title": item.title,
        "kind": item.kind.value if hasattr(item.kind, "value") else item.kind,
        "status": item.status.value if hasattr(item.status, "value") else item.status,
        "category": item.category,
        "data_format": item.data_format,
        "summary": item.summary,
        "content": item.content,
        "source_url": item.source_url,
        "payload": item.payload or {},
        "tags": item.tags or [],
    }
    return {key: value for key, value in payload.items() if value is not None}


class InjectBankBase(BaseModel):
    """Base schema for an inject bank item in CrisisLab.

    An inject bank item is a reusable crisis-event template that can be inserted
    into any exercise timeline. It carries the content (email body, SMS text,
    TV script, etc.) along with metadata for filtering and categorisation.
    """

    custom_id: Optional[str] = Field(
        default=None, max_length=100,
        description="Optional external identifier for deduplication during imports.",
        examples=["CYBER-STORM-INJ-001"],
    )
    title: str = Field(
        min_length=3, max_length=255,
        description="Short descriptive title of the inject.",
        examples=["Alerte SIEM — Activité suspecte"],
    )
    kind: InjectBankKind = Field(
        description="Communication channel: mail, sms, socialnet, tv, call, doc, system, etc.",
        examples=["mail"],
    )
    status: InjectBankStatus = Field(
        default=InjectBankStatus.DRAFT,
        description="Lifecycle status: draft, ready, or archived.",
        examples=["ready"],
    )
    category: Optional[str] = Field(
        default=None, max_length=100,
        description="Thematic category for grouping injects.",
        examples=["Alerte SOC"],
    )
    data_format: str = Field(
        default="text", max_length=16,
        description="Content format: text, audio, image, or video.",
        examples=["text"],
    )
    summary: Optional[str] = Field(
        default=None,
        description="Brief summary displayed in list views.",
        examples=["Le SIEM détecte une exfiltration de données anormale vers une IP externe."],
    )
    content: Optional[str] = Field(
        default=None,
        description="Full content body (email HTML, SMS text, script, etc.).",
    )
    source_url: Optional[str] = Field(
        default=None, max_length=500,
        description="URL to an attached media asset or external resource.",
    )
    payload: dict = Field(
        default_factory=dict,
        description="Arbitrary JSON payload specific to the inject kind (email headers, phone metadata, etc.).",
    )
    tags: list[str] = Field(
        default_factory=list,
        description="Free-form tags for search and filtering.",
        examples=[["ransomware", "soc"]],
    )

    model_config = {"json_schema_extra": {
        "example": {
            "custom_id": "CYBER-STORM-INJ-001",
            "title": "Alerte SIEM — Activité suspecte",
            "kind": "mail",
            "status": "ready",
            "category": "Alerte SOC",
            "data_format": "text",
            "summary": "Le SIEM détecte une exfiltration de données anormale vers une IP externe.",
            "content": "Bonjour,\n\nNotre SIEM a détecté une activité suspecte sur le segment réseau 10.0.3.0/24...",
            "source_url": None,
            "payload": {},
            "tags": ["ransomware", "soc"],
        }
    }}

    @classmethod
    def _normalize_kind(cls, value: any) -> InjectBankKind:
        return _normalize_kind(value)

    @classmethod
    def _normalize_status(cls, value: any) -> InjectBankStatus:
        return _normalize_status(value)

    @field_validator("kind", mode="before")
    @classmethod
    def validate_kind(cls, v: any) -> InjectBankKind:
        return cls._normalize_kind(v)

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v: any) -> InjectBankStatus:
        return cls._normalize_status(v)

    @field_validator("data_format", mode="before")
    @classmethod
    def validate_data_format(cls, v: any) -> str:
        return _normalize_data_format(v)

    @model_validator(mode="before")
    @classmethod
    def map_type_to_kind(cls, data: any) -> any:
        """Map 'type' field (from JSON schema) to 'kind' field if 'kind' is not provided."""
        if not isinstance(data, dict):
            return data
        # If 'kind' is missing but 'type' exists, map type -> kind
        if "kind" not in data and "type" in data:
            data["kind"] = data["type"]
        # Map 'description' to 'content' if content is missing
        if "content" not in data and "description" in data:
            data["content"] = data["description"]
        
        # Map 'id' (UUID from JSON) to 'custom_id' for deduplication
        if "custom_id" not in data and "id" in data:
            data["custom_id"] = str(data["id"])
        
        # Handle 'content' field - if it's an object, move it to payload
        # The schema expects content as string, but JSON schema has content as object
        if "content" in data and isinstance(data["content"], dict):
            # Merge content object into payload
            payload = data.get("payload", {}) or {}
            if isinstance(payload, dict):
                payload = {**payload, **data["content"]}
            data["payload"] = payload
            # Set content to a summary string from the content object
            content_obj = data["content"]
            summary_parts = []
            if isinstance(content_obj.get("headline"), str):
                summary_parts.append(content_obj["headline"])
            if isinstance(content_obj.get("article_body"), str):
                # Truncate long article bodies
                body = content_obj["article_body"][:500]
                summary_parts.append(body)
            if isinstance(content_obj.get("official_message"), str):
                summary_parts.append(content_obj["official_message"][:500])
            if isinstance(content_obj.get("official_statement"), str):
                summary_parts.append(content_obj["official_statement"][:500])
            data["content"] = "\n\n".join(summary_parts) if summary_parts else None
        
        return data


class InjectBankCreate(InjectBankBase):
    """Schema for creating a new inject bank item in CrisisLab.

    Inherits all fields from InjectBankBase. The `kind` and `title` fields are
    required; everything else has sensible defaults.
    """

    model_config = {"json_schema_extra": {
        "example": {
            "title": "Demande de rançon 150 BTC",
            "kind": "mail",
            "status": "draft",
            "category": "Communication externe",
            "data_format": "text",
            "summary": "Les attaquants envoient une demande de rançon de 150 BTC au COMEX.",
            "content": "Nous avons chiffré l'ensemble de vos serveurs de production. Transférez 150 BTC à l'adresse suivante dans les 48h...",
            "tags": ["ransomware", "communication", "crise"],
        }
    }}


class InjectBankUpdate(BaseModel):
    """Schema for partially updating an inject bank item. Only provided fields are modified."""

    title: Optional[str] = Field(default=None, min_length=3, max_length=255, description="Updated title.")
    kind: Optional[InjectBankKind] = Field(default=None, description="Change the inject channel type.")
    status: Optional[InjectBankStatus] = Field(default=None, description="Transition to a new status.", examples=["ready"])
    category: Optional[str] = Field(default=None, max_length=100, description="Updated category.", examples=["Pression médiatique"])
    data_format: Optional[str] = Field(default=None, max_length=16, description="Updated data format.")
    summary: Optional[str] = Field(default=None, description="Updated summary.")
    content: Optional[str] = Field(default=None, description="Updated content body.")
    source_url: Optional[str] = Field(default=None, max_length=500, description="Updated source URL.")
    payload: Optional[dict] = Field(default=None, description="Updated JSON payload.")
    tags: Optional[list[str]] = Field(default=None, description="Replacement tag list.", examples=[["communication", "crise"]])

    model_config = {"json_schema_extra": {
        "example": {
            "status": "ready",
            "category": "Pression médiatique",
            "tags": ["communication", "crise"],
        }
    }}

    @field_validator("data_format", mode="before")
    @classmethod
    def validate_data_format(cls, v: any) -> str | None:
        if v is None:
            return None
        return _normalize_data_format(v)


class InjectBankResponse(InjectBankBase):
    """Full representation of an inject bank item returned by the CrisisLab API."""

    id: int = Field(description="Unique database identifier.", examples=[1])
    owner_tenant_id: int | None = Field(default=None, description="Owning tenant ID.")
    visibility_scope: str | None = Field(default=None, description="Visibility scope: tenant or global.")
    shareable: bool | None = Field(default=None, description="Whether the item can be shared across tenants.")
    source_type: str | None = Field(default=None, description="Origin source: manual, import, marketplace.")
    origin_listing_id: int | None = Field(default=None, description="Marketplace listing ID if sourced externally.")
    created_by: Optional[int] = Field(description="User ID of the creator.")
    created_at: datetime = Field(description="Record creation timestamp.")
    updated_at: datetime = Field(description="Last modification timestamp.")

    model_config = {"from_attributes": True, "json_schema_extra": {
        "example": {
            "id": 1,
            "custom_id": "CYBER-STORM-INJ-001",
            "title": "Alerte SIEM — Activité suspecte",
            "kind": "mail",
            "status": "ready",
            "category": "Alerte SOC",
            "data_format": "text",
            "summary": "Le SIEM détecte une exfiltration de données anormale vers une IP externe.",
            "content": "Bonjour,\n\nNotre SIEM a détecté une activité suspecte...",
            "source_url": None,
            "payload": {},
            "tags": ["ransomware", "soc"],
            "owner_tenant_id": 1,
            "visibility_scope": "tenant",
            "shareable": False,
            "source_type": "manual",
            "origin_listing_id": None,
            "created_by": 3,
            "created_at": "2026-03-10T14:30:00Z",
            "updated_at": "2026-03-11T09:15:00Z",
        }
    }}


class InjectBankListResponse(BaseModel):
    """Paginated list of inject bank items returned by the CrisisLab API."""

    items: list[InjectBankResponse] = Field(description="Inject bank records for the current page.")
    total: int = Field(description="Total number of items matching the filters.", examples=[42])
    page: int = Field(description="Current page number (1-based).", examples=[1])
    page_size: int = Field(description="Number of items per page.", examples=[20])

    model_config = {"json_schema_extra": {
        "example": {
            "items": [],
            "total": 42,
            "page": 1,
            "page_size": 20,
        }
    }}


class InjectBankStats(BaseModel):
    """Aggregate statistics for the inject bank, grouped by kind and status."""

    by_kind: dict[str, int] = Field(
        description="Item count per inject kind.",
        examples=[{"mail": 15, "sms": 8, "socialnet": 12, "tv": 4, "call": 3}],
    )
    by_status: dict[str, int] = Field(
        description="Item count per lifecycle status.",
        examples=[{"draft": 10, "ready": 28, "archived": 4}],
    )
    total: int = Field(description="Total number of inject bank items.", examples=[42])

    model_config = {"json_schema_extra": {
        "example": {
            "by_kind": {"mail": 15, "sms": 8, "socialnet": 12, "tv": 4, "call": 3},
            "by_status": {"draft": 10, "ready": 28, "archived": 4},
            "total": 42,
        }
    }}


class InjectBankImportResponse(BaseModel):
    """Summary returned after a ZIP bulk-import of inject bank items into CrisisLab."""

    imported: int = Field(description="Number of items successfully imported.", examples=[35])
    skipped: int = Field(description="Number of items skipped (e.g. duplicate custom_id).", examples=[3])
    total_in_zip: int = Field(description="Total number of items found in the ZIP archive.", examples=[38])

    model_config = {"json_schema_extra": {
        "example": {
            "imported": 35,
            "skipped": 3,
            "total_in_zip": 38,
        }
    }}


class InjectBankSchemaResponse(BaseModel):
    """JSON Schema used to validate inject bank payloads during import."""

    json_schema: dict = Field(
        serialization_alias="schema",
        description="The full JSON Schema definition for inject bank items.",
    )

    model_config = {"populate_by_name": True}


def _get_attachment(payload: dict) -> Optional[dict]:
    if not isinstance(payload, dict):
        return None
    attachment = payload.get("attachment")
    if isinstance(attachment, dict):
        return attachment
    return None


def _get_attachment_media_id(payload: dict) -> Optional[int]:
    attachment = _get_attachment(payload)
    if not attachment:
        return None
    media_id = attachment.get("media_id")
    return media_id if isinstance(media_id, int) else None


def _media_source_url(kind: InjectBankKind, media_id: int) -> str:
    if kind == InjectBankKind.VIDEO:
        return f"/api/media/{media_id}/stream"
    if kind == InjectBankKind.IMAGE:
        return f"/api/media/{media_id}/preview"
    return f"/api/media/{media_id}/download"


def _safe_filename(name: str) -> str:
    safe = Path(name).name
    return safe if safe else "media.bin"


@router.get("", response_model=InjectBankListResponse)
async def list_inject_bank_items(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    kind: Optional[InjectBankKind] = None,
    status: Optional[InjectBankStatus] = None,
    category: Optional[str] = None,
    tag: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = Query("updated_at", pattern="^(updated_at|created_at|title)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """List inject bank items with filters, search, sorting, and pagination.

    Supports filtering by kind, status, category, and tag. Free-text search
    matches against title, summary, content, category, and tags.
    """
    query = select(InjectBankItem).where(InjectBankItem.owner_tenant_id == tenant_ctx.tenant.id)
    count_query = select(func.count(InjectBankItem.id)).where(InjectBankItem.owner_tenant_id == tenant_ctx.tenant.id)

    if kind:
        query = query.where(InjectBankItem.kind == kind)
        count_query = count_query.where(InjectBankItem.kind == kind)

    if status:
        query = query.where(InjectBankItem.status == status)
        count_query = count_query.where(InjectBankItem.status == status)

    if category:
        query = query.where(InjectBankItem.category == category)
        count_query = count_query.where(InjectBankItem.category == category)

    if tag:
        # JSON arrays are stored as text-compatible payload for simple contains filtering.
        tag_filter = cast(InjectBankItem.tags, String).ilike(f"%\"{tag}\"%")
        query = query.where(tag_filter)
        count_query = count_query.where(tag_filter)

    if search:
        like = f"%{search}%"
        search_filter = or_(
            InjectBankItem.title.ilike(like),
            InjectBankItem.summary.ilike(like),
            InjectBankItem.content.ilike(like),
            InjectBankItem.category.ilike(like),
            cast(InjectBankItem.tags, String).ilike(like),
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    sort_column = {
        "updated_at": InjectBankItem.updated_at,
        "created_at": InjectBankItem.created_at,
        "title": InjectBankItem.title,
    }[sort_by]

    if order == "asc":
        query = query.order_by(sort_column.asc())
    else:
        query = query.order_by(desc(sort_column))

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    result = await db.execute(query.offset((page - 1) * page_size).limit(page_size))
    items = result.scalars().all()

    return InjectBankListResponse(
        items=[InjectBankResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/stats", response_model=InjectBankStats)
async def get_inject_bank_stats(
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """Get aggregate statistics for the inject bank dashboard.

    Returns item counts grouped by kind (mail, sms, tv, etc.) and by status
    (draft, ready, archived), plus the total item count.
    """
    kind_rows = await db.execute(
        select(InjectBankItem.kind, func.count(InjectBankItem.id))
        .where(InjectBankItem.owner_tenant_id == tenant_ctx.tenant.id)
        .group_by(InjectBankItem.kind)
    )
    status_rows = await db.execute(
        select(InjectBankItem.status, func.count(InjectBankItem.id))
        .where(InjectBankItem.owner_tenant_id == tenant_ctx.tenant.id)
        .group_by(InjectBankItem.status)
    )
    total_rows = await db.execute(
        select(func.count(InjectBankItem.id)).where(InjectBankItem.owner_tenant_id == tenant_ctx.tenant.id)
    )

    by_kind = {str(kind.value): count for kind, count in kind_rows.all()}
    by_status = {str(status.value): count for status, count in status_rows.all()}

    return InjectBankStats(by_kind=by_kind, by_status=by_status, total=total_rows.scalar() or 0)


@router.get("/categories", response_model=list[str])
async def get_inject_bank_categories(
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """Get all unique category values currently used across inject bank items.

    Useful for populating filter dropdowns in the CrisisLab UI.
    """
    result = await db.execute(
        select(InjectBankItem.category)
        .where(
            InjectBankItem.owner_tenant_id == tenant_ctx.tenant.id,
            InjectBankItem.category.isnot(None),
        )
        .distinct()
        .order_by(InjectBankItem.category.asc())
    )
    categories = [row[0] for row in result.all()]
    return categories


@router.get("/schema", response_model=InjectBankSchemaResponse)
async def get_inject_bank_import_schema(
    _: any = Depends(require_auth),
):
    """Return the JSON Schema used to validate inject bank payloads during import.

    Clients can use this schema for client-side validation before submitting
    a ZIP import.
    """
    return InjectBankSchemaResponse(json_schema=get_inject_bank_schema())


@router.get("/export/zip")
async def export_inject_bank_zip(
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Export all inject bank items as a ZIP archive (admin only).

    The archive contains a JSON manifest (`inject_bank_export.json`) with all
    item metadata and a `media/` directory with referenced media files.
    Compatible with the `/import/zip` endpoint for backup and restore.
    """
    result = await db.execute(
        select(InjectBankItem)
        .where(InjectBankItem.owner_tenant_id == tenant_ctx.tenant.id)
        .order_by(InjectBankItem.id.asc())
    )
    items = result.scalars().all()
    serialized_items = [InjectBankResponse.model_validate(item).model_dump(mode="json") for item in items]

    media_ids = {
        media_id
        for item in serialized_items
        for media_id in [_get_attachment_media_id(item.get("payload") or {})]
        if media_id is not None
    }

    media_manifest: list[dict] = []
    exported_media_ids: set[int] = set()
    media_by_id: dict[int, Media] = {}
    if media_ids:
        media_result = await db.execute(select(Media).where(Media.id.in_(media_ids)))
        media_list = media_result.scalars().all()
        media_by_id = {media.id: media for media in media_list}

    for item in serialized_items:
        payload = item.get("payload")
        if not isinstance(payload, dict):
            continue
        attachment = _get_attachment(payload)
        if not attachment:
            continue
        media_id = attachment.get("media_id")
        if not isinstance(media_id, int):
            continue
        media = media_by_id.get(media_id)
        if not media:
            continue

        archive_path = f"media/{media.id}-{_safe_filename(media.original_filename)}"
        attachment["archive_media_path"] = archive_path
        attachment["source_media_id"] = media.id

        if media.id in exported_media_ids:
            continue

        media_manifest.append(
            {
                "source_media_id": media.id,
                "archive_path": archive_path,
                "original_filename": media.original_filename,
                "mime_type": media.mime_type,
                "size": media.size,
                "title": media.title,
                "description": media.description,
                "tags": media.tags or [],
                "visibility": media.visibility.value,
            }
        )
        exported_media_ids.add(media.id)

    export_payload = {
        "version": 2,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "total": len(serialized_items),
        "items": serialized_items,
        "media_manifest": media_manifest,
    }

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("inject_bank_export.json", json.dumps(export_payload, ensure_ascii=False, indent=2))
        for media_entry in media_manifest:
            media = media_by_id.get(media_entry["source_media_id"])
            if not media:
                continue
            file_path, _ = media_service.get_file_stream(media)
            zf.write(file_path, arcname=media_entry["archive_path"])

    filename = f"inject-bank-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.zip"
    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/clear-all", status_code=200)
async def clear_all_inject_bank_items(
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Delete all inject bank items for the current tenant (admin only).

    This is a destructive operation. Use with caution.
    """
    # Delete all items
    result = await db.execute(select(InjectBankItem).where(InjectBankItem.owner_tenant_id == tenant_ctx.tenant.id))
    items = result.scalars().all()
    count = len(items)
    for item in items:
        await db.delete(item)
    await db.commit()
    return {"deleted": count}


@router.post("/import/zip", response_model=InjectBankImportResponse)
async def import_inject_bank_zip(
    file: UploadFile = File(...),
    clear_before: bool = Query(False, description="Clear all existing items before import"),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    current_user=Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Import inject bank items from a ZIP archive (admin only).

    The ZIP must contain at least one JSON file with an array of inject bank items
    (or a `{"items": [...]}` wrapper). Referenced media files should be placed in a
    `media/` directory within the archive, matching the `media_manifest` entries.

    Items with a `custom_id` that already exists in the tenant are skipped (unless
    `clear_before=true` is used to wipe existing items first).
    """
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Le fichier doit etre un ZIP")
    
    # Clear all existing items if requested
    if clear_before:
        result = await db.execute(select(InjectBankItem).where(InjectBankItem.owner_tenant_id == tenant_ctx.tenant.id))
        existing_items = result.scalars().all()
        for item in existing_items:
            await db.delete(item)
        await db.commit()

    raw_bytes = await file.read()
    all_entries: list[dict] = []
    media_blob_by_key: dict[str, bytes] = {}
    media_manifest_by_source_id: dict[int, dict] = {}
    media_manifest_by_path: dict[str, dict] = {}
    
    try:
        with zipfile.ZipFile(io.BytesIO(raw_bytes), mode="r") as zf:
            json_candidates = [name for name in zf.namelist() if name.lower().endswith(".json")]
            if not json_candidates:
                raise HTTPException(status_code=400, detail="Aucun fichier JSON trouve dans le ZIP")

            # Process ALL JSON files in the ZIP, not just the first one
            for json_filename in json_candidates:
                with zf.open(json_filename, mode="r") as json_file:
                    payload = json.load(json_file)

                # Extract entries from this JSON file
                if isinstance(payload, list):
                    entries = payload
                elif isinstance(payload, dict) and isinstance(payload.get("items"), list):
                    entries = payload["items"]
                elif isinstance(payload, dict):
                    entries = [payload]
                else:
                    continue  # Skip invalid JSON structures

                # Add valid entries to our collection
                for entry in entries:
                    if isinstance(entry, dict):
                        all_entries.append(entry)

                # Collect media manifest from this JSON file
                media_manifest = payload.get("media_manifest", []) if isinstance(payload, dict) else []
                if isinstance(media_manifest, list):
                    for media_entry in media_manifest:
                        if not isinstance(media_entry, dict):
                            continue
                        archive_path = media_entry.get("archive_path")
                        source_media_id = media_entry.get("source_media_id")
                        if not isinstance(archive_path, str) or not archive_path:
                            continue
                        try:
                            media_blob_by_key[f"path:{archive_path}"] = zf.read(archive_path)
                            media_manifest_by_path[archive_path] = media_entry
                            if isinstance(source_media_id, int):
                                media_blob_by_key[f"id:{source_media_id}"] = media_blob_by_key[f"path:{archive_path}"]
                                media_manifest_by_source_id[source_media_id] = media_entry
                        except KeyError:
                            # Media file referenced in manifest but not in ZIP - skip it
                            pass

    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="ZIP invalide") from exc
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Media manquant dans le ZIP: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="JSON invalide dans le ZIP") from exc

    if len(all_entries) == 0:
        raise HTTPException(status_code=400, detail="Aucun element a importer")

    imported_items: list[InjectBankItem] = []
    skipped_count = 0
    imported_media_id_by_source_id: dict[int, int] = {}
    imported_media_id_by_path: dict[str, int] = {}
    
    # Collect existing custom_ids for deduplication (only if not clearing)
    existing_custom_ids: set[str] = set()
    if not clear_before:
        result = await db.execute(
            select(InjectBankItem.custom_id).where(
                InjectBankItem.custom_id.isnot(None),
                InjectBankItem.owner_tenant_id == tenant_ctx.tenant.id,
            )
        )
        existing_custom_ids = {row[0] for row in result.all() if row[0]}
    
    for index, raw_entry in enumerate(all_entries):
        if not isinstance(raw_entry, dict):
            raise HTTPException(status_code=400, detail=f"Element {index + 1}: format invalide")

        try:
            # Enforce the canonical JSON schema as-is for ZIP imports.
            _validate_bank_payload_or_400(raw_entry, item_index=index + 1)
            normalized_entry = _normalize_legacy_bank_entry(raw_entry, for_update=False)
            item_data = InjectBankCreate.model_validate(normalized_entry)
        except ValidationError as exc:
            # Extract specific validation error details
            errors = exc.errors()
            if errors:
                first_error = errors[0]
                field = ".".join(str(loc) for loc in first_error.get("loc", []))
                msg = first_error.get("msg", "erreur de validation")
                detail_msg = f"Element {index + 1}: champ '{field}' - {msg}"
            else:
                detail_msg = f"Element {index + 1}: donnees invalides"
            raise HTTPException(
                status_code=400,
                detail=detail_msg,
            ) from exc
        
        # Skip if custom_id already exists
        if item_data.custom_id and item_data.custom_id in existing_custom_ids:
            skipped_count += 1
            continue

        payload_data = dict(item_data.payload or {})
        source_url = item_data.source_url
        attachment = _get_attachment(payload_data)
        if attachment:
            source_media_id = attachment.get("source_media_id")
            legacy_media_id = attachment.get("media_id")
            archive_path = attachment.get("archive_media_path")

            mapped_media_id = None
            if isinstance(source_media_id, int):
                mapped_media_id = imported_media_id_by_source_id.get(source_media_id)
            if mapped_media_id is None and isinstance(archive_path, str):
                mapped_media_id = imported_media_id_by_path.get(archive_path)

            if mapped_media_id is None:
                media_bytes = None
                if isinstance(source_media_id, int):
                    media_bytes = media_blob_by_key.get(f"id:{source_media_id}")
                if media_bytes is None and isinstance(archive_path, str):
                    media_bytes = media_blob_by_key.get(f"path:{archive_path}")

                if media_bytes is not None:
                    media_manifest_entry = None
                    if isinstance(source_media_id, int):
                        media_manifest_entry = media_manifest_by_source_id.get(source_media_id)
                    if media_manifest_entry is None and isinstance(archive_path, str):
                        media_manifest_entry = media_manifest_by_path.get(archive_path)

                    restored_visibility = MediaVisibility.GLOBAL
                    if media_manifest_entry and isinstance(media_manifest_entry.get("visibility"), str):
                        try:
                            restored_visibility = MediaVisibility(media_manifest_entry["visibility"])
                        except ValueError:
                            restored_visibility = MediaVisibility.GLOBAL
                    restored_tags = (media_manifest_entry or {}).get("tags")
                    if not isinstance(restored_tags, list):
                        restored_tags = []

                    imported_media, _ = await media_service.save_file(
                        file=io.BytesIO(media_bytes),
                        filename=attachment.get("original_filename") or "imported-media.bin",
                        size=len(media_bytes),
                        uploaded_by=current_user.id,
                        title=(media_manifest_entry or {}).get("title") or item_data.title,
                        description=(media_manifest_entry or {}).get("description") or item_data.summary or item_data.content,
                        tags=restored_tags,
                        visibility=restored_visibility,
                        db=db,
                    )
                    mapped_media_id = imported_media.id
                    if isinstance(source_media_id, int):
                        imported_media_id_by_source_id[source_media_id] = mapped_media_id
                    if isinstance(archive_path, str):
                        imported_media_id_by_path[archive_path] = mapped_media_id
                elif isinstance(legacy_media_id, int):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Element {index + 1}: media #{legacy_media_id} introuvable dans le ZIP",
                    )

            if mapped_media_id is not None:
                attachment["media_id"] = mapped_media_id
                attachment["original_filename"] = attachment.get("original_filename") or "imported-media.bin"
                attachment["download_url"] = f"/api/media/{mapped_media_id}/download"
                attachment["preview_url"] = f"/api/media/{mapped_media_id}/preview"
                attachment["stream_url"] = f"/api/media/{mapped_media_id}/stream"
                attachment.pop("archive_media_path", None)
                attachment.pop("source_media_id", None)
                source_url = _media_source_url(item_data.kind, mapped_media_id)

        imported_items.append(
            InjectBankItem(
                owner_tenant_id=tenant_ctx.tenant.id,
                custom_id=item_data.custom_id,
                title=item_data.title,
                kind=item_data.kind,
                status=item_data.status,
                category=item_data.category,
                summary=item_data.summary,
                content=item_data.content,
                source_url=source_url,
                payload=payload_data,
                tags=item_data.tags,
                created_by=current_user.id,
            )
        )

    db.add_all(imported_items)
    await db.commit()

    return InjectBankImportResponse(imported=len(imported_items), skipped=skipped_count, total_in_zip=len(all_entries))


@router.post("", response_model=InjectBankResponse, status_code=201)
async def create_inject_bank_item(
    item_data: InjectBankCreate,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    current_user=Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new inject bank item (admin only).

    The payload is validated against the inject bank JSON Schema before persistence.
    """
    create_payload = _normalize_legacy_bank_entry(item_data.model_dump(mode="json"), for_update=False)
    _validate_bank_payload_or_400(create_payload)

    item = InjectBankItem(
        owner_tenant_id=tenant_ctx.tenant.id,
        title=item_data.title,
        kind=item_data.kind,
        status=item_data.status,
        category=item_data.category,
        data_format=item_data.data_format,
        summary=item_data.summary,
        content=item_data.content,
        source_url=item_data.source_url,
        payload=item_data.payload,
        tags=item_data.tags,
        created_by=current_user.id,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return InjectBankResponse.model_validate(item)


@router.get("/kinds")
async def get_inject_bank_kinds():
    """List all valid inject kind values (mail, sms, socialnet, tv, call, doc, system, etc.)."""
    return {"kinds": [kind.value for kind in InjectBankKind]}


@router.get("/statuses")
async def get_inject_bank_statuses():
    """List all valid inject status values (draft, ready, archived)."""
    return {"statuses": [status.value for status in InjectBankStatus]}


@router.get("/{item_id}", response_model=InjectBankResponse)
async def get_inject_bank_item(
    item_id: int,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """Retrieve a single inject bank item by its database ID."""
    result = await db.execute(
        select(InjectBankItem).where(
            InjectBankItem.id == item_id,
            InjectBankItem.owner_tenant_id == tenant_ctx.tenant.id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Inject bank item not found")
    return InjectBankResponse.model_validate(item)


@router.put("/{item_id}", response_model=InjectBankResponse)
async def update_inject_bank_item(
    item_id: int,
    item_data: InjectBankUpdate,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Partially update an inject bank item (admin only).

    Only the provided fields are modified. The merged result is validated against
    the inject bank JSON Schema before persistence.
    """
    result = await db.execute(
        select(InjectBankItem).where(
            InjectBankItem.id == item_id,
            InjectBankItem.owner_tenant_id == tenant_ctx.tenant.id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Inject bank item not found")

    merged_payload = _bank_item_to_schema_instance(item)
    update_payload_json = _normalize_legacy_bank_entry(
        item_data.model_dump(exclude_unset=True, mode="json"),
        for_update=True,
    )
    merged_payload.update(update_payload_json)
    _validate_bank_payload_or_400(merged_payload)

    for field, value in item_data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)

    await db.commit()
    await db.refresh(item)
    return InjectBankResponse.model_validate(item)


@router.delete("/{item_id}", status_code=204)
async def delete_inject_bank_item(
    item_id: int,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: any = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Permanently delete an inject bank item (admin only). Returns 204 on success."""
    result = await db.execute(
        select(InjectBankItem).where(
            InjectBankItem.id == item_id,
            InjectBankItem.owner_tenant_id == tenant_ctx.tenant.id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Inject bank item not found")

    await db.delete(item)
    await db.commit()
    return None
