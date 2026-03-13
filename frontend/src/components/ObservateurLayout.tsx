import { ReactNode } from 'react'
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { authApi } from '../services/api'
import { useQuery } from '@tanstack/react-query'
import { playerApi } from '../services/playerApi'
import {
  Eye,
  Home,
  Clock,
  Mail,
  MessageSquare,
  Tv,
  BarChart2,
  Image,
  LogOut,
  ChevronLeft,
  Activity,
} from 'lucide-react'
import clsx from 'clsx'
import LoadingScreen from './LoadingScreen'

interface ObservateurLayoutProps {
  children: ReactNode
}

/**
 * Layout dédié à l'observateur.
 * Donne accès à tous les écrans de l'exercice en lecture seule.
 * Aucun bouton d'action n'est disponible depuis ce layout.
 */
export default function ObservateurLayout({ children }: ObservateurLayoutProps) {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  const { data: context, isLoading, error } = useQuery({
    queryKey: ['obs-context', exerciseId],
    queryFn: () => playerApi.getContext(parseInt(exerciseId!)),
    enabled: !!exerciseId,
    refetchInterval: 30000,
  })

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch (_) {}
    logout()
    navigate('/login')
  }

  const statusColor: Record<string, string> = {
    running: 'bg-green-500',
    paused: 'bg-yellow-500',
    completed: 'bg-gray-500',
    draft: 'bg-gray-400',
    archived: 'bg-gray-600',
  }

  const statusLabel: Record<string, string> = {
    running: 'En cours',
    paused: 'En pause',
    completed: 'Terminé',
    draft: 'Brouillon',
    archived: 'Archivé',
  }

  const navItems = [
    { to: `/observe/${exerciseId}`, icon: Home, label: 'Vue générale' },
    { to: `/observe/${exerciseId}/timeline`, icon: Clock, label: 'Timeline' },
    { to: `/observe/${exerciseId}/mail`, icon: Mail, label: 'Webmail (tous)' },
    { to: `/observe/${exerciseId}/chat`, icon: MessageSquare, label: 'Chat équipes' },
    { to: `/observe/${exerciseId}/tv`, icon: Tv, label: 'TV Live' },
    { to: `/observe/${exerciseId}/media`, icon: Image, label: 'Médias' },
    { to: `/observe/${exerciseId}/scores`, icon: BarChart2, label: 'Scores & Notes' },
  ]

  if (isLoading) {
    return <LoadingScreen fullPage />
  }

  if (error || !context) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">Impossible de charger l'exercice</p>
          <button
            onClick={() => navigate('/exercises')}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
          >
            Retour aux exercices
          </button>
        </div>
      </div>
    )
  }

  const exercise = context.exercise

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-purple-800 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          {/* Back to exercises */}
          <Link
            to="/exercises"
            className="text-gray-400 hover:text-white flex items-center gap-1 text-sm"
          >
            <ChevronLeft size={16} />
            <span className="hidden sm:inline">Exercices</span>
          </Link>

          {/* Exercise info */}
          <div className="flex items-center gap-2">
            <span
              className={clsx(
                'inline-block w-2 h-2 rounded-full flex-shrink-0',
                statusColor[exercise.status] ?? 'bg-gray-400'
              )}
            />
            <span className="font-semibold text-white truncate max-w-xs">
              {exercise.name}
            </span>
            <span className="text-xs text-gray-400 hidden sm:inline">
              ({statusLabel[exercise.status] ?? exercise.status})
            </span>
          </div>

          {/* Exercise time */}
          {context.exercise_time && (
            <div className="flex items-center gap-1 text-xs text-gray-300 bg-gray-700 px-2 py-1 rounded">
              <Activity size={12} />
              <span>{context.exercise_time}</span>
            </div>
          )}
        </div>

        {/* Observer badge + user */}
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 bg-purple-900 border border-purple-600 text-purple-200 text-xs px-2 py-1 rounded-full font-medium">
            <Eye size={12} />
            OBSERVATEUR
          </span>
          <span className="text-sm text-gray-300 hidden sm:block">{user?.username}</span>
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-white p-1"
            title="Déconnexion"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 bg-gray-800 border-r border-gray-700 flex-shrink-0 flex flex-col">
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {navItems.map(({ to, icon: Icon, label }) => {
              const isActive = location.pathname === to
              return (
                <Link
                  key={to}
                  to={to}
                  className={clsx(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                    isActive
                      ? 'bg-purple-800 text-white font-medium'
                      : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                  )}
                >
                  <Icon size={16} />
                  {label}
                </Link>
              )
            })}
          </nav>

          {/* Read-only notice */}
          <div className="p-3 border-t border-gray-700">
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Eye size={11} />
              Mode lecture seule
            </p>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto bg-gray-800">
          {/* Read-only banner */}
          <div className="bg-purple-900/40 border-b border-purple-800/50 px-4 py-2 flex items-center gap-2">
            <Eye size={14} className="text-purple-400" />
            <span className="text-xs text-purple-300">
              Vous observez cet exercice en lecture seule – aucune action n'est disponible depuis cette vue.
            </span>
          </div>

          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
