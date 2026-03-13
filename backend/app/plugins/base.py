"""Base plugin manifest dataclass and category enum."""
from dataclasses import dataclass, field
from enum import Enum


class PluginCategory(str, Enum):
    SIMULATOR = "simulator"
    TOOL = "tool"
    INTEGRATION = "integration"


@dataclass
class PluginManifest:
    """Declarative descriptor for a plugin."""

    code: str
    name: str  # Default display name (fr)
    name_en: str
    description: str
    category: PluginCategory
    icon: str  # Lucide icon name
    default_color: str
    supported_formats: list[str] = field(default_factory=list)  # ["text", "audio", "video", "image"]
    default_enabled: bool = False
    coming_soon: bool = False
    sort_order: int = 99
    inject_types: list[str] = field(default_factory=list)
    router_module: str | None = None  # e.g. "app.routers.webmail"
    router_prefix: str | None = None  # e.g. "/webmail"
    config_schema: dict | None = None
