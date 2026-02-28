"""Extended crisis management models for TTX product workflows."""
import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, JSON, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ExerciseType(str, enum.Enum):
    CYBER = "cyber"
    IT_OUTAGE = "it_outage"
    RANSOMWARE = "ransomware"
    MIXED = "mixed"


class ExerciseMaturityLevel(str, enum.Enum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    EXPERT = "expert"


class ExerciseMode(str, enum.Enum):
    REAL_TIME = "real_time"
    COMPRESSED = "compressed"
    SIMULATED = "simulated"


class EscalationAxisType(str, enum.Enum):
    TECHNICAL = "technical"
    COMMUNICATION = "communication"
    LEGAL = "legal"
    POLITICAL = "political"
    MEDIA = "media"


class TriggerMode(str, enum.Enum):
    AUTO = "auto"
    MANUAL = "manual"
    CONDITIONAL = "conditional"


class InjectVisibilityScope(str, enum.Enum):
    TEAM_ONLY = "team_only"
    USER_ONLY = "user_only"
    ALL = "all"


class ExerciseScenario(Base):
    __tablename__ = "exercise_scenarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("exercises.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        unique=True,
    )
    strategic_intent: Mapped[str | None] = mapped_column(Text, nullable=True)
    initial_context: Mapped[str | None] = mapped_column(Text, nullable=True)
    initial_situation: Mapped[str | None] = mapped_column(Text, nullable=True)
    implicit_hypotheses: Mapped[str | None] = mapped_column(Text, nullable=True)
    hidden_brief: Mapped[str | None] = mapped_column(Text, nullable=True)
    pedagogical_objectives: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
    evaluation_criteria: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
    stress_factors: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    exercise = relationship("Exercise", back_populates="scenario")


class ExerciseEscalationAxis(Base):
    __tablename__ = "exercise_escalation_axes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    axis_type: Mapped[EscalationAxisType] = mapped_column(Enum(EscalationAxisType), nullable=False)
    intensity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    exercise = relationship("Exercise", back_populates="escalation_axes")


class ExercisePhase(Base):
    __tablename__ = "exercise_phases"
    __table_args__ = (
        UniqueConstraint("exercise_id", "phase_order", name="uq_exercise_phase_order"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    phase_order: Mapped[int] = mapped_column(Integer, nullable=False)
    start_offset_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_offset_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    exercise = relationship("Exercise", back_populates="phases")
    injects = relationship("Inject", back_populates="phase")


class InjectTriggerRule(Base):
    __tablename__ = "inject_trigger_rules"
    __table_args__ = (
        UniqueConstraint("inject_id", name="uq_inject_trigger_rule"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    inject_id: Mapped[int] = mapped_column(Integer, ForeignKey("injects.id", ondelete="CASCADE"), nullable=False, index=True)
    trigger_mode: Mapped[TriggerMode] = mapped_column(Enum(TriggerMode), nullable=False, default=TriggerMode.AUTO)
    expression: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    exercise = relationship("Exercise", back_populates="inject_trigger_rules")
    inject = relationship("Inject", back_populates="trigger_rule")


class ExerciseMetricSnapshot(Base):
    __tablename__ = "exercise_metric_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    stress: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    saturation: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    communication_external: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    technical_mastery: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    exercise = relationship("Exercise", back_populates="metric_snapshots")


class RetexReport(Base):
    __tablename__ = "retex_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    generated_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    kpis: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    report_metadata: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    exercise = relationship("Exercise", back_populates="retex_reports")
    creator = relationship("User")


class ParticipantCapability(Base):
    __tablename__ = "participant_capabilities"
    __table_args__ = (
        UniqueConstraint("exercise_user_id", name="uq_participant_capability_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    exercise_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercise_users.id", ondelete="CASCADE"), nullable=False, index=True)
    can_social: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    can_tv: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    can_mail: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    visibility_scope: Mapped[InjectVisibilityScope] = mapped_column(Enum(InjectVisibilityScope), nullable=False, default=InjectVisibilityScope.TEAM_ONLY)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    exercise = relationship("Exercise", back_populates="participant_capabilities")
    exercise_user = relationship("ExerciseUser", back_populates="capability")
