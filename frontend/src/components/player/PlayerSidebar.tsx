import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Home,
  Clock,
  FileText,
  FolderOpen,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import { getSimulatorPlugins } from '../../plugins/registry'

interface PlayerSidebarProps {
  exerciseId: string
}

interface NavItem {
  path: string
  icon: LucideIcon
  label?: string
  labelKey?: string
}

// Static nav items that are not plugins
const staticItemsBefore: NavItem[] = [
  { path: '', icon: Home, label: 'Accueil' },
  { path: '/timeline', icon: Clock, label: 'Timeline' },
]

const staticItemsAfter: NavItem[] = [
  { path: '/decisions', icon: FileText, label: 'Décisions' },
  { path: '/media', icon: FolderOpen, label: 'Médiathèque' },
]

// Build plugin-driven nav items from registry
const pluginNavItems: NavItem[] = getSimulatorPlugins()
  .filter((p) => p.playerRoute !== null)
  .map((p) => ({
    path: p.playerRoute!,
    icon: p.icon,
    labelKey: p.name,
  }))

const navItems: NavItem[] = [
  ...staticItemsBefore,
  ...pluginNavItems,
  ...staticItemsAfter,
]

export default function PlayerSidebar({ exerciseId }: PlayerSidebarProps) {
  const { t } = useTranslation()
  return (
    <aside className="w-48 bg-gray-900 border-r border-gray-700 flex flex-col">
      {/* Navigation header */}
      <div className="p-3 border-b border-gray-700">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          NAVIGATION
        </h3>
      </div>

      {/* Navigation items */}
      <nav className="flex-1 py-2">
        <ul className="space-y-0.5 px-2">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={`/play/${exerciseId}${item.path}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded transition-colors ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <ChevronRight size={16} className="text-white" />}
                    {!isActive && <span className="w-4" />}
                    <item.icon size={18} />
                    <span className="text-sm">{item.labelKey ? t(item.labelKey) : item.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
