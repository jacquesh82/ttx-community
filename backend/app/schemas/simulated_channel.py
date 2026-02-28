"""
Pydantic schemas for simulated communication channels.
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


# ============== MAIL ==============

class SimulatedMailBase(BaseModel):
    subject: str
    body: Optional[str] = None


class SimulatedMailCreate(SimulatedMailBase):
    to_contact_id: int
    parent_mail_id: Optional[int] = None


class SimulatedMailFromInject(BaseModel):
    """Schema for creating mail from an inject event."""
    from_name: str
    from_email: Optional[str] = None
    to_name: str
    to_email: Optional[str] = None
    subject: str
    body: Optional[str] = None
    to_contact_id: Optional[int] = None
    from_contact_id: Optional[int] = None


class SimulatedMailResponse(SimulatedMailBase):
    id: int
    exercise_id: int
    from_contact_id: Optional[int] = None
    to_contact_id: Optional[int] = None
    from_name: str
    from_email: Optional[str] = None
    to_name: str
    to_email: Optional[str] = None
    attachments: Optional[List[Dict[str, Any]]] = None
    is_from_player: bool
    is_inject: bool
    is_read: bool
    is_starred: bool
    parent_mail_id: Optional[int] = None
    sent_at: datetime
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SimulatedMailListResponse(BaseModel):
    mails: List[SimulatedMailResponse]
    total: int
    unread_count: int


# ============== CHAT ==============

class SimulatedChatRoomBase(BaseModel):
    name: str
    room_type: str = "team"
    description: Optional[str] = None


class SimulatedChatRoomCreate(SimulatedChatRoomBase):
    participant_ids: List[int] = []


class SimulatedChatRoomResponse(SimulatedChatRoomBase):
    id: int
    exercise_id: int
    participant_ids: List[int]
    is_active: bool
    created_at: datetime
    unread_count: int = 0
    last_message_at: Optional[datetime] = None
    last_message_preview: Optional[str] = None

    class Config:
        from_attributes = True


class SimulatedChatMessageCreate(BaseModel):
    content: str
    message_type: str = "text"


class SimulatedChatMessageResponse(BaseModel):
    id: int
    room_id: int
    exercise_id: int
    sender_contact_id: Optional[int] = None
    sender_name: str
    sender_type: str
    content: str
    message_type: str
    is_from_player: bool
    is_pinned: bool
    reactions: Dict[str, List[int]]
    sent_at: datetime
    edited_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SimulatedChatRoomDetailResponse(SimulatedChatRoomResponse):
    messages: List[SimulatedChatMessageResponse] = []


# ============== SMS ==============

class SimulatedSmsBase(BaseModel):
    content: str


class SimulatedSmsCreate(SimulatedSmsBase):
    to_contact_id: int


class SimulatedSmsFromInject(BaseModel):
    """Schema for creating SMS from an inject event."""
    from_name: str
    from_phone: Optional[str] = None
    to_name: str
    to_phone: Optional[str] = None
    content: str
    to_contact_id: Optional[int] = None
    from_contact_id: Optional[int] = None


class SimulatedSmsResponse(SimulatedSmsBase):
    id: int
    exercise_id: int
    from_contact_id: Optional[int] = None
    to_contact_id: Optional[int] = None
    from_name: str
    from_phone: Optional[str] = None
    to_name: str
    to_phone: Optional[str] = None
    is_from_player: bool
    is_inject: bool
    is_read: bool
    sent_at: datetime
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SimulatedSmsConversationResponse(BaseModel):
    """Grouped SMS conversation with a contact."""
    contact_id: Optional[int]
    contact_name: str
    contact_phone: Optional[str]
    messages: List[SimulatedSmsResponse]
    unread_count: int


# ============== CALL ==============

class CallStatusEnum(str, Enum):
    RINGING = "ringing"
    ANSWERED = "answered"
    MISSED = "missed"
    ENDED = "ended"
    REJECTED = "rejected"


class SimulatedCallFromInject(BaseModel):
    """Schema for creating a call from an inject event."""
    caller_name: str
    caller_phone: Optional[str] = None
    callee_name: str
    callee_phone: Optional[str] = None
    call_type: str = "incoming"
    caller_contact_id: Optional[int] = None
    callee_contact_id: Optional[int] = None
    voicemail_transcript: Optional[str] = None


class SimulatedCallAction(BaseModel):
    """Schema for call actions (answer, reject, end)."""
    action: str  # answer, reject, end


class SimulatedCallResponse(BaseModel):
    id: int
    exercise_id: int
    caller_contact_id: Optional[int] = None
    callee_contact_id: Optional[int] = None
    caller_name: str
    caller_phone: Optional[str] = None
    callee_name: str
    callee_phone: Optional[str] = None
    call_type: str
    status: CallStatusEnum
    is_from_player: bool
    is_inject: bool
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    voicemail_transcript: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ============== SOCIAL ==============

class SimulatedSocialPostFromInject(BaseModel):
    """Schema for creating a social post from an inject event."""
    author_name: str
    author_handle: str
    author_avatar: Optional[str] = None
    is_verified: bool = False
    content: str
    media_urls: List[str] = []
    likes_count: int = 0
    retweets_count: int = 0
    replies_count: int = 0
    views_count: int = 0
    is_breaking: bool = False


class SimulatedSocialPostReaction(BaseModel):
    """Schema for player reactions."""
    reaction_type: str  # like, retweet


class SimulatedSocialPostResponse(BaseModel):
    id: int
    exercise_id: int
    author_name: str
    author_handle: str
    author_avatar: Optional[str] = None
    is_verified: bool
    content: str
    media_urls: List[str]
    likes_count: int
    retweets_count: int
    replies_count: int
    views_count: int
    player_liked: bool
    player_retweeted: bool
    is_inject: bool
    is_breaking: bool
    posted_at: datetime
    seen_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SimulatedSocialFeedResponse(BaseModel):
    posts: List[SimulatedSocialPostResponse]
    total: int
    unseen_count: int


# ============== PRESS ==============

class SimulatedPressArticleFromInject(BaseModel):
    """Schema for creating a press article from an inject event."""
    source: str
    source_logo: Optional[str] = None
    title: str
    content: Optional[str] = None
    summary: Optional[str] = None
    image_url: Optional[str] = None
    article_url: Optional[str] = None
    category: Optional[str] = None
    is_breaking_news: bool = False


class SimulatedPressArticleResponse(BaseModel):
    id: int
    exercise_id: int
    source: str
    source_logo: Optional[str] = None
    title: str
    content: Optional[str] = None
    summary: Optional[str] = None
    image_url: Optional[str] = None
    article_url: Optional[str] = None
    category: Optional[str] = None
    is_inject: bool
    is_breaking_news: bool
    is_read: bool
    published_at: datetime
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SimulatedPressFeedResponse(BaseModel):
    articles: List[SimulatedPressArticleResponse]
    total: int
    unread_count: int


# ============== TV ==============

class SimulatedTvEventFromInject(BaseModel):
    """Schema for creating a TV event from an inject event."""
    channel: str
    channel_logo: Optional[str] = None
    title: str
    description: Optional[str] = None
    video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    event_type: str = "news"
    is_live: bool = False
    is_breaking: bool = False
    duration_seconds: Optional[int] = None


class SimulatedTvEventResponse(BaseModel):
    id: int
    exercise_id: int
    channel: str
    channel_logo: Optional[str] = None
    title: str
    description: Optional[str] = None
    video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    event_type: str
    is_inject: bool
    is_live: bool
    is_breaking: bool
    is_seen: bool
    broadcast_at: datetime
    seen_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SimulatedTvFeedResponse(BaseModel):
    events: List[SimulatedTvEventResponse]
    total: int
    unseen_count: int
    current_live: Optional[SimulatedTvEventResponse] = None


# ============== WEBSOCKET EVENTS ==============

class WebSocketEvent(BaseModel):
    """Generic WebSocket event for real-time updates."""
    event_type: str  # mail, chat, sms, call, social, press, tv
    action: str  # new, update, delete
    data: Dict[str, Any]
    timestamp: datetime
    exercise_id: int