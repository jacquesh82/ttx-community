"""User model."""
import enum
from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, enum.Enum):
    """User roles for RBAC."""
    ADMIN = "admin"
    ANIMATEUR = "animateur"
    OBSERVATEUR = "observateur"
    PARTICIPANT = "participant"


class User(Base):
    """User model for authentication and authorization."""
    
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),
        UniqueConstraint("tenant_id", "username", name="uq_users_tenant_username"),
    )
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role", values_callable=lambda x: [e.value for e in x]), nullable=False, default=UserRole.PARTICIPANT)
    is_platform_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    team_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True)
    display_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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
    teams = relationship("UserTeam", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    exercise_roles = relationship("ExerciseUser", back_populates="user", foreign_keys="ExerciseUser.user_id", cascade="all, delete-orphan")
    created_exercises = relationship("Exercise", back_populates="creator", foreign_keys="Exercise.created_by")
    created_injects = relationship("Inject", back_populates="creator", foreign_keys="Inject.created_by")
    messages = relationship("Message", back_populates="author")
    observer_notes = relationship("ObserverNote", back_populates="observer", foreign_keys="ObserverNote.observer_id")
    scores_given = relationship("Score", back_populates="scorer", foreign_keys="Score.scored_by")
    uploaded_media = relationship("Media", back_populates="uploader")
    audit_logs = relationship("AuditLog", back_populates="user")
    
    team = relationship("Team")

    def __repr__(self) -> str:
        return f"<User(id={self.id}, username='{self.username}', role={self.role.value})>"
    
    @property
    def is_locked(self) -> bool:
        """Check if user account is locked."""
        if self.locked_until is None:
            return False
        now = datetime.now(timezone.utc)
        locked_until = self.locked_until
        # Handle both naive and aware datetimes
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        return now < locked_until
    
    @property
    def is_admin(self) -> bool:
        """Check if user has admin role."""
        return self.role == UserRole.ADMIN
    
    @property
    def is_animateur(self) -> bool:
        """Check if user has animateur role or higher."""
        return self.role in (UserRole.ADMIN, UserRole.ANIMATEUR)
    
    @property
    def is_observateur(self) -> bool:
        """Check if user has observateur role or higher."""
        return self.role in (UserRole.ADMIN, UserRole.ANIMATEUR, UserRole.OBSERVATEUR)
