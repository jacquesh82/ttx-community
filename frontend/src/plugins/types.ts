import type { ComponentType, LazyExoticComponent } from 'react'
import type { LucideIcon } from 'lucide-react'

export type PluginCategory = 'simulator' | 'tool' | 'integration'
export type DataFormat = 'text' | 'audio' | 'video' | 'image'

export interface PluginManifest {
  /** Unique key matching plugin_type in DB (e.g. "mailbox") */
  code: string
  /** i18n key for the display name (e.g. "plugins.mailbox.name") */
  name: string
  /** i18n key for the description */
  description: string
  category: PluginCategory
  icon: LucideIcon
  defaultColor: string
  supportedFormats: DataFormat[]
  defaultEnabled: boolean
  comingSoon: boolean
  sortOrder: number
  /** Inject types handled by this plugin (e.g. ['mail', 'doc'] for mailbox) */
  injectTypes: string[]
  /** Player route segment (e.g. '/mail'), null if no dedicated page */
  playerRoute: string | null
  /** Lazy-loaded player page component */
  PlayerPage: LazyExoticComponent<ComponentType<any>> | null
  /** Lazy-loaded event receiver component for animateur dashboard */
  EventReceiver: LazyExoticComponent<ComponentType<any>> | null
  /** Lazy-loaded preview popup component */
  PreviewPopup: LazyExoticComponent<ComponentType<any>> | null
  configSchema: Record<string, any> | null
}
