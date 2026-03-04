import { Link } from 'react-router-dom'
import { AlertTriangle, Inbox, CheckCircle, MessageCircle, Plus, ChevronRight } from 'lucide-react'
import { PlayerStats, Notification } from '../../services/playerApi'

interface PlayerRightPanelProps {
  stats: PlayerStats
  notifications: Notification[]
  exerciseId: string
}

export default function PlayerRightPanel({
  stats,
  notifications,
  exerciseId,
}: PlayerRightPanelProps) {
  const pendingInjects = notifications.filter(
    (n) => n.type === 'inject.received' && !n.is_read
  )

  return (
    <aside className="w-72 bg-gray-900 border-l border-gray-700 flex flex-col overflow-hidden">
      {/* À traiter section */}
      <div className="p-4 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          À traiter
        </h3>
        <div className="space-y-2">
          {stats.injects_pending > 0 && (
            <div className="flex items-center justify-between p-2 bg-red-900/30 rounded-lg border border-red-800">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-400" />
                <span className="text-sm text-red-300">Injects non traités</span>
              </div>
              <span className="text-lg font-bold text-red-400">{stats.injects_pending}</span>
            </div>
          )}
          {stats.injects_in_progress > 0 && (
            <div className="flex items-center justify-between p-2 bg-yellow-900/30 rounded-lg border border-yellow-800">
              <div className="flex items-center gap-2">
                <Inbox size={16} className="text-yellow-400" />
                <span className="text-sm text-yellow-300">En cours</span>
              </div>
              <span className="text-lg font-bold text-yellow-400">{stats.injects_in_progress}</span>
            </div>
          )}
          {stats.injects_treated > 0 && (
            <div className="flex items-center justify-between p-2 bg-green-900/30 rounded-lg border border-green-800">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-green-400" />
                <span className="text-sm text-green-300">Traités</span>
              </div>
              <span className="text-lg font-bold text-green-400">{stats.injects_treated}</span>
            </div>
          )}
          {stats.injects_pending === 0 && stats.injects_in_progress === 0 && (
            <p className="text-sm text-gray-500 italic">Aucun inject en attente</p>
          )}
        </div>
      </div>

      {/* Derniers injects section */}
      <div className="flex-1 p-4 overflow-auto">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Derniers injects
        </h3>
        {pendingInjects.length > 0 ? (
          <ul className="space-y-2">
            {pendingInjects.slice(0, 5).map((notification) => (
              <li key={notification.id}>
                <Link
                  to={`/play/${exerciseId}/timeline?event=${notification.entity_id}`}
                  className="block p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-lg">{getCriticityIcon(notification.criticity)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {notification.title}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatRelativeTime(notification.created_at)}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500 italic">Aucun inject récent</p>
        )}
      </div>

      {/* Actions rapides section */}
      <div className="p-4 border-t border-gray-700">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Raccourcis
        </h3>
        <div className="space-y-2">
          <Link
            to={`/play/${exerciseId}/decisions?action=new`}
            className="flex items-center gap-2 p-2 bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors text-sm"
          >
            <Plus size={16} />
            <span>Nouvelle décision</span>
          </Link>
          <button
            className="w-full flex items-center justify-between p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-sm"
          >
            <div className="flex items-center gap-2">
              <MessageCircle size={16} />
              <span>Contacter l'animateur</span>
            </div>
            <ChevronRight size={16} className="text-gray-400" />
          </button>
        </div>
      </div>
    </aside>
  )
}

function getCriticityIcon(criticity: string): string {
  switch (criticity) {
    case 'critical':
      return '🔴'
    case 'important':
      return '🟡'
    default:
      return '🔵'
  }
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)

  if (diffMins < 1) return 'À l\'instant'
  if (diffMins < 60) return `Il y a ${diffMins} min`
  if (diffHours < 24) return `Il y a ${diffHours}h`
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}