from app.plugins.base import PluginCategory, PluginManifest

manifest = PluginManifest(
    code="mailbox",
    name="Messagerie",
    name_en="Mailbox",
    description="Simulation de boite mail",
    category=PluginCategory.SIMULATOR,
    icon="Mail",
    default_color="blue",
    supported_formats=["text", "image"],
    default_enabled=True,
    coming_soon=False,
    sort_order=4,
    inject_types=["mail", "doc", "call"],
    router_module="app.routers.webmail",
    router_prefix="/webmail",
)
