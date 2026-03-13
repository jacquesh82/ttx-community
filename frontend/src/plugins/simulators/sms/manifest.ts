import { lazy } from 'react'
import { MessageSquare } from 'lucide-react'
import type { PluginManifest } from '../../types'

export const manifest: PluginManifest = {
  code: 'sms',
  name: 'plugins.sms.name',
  description: 'plugins.sms.description',
  category: 'simulator',
  icon: MessageSquare,
  defaultColor: 'gray',
  supportedFormats: ['text', 'image'],
  defaultEnabled: false,
  comingSoon: false,
  sortOrder: 7,
  injectTypes: ['sms'],
  playerRoute: '/sms',
  PlayerPage: lazy(() => import('./PlayerPage')),
  EventReceiver: lazy(() => import('./EventReceiver')),
  PreviewPopup: lazy(() => import('./PreviewPopup')),
  configSchema: null,
}
