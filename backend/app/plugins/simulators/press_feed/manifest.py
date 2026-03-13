from app.plugins.base import PluginCategory, PluginManifest

manifest = PluginManifest(
    code="press_feed",
    name="Fil presse",
    name_en="Press Feed",
    description="Simulation de flux actualites media",
    category=PluginCategory.SIMULATOR,
    icon="Newspaper",
    default_color="gray",
    supported_formats=["text", "image"],
    default_enabled=False,
    coming_soon=False,
    sort_order=6,
    inject_types=[],
    router_module="app.routers.simulated_channels",
    router_prefix="/api/simulated",
)
