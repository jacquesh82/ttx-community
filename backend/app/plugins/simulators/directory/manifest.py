from app.plugins.base import PluginCategory, PluginManifest

manifest = PluginManifest(
    code="directory",
    name="Annuaire de Crise",
    name_en="Crisis Directory",
    description="Gestion des contacts et ressources de crise",
    category=PluginCategory.SIMULATOR,
    icon="BookOpen",
    default_color="green",
    supported_formats=["text"],
    default_enabled=True,
    coming_soon=False,
    sort_order=1,
    inject_types=["directory"],
    router_module="app.routers.crisis_contacts",
    router_prefix="/api/crisis-contacts",
)
