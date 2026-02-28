"""TV simulation models."""
import enum
from datetime import datetime
from sqlalchemy import BigInteger, Boolean, DateTime, Enum, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TVSegmentType(str, enum.Enum):
    """Type of TV segment."""
    BREAKING = "breaking"
    NEWS = "news"
    INTERVIEW = "interview"
    REPORT = "report"
    TICKER = "ticker"
    COMMERCIAL = "commercial"


class TVSegmentStatus(str, enum.Enum):
    """Status of TV segment."""
    PREPARED = "prepared"
    LIVE = "live"
    ENDED = "ended"


class TVLiveStatus(str, enum.Enum):
    """Status of TV live stream."""
    IDLE = "idle"
    PLAYING = "playing"
    PAUSED = "paused"
    ENDED = "ended"


class PlaylistItemStatus(str, enum.Enum):
    """Status of playlist item."""
    QUEUED = "queued"
    ON_AIR = "on_air"
    DONE = "done"
    SKIPPED = "skipped"


class TVChannel(Base):
    """TV channel for simulation."""
    
    __tablename__ = "tv_channels"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    style_preset: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # colors, fonts, branding
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    
    # Relationships
    exercise = relationship("Exercise", back_populates="tv_channels")
    segments = relationship("TVSegment", back_populates="channel", cascade="all, delete-orphan")
    
    def __repr__(self) -> str:
        return f"<TVChannel(id={self.id}, name='{self.name}')>"


class TVSegment(Base):
    """TV segment for simulation."""
    
    __tablename__ = "tv_segments"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    channel_id: Mapped[int] = mapped_column(Integer, ForeignKey("tv_channels.id", ondelete="CASCADE"), nullable=False, index=True)
    segment_type: Mapped[TVSegmentType] = mapped_column(Enum(TVSegmentType), nullable=False)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    banner_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    ticker_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    script: Mapped[str | None] = mapped_column(Text, nullable=True)  # Script for presenter
    inject_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("injects.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[TVSegmentStatus] = mapped_column(
        Enum(TVSegmentStatus),
        nullable=False,
        default=TVSegmentStatus.PREPARED
    )
    scheduled_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scheduled_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    
    # Relationships
    channel = relationship("TVChannel", back_populates="segments")
    inject = relationship("Inject", back_populates="tv_segments")
    media = relationship("TVSegmentMedia", back_populates="segment", cascade="all, delete-orphan")
    creator = relationship("User", foreign_keys=[created_by])
    
    def __repr__(self) -> str:
        return f"<TVSegment(id={self.id}, title='{self.title}', status={self.status.value})>"


class TVSegmentMedia(Base):
    """Media attachment for TV segments."""
    
    __tablename__ = "tv_segment_media"
    
    segment_id: Mapped[int] = mapped_column(Integer, ForeignKey("tv_segments.id", ondelete="CASCADE"), primary_key=True)
    media_id: Mapped[int] = mapped_column(Integer, ForeignKey("media.id", ondelete="CASCADE"), primary_key=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    media_type: Mapped[str | None] = mapped_column(String(20), nullable=True)  # 'background', 'overlay', 'video'
    
    # Relationships
    segment = relationship("TVSegment", back_populates="media")
    media = relationship("Media", back_populates="tv_segment_media")
    
    def __repr__(self) -> str:
        return f"<TVSegmentMedia(segment_id={self.segment_id}, media_id={self.media_id})>"


class TVLiveState(Base):
    """Live state for a TV channel (one row per channel)."""
    
    __tablename__ = "tv_live_state"
    
    channel_id: Mapped[int] = mapped_column(Integer, ForeignKey("tv_channels.id", ondelete="CASCADE"), primary_key=True)
    status: Mapped[TVLiveStatus] = mapped_column(
        Enum(TVLiveStatus),
        nullable=False,
        default=TVLiveStatus.IDLE
    )
    on_air_type: Mapped[str | None] = mapped_column(String(20), nullable=True)  # 'segment' or 'video'
    on_air_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # segment_id or playlist_item_id
    on_air_media_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("media.id", ondelete="SET NULL"), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )
    banner_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    ticker_items: Mapped[list] = mapped_column(JSON, nullable=False, default=list)  # [{"text": "...", "priority": "high"}]
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)  # Optimistic locking
    
    # Relationships
    channel = relationship("TVChannel")
    on_air_media = relationship("Media")
    
    def __repr__(self) -> str:
        return f"<TVLiveState(channel_id={self.channel_id}, status={self.status.value})>"


class TVPlaylistItem(Base):
    """Playlist item for TV channel."""
    
    __tablename__ = "tv_playlist_items"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    channel_id: Mapped[int] = mapped_column(Integer, ForeignKey("tv_channels.id", ondelete="CASCADE"), nullable=False, index=True)
    exercise_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    item_type: Mapped[str] = mapped_column(String(30), nullable=False)  # 'segment', 'video_inject', 'flash'
    ref_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # segment_id or inject_id
    media_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("media.id", ondelete="SET NULL"), nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    planned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[PlaylistItemStatus] = mapped_column(
        Enum(PlaylistItemStatus),
        nullable=False,
        default=PlaylistItemStatus.QUEUED
    )
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    banner_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    ticker_items: Mapped[list | None] = mapped_column(JSON, nullable=True)
    play_mode: Mapped[str | None] = mapped_column(String(20), nullable=True, default="once")  # 'once' or 'loop'
    takeover: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # Interrupt current content
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
    channel = relationship("TVChannel")
    exercise = relationship("Exercise")
    media = relationship("Media")
    
    def __repr__(self) -> str:
        return f"<TVPlaylistItem(id={self.id}, type='{self.item_type}', status={self.status.value})>"
