"""Authentication schemas for API."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole
from app.models.tenant import WsAuthTicketScope


class LoginRequest(BaseModel):
    """Connexion avec identifiant (username ou email) et mot de passe."""
    username_or_email: str = Field(..., min_length=3, description="Nom d'utilisateur ou adresse e-mail")
    password: str = Field(..., min_length=1, description="Mot de passe")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "summary": "Login admin",
                    "value": {"username_or_email": "admin", "password": "Admin123!"},
                },
                {
                    "summary": "Login par email",
                    "value": {"username_or_email": "animateur1@ttx.local", "password": "Anim123!"},
                },
            ]
        }
    }


class SessionUser(BaseModel):
    """Informations utilisateur dans la session active."""
    id: int = Field(..., description="ID unique de l'utilisateur", examples=[1])
    email: str = Field(..., description="Adresse e-mail", examples=["admin@ttx.local"])
    username: str = Field(..., description="Nom d'utilisateur", examples=["admin"])
    role: UserRole = Field(..., description="Rôle global sur la plateforme", examples=["admin"])
    is_active: bool = Field(..., description="Compte actif", examples=[True])
    display_name: Optional[str] = Field(None, description="Nom d'affichage", examples=["Administrateur plateforme"])
    avatar_url: Optional[str] = Field(None, description="URL de l'avatar")

    model_config = {"from_attributes": True}


class SessionTenant(BaseModel):
    """Informations du tenant (organisation) courant."""
    id: int = Field(..., description="ID du tenant", examples=[1])
    slug: str = Field(..., description="Slug unique du tenant", examples=["default"])
    name: str = Field(..., description="Nom du tenant", examples=["Duval Industries"])


class LoginResponse(BaseModel):
    """Réponse après connexion réussie. Contient l'utilisateur, le token CSRF et le tenant."""
    user: SessionUser
    csrf_token: str = Field(..., description="Token CSRF à inclure dans le header X-CSRF-Token pour les requêtes mutantes")
    tenant: SessionTenant

    model_config = {
        "json_schema_extra": {
            "example": {
                "user": {
                    "id": 1,
                    "email": "admin@ttx.local",
                    "username": "admin",
                    "role": "admin",
                    "is_active": True,
                    "display_name": "Administrateur plateforme",
                    "avatar_url": None,
                },
                "csrf_token": "a1b2c3d4e5f6...",
                "tenant": {"id": 1, "slug": "default", "name": "Duval Industries"},
            }
        }
    }


class SessionResponse(BaseModel):
    """Informations de la session courante (GET /api/auth/me)."""
    user: SessionUser
    csrf_token: str
    tenant: SessionTenant
    expires_at: Optional[datetime] = Field(None, description="Date d'expiration de la session")


class ChangePasswordRequest(BaseModel):
    """Changement de mot de passe de l'utilisateur connecté."""
    current_password: str = Field(..., min_length=1, description="Mot de passe actuel")
    new_password: str = Field(..., min_length=8, max_length=128, description="Nouveau mot de passe (min 8 caractères)")

    model_config = {
        "json_schema_extra": {
            "example": {
                "current_password": "Admin123!",
                "new_password": "NewSecurePass456!",
            }
        }
    }


class AuthError(BaseModel):
    """Erreur d'authentification."""
    error: str = Field(..., description="Code d'erreur", examples=["invalid_credentials"])
    detail: Optional[str] = Field(None, description="Message descriptif", examples=["Identifiant ou mot de passe incorrect"])


class WsTicketRequest(BaseModel):
    """Demande de ticket d'authentification WebSocket à usage unique."""
    scope: WsAuthTicketScope = Field(..., description="Portée du ticket : TENANT ou EXERCISE")
    exercise_id: int | None = Field(None, description="ID de l'exercice (requis si scope=EXERCISE)")

    model_config = {
        "json_schema_extra": {
            "example": {"scope": "EXERCISE", "exercise_id": 1}
        }
    }


class WsTicketResponse(BaseModel):
    """Ticket WebSocket à usage unique, valide quelques secondes."""
    ticket: str = Field(..., description="Token à passer en query param ?ticket=...")
    expires_at: datetime = Field(..., description="Date d'expiration du ticket")
    scope: WsAuthTicketScope
