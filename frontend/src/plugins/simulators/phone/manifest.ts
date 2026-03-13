import { lazy } from 'react'
import { Phone } from 'lucide-react'
import type { PluginManifest } from '../../types'

export const manifest: PluginManifest = {
  code: 'phone',
  name: 'plugins.phone.name',
  description: 'plugins.phone.description',
  category: 'simulator',
  icon: Phone,
  defaultColor: 'green',
  supportedFormats: ['audio'],
  defaultEnabled: false,
  comingSoon: true,
  sortOrder: 8,
  injectTypes: [],
  playerRoute: '/phone',
  PlayerPage: lazy(() => import('./PlayerPage')),
  EventReceiver: lazy(() => import('./EventReceiver')),
  PreviewPopup: lazy(() => import('./PreviewPopup')),
  configSchema: null,
}
