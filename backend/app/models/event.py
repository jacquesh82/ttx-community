"""Event model for unified timeline."""
import enum
from datetime import datetime
from sqlalchemy import DateTime, Enum, ForeignKey, Integer, JSON, String, func, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.inject import AudienceKind


class EventType(str, enum.Enum):
    """Type of event in the timeline."""
    # Exercise events
    EXERCISE_CREATED = "exercise_created"
    EXERCISE_STARTED = "exercise_started"
    EXERCISE_PAUSED = "exercise_paused"
    EXERCISE_ENDED = "exercise_ended"
    
    # Inject events
    INJECT_CREATED = "inject_created"
    INJECT_SCHEDULED = "inject_scheduled"
    INJECT_SENT = "inject_sent"
    INJECT_CANCELLED = "inject_cancelled"
    
    # Mail events
    MAIL_DELIVERED = "mail_delivered"
    MAIL_OPENED = "mail_opened"
    MAIL_REPLIED = "mail_replied"
    
    # Twitter events
    TWITTER_POSTED = "twitter_posted"
    TWITTER_REPLY = "twitter_reply"
    TWITTER_VIRAL = "twitter_viral"
    
    # TV events
    TV_SEGMENT_STARTED = "tv_segment_started"
    TV_SEGMENT_ENDED = "tv_segment_ended"
    TV_BANNER_CHANGED = "tv_banner_changed"
    
    # Scoring events
    DECISION_LOGGED = "decision_logged"
    SCORE_ADDED = "score_added"
    NOTE_ADDED = "note_added"
    
    # Media events
    MEDIA_UPLOADED = "media_uploaded"
    
    # User events
    USER_JOINED = "user_joined"
    USER_REACTION = "user_reaction"


class EventActorType(str, enum.Enum):
    """Type of actor that triggered the event."""
    USER = "user"
    ACTOR = "actor"  # Simulated character
    SYSTEM = "system"
    AUTOMATION = "automation"


class Event(Base):
    """Event model for unified timeline."""
    
    __tablename__ = "events"
    __table_args__ = (
        Index('ix_events_exercise_ts', 'exercise_id', 'ts'),
        Index('ix_events_entity', 'entity_type', 'entity_id'),
    )
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    type: Mapped[EventType] = mapped_column(Enum(EventType), nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # 'inject', 'message', 'post', 'segment', etc.
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    actor_type: Mapped[EventActorType] = mapped_column(
        Enum(EventActorType),
        nullable=False,
        default=EventActorType.SYSTEM
    )
    actor_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ts: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True
    )
    exercise_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # Time in exercise clock
    
    # Relationships
    exercise = relationship("Exercise", back_populates="events")
    actor = relationship("User", foreign_keys=[actor_id])
    audiences = relationship("EventAudience", back_populates="event", cascade="all, delete-orphan")
    
    def __repr__(self) -> str:
        return f"<Event(id={self.id}, type={self.type.value}, exercise_id={self.exercise_id})>"


class EventAudience(Base):
    """Audience targeting for a timeline event."""

    __tablename__ = "event_audiences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[AudienceKind] = mapped_column(Enum(AudienceKind, name="audiencekind"), nullable=False)
    value: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    event = relationship("Event", back_populates="audiences")

    def __repr__(self) -> str:
        return f"<EventAudience(event_id={self.event_id}, kind={self.kind.value}, value={self.value})>"
