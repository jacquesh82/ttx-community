from app.plugins.base import PluginCategory, PluginManifest

manifest = PluginManifest(
    code="social_internal",
    name="Reseau social",
    name_en="Social Network",
    description="Simulation de fil social interne",
    category=PluginCategory.SIMULATOR,
    icon="Twitter",
    default_color="blue",
    supported_formats=["text", "video", "image"],
    default_enabled=False,
    coming_soon=False,
    sort_order=2,
    inject_types=["socialnet"],
    router_module="app.routers.twitter",
    router_prefix="/api/twitter",
)
