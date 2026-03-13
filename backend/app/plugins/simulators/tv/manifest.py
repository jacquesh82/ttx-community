from app.plugins.base import PluginCategory, PluginManifest

manifest = PluginManifest(
    code="tv",
    name="TV / Medias",
    name_en="TV / Media",
    description="Simulation de chaines TV et segments media",
    category=PluginCategory.SIMULATOR,
    icon="Tv",
    default_color="purple",
    supported_formats=["video"],
    default_enabled=False,
    coming_soon=False,
    sort_order=3,
    inject_types=["tv"],
    router_module="app.routers.tv",
    router_prefix="/api/tv",
)
