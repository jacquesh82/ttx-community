import { lazy } from 'react'
import { AtSign } from 'lucide-react'
import type { PluginManifest } from '../../types'

export const manifest: PluginManifest = {
  code: 'social_internal',
  name: 'plugins.social_internal.name',
  description: 'plugins.social_internal.description',
  category: 'simulator',
  icon: AtSign,
  defaultColor: 'blue',
  supportedFormats: ['text', 'video', 'image'],
  defaultEnabled: false,
  comingSoon: false,
  sortOrder: 2,
  injectTypes: ['socialnet'],
  playerRoute: '/social',
  PlayerPage: lazy(() => import('./PlayerPage')),
  EventReceiver: lazy(() => import('./EventReceiver')),
  PreviewPopup: lazy(() => import('./PreviewPopup')),
  configSchema: null,
}
