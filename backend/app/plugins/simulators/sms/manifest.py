from app.plugins.base import PluginCategory, PluginManifest

manifest = PluginManifest(
    code="sms",
    name="SMS simules",
    name_en="SMS",
    description="Simulation de messages SMS",
    category=PluginCategory.SIMULATOR,
    icon="MessageSquare",
    default_color="gray",
    supported_formats=["text", "image"],
    default_enabled=False,
    coming_soon=False,
    sort_order=7,
    inject_types=["sms"],
    router_module="app.routers.simulated_channels",
    router_prefix="/api/simulated",
)
