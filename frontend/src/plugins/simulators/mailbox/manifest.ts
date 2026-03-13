import { lazy } from 'react'
import { Mail } from 'lucide-react'
import type { PluginManifest } from '../../types'

export const manifest: PluginManifest = {
  code: 'mailbox',
  name: 'plugins.mailbox.name',
  description: 'plugins.mailbox.description',
  category: 'simulator',
  icon: Mail,
  defaultColor: 'blue',
  supportedFormats: ['text', 'image'],
  defaultEnabled: true,
  comingSoon: false,
  sortOrder: 4,
  injectTypes: ['mail', 'doc'],
  playerRoute: '/mail',
  PlayerPage: lazy(() => import('./PlayerPage')),
  EventReceiver: lazy(() => import('./EventReceiver')),
  PreviewPopup: lazy(() => import('./PreviewPopup')),
  configSchema: null,
}
