from app.plugins.base import PluginCategory, PluginManifest

manifest = PluginManifest(
    code="chat",
    name="Chat",
    name_en="Chat",
    description="Communication en temps reel",
    category=PluginCategory.SIMULATOR,
    icon="MessageCircle",
    default_color="teal",
    supported_formats=["text"],
    default_enabled=False,
    coming_soon=False,
    sort_order=5,
    inject_types=[],
    router_module="app.routers.simulated_channels",
    router_prefix="/api/simulated",
)
