"""Plugin models for modular exercise tools."""
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, func, UniqueConstraint
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# PostgreSQL enum type for plugin_type.
# Lowercase values are the canonical form; uppercase kept for legacy compatibility.
plugin_type_enum = PgEnum(
    "directory",
    "social_internal",
    "social_network",
    "tv",
    "mailbox",
    "email",
    "chat",
    "press_feed",
    "sms",
    "gov_channel",
    "anssi_channel",
    # Defensive compatibility for legacy rows that were persisted in uppercase.
    "DIRECTORY",
    "SOCIAL_INTERNAL",
    "SOCIAL_NETWORK",
    "TV",
    "MAILBOX",
    "EMAIL",
    "CHAT",
    "PRESS_FEED",
    "SMS",
    "GOV_CHANNEL",
    "ANSSI_CHANNEL",
    name="plugin_type",
    create_type=True,
    validate_strings=False,
    metadata=Base.metadata,
)


# Static fallback metadata used only when plugin_configurations misses a row.
PLUGIN_CONFIG_FALLBACKS: dict[str, dict[str, Any]] = {
    "directory": {
        "name": "Annuaire de Crise",
        "description": "Gestion des contacts et ressources de crise",
        "icon": "BookOpen",
        "color": "green",
        "default_enabled": True,
        "coming_soon": False,
        "sort_order": 1,
    },
    "social_internal": {
        "name": "Reseau social",
        "description": "Simulation de fil social interne",
        "icon": "Twitter",
        "color": "blue",
        "default_enabled": False,
        "coming_soon": False,
        "sort_order": 2,
    },
    "tv": {
        "name": "TV / Medias",
        "description": "Simulation de chaines TV et segments media",
        "icon": "Tv",
        "color": "purple",
        "default_enabled": False,
        "coming_soon": False,
        "sort_order": 3,
    },
    "mailbox": {
        "name": "Messagerie",
        "description": "Simulation de boite mail",
        "icon": "Mail",
        "color": "blue",
        "default_enabled": True,
        "coming_soon": False,
        "sort_order": 4,
    },
    "chat": {
        "name": "Chat",
        "description": "Communication en temps reel",
        "icon": "MessageCircle",
        "color": "teal",
        "default_enabled": False,
        "coming_soon": False,
        "sort_order": 5,
    },
    "press_feed": {
        "name": "Fil presse",
        "description": "Simulation de flux actualites media",
        "icon": "Newspaper",
        "color": "gray",
        "default_enabled": False,
        "coming_soon": False,
        "sort_order": 6,
    },
    "sms": {
        "name": "SMS simules",
        "description": "Simulation de messages SMS",
        "icon": "MessageSquare",
        "color": "gray",
        "default_enabled": False,
        "coming_soon": False,
        "sort_order": 7,
    },
    "gov_channel": {
        "name": "Canal gouvernement",
        "description": "Messages institutionnels gouvernementaux",
        "icon": "Landmark",
        "color": "gray",
        "default_enabled": False,
        "coming_soon": False,
        "sort_order": 8,
    },
    "anssi_channel": {
        "name": "Canal ANSSI",
        "description": "Communications techniques ANSSI",
        "icon": "Shield",
        "color": "gray",
        "default_enabled": False,
        "coming_soon": False,
        "sort_order": 9,
    },
}


def get_plugin_config_fallback(plugin_type: str, sort_order: int | None = None) -> dict[str, Any]:
    """Return fallback plugin config when DB row is missing."""
    fallback = PLUGIN_CONFIG_FALLBACKS.get(plugin_type, {})
    resolved_sort_order = sort_order if sort_order is not None else int(fallback.get("sort_order", 999))

    if fallback:
        return {
            "name": str(fallback.get("name", plugin_type)),
            "description": str(fallback.get("description", "")),
            "icon": str(fallback.get("icon", "Box")),
            "color": str(fallback.get("color", "gray")),
            "default_enabled": bool(fallback.get("default_enabled", False)),
            "coming_soon": bool(fallback.get("coming_soon", False)),
            "sort_order": resolved_sort_order,
        }

    human_name = plugin_type.replace("_", " ").title() if plugin_type else "Plugin"
    return {
        "name": human_name,
        "description": "",
        "icon": "Box",
        "color": "gray",
        "default_enabled": False,
        "coming_soon": False,
        "sort_order": resolved_sort_order,
    }


class ExercisePlugin(Base):
    """Association between exercises and plugins."""
    
    __tablename__ = "exercise_plugins"
    __table_args__ = (
        UniqueConstraint('exercise_id', 'plugin_type', name='uq_exercise_plugins_exercise_type'),
    )
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    plugin_type: Mapped[str] = mapped_column(plugin_type_enum, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    configuration: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # Plugin-specific settings
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
    
    # Relationships
    exercise = relationship("Exercise", back_populates="plugins")
    
    def __repr__(self) -> str:
        return f"<ExercisePlugin(exercise_id={self.exercise_id}, type={self.plugin_type}, enabled={self.enabled})>"
    
    @property
    def info(self) -> dict:
        """Get plugin information."""
        return get_plugin_config_fallback(self.plugin_type)


class PluginConfiguration(Base):
    """Editable configuration for each plugin type (admin-managed)."""
    
    __tablename__ = "plugin_configurations"
    __table_args__ = (
        UniqueConstraint('plugin_type', name='uq_plugin_config_type'),
    )
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plugin_type: Mapped[str] = mapped_column(plugin_type_enum, nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon: Mapped[str] = mapped_column(String(50), nullable=False, default="Box")
    color: Mapped[str] = mapped_column(String(30), nullable=False, default="gray")
    default_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    coming_soon: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
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
        return f"<PluginConfiguration(type={self.plugin_type}, name='{self.name}')>"
