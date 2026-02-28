import { useParams, Link } from 'react-router-dom'
import { usePlayer } from '../../contexts/PlayerContext'
import {
  AlertTriangle,
  Mail,
  Tv,
  Clock,
  FileText,
  ChevronRight,
  Bell,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react'

export default function PlayerHomePage() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const { context, injects, decisions, notifications } = usePlayer()

  const stats = context?.stats || { injects_pending: 0, messages_unread: 0 }
  const recentEvents = notifications.slice(0, 5)

  // Get pending injects (delivered but not treated)
  const pendingInjects = injects.filter(
    (i) => i.delivery_status === 'delivered' || i.delivery_status === 'opened'
  )

  // Open decisions count
  const openDecisions = decisions.filter((d) => !d.decided_at)

  return (
    <div className="h-full flex flex-col">
      {/* Main content grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Derniers événements */}
        <div className="bg-gray-800 rounded-lg border border-gray-700">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              DERNIERS ÉVÉNEMENTS
            </h2>
          </div>
          <div className="p-4">
            {recentEvents.length > 0 ? (
              <ul className="space-y-1">
                {recentEvents.map((event) => {
                  const config = getEventConfig(event.type)
                  const Icon = config.icon
                  return (
                    <li
                      key={event.id}
                      className="flex items-start gap-3 p-2.5 hover:bg-gray-700/50 rounded-lg transition-colors"
                    >
                      <div className={`p-1.5 rounded-lg shrink-0 ${config.color}`}>
                        <Icon size={13} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{event.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatRelativeTime(event.created_at)}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <Clock size={48} className="mx-auto mb-3 opacity-50" />
                <p>Aucun événement récent</p>
              </div>
            )}
          </div>
        </div>

        {/* À traiter */}
        <div className="bg-gray-800 rounded-lg border border-gray-700">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              À TRAITER
            </h2>
          </div>
          <div className="p-4 space-y-3">
            {/* Injects non traités — list view */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-red-300 font-medium">Injects à traiter</span>
                {pendingInjects.length > 0 && (
                  <span className="text-xs bg-red-900/50 text-red-400 rounded-full px-2 py-0.5 font-bold">
                    {pendingInjects.length}
                  </span>
                )}
              </div>
              {pendingInjects.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-3">✓ Tout est traité</p>
              ) : (
                <div className="space-y-1.5">
                  {pendingInjects.slice(0, 3).map((inject) => (
                    <Link
                      key={inject.id}
                      to={`/play/${exerciseId}/timeline`}
                      className="flex items-center gap-2.5 p-2 bg-red-900/20 rounded border border-red-800/40 hover:bg-red-900/40 transition-colors"
                    >
                      <AlertTriangle size={13} className="text-red-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-red-200 truncate font-medium">{inject.title}</p>
                        <p className="text-[10px] text-red-400/60 capitalize">{inject.type || ''}</p>
                      </div>
                      <ChevronRight size={12} className="text-red-400/40 shrink-0" />
                    </Link>
                  ))}
                  {pendingInjects.length > 3 && (
                    <Link
                      to={`/play/${exerciseId}/timeline`}
                      className="block text-center text-xs text-red-400/70 hover:text-red-300 py-1"
                    >
                      +{pendingInjects.length - 3} autres →
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Messages non lus */}
            <Link
              to={`/play/${exerciseId}/mail`}
              className="flex items-center justify-between p-3 bg-blue-900/30 rounded-lg border border-blue-800 hover:bg-blue-900/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Mail size={20} className="text-blue-400" />
                <span className="text-blue-300">Messages non lus</span>
              </div>
              <span className="text-2xl font-bold text-blue-400">
                {stats?.messages_unread || 0}
              </span>
            </Link>

            {/* Décisions ouvertes */}
            <Link
              to={`/play/${exerciseId}/decisions`}
              className="flex items-center justify-between p-3 bg-yellow-900/30 rounded-lg border border-yellow-800 hover:bg-yellow-900/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <FileText size={20} className="text-yellow-400" />
                <span className="text-yellow-300">Décisions ouvertes</span>
              </div>
              <span className="text-2xl font-bold text-yellow-400">
                {openDecisions.length}
              </span>
            </Link>
          </div>
        </div>
      </div>

      {/* Quick stats footer */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link
          to={`/play/${exerciseId}/tv`}
          className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-purple-500 transition-colors"
        >
          <Tv className="text-purple-400" size={20} />
          <span className="text-sm text-gray-300">TV Live</span>
        </Link>
        <Link
          to={`/play/${exerciseId}/chat`}
          className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-blue-500 transition-colors"
        >
          <MessageCircle className="text-blue-400" size={20} />
          <span className="text-sm text-gray-300">Chat équipe</span>
        </Link>
        <Link
          to={`/play/${exerciseId}/timeline`}
          className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-yellow-500 transition-colors"
        >
          <Clock className="text-yellow-400" size={20} />
          <span className="text-sm text-gray-300">Timeline</span>
        </Link>
        <Link
          to={`/play/${exerciseId}/media`}
          className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-green-500 transition-colors"
        >
          <FileText className="text-green-400" size={20} />
          <span className="text-sm text-gray-300">Médiathèque</span>
        </Link>
      </div>
    </div>
  )
}

function getEventConfig(type: string): { icon: LucideIcon; color: string } {
  switch (type) {
    case 'inject_sent':
    case 'inject:sent':
    case 'inject.received':
      return { icon: AlertTriangle, color: 'bg-red-900/40 text-red-400' }
    case 'mail_opened':
    case 'mail.received':
      return { icon: Mail, color: 'bg-blue-900/40 text-blue-400' }
    case 'tv_segment_started':
    case 'tv.broadcast':
      return { icon: Tv, color: 'bg-purple-900/40 text-purple-400' }
    case 'decision_logged':
      return { icon: FileText, color: 'bg-yellow-900/40 text-yellow-400' }
    default:
      return { icon: Bell, color: 'bg-gray-700/50 text-gray-400' }
  }
}

function formatRelativeTime(dateString: string): string {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)

  if (diffMins < 1) return "À l'instant"
  if (diffMins < 60) return `Il y a ${diffMins} min`
  if (diffHours < 24) return `Il y a ${diffHours}h`
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}