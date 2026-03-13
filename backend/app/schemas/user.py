"""User schemas for API."""
from datetime import datetime
from typing import Optional, List
import re

from pydantic import BaseModel, Field, field_validator

from app.models.user import UserRole


class UserBase(BaseModel):
    """Champs communs à la création et la réponse utilisateur."""
    email: str = Field(..., max_length=255, description="Adresse e-mail (domaines .local autorisés en dev)")
    username: str = Field(..., min_length=3, max_length=50, description="Nom d'utilisateur unique")

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        """Validate email format loosely to allow special domains like .local"""
        if not v or '@' not in v:
            raise ValueError('Invalid email address')
        parts = v.split('@')
        if len(parts) != 2 or not parts[0] or not parts[1]:
            raise ValueError('Invalid email address')
        return v.lower()


class UserCreate(UserBase):
    """Création d'un utilisateur (admin uniquement)."""
    password: str = Field(..., min_length=8, max_length=128, description="Mot de passe (min 8 caractères)")
    role: UserRole = Field(default=UserRole.PARTICIPANT, description="Rôle global : admin, animateur, observateur, participant")
    team_id: Optional[int] = Field(None, description="ID de l'équipe à laquelle rattacher l'utilisateur")
    tags: List[str] = Field(default_factory=list, description="Tags libres pour catégoriser l'utilisateur")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "summary": "Créer un animateur",
                    "value": {
                        "email": "animateur1@ttx.local",
                        "username": "animateur1",
                        "password": "Anim123!",
                        "role": "animateur",
                        "tags": ["facilitateur"],
                    },
                },
                {
                    "summary": "Créer un participant",
                    "value": {
                        "email": "participant1@ttx.local",
                        "username": "participant1",
                        "password": "Part123!",
                        "role": "participant",
                        "team_id": 1,
                        "tags": ["DSI", "technique"],
                    },
                },
            ]
        }
    }


class UserUpdate(BaseModel):
    """Mise à jour partielle d'un utilisateur (admin uniquement). Seuls les champs fournis sont modifiés."""
    email: Optional[str] = Field(None, max_length=255)
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    team_id: Optional[int] = None
    tags: Optional[List[str]] = None

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: Optional[str]) -> Optional[str]:
        """Validate email format loosely to allow special domains like .local"""
        if v is None:
            return v
        if '@' not in v:
            raise ValueError('Invalid email address')
        parts = v.split('@')
        if len(parts) != 2 or not parts[0] or not parts[1]:
            raise ValueError('Invalid email address')
        return v.lower()

    model_config = {
        "json_schema_extra": {
            "example": {
                "role": "animateur",
                "is_active": True,
                "tags": ["DSI", "technique"],
            }
        }
    }


class UserProfileUpdate(BaseModel):
    """Mise à jour du profil par l'utilisateur connecté (pas besoin d'être admin)."""
    display_name: Optional[str] = Field(None, max_length=100, description="Nom affiché dans l'interface")
    avatar_url: Optional[str] = Field(None, max_length=512, description="URL de l'avatar")
    username: Optional[str] = Field(None, min_length=3, max_length=50, description="Nouveau nom d'utilisateur")

    model_config = {
        "json_schema_extra": {
            "example": {
                "display_name": "Directeur de crise",
                "username": "directeur1",
            }
        }
    }


class UserResponse(UserBase):
    """Réponse complète d'un utilisateur."""
    id: int = Field(..., examples=[1])
    role: UserRole = Field(..., examples=["participant"])
    is_active: bool = Field(..., examples=[True])
    team_id: Optional[int] = Field(None, examples=[1])
    tags: List[str] = Field(default_factory=list, examples=[["DSI", "technique"]])
    display_name: Optional[str] = Field(None, examples=["Directeur de crise (Alpha)"])
    avatar_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserListResponse(BaseModel):
    """Liste paginée d'utilisateurs."""
    users: list[UserResponse]
    total: int = Field(..., description="Nombre total d'utilisateurs correspondant aux filtres", examples=[42])
    page: int = Field(..., description="Page courante", examples=[1])
    page_size: int = Field(..., description="Taille de page", examples=[20])
