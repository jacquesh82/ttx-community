"""Inject bank models for reusable exercise building blocks."""
import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.tenant import InjectBankItemSourceType, InjectBankVisibilityScope


class InjectBankKind(str, enum.Enum):
    """Type of reusable inject brick — canonical values from JSON schema."""
    MAIL = "mail"
    SMS = "sms"
    CALL = "call"
    SOCIALNET = "socialnet"
    TV = "tv"
    DOC = "doc"
    DIRECTORY = "directory"
    STORY = "story"


class InjectBankStatus(str, enum.Enum):
    """Lifecycle status for inject bank item."""
    DRAFT = "draft"
    READY = "ready"
    ARCHIVED = "archived"


class InjectBankItem(Base):
    """Reusable content block used later to assemble exercises."""

    __tablename__ = "inject_bank_items"
    __table_args__ = ()

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_tenant_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True
    )
    custom_id: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    kind: Mapped[InjectBankKind] = mapped_column(
        Enum(
            InjectBankKind,
            name="injectbankkind",
            values_callable=lambda enum_class: [member.value for member in enum_class],
        ),
        nullable=False,
        index=True,
    )
    status: Mapped[InjectBankStatus] = mapped_column(
        Enum(
            InjectBankStatus,
            name="injectbankstatus",
            values_callable=lambda enum_class: [member.value for member in enum_class],
        ),
        nullable=False,
        default=InjectBankStatus.DRAFT,
        index=True,
    )
    category: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    data_format: Mapped[str] = mapped_column(String(16), nullable=False, default="text", server_default="text")

    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Flexible structured payload (e.g. mail headers, scenario steps, metadata)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    visibility_scope: Mapped[InjectBankVisibilityScope] = mapped_column(
        Enum(InjectBankVisibilityScope),
        nullable=False,
        default=InjectBankVisibilityScope.PRIVATE,
        index=True,
    )
    shareable: Mapped[bool] = mapped_column(nullable=False, default=False, server_default="false")
    source_type: Mapped[InjectBankItemSourceType] = mapped_column(
        Enum(InjectBankItemSourceType),
        nullable=False,
        default=InjectBankItemSourceType.TENANT,
        index=True,
    )
    created_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<InjectBankItem(id={self.id}, kind={self.kind.value}, title='{self.title}')>"
