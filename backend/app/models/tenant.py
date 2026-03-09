"""Tenant models for multi-tenant support."""
from datetime import datetime
import enum

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    Index,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TenantStatus(str, enum.Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    ARCHIVED = "archived"


class TenantDomainType(str, enum.Enum):
    SUBDOMAIN = "subdomain"
    CUSTOM = "custom"


class WsAuthTicketScope(str, enum.Enum):
    EXERCISE_UPDATES = "exercise_updates"
    SIMULATED_CHANNELS = "simulated_channels"
    DEBUG_EVENTS = "debug_events"


class InjectBankVisibilityScope(str, enum.Enum):
    PRIVATE = "private"
    TENANT = "tenant"
    SHARED = "shared"


class InjectBankItemSourceType(str, enum.Enum):
    TENANT = "tenant"
    PLATFORM = "platform"


class SessionScope(str, enum.Enum):
    TENANT = "tenant"
    PLATFORM = "platform"


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(63), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[TenantStatus] = mapped_column(Enum(TenantStatus), nullable=False, default=TenantStatus.ACTIVE)
    primary_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class TenantDomain(Base):
    __tablename__ = "tenant_domains"
    __table_args__ = (UniqueConstraint("domain", name="uq_tenant_domains_domain"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    domain: Mapped[str] = mapped_column(String(255), nullable=False)
    domain_type: Mapped[TenantDomainType] = mapped_column(
        Enum(TenantDomainType), nullable=False, default=TenantDomainType.SUBDOMAIN
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class TenantConfiguration(Base):
    """Tenant-scoped configuration."""

    __tablename__ = "tenant_configurations"
    __table_args__ = (UniqueConstraint("tenant_id", name="uq_tenant_configurations_tenant_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)

    organization_name: Mapped[str] = mapped_column(String(200), nullable=False, default="Organisation")
    organization_logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    organization_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    organization_reference_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    organization_keywords: Mapped[str | None] = mapped_column(Text, nullable=True)
    organization_tech_stack: Mapped[str | None] = mapped_column(Text, nullable=True)
    organization_sector: Mapped[str | None] = mapped_column(String(100), nullable=True)
    bia_processes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Technical context — used by AI inject generation for realism
    windows_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    public_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mail_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    internal_ip_ranges: Mapped[str | None] = mapped_column(Text, nullable=True)
    dmz_ip_ranges: Mapped[str | None] = mapped_column(Text, nullable=True)
    domain_controllers: Mapped[str | None] = mapped_column(Text, nullable=True)
    server_naming_examples: Mapped[str | None] = mapped_column(Text, nullable=True)
    technological_dependencies: Mapped[str | None] = mapped_column(Text, nullable=True)
    cloud_providers: Mapped[str | None] = mapped_column(Text, nullable=True)
    critical_applications: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Transitional overlay for legacy app_config fields not yet normalized in tenant_configurations.
    legacy_app_config_overrides: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class WsAuthTicket(Base):
    __tablename__ = "ws_auth_tickets"
    __table_args__ = (
        Index("ix_ws_auth_tickets_tenant_scope_expires", "tenant_id", "scope", "expires_at"),
        Index("ix_ws_auth_tickets_user_expires", "user_id", "expires_at"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    session_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=True, index=True)
    scope: Mapped[WsAuthTicketScope] = mapped_column(Enum(WsAuthTicketScope), nullable=False)
    exercise_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class TenantPluginConfiguration(Base):
    __tablename__ = "tenant_plugin_configurations"
    __table_args__ = (
        UniqueConstraint("tenant_id", "plugin_type", name="uq_tenant_plugin_config_tenant_plugin"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    plugin_type: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    color: Mapped[str | None] = mapped_column(String(30), nullable=True)
    default_enabled: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    coming_soon: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    sort_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class InjectBankShareGrant(Base):
    __tablename__ = "inject_bank_share_grants"
    __table_args__ = (
        Index("ix_inject_bank_share_grants_target_status", "target_tenant_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    item_id: Mapped[int] = mapped_column(Integer, ForeignKey("inject_bank_items.id", ondelete="CASCADE"), nullable=False, index=True)
    source_tenant_id: Mapped[int] = mapped_column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    target_tenant_id: Mapped[int] = mapped_column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    access_mode: Mapped[str] = mapped_column(String(30), nullable=False, default="copy")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active", index=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
