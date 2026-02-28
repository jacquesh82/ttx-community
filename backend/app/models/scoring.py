"""Scoring and observation models."""
from datetime import datetime
from decimal import Decimal
from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Decision(Base):
    """Decision log entry for teams/users during exercise."""
    
    __tablename__ = "decisions"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    team_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    impact: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    
    # Relationships
    exercise = relationship("Exercise", back_populates="decisions")
    team = relationship("Team", back_populates="decisions")
    user = relationship("User", foreign_keys=[user_id])
    
    def __repr__(self) -> str:
        return f"<Decision(id={self.id}, title='{self.title[:50]}...')>"


class ObserverNote(Base):
    """Observer note during exercise."""
    
    __tablename__ = "observer_notes"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    observer_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    target_team_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True)
    target_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)  # 'communication', 'decision', 'crisis_mgmt', etc.
    importance: Mapped[int] = mapped_column(Integer, default=3, nullable=False)  # 1-5
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    
    # Relationships
    exercise = relationship("Exercise", back_populates="observer_notes")
    observer = relationship("User", back_populates="observer_notes", foreign_keys=[observer_id])
    target_team = relationship("Team", foreign_keys=[target_team_id])
    target_user = relationship("User", foreign_keys=[target_user_id])
    
    def __repr__(self) -> str:
        return f"<ObserverNote(id={self.id}, observer_id={self.observer_id}, category={self.category})>"


class Score(Base):
    """Score entry for teams/users during exercise."""
    
    __tablename__ = "scores"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    team_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)  # 0-100
    max_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("100.00"), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    scored_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=False)
    scored_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    
    # Relationships
    exercise = relationship("Exercise", back_populates="scores")
    team = relationship("Team", back_populates="scores")
    user = relationship("User", foreign_keys=[user_id])
    scorer = relationship("User", back_populates="scores_given", foreign_keys=[scored_by])
    
    def __repr__(self) -> str:
        return f"<Score(id={self.id}, category='{self.category}', score={self.score})>"