"""
Models for simulated communication channels (mail, chat, sms, phone, social, press, tv)
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Enum, JSON
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class SimulatedMail(Base):
    """Simulated email messages between players and crisis contacts."""
    __tablename__ = "simulated_mails"

    id = Column(Integer, primary_key=True, index=True)
    exercise_id = Column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Sender/Recipient (references crisis_contacts)
    from_contact_id = Column(Integer, ForeignKey("crisis_contacts.id", ondelete="SET NULL"), nullable=True)
    to_contact_id = Column(Integer, ForeignKey("crisis_contacts.id", ondelete="SET NULL"), nullable=True)
    
    # Sender info (for display, if contact deleted)
    from_name = Column(String(255), nullable=False)
    from_email = Column(String(255), nullable=True)
    to_name = Column(String(255), nullable=False)
    to_email = Column(String(255), nullable=True)
    
    # Message content
    subject = Column(String(500), nullable=False)
    body = Column(Text, nullable=True)
    attachments = Column(JSON, nullable=True)  # List of attachment metadata
    
    # Flags
    is_from_player = Column(Boolean, default=False)  # True if sent by a player
    is_inject = Column(Boolean, default=False)  # True if from exercise inject
    is_read = Column(Boolean, default=False)
    is_starred = Column(Boolean, default=False)
    
    # Threading
    parent_mail_id = Column(Integer, ForeignKey("simulated_mails.id", ondelete="SET NULL"), nullable=True)
    
    # Timestamps
    sent_at = Column(DateTime, default=datetime.utcnow)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    exercise = relationship("Exercise", backref="simulated_mails")
    from_contact = relationship("CrisisContact", foreign_keys=[from_contact_id])
    to_contact = relationship("CrisisContact", foreign_keys=[to_contact_id])


class SimulatedChatRoom(Base):
    """Chat rooms for team communication."""
    __tablename__ = "simulated_chat_rooms"

    id = Column(Integer, primary_key=True, index=True)
    exercise_id = Column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    
    name = Column(String(255), nullable=False)
    room_type = Column(String(50), default="team")  # team, direct, broadcast
    description = Column(Text, nullable=True)
    
    # Participants (JSON list of contact IDs or player IDs)
    participant_ids = Column(JSON, default=list)
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    exercise = relationship("Exercise", backref="simulated_chat_rooms")
    messages = relationship("SimulatedChatMessage", back_populates="room", cascade="all, delete-orphan")


class SimulatedChatMessage(Base):
    """Messages in chat rooms."""
    __tablename__ = "simulated_chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("simulated_chat_rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    exercise_id = Column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    
    sender_contact_id = Column(Integer, ForeignKey("crisis_contacts.id", ondelete="SET NULL"), nullable=True)
    sender_name = Column(String(255), nullable=False)
    sender_type = Column(String(50), default="player")  # player, system, contact
    
    content = Column(Text, nullable=False)
    message_type = Column(String(50), default="text")  # text, image, file, system
    
    is_from_player = Column(Boolean, default=False)
    is_pinned = Column(Boolean, default=False)
    reactions = Column(JSON, default=dict)  # {"👍": [contact_id1, contact_id2]}
    
    sent_at = Column(DateTime, default=datetime.utcnow)
    edited_at = Column(DateTime, nullable=True)
    
    # Relationships
    room = relationship("SimulatedChatRoom", back_populates="messages")
    exercise = relationship("Exercise", backref="simulated_chat_messages")
    sender_contact = relationship("CrisisContact")


class SimulatedSms(Base):
    """Simulated SMS messages."""
    __tablename__ = "simulated_sms"

    id = Column(Integer, primary_key=True, index=True)
    exercise_id = Column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    
    from_contact_id = Column(Integer, ForeignKey("crisis_contacts.id", ondelete="SET NULL"), nullable=True)
    to_contact_id = Column(Integer, ForeignKey("crisis_contacts.id", ondelete="SET NULL"), nullable=True)
    
    from_name = Column(String(255), nullable=False)
    from_phone = Column(String(50), nullable=True)
    to_name = Column(String(255), nullable=False)
    to_phone = Column(String(50), nullable=True)
    
    content = Column(Text, nullable=False)
    
    is_from_player = Column(Boolean, default=False)
    is_inject = Column(Boolean, default=False)
    is_read = Column(Boolean, default=False)
    
    sent_at = Column(DateTime, default=datetime.utcnow)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    exercise = relationship("Exercise", backref="simulated_sms")
    from_contact = relationship("CrisisContact", foreign_keys=[from_contact_id])
    to_contact = relationship("CrisisContact", foreign_keys=[to_contact_id])


class CallStatus(str, enum.Enum):
    RINGING = "ringing"
    ANSWERED = "answered"
    MISSED = "missed"
    ENDED = "ended"
    REJECTED = "rejected"


class SimulatedCall(Base):
    """Simulated phone calls."""
    __tablename__ = "simulated_calls"

    id = Column(Integer, primary_key=True, index=True)
    exercise_id = Column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    
    caller_contact_id = Column(Integer, ForeignKey("crisis_contacts.id", ondelete="SET NULL"), nullable=True)
    callee_contact_id = Column(Integer, ForeignKey("crisis_contacts.id", ondelete="SET NULL"), nullable=True)
    
    caller_name = Column(String(255), nullable=False)
    caller_phone = Column(String(50), nullable=True)
    callee_name = Column(String(255), nullable=False)
    callee_phone = Column(String(50), nullable=True)
    
    call_type = Column(String(50), default="incoming")  # incoming, outgoing
    status = Column(Enum(CallStatus), default=CallStatus.RINGING)
    
    is_from_player = Column(Boolean, default=False)
    is_inject = Column(Boolean, default=False)
    
    # Call details
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    
    # Voicemail if missed
    voicemail_transcript = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    exercise = relationship("Exercise", backref="simulated_calls")
    caller_contact = relationship("CrisisContact", foreign_keys=[caller_contact_id])
    callee_contact = relationship("CrisisContact", foreign_keys=[callee_contact_id])


class SimulatedSocialPost(Base):
    """Simulated social media posts (X/Twitter style)."""
    __tablename__ = "simulated_social_posts"

    id = Column(Integer, primary_key=True, index=True)
    exercise_id = Column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Author info
    author_name = Column(String(255), nullable=False)
    author_handle = Column(String(100), nullable=False)
    author_avatar = Column(String(500), nullable=True)
    is_verified = Column(Boolean, default=False)
    
    # Post content
    content = Column(Text, nullable=False)
    media_urls = Column(JSON, default=list)  # List of image/video URLs
    
    # Engagement counts (can be updated)
    likes_count = Column(Integer, default=0)
    retweets_count = Column(Integer, default=0)
    replies_count = Column(Integer, default=0)
    views_count = Column(Integer, default=0)
    
    # Player interactions
    player_liked = Column(Boolean, default=False)
    player_retweeted = Column(Boolean, default=False)
    
    # Flags
    is_inject = Column(Boolean, default=False)
    is_breaking = Column(Boolean, default=False)
    
    posted_at = Column(DateTime, default=datetime.utcnow)
    seen_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    exercise = relationship("Exercise", backref="simulated_social_posts")


class SimulatedPressArticle(Base):
    """Simulated press articles."""
    __tablename__ = "simulated_press_articles"

    id = Column(Integer, primary_key=True, index=True)
    exercise_id = Column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    
    source = Column(String(255), nullable=False)  # e.g., "Le Monde", "AFP"
    source_logo = Column(String(500), nullable=True)
    
    title = Column(String(500), nullable=False)
    content = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    
    image_url = Column(String(500), nullable=True)
    article_url = Column(String(500), nullable=True)
    
    category = Column(String(100), nullable=True)  # e.g., "Politique", "Économie"
    
    is_inject = Column(Boolean, default=False)
    is_breaking_news = Column(Boolean, default=False)
    is_read = Column(Boolean, default=False)
    
    published_at = Column(DateTime, default=datetime.utcnow)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    exercise = relationship("Exercise", backref="simulated_press_articles")


class SimulatedTvEvent(Base):
    """Simulated TV broadcast events."""
    __tablename__ = "simulated_tv_events"

    id = Column(Integer, primary_key=True, index=True)
    exercise_id = Column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    
    channel = Column(String(100), nullable=False)  # e.g., "TF1", "France 24"
    channel_logo = Column(String(500), nullable=True)
    
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    
    video_url = Column(String(500), nullable=True)  # Placeholder or real URL
    thumbnail_url = Column(String(500), nullable=True)
    
    event_type = Column(String(50), default="news")  # news, breaking, interview, reportage
    
    is_inject = Column(Boolean, default=False)
    is_live = Column(Boolean, default=False)
    is_breaking = Column(Boolean, default=False)
    is_seen = Column(Boolean, default=False)
    
    broadcast_at = Column(DateTime, default=datetime.utcnow)
    seen_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    exercise = relationship("Exercise", backref="simulated_tv_events")