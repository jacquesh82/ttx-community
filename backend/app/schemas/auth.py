"""Authentication schemas for API."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole
from app.models.tenant import WsAuthTicketScope


class LoginRequest(BaseModel):
    """Schema for login request."""
    username_or_email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=1)


class LoginResponse(BaseModel):
    """Schema for login response."""
    user: "SessionUser"
    csrf_token: str
    tenant: "SessionTenant"


class SessionUser(BaseModel):
    """Schema for user in session."""
    id: int
    email: str
    username: str
    role: UserRole
    is_active: bool
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None

    model_config = {"from_attributes": True}


class SessionTenant(BaseModel):
    id: int
    slug: str
    name: str


class SessionResponse(BaseModel):
    """Schema for session info."""
    user: SessionUser
    csrf_token: str
    tenant: SessionTenant
    expires_at: Optional[datetime] = None


class ChangePasswordRequest(BaseModel):
    """Schema for password change."""
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


class AuthError(BaseModel):
    """Schema for authentication error."""
    error: str
    detail: Optional[str] = None


class WsTicketRequest(BaseModel):
    scope: WsAuthTicketScope
    exercise_id: int | None = None


class WsTicketResponse(BaseModel):
    ticket: str
    expires_at: datetime
    scope: WsAuthTicketScope
