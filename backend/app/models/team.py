"""Team and UserTeam models."""
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Team(Base):
    """Team model for grouping users."""
    
    __tablename__ = "teams"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#3b82f6")
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
    members = relationship("UserTeam", back_populates="team", cascade="all, delete-orphan")
    exercises = relationship("ExerciseTeam", back_populates="team", cascade="all, delete-orphan")
    exercise_users = relationship("ExerciseUser", back_populates="team")
    decisions = relationship("Decision", back_populates="team")
    scores = relationship("Score", back_populates="team")
    twitter_accounts = relationship("TwitterAccount", back_populates="controlled_by_team")
    
    def __repr__(self) -> str:
        return f"<Team(id={self.id}, name='{self.name}')>"


class UserTeam(Base):
    """Association table for User-Team many-to-many relationship."""
    
    __tablename__ = "user_teams"
    
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    team_id: Mapped[int] = mapped_column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True)
    is_leader: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    
    # Relationships
    user = relationship("User", back_populates="teams")
    team = relationship("Team", back_populates="members")
    
    def __repr__(self) -> str:
        return f"<UserTeam(user_id={self.user_id}, team_id={self.team_id}, is_leader={self.is_leader})>"
