import { lazy } from 'react'
import { Tv } from 'lucide-react'
import type { PluginManifest } from '../../types'

export const manifest: PluginManifest = {
  code: 'tv',
  name: 'plugins.tv.name',
  description: 'plugins.tv.description',
  category: 'simulator',
  icon: Tv,
  defaultColor: 'purple',
  supportedFormats: ['video'],
  defaultEnabled: false,
  comingSoon: false,
  sortOrder: 3,
  injectTypes: ['tv'],
  playerRoute: '/tv',
  PlayerPage: lazy(() => import('./PlayerPage')),
  EventReceiver: lazy(() => import('./EventReceiver')),
  PreviewPopup: lazy(() => import('./PreviewPopup')),
  configSchema: null,
}
