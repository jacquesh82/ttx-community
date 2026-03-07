"""Exercise model."""
import enum
from datetime import datetime
from decimal import Decimal
from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ExerciseStatus(str, enum.Enum):
    """Exercise status."""
    DRAFT = "draft"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class Exercise(Base):
    """Exercise model for TTX scenarios."""
    
    __tablename__ = "exercises"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ExerciseStatus] = mapped_column(
        Enum(ExerciseStatus, name="exercise_status", values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=ExerciseStatus.DRAFT
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_multiplier: Mapped[Decimal] = mapped_column(Numeric(4, 2), default=Decimal("1.0"), nullable=False)
    exercise_type: Mapped[str] = mapped_column(String(50), nullable=False, default="cyber")
    target_duration_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    maturity_level: Mapped[str] = mapped_column(String(50), nullable=False, default="beginner")
    mode: Mapped[str] = mapped_column(String(50), nullable=False, default="real_time")
    planned_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    location: Mapped[str | None] = mapped_column(String(500), nullable=True)
    business_objective: Mapped[str | None] = mapped_column(Text, nullable=True)
    technical_objective: Mapped[str | None] = mapped_column(Text, nullable=True)
    lead_organizer_user_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
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
    creator = relationship("User", back_populates="created_exercises", foreign_keys=[created_by])
    lead_organizer = relationship("User", foreign_keys=[lead_organizer_user_id])
    teams = relationship("ExerciseTeam", back_populates="exercise", cascade="all, delete-orphan")
    user_roles = relationship("ExerciseUser", back_populates="exercise", cascade="all, delete-orphan")
    injects = relationship("Inject", back_populates="exercise", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="exercise", cascade="all, delete-orphan")
    twitter_accounts = relationship("TwitterAccount", back_populates="exercise", cascade="all, delete-orphan")
    twitter_posts = relationship("TwitterPost", back_populates="exercise", cascade="all, delete-orphan")
    tv_channels = relationship("TVChannel", back_populates="exercise", cascade="all, delete-orphan")
    media = relationship("Media", back_populates="exercise")
    events = relationship("Event", back_populates="exercise", cascade="all, delete-orphan")
    decisions = relationship("Decision", back_populates="exercise", cascade="all, delete-orphan")
    observer_notes = relationship("ObserverNote", back_populates="exercise", cascade="all, delete-orphan")
    scores = relationship("Score", back_populates="exercise", cascade="all, delete-orphan")
    crisis_contacts = relationship("CrisisContact", back_populates="exercise", cascade="all, delete-orphan")
    plugins = relationship("ExercisePlugin", back_populates="exercise", cascade="all, delete-orphan")
    scenario = relationship("ExerciseScenario", back_populates="exercise", cascade="all, delete-orphan", uselist=False)
    escalation_axes = relationship("ExerciseEscalationAxis", back_populates="exercise", cascade="all, delete-orphan")
    phases = relationship("ExercisePhase", back_populates="exercise", cascade="all, delete-orphan")
    inject_trigger_rules = relationship("InjectTriggerRule", back_populates="exercise", cascade="all, delete-orphan")
    metric_snapshots = relationship("ExerciseMetricSnapshot", back_populates="exercise", cascade="all, delete-orphan")
    retex_reports = relationship("RetexReport", back_populates="exercise", cascade="all, delete-orphan")
    participant_capabilities = relationship("ParticipantCapability", back_populates="exercise", cascade="all, delete-orphan")
    
    def __repr__(self) -> str:
        return f"<Exercise(id={self.id}, name='{self.name}', status={self.status.value})>"
    
    @property
    def is_active(self) -> bool:
        """Check if exercise is in active state."""
        return self.status == ExerciseStatus.RUNNING


class ExerciseTeam(Base):
    """Association table for Exercise-Team many-to-many relationship."""
    
    __tablename__ = "exercise_teams"
    
    exercise_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), primary_key=True)
    team_id: Mapped[int] = mapped_column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True)
    
    # Relationships
    exercise = relationship("Exercise", back_populates="teams")
    team = relationship("Team", back_populates="exercises")
    
    def __repr__(self) -> str:
        return f"<ExerciseTeam(exercise_id={self.exercise_id}, team_id={self.team_id})>"
