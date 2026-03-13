import type { PluginManifest, PluginCategory } from './types'

// Auto-discover all manifest.ts files under plugins/
const modules = import.meta.glob<{ manifest: PluginManifest }>(
  './**/manifest.ts',
  { eager: true }
)

// Build registry map: code → manifest
const registry = new Map<string, PluginManifest>()

for (const [, mod] of Object.entries(modules)) {
  if (mod.manifest) {
    registry.set(mod.manifest.code, mod.manifest)
  }
}

/** Get all registered plugins sorted by sortOrder */
export function getPlugins(): PluginManifest[] {
  return Array.from(registry.values()).sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Get plugins filtered by category */
export function getPluginsByCategory(category: PluginCategory): PluginManifest[] {
  return getPlugins().filter((p) => p.category === category)
}

/** Get all simulator plugins */
export function getSimulatorPlugins(): PluginManifest[] {
  return getPluginsByCategory('simulator')
}

/** Get a specific plugin by code */
export function getPlugin(code: string): PluginManifest | undefined {
  return registry.get(code)
}

/** Get the set of simulator plugin codes (for filtering) */
export function getSimulatorPluginCodes(): Set<string> {
  return new Set(getSimulatorPlugins().map((p) => p.code))
}

/** Get default simulator mapping: inject_type → plugin_code */
export function getInjectTypeToSimulatorMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const plugin of getSimulatorPlugins()) {
    for (const injectType of plugin.injectTypes) {
      // First plugin to claim an inject type wins
      if (!(injectType in map)) {
        map[injectType] = plugin.code
      }
    }
  }
  return map
}

export { registry }
