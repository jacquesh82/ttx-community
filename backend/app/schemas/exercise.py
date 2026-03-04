"""Exercise schemas for API."""
from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.models.exercise import ExerciseStatus
from app.models.crisis_management import ExerciseType, ExerciseMaturityLevel, ExerciseMode


class ExerciseBase(BaseModel):
    """Base exercise schema."""
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    time_multiplier: Decimal = Field(default=Decimal("1.0"), ge=0.1, le=10.0)
    exercise_type: ExerciseType = ExerciseType.CYBER
    target_duration_hours: int = Field(default=4, ge=1, le=72)
    maturity_level: ExerciseMaturityLevel = ExerciseMaturityLevel.BEGINNER
    mode: ExerciseMode = ExerciseMode.REAL_TIME
    planned_date: Optional[datetime] = None
    business_objective: Optional[str] = None
    technical_objective: Optional[str] = None
    lead_organizer_user_id: Optional[int] = None


class PluginInfoResponse(BaseModel):
    """Schema for plugin information."""
    type: str  # Plugin type as string
    name: str
    description: str
    icon: str
    color: str
    default_enabled: bool = False
    coming_soon: bool = False
    sort_order: int = 0


class ExercisePluginResponse(BaseModel):
    """Schema for exercise plugin association."""
    plugin_type: str  # Plugin type as string
    enabled: bool
    configuration: Optional[dict] = None
    info: Optional[PluginInfoResponse] = None

    model_config = {"from_attributes": True}


class ExerciseCreate(ExerciseBase):
    """Schema for creating an exercise."""
    team_ids: Optional[list[int]] = None
    enabled_plugins: Optional[list[str]] = None  # Plugin types as strings
    phase_preset: Optional[Literal["minimal", "classique", "precis", "full"]] = None


class ExerciseUpdate(BaseModel):
    """Schema for updating an exercise."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    status: Optional[ExerciseStatus] = None
    time_multiplier: Optional[Decimal] = Field(None, ge=0.1, le=10.0)
    exercise_type: Optional[ExerciseType] = None
    target_duration_hours: Optional[int] = Field(None, ge=1, le=72)
    maturity_level: Optional[ExerciseMaturityLevel] = None
    mode: Optional[ExerciseMode] = None
    planned_date: Optional[datetime] = None
    business_objective: Optional[str] = None
    technical_objective: Optional[str] = None
    lead_organizer_user_id: Optional[int] = None


class ExerciseResponse(ExerciseBase):
    """Schema for exercise response."""
    id: int
    status: str  # Serialized as string for frontend compatibility
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    created_by: Optional[int] = None
    lead_organizer_user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    plugins: list[ExercisePluginResponse] = []

    model_config = {"from_attributes": True}


class ExerciseListResponse(BaseModel):
    """Schema for list of exercises."""
    exercises: list[ExerciseResponse]
    total: int
    page: int
    page_size: int


class ExerciseStats(BaseModel):
    """Schema for exercise statistics."""
    exercise_id: int
    total_injects: int
    sent_injects: int
    pending_injects: int
    total_messages: int
    total_tweets: int
    total_decisions: int
    average_score: Optional[Decimal] = None
