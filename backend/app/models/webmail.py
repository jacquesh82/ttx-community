"""Webmail models: Conversation, Message, ReadReceipt, etc."""
import enum
from datetime import datetime
from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AuthorType(str, enum.Enum):
    """Type of message author."""
    USER = "user"
    ACTOR = "actor"  # Simulated character
    SYSTEM = "system"


class Conversation(Base):
    """Conversation model for email threads."""
    
    __tablename__ = "conversations"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    inject_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("injects.id", ondelete="SET NULL"), nullable=True)
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
    exercise = relationship("Exercise", back_populates="conversations")
    inject = relationship("Inject", back_populates="conversations")
    participants = relationship("ConversationParticipant", back_populates="conversation", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at")
    
    def __repr__(self) -> str:
        return f"<Conversation(id={self.id}, subject='{self.subject[:50]}...')>"


class ConversationParticipant(Base):
    """Participant in a conversation (user, actor, or team)."""
    
    __tablename__ = "conversation_participants"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    participant_type: Mapped[str] = mapped_column(String(10), nullable=False)  # 'user', 'actor', 'team'
    participant_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # user_id or actor_id
    participant_label: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Display name
    role: Mapped[str] = mapped_column(String(20), default="to", nullable=False)  # 'to', 'cc', 'bcc', 'from'
    
    # Relationships
    conversation = relationship("Conversation", back_populates="participants")
    
    def __repr__(self) -> str:
        return f"<ConversationParticipant(conversation_id={self.conversation_id}, type={self.participant_type}, role={self.role})>"


class Message(Base):
    """Message model for emails within conversations."""
    
    __tablename__ = "messages"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_message_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    author_type: Mapped[AuthorType] = mapped_column(Enum(AuthorType), nullable=False, default=AuthorType.USER)
    author_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    author_label: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Display name
    subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    body_text: Mapped[str] = mapped_column(Text, nullable=False)
    body_html: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True
    )
    
    # Relationships
    conversation = relationship("Conversation", back_populates="messages")
    parent = relationship("Message", remote_side=[id], backref="replies")
    author = relationship("User", back_populates="messages")
    attachments = relationship("MessageAttachment", back_populates="message", cascade="all, delete-orphan")
    read_receipts = relationship("ReadReceipt", back_populates="message", cascade="all, delete-orphan")
    
    def __repr__(self) -> str:
        return f"<Message(id={self.id}, conversation_id={self.conversation_id}, author_type={self.author_type.value})>"


class ReadReceipt(Base):
    """Read receipt for messages."""
    
    __tablename__ = "read_receipts"
    
    message_id: Mapped[int] = mapped_column(Integer, ForeignKey("messages.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    read_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    
    # Relationships
    message = relationship("Message", back_populates="read_receipts")
    
    def __repr__(self) -> str:
        return f"<ReadReceipt(message_id={self.message_id}, user_id={self.user_id})>"


class MessageAttachment(Base):
    """Attachment link between messages and media."""
    
    __tablename__ = "message_attachments"
    
    message_id: Mapped[int] = mapped_column(Integer, ForeignKey("messages.id", ondelete="CASCADE"), primary_key=True)
    media_id: Mapped[int] = mapped_column(Integer, ForeignKey("media.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    
    # Relationships
    message = relationship("Message", back_populates="attachments")
    media = relationship("Media", back_populates="message_attachments")
    
    def __repr__(self) -> str:
        return f"<MessageAttachment(message_id={self.message_id}, media_id={self.media_id})>"