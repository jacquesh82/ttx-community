"""Application-wide configuration model for admin settings."""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AppConfiguration(Base):
    """Singleton-like app configuration stored in database.
    
    Only one row should exist (id=1). This allows runtime configuration
    of application-wide settings without environment variables.
    """
    
    __tablename__ = "app_configurations"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # Organization info
    organization_name: Mapped[str] = mapped_column(String(200), nullable=False, default="Organisation")
    organization_logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    organization_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    organization_reference_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    organization_keywords: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Default exercise settings
    default_exercise_duration_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    default_time_multiplier: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    default_maturity_level: Mapped[str] = mapped_column(String(20), nullable=False, default="intermediate")
    default_exercise_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="real_time")
    
    # Features toggles
    enable_tv_plugin: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    enable_social_plugin: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    enable_welcome_kits: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    enable_scoring: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    
    # Security settings
    session_timeout_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    max_login_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    password_min_length: Mapped[int] = mapped_column(Integer, nullable=False, default=8)
    
    # Email settings (for notifications)
    smtp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    smtp_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    smtp_user: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_from: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Simulator to Inject Type Mapping (JSON)
    simulator_inject_mapping: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )
    
    def __repr__(self) -> str:
        return f"<AppConfiguration(id={self.id}, organization='{self.organization_name}')>"


# Default configuration values
DEFAULT_APP_CONFIG = {
    "organization_name": "Organisation",
    "organization_logo_url": None,
    "organization_description": None,
    "organization_reference_url": None,
    "organization_keywords": None,
    "default_exercise_duration_hours": 4,
    "default_time_multiplier": 1,
    "default_maturity_level": "intermediate",
    "default_exercise_mode": "real_time",
    "enable_tv_plugin": True,
    "enable_social_plugin": True,
    "enable_welcome_kits": True,
    "enable_scoring": False,
    "session_timeout_minutes": 60,
    "max_login_attempts": 5,
    "password_min_length": 8,
    "smtp_enabled": False,
    "smtp_host": None,
    "smtp_port": None,
    "smtp_user": None,
    "smtp_from": None,
    "simulator_inject_mapping": None,
    "default_phases_config": None,
    "default_phases_preset": None,
}
