import { BookOpen } from 'lucide-react'
import type { PluginManifest } from '../../types'

export const manifest: PluginManifest = {
  code: 'directory',
  name: 'plugins.directory.name',
  description: 'plugins.directory.description',
  category: 'simulator',
  icon: BookOpen,
  defaultColor: 'green',
  supportedFormats: ['text'],
  defaultEnabled: true,
  comingSoon: false,
  sortOrder: 1,
  injectTypes: ['directory'],
  playerRoute: null,
  PlayerPage: null,
  EventReceiver: null,
  PreviewPopup: null,
  configSchema: null,
}
