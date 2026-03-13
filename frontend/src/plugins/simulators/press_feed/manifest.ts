import { lazy } from 'react'
import { Newspaper } from 'lucide-react'
import type { PluginManifest } from '../../types'

export const manifest: PluginManifest = {
  code: 'press_feed',
  name: 'plugins.press_feed.name',
  description: 'plugins.press_feed.description',
  category: 'simulator',
  icon: Newspaper,
  defaultColor: 'gray',
  supportedFormats: ['text', 'image'],
  defaultEnabled: false,
  comingSoon: false,
  sortOrder: 6,
  injectTypes: [],
  playerRoute: '/press',
  PlayerPage: lazy(() => import('./PlayerPage')),
  EventReceiver: lazy(() => import('./EventReceiver')),
  PreviewPopup: lazy(() => import('./PreviewPopup')),
  configSchema: null,
}
