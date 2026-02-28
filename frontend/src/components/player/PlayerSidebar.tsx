import { NavLink } from 'react-router-dom'
import {
  Home,
  Clock,
  Mail,
  Tv,
  MessageCircle,
  FileText,
  FolderOpen,
  ChevronRight,
  Phone,
  Newspaper,
  MessageSquare,
  AtSign,
} from 'lucide-react'

interface PlayerSidebarProps {
  exerciseId: string
}

const navItems = [
  { path: '', icon: Home, label: 'Accueil' },
  { path: '/timeline', icon: Clock, label: 'Timeline' },
  { path: '/mail', icon: Mail, label: 'Emails' },
  { path: '/chat', icon: MessageCircle, label: 'Chat équipe' },
  { path: '/sms', icon: MessageSquare, label: 'SMS' },
  { path: '/phone', icon: Phone, label: 'Téléphone' },
  { path: '/social', icon: AtSign, label: 'Réseaux sociaux' },
  { path: '/press', icon: Newspaper, label: 'Presse' },
  { path: '/tv', icon: Tv, label: 'TV Live' },
  { path: '/decisions', icon: FileText, label: 'Décisions' },
  { path: '/media', icon: FolderOpen, label: 'Médiathèque' },
]

export default function PlayerSidebar({ exerciseId }: PlayerSidebarProps) {
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
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <ChevronRight size={16} className="text-white" />}
                    {!isActive && <span className="w-4" />}
                    <item.icon size={18} />
                    <span className="text-sm">{item.label}</span>
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
