"""Welcome kit template model."""
import enum
from datetime import datetime
from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, Boolean, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class WelcomeKitKind(str, enum.Enum):
    """Welcome kit template kind."""
    PLAYER = "player"
    FACILITATOR = "facilitator"


class WelcomeKitTemplate(Base):
    """Template for generating welcome kit PDFs."""
    
    __tablename__ = "welcome_kit_templates"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[WelcomeKitKind] = mapped_column(Enum(WelcomeKitKind), nullable=False)
    template_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    variables: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    creator = relationship("User", foreign_keys=[created_by])
    
    def __repr__(self) -> str:
        return f"<WelcomeKitTemplate(id={self.id}, name='{self.name}', kind={self.kind.value})>"


class ExerciseUserCredential(Base):
    """Stores temporary passwords for welcome kit generation."""
    
    __tablename__ = "exercise_user_credentials"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    plain_password: Mapped[str] = mapped_column(String(100), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationships
    exercise = relationship("Exercise")
    user = relationship("User")
    
    def __repr__(self) -> str:
        return f"<ExerciseUserCredential(exercise_id={self.exercise_id}, user_id={self.user_id})>"