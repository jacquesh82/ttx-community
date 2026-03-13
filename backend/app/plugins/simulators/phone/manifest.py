from app.plugins.base import PluginCategory, PluginManifest

manifest = PluginManifest(
    code="phone",
    name="Telephone",
    name_en="Phone",
    description="Simulation d'appels telephoniques",
    category=PluginCategory.SIMULATOR,
    icon="Phone",
    default_color="green",
    supported_formats=["audio"],
    default_enabled=False,
    coming_soon=True,
    sort_order=8,
    inject_types=[],
    router_module=None,
    router_prefix=None,
)
