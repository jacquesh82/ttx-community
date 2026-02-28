"""Exercise-scoped user role model for RBAC."""
import enum
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, Enum, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ExerciseRole(str, enum.Enum):
    """User role within a specific exercise."""
    ANIMATEUR = "animateur"
    OBSERVATEUR = "observateur"
    JOUEUR = "joueur"


class ExerciseUser(Base):
    """Exercise-scoped role assignment for users.
    
    This allows a user to have different roles in different exercises.
    For example: ANIMATEUR in Exercise A, but JOUEUR in Exercise B.
    """
    
    __tablename__ = "exercise_users"
    __table_args__ = (
        UniqueConstraint('user_id', 'exercise_id', name='uq_user_exercise'),
    )
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    exercise_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[ExerciseRole] = mapped_column(Enum(ExerciseRole), nullable=False, default=ExerciseRole.JOUEUR)
    team_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True)
    organization: Mapped[str | None] = mapped_column(String(255), nullable=True)
    real_function: Mapped[str | None] = mapped_column(String(255), nullable=True)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    assigned_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="exercise_roles", foreign_keys=[user_id])
    exercise = relationship("Exercise", back_populates="user_roles")
    team = relationship("Team", back_populates="exercise_users")
    assigner = relationship("User", foreign_keys=[assigned_by])
    capability = relationship("ParticipantCapability", back_populates="exercise_user", cascade="all, delete-orphan", uselist=False)
    
    def __repr__(self) -> str:
        return f"<ExerciseUser(user_id={self.user_id}, exercise_id={self.exercise_id}, role={self.role.value})>"
