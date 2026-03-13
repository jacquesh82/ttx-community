import { lazy } from 'react'
import { MessageCircle } from 'lucide-react'
import type { PluginManifest } from '../../types'

export const manifest: PluginManifest = {
  code: 'chat',
  name: 'plugins.chat.name',
  description: 'plugins.chat.description',
  category: 'simulator',
  icon: MessageCircle,
  defaultColor: 'teal',
  supportedFormats: ['text'],
  defaultEnabled: false,
  comingSoon: false,
  sortOrder: 5,
  injectTypes: [],
  playerRoute: '/chat',
  PlayerPage: lazy(() => import('./PlayerPage')),
  EventReceiver: lazy(() => import('./EventReceiver')),
  PreviewPopup: lazy(() => import('./PreviewPopup')),
  configSchema: null,
}
