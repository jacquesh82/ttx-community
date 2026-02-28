"""Schemas for Player API."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
from enum import Enum

from app.models.inject import DeliveryStatus
from app.models.event import EventType, EventActorType


class PlayerTeamInfo(BaseModel):
    """Team info for player context."""
    id: int
    name: str
    code: str


class PlayerExerciseInfo(BaseModel):
    """Exercise info for player context."""
    id: int
    name: str
    status: str
    started_at: Optional[datetime]
    time_multiplier: str


class PlayerContext(BaseModel):
    """Full player context."""
    exercise: PlayerExerciseInfo
    team: Optional[PlayerTeamInfo]
    role: str
    exercise_time: Optional[str]  # T+HH:MM format
    stats: "PlayerStats"


class PlayerStats(BaseModel):
    """Statistics for player dashboard."""
    injects_pending: int
    injects_in_progress: int
    injects_treated: int
    messages_unread: int
    decisions_count: int


class PlayerInject(BaseModel):
    """Inject visible to player."""
    id: int
    type: str
    title: str
    description: Optional[str]
    status: str
    delivery_id: Optional[int]
    delivery_status: Optional[DeliveryStatus]
    scheduled_at: Optional[datetime]
    sent_at: Optional[datetime]
    delivered_at: Optional[datetime]
    opened_at: Optional[datetime]
    acknowledged_at: Optional[datetime]
    treated_at: Optional[datetime]
    is_public: bool
    target_type: str  # 'team', 'user', 'public'
    criticity: str  # 'info', 'important', 'critical'
    created_at: datetime


class PlayerEvent(BaseModel):
    """Event visible to player in timeline."""
    id: int
    type: EventType
    entity_type: Optional[str]
    entity_id: Optional[int]
    actor_type: EventActorType
    actor_label: Optional[str]
    payload: Optional[dict]
    ts: datetime
    exercise_time: Optional[datetime]
    # Enriched fields for display
    title: str
    description: Optional[str]
    icon: str  # emoji or icon name
    visibility: str  # 'public', 'team', 'personal'
    channel: str  # 'inject', 'mail', 'tv', 'social', 'decision'
    criticity: str
    is_read: bool
    actions: List[str]  # available actions: ['open', 'reply', 'create_decision', 'mark_treated']


class UpdateDeliveryRequest(BaseModel):
    """Request to update delivery status."""
    status: Optional[DeliveryStatus] = None
    acknowledge: Optional[bool] = None
    treat: Optional[bool] = None


class DeliveryResponse(BaseModel):
    """Response after updating delivery."""
    id: int
    status: DeliveryStatus
    acknowledged_at: Optional[datetime]
    treated_at: Optional[datetime]
    treated_by: Optional[int]


class ChatRoom(BaseModel):
    """Chat room for player."""
    id: int
    name: str
    room_type: str  # 'public', 'team', 'inject'
    unread_count: int
    last_message_at: Optional[datetime]
    last_message_preview: Optional[str]


class ChatMessage(BaseModel):
    """Chat message."""
    id: int
    room_id: int
    author_type: str  # 'user', 'actor', 'system'
    author_id: Optional[int]
    author_label: str
    content: str
    created_at: datetime
    is_pinned: bool
    reactions: dict  # {'👍': [user_ids]}


class SendChatMessageRequest(BaseModel):
    """Request to send a chat message."""
    content: str
    parent_message_id: Optional[int] = None


class CreateDecisionRequest(BaseModel):
    """Request to create a decision."""
    title: str
    description: Optional[str] = None
    impact: Optional[str] = None
    source_event_id: Optional[int] = None
    source_inject_id: Optional[int] = None


class DecisionResponse(BaseModel):
    """Response for a decision."""
    id: int
    exercise_id: int
    team_id: Optional[int]
    user_id: Optional[int]
    title: str
    description: Optional[str]
    impact: Optional[str]
    decided_at: datetime
    created_at: datetime
    source_event_id: Optional[int] = None
    source_inject_id: Optional[int] = None


class Notification(BaseModel):
    """Notification for player."""
    id: str
    type: str  # 'inject.received', 'tv.segment', 'mail.received', 'chat.message', 'social.mention'
    title: str
    message: str
    entity_type: Optional[str]
    entity_id: Optional[int]
    criticity: str
    created_at: datetime
    is_read: bool


class NotificationListResponse(BaseModel):
    """List of notifications."""
    notifications: List[Notification]
    unread_count: int


class TimelineFilters(BaseModel):
    """Filters for timeline."""
    channel: Optional[str] = None  # 'all', 'inject', 'mail', 'tv', 'social', 'decision'
    scope: Optional[str] = None  # 'all', 'team', 'public', 'me'
    criticity: Optional[str] = None  # 'all', 'info', 'important', 'critical'
    unread_only: Optional[bool] = False


# Update forward references
PlayerContext.model_rebuild()