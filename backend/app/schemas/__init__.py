"""Pydantic schemas for API serialization."""
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.schemas.auth import LoginRequest, LoginResponse, SessionUser
from app.schemas.exercise import ExerciseCreate, ExerciseResponse, ExerciseUpdate

__all__ = [
    "UserCreate", "UserResponse", "UserUpdate",
    "LoginRequest", "LoginResponse", "SessionUser",
    "ExerciseCreate", "ExerciseResponse", "ExerciseUpdate",
]