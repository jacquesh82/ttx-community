"""Twitter/X simulation models."""
import enum
from datetime import datetime
from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, JSON, String, Text, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TwitterAccountType(str, enum.Enum):
    """Type of Twitter account."""
    JOURNALIST = "journalist"
    INFLUENCER = "influencer"
    OFFICIAL = "official"
    ANONYMOUS = "anonymous"
    TEAM_COMM = "team_comm"
    FAKE_NEWS = "fake_news"


class TwitterPostType(str, enum.Enum):
    """Type of Twitter post."""
    TWEET = "tweet"
    REPLY = "reply"
    QUOTE = "quote"
    RETWEET = "retweet"


class TwitterAccount(Base):
    """Twitter account for simulation."""
    
    __tablename__ = "twitter_accounts"
    __table_args__ = (
        UniqueConstraint('exercise_id', 'handle', name='uq_twitter_accounts_exercise_handle'),
    )
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    handle: Mapped[str] = mapped_column(String(50), nullable=False)  # @journaliste_lemonde
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    account_type: Mapped[TwitterAccountType] = mapped_column(Enum(TwitterAccountType), nullable=False)
    controlled_by_team_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True)
    controlled_by_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    extra_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # followers_count, bio, etc.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    
    # Relationships
    exercise = relationship("Exercise", back_populates="twitter_accounts")
    controlled_by_team = relationship("Team", back_populates="twitter_accounts")
    controlled_by_user = relationship("User", foreign_keys=[controlled_by_user_id])
    posts = relationship("TwitterPost", back_populates="account", cascade="all, delete-orphan")
    
    def __repr__(self) -> str:
        return f"<TwitterAccount(id={self.id}, handle='{self.handle}', type={self.account_type.value})>"


class TwitterPost(Base):
    """Twitter post for simulation."""
    
    __tablename__ = "twitter_posts"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id: Mapped[int] = mapped_column(Integer, ForeignKey("twitter_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    post_type: Mapped[TwitterPostType] = mapped_column(Enum(TwitterPostType), nullable=False, default=TwitterPostType.TWEET)
    parent_post_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("twitter_posts.id", ondelete="CASCADE"), nullable=True, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True
    )
    extra_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # likes, retweets, quotes count (simulated)
    
    # Relationships
    exercise = relationship("Exercise", back_populates="twitter_posts")
    account = relationship("TwitterAccount", back_populates="posts")
    parent = relationship("TwitterPost", remote_side=[id], backref="replies")
    media = relationship("TwitterPostMedia", back_populates="post", cascade="all, delete-orphan")
    
    def __repr__(self) -> str:
        return f"<TwitterPost(id={self.id}, account_id={self.account_id}, type={self.post_type.value})>"


class TwitterPostMedia(Base):
    """Media attachment for Twitter posts."""
    
    __tablename__ = "twitter_post_media"
    
    post_id: Mapped[int] = mapped_column(Integer, ForeignKey("twitter_posts.id", ondelete="CASCADE"), primary_key=True)
    media_id: Mapped[int] = mapped_column(Integer, ForeignKey("media.id", ondelete="CASCADE"), primary_key=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # Relationships
    post = relationship("TwitterPost", back_populates="media")
    media = relationship("Media", back_populates="twitter_post_media")
    
    def __repr__(self) -> str:
        return f"<TwitterPostMedia(post_id={self.post_id}, media_id={self.media_id})>"