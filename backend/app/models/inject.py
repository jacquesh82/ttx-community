"""Inject and Delivery models."""
import enum
from datetime import datetime
from sqlalchemy import DateTime, Enum, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

class AudienceKind(str, enum.Enum):
    """Audience kind for injects/events."""
    ROLE = "role"
    TEAM = "team"
    USER = "user"
    TAG = "tag"


class InjectType(str, enum.Enum):
    """Type of inject."""
    MAIL = "mail"
    TWITTER = "twitter"
    TV = "tv"
    DECISION = "decision"
    SCORE = "score"
    SYSTEM = "system"


# Accept extended inject-bank vocabulary and map it to runtime inject types.
INJECT_TYPE_ALIASES: dict[str, InjectType] = {
    InjectType.MAIL.value: InjectType.MAIL,
    InjectType.TWITTER.value: InjectType.TWITTER,
    InjectType.TV.value: InjectType.TV,
    InjectType.DECISION.value: InjectType.DECISION,
    InjectType.SCORE.value: InjectType.SCORE,
    InjectType.SYSTEM.value: InjectType.SYSTEM,
    "idea": InjectType.DECISION,
    "scenario": InjectType.DECISION,
    "chronogram": InjectType.SCORE,
    "video": InjectType.TV,
    "image": InjectType.TV,
    "message": InjectType.TWITTER,
    "social_post": InjectType.TWITTER,
    "directory": InjectType.SYSTEM,
    "reference_url": InjectType.SYSTEM,
    "document": InjectType.SYSTEM,
    "canal_press": InjectType.SYSTEM,
    "canal_anssi": InjectType.SYSTEM,
    "canal_gouvernement": InjectType.SYSTEM,
    "other": InjectType.SYSTEM,
}


def parse_inject_type(value: str | None, default: InjectType = InjectType.MAIL) -> InjectType:
    """Parse inject type with support for inject-bank aliases."""
    if value is None:
        return default
    normalized = str(value).strip().lower()
    if not normalized:
        return default
    mapped = INJECT_TYPE_ALIASES.get(normalized)
    if mapped is not None:
        return mapped
    return InjectType(normalized)


def accepted_inject_type_values() -> list[str]:
    """List accepted CSV/JSON type values including aliases."""
    return sorted(INJECT_TYPE_ALIASES.keys())


class InjectStatus(str, enum.Enum):
    """Status of an inject."""
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    SENT = "sent"
    CANCELLED = "cancelled"


class TimelineType(str, enum.Enum):
    """Type of timeline for injects."""
    BUSINESS = "business"
    TECHNICAL = "technical"


class InjectCategory(str, enum.Enum):
    """Category of inject content."""
    INFORMATION = "information"
    INCIDENT = "incident"
    DECISION = "decision"
    MEDIA = "media"
    TECHNICAL = "technical"
    LEGAL = "legal"
    CANAL_PRESS = "canal_press"
    CANAL_ANSSI = "canal_anssi"
    CANAL_GOUVERNEMENT = "canal_gouvernement"


class InjectChannel(str, enum.Enum):
    """Channel of diffusion for the inject."""
    MAIL = "mail"
    PHONE = "phone"
    PRESS = "press"
    SIEM = "siem"
    TV = "tv"
    SOCIAL_NETWORK = "social_network"
    OFFICIAL_MAIL = "official_mail"


class TargetAudience(str, enum.Enum):
    """Target audience for the inject."""
    DIRECTION = "direction"
    DSI = "dsi"
    COM = "com"
    LEGAL = "legal"
    CARE = "care"
    ALL = "all"


class TestedCompetence(str, enum.Enum):
    """Competence tested by the inject."""
    COORDINATION = "coordination"
    ARBITRATION = "arbitration"
    COMMUNICATION = "communication"
    TECHNICAL = "technical"
    GOVERNANCE = "governance"


class PressureLevel(str, enum.Enum):
    """Pressure level of the inject."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class InjectDataFormat(str, enum.Enum):
    """Format of the main inject payload."""
    TEXT = "text"
    AUDIO = "audio"
    VIDEO = "video"
    IMAGE = "image"


class DeliveryStatus(str, enum.Enum):
    """Status of a delivery."""
    PENDING = "pending"
    DELIVERED = "delivered"
    OPENED = "opened"
    ACKNOWLEDGED = "acknowledged"
    IN_PROGRESS = "in_progress"
    TREATED = "treated"
    REPLIED = "replied"


def _enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    """Persist enum values (lowercase labels) instead of enum member names."""
    return [member.value for member in enum_cls]


def _inject_enum(enum_cls: type[enum.Enum], name: str) -> Enum:
    """Create enum type that accepts both lowercase values and legacy uppercase labels."""
    enum_type = Enum(enum_cls, name=name, values_callable=_enum_values)
    for member in enum_cls:
        # Backward compatibility for rows persisted as enum member names.
        enum_type._object_lookup.setdefault(member.name, member)  # type: ignore[attr-defined]
    return enum_type


class Inject(Base):
    """Inject model for scheduled events during exercise."""
    
    __tablename__ = "injects"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    phase_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("exercise_phases.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Custom ID for display (ex: INJ-J1-005)
    custom_id: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    
    # Type and category
    type: Mapped[InjectType] = mapped_column(_inject_enum(InjectType, "inject_type"), nullable=False)
    timeline_type: Mapped[TimelineType] = mapped_column(
        _inject_enum(TimelineType, "timelinetype"),
        nullable=False,
        default=TimelineType.BUSINESS,
        server_default="business",
    )
    is_surprise: Mapped[bool] = mapped_column(nullable=False, default=False, server_default="false")
    inject_category: Mapped[InjectCategory | None] = mapped_column(
        _inject_enum(InjectCategory, "injectcategory"),
        nullable=True,
    )
    channel: Mapped[InjectChannel | None] = mapped_column(_inject_enum(InjectChannel, "injectchannel"), nullable=True)
    data_format: Mapped[str] = mapped_column(String(16), nullable=False, default="text", server_default="text")
    
    # Content
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)  # Type-specific payload
    
    # Timing
    time_offset: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Minutes from exercise start (T+0)
    duration_min: Mapped[int] = mapped_column(Integer, nullable=False, default=15)  # Duration in minutes, default 15min
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Status
    status: Mapped[InjectStatus] = mapped_column(
        _inject_enum(InjectStatus, "inject_status"),
        nullable=False,
        default=InjectStatus.DRAFT
    )
    
    # Targeting
    target_audience: Mapped[TargetAudience | None] = mapped_column(
        _inject_enum(TargetAudience, "targetaudience"),
        nullable=True,
    )
    
    # Pedagogical info
    pedagogical_objective: Mapped[str | None] = mapped_column(Text, nullable=True)
    tested_competence: Mapped[TestedCompetence | None] = mapped_column(
        _inject_enum(TestedCompetence, "testedcompetence"),
        nullable=True,
    )
    pressure_level: Mapped[PressureLevel | None] = mapped_column(
        _inject_enum(PressureLevel, "pressurelevel"),
        nullable=True,
    )
    
    # Dependencies (list of inject IDs that must be sent before this one)
    dependency_ids: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
    
    # Audit
    created_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )
    
    # Relationships
    exercise = relationship("Exercise", back_populates="injects")
    creator = relationship("User", back_populates="created_injects", foreign_keys=[created_by])
    deliveries = relationship("Delivery", back_populates="inject", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="inject")
    tv_segments = relationship("TVSegment", back_populates="inject")
    media_associations = relationship("InjectMedia", back_populates="inject", cascade="all, delete-orphan")
    phase = relationship("ExercisePhase", back_populates="injects")
    trigger_rule = relationship("InjectTriggerRule", back_populates="inject", cascade="all, delete-orphan", uselist=False)
    audiences = relationship("InjectAudience", back_populates="inject", cascade="all, delete-orphan")
    
    def __repr__(self) -> str:
        return f"<Inject(id={self.id}, type={self.type.value}, title='{self.title}')>"
    
    def calculate_scheduled_time(self, exercise_started_at: datetime, time_multiplier: float = 1.0) -> datetime | None:
        """Calculate absolute scheduled time from time_offset."""
        if self.time_offset is None:
            return self.scheduled_at
        from datetime import timedelta
        offset_seconds = self.time_offset * 60 * time_multiplier
        return exercise_started_at + timedelta(seconds=offset_seconds)


class InjectMedia(Base):
    """Association table for Inject-Media many-to-many relationship."""
    
    __tablename__ = "inject_media"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    inject_id: Mapped[int] = mapped_column(Integer, ForeignKey("injects.id", ondelete="CASCADE"), nullable=False, index=True)
    media_id: Mapped[int] = mapped_column(Integer, ForeignKey("media.id", ondelete="CASCADE"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    
    # Relationships
    inject = relationship("Inject", back_populates="media_associations")
    media = relationship("Media", back_populates="inject_associations")
    
    def __repr__(self) -> str:
        return f"<InjectMedia(inject_id={self.inject_id}, media_id={self.media_id}, position={self.position})>"


class Delivery(Base):
    """Delivery model for tracking inject delivery to targets."""
    
    __tablename__ = "deliveries"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    inject_id: Mapped[int] = mapped_column(Integer, ForeignKey("injects.id", ondelete="CASCADE"), nullable=False, index=True)
    target_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    target_team_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=True, index=True)
    status: Mapped[DeliveryStatus] = mapped_column(
        _inject_enum(DeliveryStatus, "delivery_status"),
        nullable=False,
        default=DeliveryStatus.PENDING
    )
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    treated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    treated_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    first_reply_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    
    # Relationships
    inject = relationship("Inject", back_populates="deliveries")
    target_user = relationship("User", foreign_keys=[target_user_id])
    target_team = relationship("Team", foreign_keys=[target_team_id])
    
    def __repr__(self) -> str:
        target = f"user_id={self.target_user_id}" if self.target_user_id else f"team_id={self.target_team_id}"
        return f"<Delivery(id={self.id}, inject_id={self.inject_id}, {target}, status={self.status.value})>"


class InjectAudience(Base):
    """Audience targeting for an inject."""

    __tablename__ = "inject_audiences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    inject_id: Mapped[int] = mapped_column(Integer, ForeignKey("injects.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[AudienceKind] = mapped_column(Enum(AudienceKind, name="audiencekind"), nullable=False)
    value: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    inject = relationship("Inject", back_populates="audiences")

    def __repr__(self) -> str:
        return f"<InjectAudience(inject_id={self.inject_id}, kind={self.kind.value}, value={self.value})>"
