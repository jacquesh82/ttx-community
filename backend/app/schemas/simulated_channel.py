"""
Pydantic schemas for simulated communication channels.

Chaque canal (mail, SMS, appel, réseau social, presse, TV) dispose de schemas
pour la création depuis un inject, la réponse API et les feeds paginés.
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


# ============== MAIL ==============

class SimulatedMailBase(BaseModel):
    """Champs communs pour un e-mail simulé."""
    subject: str = Field(..., description="Objet du mail", examples=["URGENT — Rapport SOC : chiffrement de fichiers en cours"])
    body: Optional[str] = Field(None, description="Corps du mail (HTML ou texte)")


class SimulatedMailCreate(SimulatedMailBase):
    """Envoi d'un mail par un joueur."""
    to_contact_id: int = Field(..., description="ID du contact destinataire")
    parent_mail_id: Optional[int] = Field(None, description="ID du mail parent (réponse)")

    model_config = {
        "json_schema_extra": {
            "example": {
                "subject": "RE: Rapport SOC — Chiffrement de fichiers en cours",
                "body": "Bien reçu. J'ai lancé l'isolation du segment réseau concerné. Les serveurs FS-PAR-01 et FS-PAR-02 sont en cours de déconnexion.",
                "to_contact_id": 3,
                "parent_mail_id": 1,
            }
        }
    }


class SimulatedMailFromInject(BaseModel):
    """Création d'un mail depuis un inject (animateur → joueur)."""
    from_name: str = Field(..., examples=["SOC Duval Industries"])
    from_email: Optional[str] = Field(None, examples=["soc@duval-industries.fr"])
    to_name: str = Field(..., examples=["RSSI"])
    to_email: Optional[str] = Field(None, examples=["rssi@duval-industries.fr"])
    subject: str = Field(..., examples=["URGENT — Rapport SOC : chiffrement de fichiers en cours"])
    body: Optional[str] = Field(None, examples=["Bonjour,\n\nLe SOC a détecté une activité de chiffrement anormale sur les serveurs FS-PAR-01, FS-PAR-02 et FS-LYO-01.\n\nActions recommandées :\n1. Isoler immédiatement les serveurs concernés\n2. Activer le plan de réponse à incident\n3. Prévenir le RSSI et le DSI\n\nCordialement,\nSOC Duval Industries"])
    to_contact_id: Optional[int] = None
    from_contact_id: Optional[int] = None


class SimulatedMailResponse(SimulatedMailBase):
    """Réponse complète d'un mail simulé."""
    id: int = Field(..., examples=[1])
    exercise_id: int = Field(..., examples=[1])
    from_contact_id: Optional[int] = None
    to_contact_id: Optional[int] = None
    from_name: str = Field(..., examples=["SOC Duval Industries"])
    from_email: Optional[str] = Field(None, examples=["soc@duval-industries.fr"])
    to_name: str = Field(..., examples=["RSSI"])
    to_email: Optional[str] = Field(None, examples=["rssi@duval-industries.fr"])
    attachments: Optional[List[Dict[str, Any]]] = None
    is_from_player: bool = Field(..., examples=[False])
    is_inject: bool = Field(..., examples=[True])
    is_read: bool = Field(..., examples=[False])
    is_starred: bool = Field(..., examples=[False])
    parent_mail_id: Optional[int] = None
    sent_at: datetime
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SimulatedMailListResponse(BaseModel):
    """Liste de mails avec compteur de non-lus."""
    mails: List[SimulatedMailResponse]
    total: int = Field(..., examples=[12])
    unread_count: int = Field(..., examples=[3])


# ============== CHAT ==============

class SimulatedChatRoomBase(BaseModel):
    """Champs communs pour un salon de discussion."""
    name: str = Field(..., description="Nom du salon", examples=["Cellule de crise"])
    room_type: str = Field("team", description="Type : team, public, inject", examples=["team"])
    description: Optional[str] = Field(None, examples=["Canal de communication de la cellule de crise"])


class SimulatedChatRoomCreate(SimulatedChatRoomBase):
    """Création d'un salon de discussion."""
    participant_ids: List[int] = Field(default=[], description="IDs des participants")

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "Cellule de crise",
                "room_type": "team",
                "description": "Canal de communication de la cellule de crise",
                "participant_ids": [1, 4, 6],
            }
        }
    }


class SimulatedChatRoomResponse(SimulatedChatRoomBase):
    """Réponse complète d'un salon de discussion."""
    id: int = Field(..., examples=[1])
    exercise_id: int = Field(..., examples=[1])
    participant_ids: List[int]
    is_active: bool = Field(..., examples=[True])
    created_at: datetime
    unread_count: int = Field(0, examples=[5])
    last_message_at: Optional[datetime] = None
    last_message_preview: Optional[str] = Field(None, examples=["Avez-vous isolé le réseau OT ?"])

    class Config:
        from_attributes = True


class SimulatedChatMessageCreate(BaseModel):
    """Envoi d'un message dans un salon."""
    content: str = Field(..., description="Contenu du message", examples=["Il faut isoler le réseau OT immédiatement."])
    message_type: str = Field("text", description="Type : text, system", examples=["text"])


class SimulatedChatMessageResponse(BaseModel):
    """Réponse complète d'un message de chat."""
    id: int = Field(..., examples=[1])
    room_id: int = Field(..., examples=[1])
    exercise_id: int = Field(..., examples=[1])
    sender_contact_id: Optional[int] = None
    sender_name: str = Field(..., examples=["Directeur de crise"])
    sender_type: str = Field(..., examples=["user"])
    content: str = Field(..., examples=["Il faut isoler le réseau OT immédiatement."])
    message_type: str = Field(..., examples=["text"])
    is_from_player: bool = Field(..., examples=[True])
    is_pinned: bool = Field(..., examples=[False])
    reactions: Dict[str, List[int]] = Field(..., examples=[{"👍": [1, 3]}])
    sent_at: datetime
    edited_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SimulatedChatRoomDetailResponse(SimulatedChatRoomResponse):
    """Salon avec la liste de ses messages."""
    messages: List[SimulatedChatMessageResponse] = []


# ============== SMS ==============

class SimulatedSmsBase(BaseModel):
    """Champs communs pour un SMS simulé."""
    content: str = Field(..., description="Contenu du SMS", examples=["Bonjour, pouvez-vous rappeler le préfet au 01 23 45 67 89 ? Urgent."])


class SimulatedSmsCreate(SimulatedSmsBase):
    """Envoi d'un SMS par un joueur."""
    to_contact_id: int = Field(..., description="ID du contact destinataire")

    model_config = {
        "json_schema_extra": {
            "example": {
                "content": "Bien reçu, j'appelle le préfet immédiatement.",
                "to_contact_id": 5,
            }
        }
    }


class SimulatedSmsFromInject(BaseModel):
    """Création d'un SMS depuis un inject."""
    from_name: str = Field(..., examples=["Catherine Roux (DG)"])
    from_phone: Optional[str] = Field(None, examples=["06 01 23 45 67"])
    to_name: str = Field(..., examples=["Directeur de crise"])
    to_phone: Optional[str] = Field(None, examples=["06 12 34 56 78"])
    content: str = Field(..., examples=["Réunion cellule de crise dans 10 min. Salle Colbert. Présence obligatoire."])
    to_contact_id: Optional[int] = None
    from_contact_id: Optional[int] = None


class SimulatedSmsResponse(SimulatedSmsBase):
    """Réponse complète d'un SMS simulé."""
    id: int = Field(..., examples=[1])
    exercise_id: int = Field(..., examples=[1])
    from_contact_id: Optional[int] = None
    to_contact_id: Optional[int] = None
    from_name: str = Field(..., examples=["Catherine Roux (DG)"])
    from_phone: Optional[str] = Field(None, examples=["06 01 23 45 67"])
    to_name: str = Field(..., examples=["Directeur de crise"])
    to_phone: Optional[str] = Field(None, examples=["06 12 34 56 78"])
    is_from_player: bool = Field(..., examples=[False])
    is_inject: bool = Field(..., examples=[True])
    is_read: bool = Field(..., examples=[False])
    sent_at: datetime
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SimulatedSmsConversationResponse(BaseModel):
    """Conversation SMS groupée par contact."""
    contact_id: Optional[int] = Field(None, examples=[5])
    contact_name: str = Field(..., examples=["Catherine Roux (DG)"])
    contact_phone: Optional[str] = Field(None, examples=["06 01 23 45 67"])
    messages: List[SimulatedSmsResponse]
    unread_count: int = Field(..., examples=[1])


# ============== CALL ==============

class CallStatusEnum(str, Enum):
    RINGING = "ringing"
    ANSWERED = "answered"
    MISSED = "missed"
    ENDED = "ended"
    REJECTED = "rejected"


class SimulatedCallFromInject(BaseModel):
    """Création d'un appel depuis un inject."""
    caller_name: str = Field(..., examples=["Préfet Jean-Pierre Lemaire"])
    caller_phone: Optional[str] = Field(None, examples=["01 23 45 67 89"])
    callee_name: str = Field(..., examples=["Directeur de crise"])
    callee_phone: Optional[str] = Field(None, examples=["06 12 34 56 78"])
    call_type: str = Field("incoming", description="Type : incoming, outgoing", examples=["incoming"])
    caller_contact_id: Optional[int] = None
    callee_contact_id: Optional[int] = None
    voicemail_transcript: Optional[str] = Field(None, examples=["Ici le préfet Lemaire. Rappelez-moi de toute urgence concernant l'incident en cours chez Duval Industries."])


class SimulatedCallAction(BaseModel):
    """Action sur un appel en cours."""
    action: str = Field(..., description="Action : answer, reject, end", examples=["answer"])


class SimulatedCallResponse(BaseModel):
    """Réponse complète d'un appel simulé."""
    id: int = Field(..., examples=[1])
    exercise_id: int = Field(..., examples=[1])
    caller_contact_id: Optional[int] = None
    callee_contact_id: Optional[int] = None
    caller_name: str = Field(..., examples=["Préfet Jean-Pierre Lemaire"])
    caller_phone: Optional[str] = Field(None, examples=["01 23 45 67 89"])
    callee_name: str = Field(..., examples=["Directeur de crise"])
    callee_phone: Optional[str] = Field(None, examples=["06 12 34 56 78"])
    call_type: str = Field(..., examples=["incoming"])
    status: CallStatusEnum
    is_from_player: bool = Field(..., examples=[False])
    is_inject: bool = Field(..., examples=[True])
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration_seconds: Optional[int] = Field(None, examples=[180])
    voicemail_transcript: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ============== SOCIAL ==============

class SimulatedSocialPostFromInject(BaseModel):
    """Création d'un post réseau social depuis un inject."""
    author_name: str = Field(..., examples=["Pierre Martin"])
    author_handle: str = Field(..., examples=["@P_Martin_Cyber"])
    author_avatar: Optional[str] = None
    is_verified: bool = Field(False, examples=[True])
    content: str = Field(..., examples=["🚨 EXCLU — Selon nos sources, le groupe industriel Duval Industries serait victime d'une cyberattaque majeure de type ransomware. Des données employés auraient été exfiltrées. #cybersécurité #ransomware"])
    media_urls: List[str] = []
    likes_count: int = Field(0, examples=[247])
    retweets_count: int = Field(0, examples=[89])
    replies_count: int = Field(0, examples=[34])
    views_count: int = Field(0, examples=[12500])
    is_breaking: bool = Field(False, examples=[True])


class SimulatedSocialPostReaction(BaseModel):
    """Réaction d'un joueur à un post."""
    reaction_type: str = Field(..., description="Type : like, retweet", examples=["like"])


class SimulatedSocialPostResponse(BaseModel):
    """Réponse complète d'un post réseau social."""
    id: int = Field(..., examples=[1])
    exercise_id: int = Field(..., examples=[1])
    author_name: str = Field(..., examples=["Pierre Martin"])
    author_handle: str = Field(..., examples=["@P_Martin_Cyber"])
    author_avatar: Optional[str] = None
    is_verified: bool = Field(..., examples=[True])
    content: str = Field(..., examples=["🚨 EXCLU — Duval Industries victime d'une cyberattaque ransomware..."])
    media_urls: List[str]
    likes_count: int = Field(..., examples=[247])
    retweets_count: int = Field(..., examples=[89])
    replies_count: int = Field(..., examples=[34])
    views_count: int = Field(..., examples=[12500])
    player_liked: bool = Field(..., examples=[False])
    player_retweeted: bool = Field(..., examples=[False])
    is_inject: bool = Field(..., examples=[True])
    is_breaking: bool = Field(..., examples=[True])
    posted_at: datetime
    seen_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SimulatedSocialFeedResponse(BaseModel):
    """Feed réseau social paginé."""
    posts: List[SimulatedSocialPostResponse]
    total: int = Field(..., examples=[15])
    unseen_count: int = Field(..., examples=[3])


# ============== PRESS ==============

class SimulatedPressArticleFromInject(BaseModel):
    """Création d'un article de presse depuis un inject."""
    source: str = Field(..., description="Nom du média", examples=["BFM Business"])
    source_logo: Optional[str] = None
    title: str = Field(..., examples=["Cyberattaque massive chez Duval Industries — Production à l'arrêt"])
    content: Optional[str] = Field(None, examples=["Le groupe industriel Duval Industries, sous-traitant majeur de l'aéronautique et de la défense, serait victime d'une attaque ransomware d'envergure. Selon nos informations, les systèmes de production seraient à l'arrêt."])
    summary: Optional[str] = Field(None, examples=["Duval Industries victime d'une cyberattaque ransomware. Production arrêtée, données employés possiblement exfiltrées."])
    image_url: Optional[str] = None
    article_url: Optional[str] = None
    category: Optional[str] = Field(None, examples=["cybersécurité"])
    is_breaking_news: bool = Field(False, examples=[True])


class SimulatedPressArticleResponse(BaseModel):
    """Réponse complète d'un article de presse."""
    id: int = Field(..., examples=[1])
    exercise_id: int = Field(..., examples=[1])
    source: str = Field(..., examples=["BFM Business"])
    source_logo: Optional[str] = None
    title: str = Field(..., examples=["Cyberattaque massive chez Duval Industries"])
    content: Optional[str] = None
    summary: Optional[str] = None
    image_url: Optional[str] = None
    article_url: Optional[str] = None
    category: Optional[str] = Field(None, examples=["cybersécurité"])
    is_inject: bool = Field(..., examples=[True])
    is_breaking_news: bool = Field(..., examples=[True])
    is_read: bool = Field(..., examples=[False])
    published_at: datetime
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SimulatedPressFeedResponse(BaseModel):
    """Feed de presse paginé."""
    articles: List[SimulatedPressArticleResponse]
    total: int = Field(..., examples=[8])
    unread_count: int = Field(..., examples=[2])


# ============== TV ==============

class SimulatedTvEventFromInject(BaseModel):
    """Création d'un événement TV depuis un inject."""
    channel: str = Field(..., description="Nom de la chaîne", examples=["BFM Business"])
    channel_logo: Optional[str] = None
    title: str = Field(..., examples=["Flash info — Cyberattaque industrielle majeure"])
    description: Optional[str] = Field(None, examples=["Le groupe industriel Duval Industries serait victime d'une attaque ransomware. Les systèmes de production seraient à l'arrêt et des données personnelles de plus de 2 000 employés auraient été dérobées."])
    video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    event_type: str = Field("news", description="Type : news, breaking, live, interview", examples=["breaking"])
    is_live: bool = Field(False, examples=[True])
    is_breaking: bool = Field(False, examples=[True])
    duration_seconds: Optional[int] = Field(None, examples=[120])


class SimulatedTvEventResponse(BaseModel):
    """Réponse complète d'un événement TV."""
    id: int = Field(..., examples=[1])
    exercise_id: int = Field(..., examples=[1])
    channel: str = Field(..., examples=["BFM Business"])
    channel_logo: Optional[str] = None
    title: str = Field(..., examples=["Flash info — Cyberattaque industrielle majeure"])
    description: Optional[str] = None
    video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    event_type: str = Field(..., examples=["breaking"])
    is_inject: bool = Field(..., examples=[True])
    is_live: bool = Field(..., examples=[True])
    is_breaking: bool = Field(..., examples=[True])
    is_seen: bool = Field(..., examples=[False])
    broadcast_at: datetime
    seen_at: Optional[datetime] = None
    duration_seconds: Optional[int] = Field(None, examples=[120])
    created_at: datetime

    class Config:
        from_attributes = True


class SimulatedTvFeedResponse(BaseModel):
    """Feed TV avec l'événement live en cours."""
    events: List[SimulatedTvEventResponse]
    total: int = Field(..., examples=[5])
    unseen_count: int = Field(..., examples=[2])
    current_live: Optional[SimulatedTvEventResponse] = Field(None, description="Événement actuellement en direct")


# ============== WEBSOCKET EVENTS ==============

class WebSocketEvent(BaseModel):
    """Événement WebSocket pour les mises à jour temps réel sur les canaux simulés."""
    event_type: str = Field(..., description="Canal : mail, chat, sms, call, social, press, tv", examples=["mail"])
    action: str = Field(..., description="Action : new, update, delete", examples=["new"])
    data: Dict[str, Any] = Field(..., description="Payload de l'événement")
    timestamp: datetime
    exercise_id: int = Field(..., examples=[1])
