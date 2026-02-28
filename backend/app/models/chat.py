"""Chat models for exercise communication."""
from datetime import datetime, timezone
from enum import Enum
from typing import Optional, List, Dict
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Enum as SQLEnum,
    Index, UniqueConstraint
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB

from app.database import Base


class ChatRoomType(str, Enum):
    """Type of chat room."""
    PUBLIC = "public"      # Visible to all exercise participants
    TEAM = "team"          # Team-specific room
    INJECT = "inject"      # Room for specific inject discussion
    DIRECT = "direct"      # Direct message between users


class ChatRoom(Base):
    """Chat room for exercise communication."""
    __tablename__ = "chat_rooms"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    room_type: Mapped[ChatRoomType] = mapped_column(SQLEnum(ChatRoomType), nullable=False, default=ChatRoomType.PUBLIC)
    
    # For team rooms
    team_id: Mapped[Optional[int]] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"), nullable=True)
    
    # For inject-specific rooms
    inject_id: Mapped[Optional[int]] = mapped_column(ForeignKey("injects.id", ondelete="CASCADE"), nullable=True)
    
    # For direct messages (user IDs stored as JSON array)
    participant_ids: Mapped[Optional[List[int]]] = mapped_column(JSONB, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    # Relationships
    exercise = relationship("Exercise", backref="chat_rooms")
    team = relationship("Team", backref="chat_rooms")
    messages = relationship("ChatMessage", back_populates="room", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index("ix_chat_rooms_exercise_id", "exercise_id"),
        Index("ix_chat_rooms_team_id", "team_id"),
    )


class ChatMessage(Base):
    """Message in a chat room."""
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("chat_rooms.id", ondelete="CASCADE"), nullable=False)
    
    # Author info
    author_type: Mapped[str] = mapped_column(String(20), nullable=False)  # 'user', 'actor', 'system'
    author_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    author_label: Mapped[str] = mapped_column(String(100), nullable=False)
    
    # Message content
    content: Mapped[str] = mapped_column(Text, nullable=False)
    
    # For replies
    parent_message_id: Mapped[Optional[int]] = mapped_column(ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True)
    
    # Pinning and reactions
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pinned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    pinned_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    # Reactions as JSON: {'👍': [user_id1, user_id2], '❤️': [user_id3]}
    reactions: Mapped[Dict] = mapped_column(JSONB, default=dict, nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    room = relationship("ChatRoom", back_populates="messages")
    author = relationship("User", foreign_keys=[author_id])
    
    __table_args__ = (
        Index("ix_chat_messages_room_id", "room_id"),
        Index("ix_chat_messages_created_at", "created_at"),
    )


class ChatReadReceipt(Base):
    """Track read receipts for users in rooms."""
    __tablename__ = "chat_read_receipts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("chat_rooms.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    last_read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    last_read_message_id: Mapped[Optional[int]] = mapped_column(ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True)
    
    __table_args__ = (
        UniqueConstraint("room_id", "user_id", name="uq_chat_read_receipts_room_user"),
        Index("ix_chat_read_receipts_room_user", "room_id", "user_id"),
    )