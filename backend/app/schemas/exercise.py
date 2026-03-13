"""Exercise schemas for API."""
from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.models.exercise import ExerciseStatus


class ExerciseBase(BaseModel):
    """Champs communs à la création et la réponse exercice."""
    name: str = Field(..., min_length=1, max_length=200, description="Nom de l'exercice")
    description: Optional[str] = Field(None, description="Description détaillée du scénario")
    time_multiplier: Decimal = Field(default=Decimal("1.0"), ge=0.1, le=10.0, description="Multiplicateur de temps (1.0 = temps réel, 2.0 = 2× plus rapide)")
    exercise_type: str = Field(default="cyber", min_length=1, max_length=50, description="Type d'exercice : cyber, ransomware, it_outage, mixed")
    target_duration_hours: int = Field(default=4, ge=1, le=72, description="Durée cible en heures")
    maturity_level: str = Field(default="beginner", min_length=1, max_length=50, description="Niveau de maturité : beginner, intermediate, expert")
    mode: str = Field(default="real_time", min_length=1, max_length=50, description="Mode : real_time, compressed, simulated")
    planned_date: Optional[datetime] = Field(None, description="Date prévue de l'exercice")
    business_objective: Optional[str] = Field(None, description="Objectif métier de l'exercice")
    technical_objective: Optional[str] = Field(None, description="Objectif technique de l'exercice")
    lead_organizer_user_id: Optional[int] = Field(None, description="ID de l'organisateur principal")


class PluginInfoResponse(BaseModel):
    """Métadonnées d'un plugin disponible."""
    type: str = Field(..., description="Code unique du plugin", examples=["mailbox"])
    name: str = Field(..., description="Nom affiché", examples=["Messagerie"])
    description: str = Field(..., description="Description courte", examples=["Simulateur de messagerie e-mail"])
    icon: str = Field(..., description="Nom de l'icône Lucide", examples=["Mail"])
    color: str = Field(..., description="Couleur CSS du plugin", examples=["blue"])
    default_enabled: bool = Field(False, description="Activé par défaut à la création d'exercice")
    coming_soon: bool = Field(False, description="Plugin pas encore disponible")
    sort_order: int = Field(0, description="Ordre d'affichage")


class ExercisePluginResponse(BaseModel):
    """Association exercice ↔ plugin avec son état d'activation."""
    plugin_type: str = Field(..., description="Code du plugin", examples=["mailbox"])
    enabled: bool = Field(..., description="Plugin activé pour cet exercice", examples=[True])
    configuration: Optional[dict] = Field(None, description="Configuration spécifique au plugin")
    info: Optional[PluginInfoResponse] = Field(None, description="Métadonnées du plugin")

    model_config = {"from_attributes": True}


class ExerciseCreate(ExerciseBase):
    """Création d'un exercice de crise."""
    team_ids: Optional[list[int]] = Field(None, description="IDs des équipes à rattacher")
    enabled_plugins: Optional[list[str]] = Field(None, description="Plugins à activer (codes)", examples=[["mailbox", "sms", "social_internal", "tv"]])
    phase_preset: Optional[Literal["minimal", "classique", "precis", "full"]] = Field(None, description="Preset de phases : minimal (4), classique (9), precis (13), full (17)")

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "Exercice CYBER-STORM 2024",
                "description": "Simulation d'une cyber-attaque majeure sur l'infrastructure critique. Les équipes doivent gérer la communication de crise, coordonner la réponse technique et prendre des décisions stratégiques sous pression temporelle.",
                "exercise_type": "ransomware",
                "target_duration_hours": 4,
                "maturity_level": "intermediate",
                "mode": "real_time",
                "business_objective": "Tester la gouvernance de crise face à une attaque ransomware : capacité de prise de décision stratégique, coordination inter-services et communication de crise sous pression temporelle.",
                "technical_objective": "Évaluer la réponse technique à un incident ransomware : détection, confinement, analyse forensique, restauration des systèmes et coordination avec les autorités (ANSSI, CNIL).",
                "team_ids": [1, 2, 3],
                "enabled_plugins": ["mailbox", "sms", "social_internal", "tv"],
                "phase_preset": "classique",
            }
        }
    }


class ExerciseUpdate(BaseModel):
    """Mise à jour partielle d'un exercice. Seuls les champs fournis sont modifiés."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    status: Optional[ExerciseStatus] = None
    time_multiplier: Optional[Decimal] = Field(None, ge=0.1, le=10.0)
    exercise_type: Optional[str] = Field(None, min_length=1, max_length=50)
    target_duration_hours: Optional[int] = Field(None, ge=1, le=72)
    maturity_level: Optional[str] = Field(None, min_length=1, max_length=50)
    mode: Optional[str] = Field(None, min_length=1, max_length=50)
    planned_date: Optional[datetime] = None
    business_objective: Optional[str] = None
    technical_objective: Optional[str] = None
    lead_organizer_user_id: Optional[int] = None
    timeline_configured: Optional[bool] = None

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "CYBER-STORM 2024 — Édition révisée",
                "target_duration_hours": 8,
                "maturity_level": "expert",
            }
        }
    }


class ExerciseResponse(ExerciseBase):
    """Réponse complète d'un exercice avec ses plugins."""
    id: int = Field(..., examples=[1])
    status: str = Field(..., description="Statut : draft, running, paused, completed, archived", examples=["draft"])
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    created_by: Optional[int] = Field(None, examples=[1])
    lead_organizer_user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    plugins: list[ExercisePluginResponse] = []
    timeline_configured: bool = False

    model_config = {"from_attributes": True}


class ExerciseListResponse(BaseModel):
    """Liste paginée d'exercices."""
    exercises: list[ExerciseResponse]
    total: int = Field(..., examples=[5])
    page: int = Field(..., examples=[1])
    page_size: int = Field(..., examples=[20])


class ExerciseStats(BaseModel):
    """Statistiques d'un exercice."""
    exercise_id: int = Field(..., examples=[1])
    total_injects: int = Field(..., description="Nombre total d'injects", examples=[15])
    sent_injects: int = Field(..., description="Injects envoyés", examples=[8])
    pending_injects: int = Field(..., description="Injects en attente", examples=[7])
    total_messages: int = Field(..., description="Messages webmail échangés", examples=[23])
    total_tweets: int = Field(..., description="Publications réseau social", examples=[5])
    total_decisions: int = Field(..., description="Décisions prises", examples=[4])
    average_score: Optional[Decimal] = Field(None, description="Score moyen (0-100)", examples=[72.5])
