"""Plugin auto-discovery via importlib scan of plugins/**/manifest.py."""
import importlib
import logging
from pathlib import Path

from app.plugins.base import PluginManifest

logger = logging.getLogger(__name__)

_registry: dict[str, PluginManifest] | None = None


def discover_plugins() -> dict[str, PluginManifest]:
    """Scan plugins/**/manifest.py, import and collect PluginManifest instances."""
    global _registry
    if _registry is not None:
        return _registry

    registry: dict[str, PluginManifest] = {}
    plugins_dir = Path(__file__).parent

    for manifest_path in sorted(plugins_dir.rglob("manifest.py")):
        # Build importable module path: app.plugins.<category>.<plugin_name>.manifest
        relative = manifest_path.relative_to(plugins_dir.parent.parent)  # relative to backend/app/..
        module_path = str(relative).replace("/", ".").removesuffix(".py")

        try:
            module = importlib.import_module(module_path)
        except Exception:
            logger.exception("Failed to import plugin manifest: %s", module_path)
            continue

        manifest = getattr(module, "manifest", None)
        if not isinstance(manifest, PluginManifest):
            logger.warning("No PluginManifest found in %s", module_path)
            continue

        if manifest.code in registry:
            logger.warning("Duplicate plugin code '%s' in %s, skipping", manifest.code, module_path)
            continue

        registry[manifest.code] = manifest

    _registry = registry
    logger.info("Discovered %d plugin(s): %s", len(registry), list(registry.keys()))
    return registry


def get_plugin_registry() -> dict[str, PluginManifest]:
    """Return the plugin registry, discovering plugins if needed."""
    return discover_plugins()
