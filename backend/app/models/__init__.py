"""SQLAlchemy models for TTX Platform."""
from app.models.tenant import (
    Tenant,
    TenantStatus,
    TenantDomain,
    TenantDomainType,
    TenantConfiguration,
    WsAuthTicket,
    WsAuthTicketScope,
    SessionScope,
    InjectBankVisibilityScope,
    InjectBankItemSourceType,
    InjectBankShareGrant,
    TenantPluginConfiguration,
)
from app.models.user import User, UserRole
from app.models.team import Team, UserTeam
from app.models.session import Session
from app.models.exercise import Exercise, ExerciseTeam, ExerciseStatus
from app.models.exercise_user import ExerciseUser, ExerciseRole
from app.models.inject import (
    Inject, InjectType, InjectStatus, Delivery, DeliveryStatus, InjectMedia,
    InjectCategory, InjectChannel, TargetAudience, TestedCompetence, PressureLevel,
    AudienceKind, InjectAudience
)
from app.models.webmail import Conversation, ConversationParticipant, Message, ReadReceipt, MessageAttachment
from app.models.twitter import TwitterAccount, TwitterAccountType, TwitterPost, TwitterPostType, TwitterPostMedia
from app.models.tv import (
    TVChannel, TVSegment, TVSegmentType, TVSegmentMedia, TVSegmentStatus,
    TVLiveState, TVLiveStatus, TVPlaylistItem, PlaylistItemStatus
)
from app.models.media import Media, MediaVisibility, MediaStatus, StorageProvider, MediaRendition
from app.models.scoring import Decision, ObserverNote, Score
from app.models.event import Event, EventType, EventActorType, EventAudience
from app.models.audit import AuditLog
from app.models.crisis_contact import CrisisContact, ContactCategory, ContactPriority
from app.models.plugin import ExercisePlugin, PluginConfiguration, plugin_type_enum
from app.models.chat import ChatRoom, ChatRoomType, ChatMessage, ChatReadReceipt
from app.models.inject_bank import InjectBankItem, InjectBankKind, InjectBankStatus
from app.models.crisis_management import (
    ExerciseType,
    ExerciseMaturityLevel,
    ExerciseMode,
    EscalationAxisType,
    TriggerMode,
    InjectVisibilityScope,
    ExerciseScenario,
    ExerciseEscalationAxis,
    ExercisePhase,
    InjectTriggerRule,
    ExerciseMetricSnapshot,
    RetexReport,
    ParticipantCapability,
)
from app.models.welcome_kit import WelcomeKitTemplate, WelcomeKitKind, ExerciseUserCredential
from app.models.app_configuration import AppConfiguration, DEFAULT_APP_CONFIG
from app.models.api_key import ApiKey

__all__ = [
    # Tenant / Multi-tenant
    "Tenant", "TenantStatus", "TenantDomain", "TenantDomainType",
    "TenantConfiguration",
    "WsAuthTicket", "WsAuthTicketScope", "SessionScope",
    "InjectBankVisibilityScope", "InjectBankItemSourceType",
    "InjectBankShareGrant",
    "TenantPluginConfiguration",
    # User & Auth
    "User", "UserRole", "Session",
    # Team
    "Team", "UserTeam",
    # Exercise
    "Exercise", "ExerciseTeam", "ExerciseStatus", "ExerciseUser", "ExerciseRole",
    # Inject
    "Inject", "InjectType", "InjectStatus", "Delivery", "DeliveryStatus", "InjectMedia",
    "InjectCategory", "InjectChannel", "TargetAudience", "TestedCompetence", "PressureLevel",
    "AudienceKind", "InjectAudience",
    # Webmail
    "Conversation", "ConversationParticipant", "Message", "ReadReceipt", "MessageAttachment",
    # Twitter
    "TwitterAccount", "TwitterAccountType", "TwitterPost", "TwitterPostType", "TwitterPostMedia",
    # TV
    "TVChannel", "TVSegment", "TVSegmentType", "TVSegmentMedia", "TVSegmentStatus",
    "TVLiveState", "TVLiveStatus", "TVPlaylistItem", "PlaylistItemStatus",
    # Media
    "Media", "MediaVisibility", "MediaStatus", "StorageProvider", "MediaRendition",
    # Scoring
    "Decision", "ObserverNote", "Score",
    # Events
    "Event", "EventType", "EventActorType", "EventAudience",
    # Audit
    "AuditLog",
    # Crisis Contact
    "CrisisContact", "ContactCategory", "ContactPriority",
    # Plugins
    "ExercisePlugin", "PluginConfiguration", "plugin_type_enum",
    # Chat
    "ChatRoom", "ChatRoomType", "ChatMessage", "ChatReadReceipt",
    # Inject Bank
    "InjectBankItem", "InjectBankKind", "InjectBankStatus",
    # Crisis management
    "ExerciseType", "ExerciseMaturityLevel", "ExerciseMode", "EscalationAxisType",
    "TriggerMode", "InjectVisibilityScope",
    "ExerciseScenario", "ExerciseEscalationAxis", "ExercisePhase", "InjectTriggerRule",
    "ExerciseMetricSnapshot", "RetexReport", "ParticipantCapability",
    # Welcome Kit
    "WelcomeKitTemplate", "WelcomeKitKind", "ExerciseUserCredential",
    # App Configuration
    "AppConfiguration", "DEFAULT_APP_CONFIG",
    # API Keys
    "ApiKey",
]
