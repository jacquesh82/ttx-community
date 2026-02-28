"""Media library model."""
import enum
from datetime import datetime
from sqlalchemy import ARRAY, BigInteger, Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class MediaVisibility(str, enum.Enum):
    """Visibility level for media."""
    PRIVATE = "private"      # Only uploader
    TEAM = "team"            # Team members
    EXERCISE = "exercise"    # Exercise participants
    GLOBAL = "global"        # All users


class MediaStatus(str, enum.Enum):
    """Status of media processing."""
    UPLOADING = "uploading"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class StorageProvider(str, enum.Enum):
    """Storage provider for media files."""
    LOCAL = "local"
    S3 = "s3"


class Media(Base):
    """Media file in the library."""
    
    __tablename__ = "media"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True
    )
    exercise_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("exercises.id", ondelete="SET NULL"), nullable=True, index=True)
    owner_team_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)  # Storage filename (UUID-based)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)  # Original uploaded name
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    size: Mapped[int] = mapped_column(Integer, nullable=False)  # Size in bytes
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)  # Hash for deduplication
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)  # Path or S3 key
    storage_provider: Mapped[StorageProvider] = mapped_column(
        Enum(StorageProvider),
        nullable=False,
        default=StorageProvider.LOCAL
    )
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list | None] = mapped_column(ARRAY(String), nullable=True)
    visibility: Mapped[MediaVisibility] = mapped_column(
        Enum(MediaVisibility),
        nullable=False,
        default=MediaVisibility.EXERCISE
    )
    status: Mapped[MediaStatus] = mapped_column(
        Enum(MediaStatus),
        nullable=False,
        default=MediaStatus.READY
    )
    uploaded_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=False, index=True)
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
    exercise = relationship("Exercise", back_populates="media")
    owner_team = relationship("Team", foreign_keys=[owner_team_id])
    uploader = relationship("User", back_populates="uploaded_media")
    renditions = relationship("MediaRendition", back_populates="asset", cascade="all, delete-orphan")
    message_attachments = relationship("MessageAttachment", back_populates="media", cascade="all, delete-orphan")
    twitter_post_media = relationship("TwitterPostMedia", back_populates="media", cascade="all, delete-orphan")
    tv_segment_media = relationship("TVSegmentMedia", back_populates="media", cascade="all, delete-orphan")
    inject_associations = relationship("InjectMedia", back_populates="media", cascade="all, delete-orphan")
    
    def __repr__(self) -> str:
        return f"<Media(id={self.id}, filename='{self.original_filename}', mime='{self.mime_type}')>"
    
    @property
    def is_image(self) -> bool:
        """Check if media is an image."""
        return self.mime_type.startswith("image/")
    
    @property
    def is_video(self) -> bool:
        """Check if media is a video."""
        return self.mime_type.startswith("video/")
    
    @property
    def is_audio(self) -> bool:
        """Check if media is an audio file."""
        return self.mime_type.startswith("audio/")
    
    @property
    def is_pdf(self) -> bool:
        """Check if media is a PDF."""
        return self.mime_type == "application/pdf"


class MediaRendition(Base):
    """Media rendition for transcoding variants."""
    
    __tablename__ = "media_renditions"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asset_id: Mapped[int] = mapped_column(Integer, ForeignKey("media.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(50), nullable=False)  # 'mp4_720p', 'thumb', 'waveform', etc.
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # width, height, duration, etc.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    
    # Relationships
    asset = relationship("Media", back_populates="renditions")
    
    def __repr__(self) -> str:
        return f"<MediaRendition(id={self.id}, asset_id={self.asset_id}, kind='{self.kind}')>"
