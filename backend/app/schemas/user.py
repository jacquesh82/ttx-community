"""User schemas for API."""
from datetime import datetime
from typing import Optional, List
import re

from pydantic import BaseModel, Field, field_validator

from app.models.user import UserRole


class UserBase(BaseModel):
    """Base user schema."""
    email: str = Field(..., max_length=255)
    username: str = Field(..., min_length=3, max_length=50)
    
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
    """Schema for creating a user."""
    password: str = Field(..., min_length=8, max_length=128)
    role: UserRole = UserRole.PARTICIPANT
    team_id: Optional[int] = None
    tags: List[str] = Field(default_factory=list)


class UserUpdate(BaseModel):
    """Schema for updating a user."""
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


class UserProfileUpdate(BaseModel):
    """Schema for self-service profile update (current user only)."""
    display_name: Optional[str] = Field(None, max_length=100)
    avatar_url: Optional[str] = Field(None, max_length=512)
    username: Optional[str] = Field(None, min_length=3, max_length=50)


class UserResponse(UserBase):
    """Schema for user response."""
    id: int
    role: UserRole
    is_active: bool
    team_id: Optional[int] = None
    tags: List[str] = Field(default_factory=list)
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserListResponse(BaseModel):
    """Schema for list of users."""
    users: list[UserResponse]
    total: int
    page: int
    page_size: int
