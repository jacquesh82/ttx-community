"""Schemas for Player API."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from enum import Enum

from app.models.inject import DeliveryStatus
from app.models.event import EventType, EventActorType


class PlayerTeamInfo(BaseModel):
    """Équipe du joueur dans l'exercice."""
    id: int = Field(..., examples=[1])
    name: str = Field(..., description="Nom de l'équipe", examples=["Équipe Alpha"])
    code: str = Field(..., description="Code court de l'équipe", examples=["ALPHA"])


class PlayerExerciseInfo(BaseModel):
    """Informations de l'exercice vu par le joueur."""
    id: int = Field(..., examples=[1])
    name: str = Field(..., examples=["Exercice CYBER-STORM 2024"])
    status: str = Field(..., description="Statut : draft, running, paused, completed", examples=["running"])
    started_at: Optional[datetime] = None
    time_multiplier: str = Field(..., examples=["1.0"])


class PlayerStats(BaseModel):
    """Compteurs pour le tableau de bord joueur."""
    injects_pending: int = Field(..., description="Injects en attente de traitement", examples=[3])
    injects_in_progress: int = Field(..., description="Injects en cours", examples=[2])
    injects_treated: int = Field(..., description="Injects traités", examples=[5])
    messages_unread: int = Field(..., description="Messages non lus", examples=[4])
    decisions_count: int = Field(..., description="Décisions prises", examples=[1])


class PlayerContext(BaseModel):
    """Contexte complet du joueur pour un exercice donné. Point d'entrée principal de l'interface joueur."""
    exercise: PlayerExerciseInfo
    team: Optional[PlayerTeamInfo] = None
    role: str = Field(..., description="Rôle dans l'exercice : joueur, animateur, observateur", examples=["joueur"])
    exercise_time: Optional[str] = Field(None, description="Temps d'exercice au format T+HH:MM", examples=["T+01:23"])
    stats: PlayerStats

    model_config = {
        "json_schema_extra": {
            "example": {
                "exercise": {
                    "id": 1,
                    "name": "Exercice CYBER-STORM 2024",
                    "status": "running",
                    "started_at": "2024-03-15T14:00:00Z",
                    "time_multiplier": "1.0",
                },
                "team": {"id": 1, "name": "Équipe Alpha", "code": "ALPHA"},
                "role": "joueur",
                "exercise_time": "T+01:23",
                "stats": {
                    "injects_pending": 3,
                    "injects_in_progress": 2,
                    "injects_treated": 5,
                    "messages_unread": 4,
                    "decisions_count": 1,
                },
            }
        }
    }


class PlayerInject(BaseModel):
    """Inject visible par le joueur avec son statut de livraison."""
    id: int = Field(..., examples=[1])
    type: str = Field(..., description="Type d'inject : mail, sms, call, socialnet, tv, doc, system, decision", examples=["mail"])
    title: str = Field(..., examples=["Alerte SIEM — Activité suspecte détectée"])
    description: Optional[str] = Field(None, examples=["Le SIEM a détecté une activité de chiffrement anormale sur les serveurs FS-PAR-01, FS-PAR-02."])
    status: str = Field(..., description="Statut de l'inject : pending, sent, delivered, treated", examples=["delivered"])
    delivery_id: Optional[int] = Field(None, examples=[1])
    delivery_status: Optional[DeliveryStatus] = None
    scheduled_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    opened_at: Optional[datetime] = None
    acknowledged_at: Optional[datetime] = None
    treated_at: Optional[datetime] = None
    is_public: bool = Field(..., description="Inject visible par tous les joueurs", examples=[False])
    target_type: str = Field(..., description="Cible : team, user, public", examples=["team"])
    criticity: str = Field(..., description="Criticité : info, important, critical", examples=["critical"])
    created_at: datetime


class PlayerEvent(BaseModel):
    """Événement affiché dans la timeline du joueur."""
    id: int
    type: EventType
    entity_type: Optional[str] = Field(None, examples=["inject"])
    entity_id: Optional[int] = Field(None, examples=[1])
    actor_type: EventActorType
    actor_label: Optional[str] = Field(None, examples=["SOC Duval Industries"])
    payload: Optional[dict] = None
    ts: datetime
    exercise_time: Optional[datetime] = None
    title: str = Field(..., examples=["Alerte SIEM — Chiffrement détecté"])
    description: Optional[str] = None
    icon: str = Field(..., description="Emoji ou nom d'icône", examples=["🚨"])
    visibility: str = Field(..., description="public, team, personal", examples=["team"])
    channel: str = Field(..., description="Canal : inject, mail, tv, social, decision", examples=["inject"])
    criticity: str = Field(..., examples=["critical"])
    is_read: bool = Field(..., examples=[False])
    actions: List[str] = Field(..., description="Actions disponibles", examples=[["open", "mark_treated", "create_decision"]])


class UpdateDeliveryRequest(BaseModel):
    """Mise à jour du statut de livraison d'un inject par le joueur."""
    status: Optional[DeliveryStatus] = Field(None, description="Nouveau statut de livraison")
    acknowledge: Optional[bool] = Field(None, description="Marquer comme accusé de réception")
    treat: Optional[bool] = Field(None, description="Marquer comme traité")

    model_config = {
        "json_schema_extra": {
            "example": {"treat": True}
        }
    }


class DeliveryResponse(BaseModel):
    """Réponse après mise à jour d'une livraison."""
    id: int = Field(..., examples=[1])
    status: DeliveryStatus
    acknowledged_at: Optional[datetime] = None
    treated_at: Optional[datetime] = None
    treated_by: Optional[int] = Field(None, examples=[6])


class ChatRoom(BaseModel):
    """Salon de discussion pour le joueur."""
    id: int = Field(..., examples=[1])
    name: str = Field(..., examples=["Cellule de crise"])
    room_type: str = Field(..., description="Type : public, team, inject", examples=["team"])
    unread_count: int = Field(..., examples=[3])
    last_message_at: Optional[datetime] = None
    last_message_preview: Optional[str] = Field(None, examples=["Avez-vous isolé le réseau OT ?"])


class ChatMessage(BaseModel):
    """Message dans un salon de discussion."""
    id: int = Field(..., examples=[1])
    room_id: int = Field(..., examples=[1])
    author_type: str = Field(..., description="Type d'auteur : user, actor, system", examples=["user"])
    author_id: Optional[int] = Field(None, examples=[6])
    author_label: str = Field(..., examples=["Directeur de crise"])
    content: str = Field(..., examples=["Il faut isoler le réseau OT immédiatement."])
    created_at: datetime
    is_pinned: bool = Field(..., examples=[False])
    reactions: dict = Field(..., description="Réactions par emoji : {'👍': [user_ids]}", examples=[{"👍": [1, 3]}])


class SendChatMessageRequest(BaseModel):
    """Envoi d'un message dans un salon de discussion."""
    content: str = Field(..., description="Contenu du message")
    parent_message_id: Optional[int] = Field(None, description="ID du message parent (réponse)")

    model_config = {
        "json_schema_extra": {
            "example": {
                "content": "Avez-vous confirmation que les sauvegardes de dimanche sont saines ?",
                "parent_message_id": None,
            }
        }
    }


class CreateDecisionRequest(BaseModel):
    """Création d'une décision par un joueur."""
    title: str = Field(..., description="Titre de la décision")
    description: Optional[str] = Field(None, description="Description détaillée")
    impact: Optional[str] = Field(None, description="Impact attendu de la décision")
    source_event_id: Optional[int] = Field(None, description="ID de l'événement déclencheur")
    source_inject_id: Optional[int] = Field(None, description="ID de l'inject déclencheur")

    model_config = {
        "json_schema_extra": {
            "example": {
                "title": "Activation de la cellule de crise",
                "description": "Au vu de la demande de rançon et de la confirmation d'exfiltration de données, activation immédiate de la cellule de crise au niveau Direction Générale.",
                "impact": "Mobilisation DG, DSI, Juridique, Communication, RH — réunion immédiate en salle de crise.",
                "source_inject_id": 4,
            }
        }
    }


class DecisionResponse(BaseModel):
    """Réponse pour une décision prise."""
    id: int = Field(..., examples=[1])
    exercise_id: int = Field(..., examples=[1])
    team_id: Optional[int] = Field(None, examples=[3])
    user_id: Optional[int] = Field(None, examples=[6])
    title: str = Field(..., examples=["Activation de la cellule de crise"])
    description: Optional[str] = None
    impact: Optional[str] = None
    decided_at: datetime
    created_at: datetime
    source_event_id: Optional[int] = None
    source_inject_id: Optional[int] = Field(None, examples=[4])


class Notification(BaseModel):
    """Notification temps réel pour le joueur."""
    id: str = Field(..., examples=["notif-001"])
    type: str = Field(..., description="Type : inject.received, tv.segment, mail.received, chat.message, social.mention", examples=["inject.received"])
    title: str = Field(..., examples=["Nouvel inject reçu"])
    message: str = Field(..., examples=["Alerte SIEM — Activité suspecte détectée"])
    entity_type: Optional[str] = Field(None, examples=["inject"])
    entity_id: Optional[int] = Field(None, examples=[1])
    criticity: str = Field(..., examples=["critical"])
    created_at: datetime
    is_read: bool = Field(..., examples=[False])


class NotificationListResponse(BaseModel):
    """Liste de notifications avec compteur de non-lues."""
    notifications: List[Notification]
    unread_count: int = Field(..., examples=[3])


class TimelineFilters(BaseModel):
    """Filtres pour la timeline du joueur."""
    channel: Optional[str] = Field(None, description="Canal : all, inject, mail, tv, social, decision", examples=["inject"])
    scope: Optional[str] = Field(None, description="Portée : all, team, public, me", examples=["team"])
    criticity: Optional[str] = Field(None, description="Criticité : all, info, important, critical", examples=["critical"])
    unread_only: Optional[bool] = Field(False, description="Uniquement les non-lus")


# Update forward references
PlayerContext.model_rebuild()
