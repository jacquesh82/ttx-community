import { useState, useEffect } from 'react'
import { auditApi, AuditLog } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import {
  Shield,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  Activity,
  Users,
  Calendar,
  AlertTriangle,
} from 'lucide-react'
import clsx from 'clsx'

interface AuditStats {
  total_logs: number
  logs_today: number
  logs_this_week: number
  unique_users: number
  top_actions: Array<{ action: string; count: number }>
  top_users: Array<{ user_id: number; username: string; count: number }>
}

export default function AuditPage() {
  const { user } = useAuthStore()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [stats, setStats] = useState<AuditStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [entityTypeFilter, setEntityTypeFilter] = useState('')

  const totalPages = Math.ceil(total / pageSize)

  useEffect(() => {
    if (user?.role !== 'admin') return
    fetchLogs()
    fetchStats()
  }, [page, actionFilter, entityTypeFilter])

  const fetchLogs = async () => {
    try {
      setLoading(true)
      const response = await auditApi.listLogs({
        page,
        page_size: pageSize,
        search: search || undefined,
        action: actionFilter || undefined,
        entity_type: entityTypeFilter || undefined,
      })
      setLogs(response.logs)
      setTotal(response.total)
    } catch (error) {
      console.error('Failed to fetch audit logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await auditApi.getStats()
      setStats(response)
    } catch (error) {
      console.error('Failed to fetch audit stats:', error)
    }
  }

  const handleSearch = () => {
    setPage(1)
    fetchLogs()
  }

  const handleExport = async () => {
    try {
      const blob = await auditApi.exportCsv({
        action: actionFilter || undefined,
        entity_type: entityTypeFilter || undefined,
      })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Failed to export audit logs:', error)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getActionColor = (action: string) => {
    if (action.includes('delete')) return 'text-red-400'
    if (action.includes('create')) return 'text-green-400'
    if (action.includes('update')) return 'text-yellow-400'
    if (action.includes('login')) return 'text-primary-400'
    return 'text-gray-300'
  }

  if (user?.role !== 'admin') {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
        <h2 className="mt-2 text-xl font-semibold text-white">Accès refusé</h2>
        <p className="mt-2 text-gray-400">Vous n'avez pas les permissions pour accéder à cette page.</p>
      </div>
    )
  }

  return (
    <div className="options-theme space-y-6">
      {/* Header */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Audit & Conformité</h1>
            <p className="text-sm text-gray-400 mt-1">Journal d'audit et suivi des actions utilisateurs</p>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
          >
            <Download className="h-4 w-4" />
            Exporter CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <div className="flex items-center">
              <Activity className="h-8 w-8 text-primary-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-400">Total événements</p>
                <p className="text-2xl font-bold text-white">{stats.total_logs}</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <div className="flex items-center">
              <Calendar className="h-8 w-8 text-green-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-400">Aujourd'hui</p>
                <p className="text-2xl font-bold text-white">{stats.logs_today}</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <div className="flex items-center">
              <Calendar className="h-8 w-8 text-yellow-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-400">Cette semaine</p>
                <p className="text-2xl font-bold text-white">{stats.logs_this_week}</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-purple-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-400">Utilisateurs actifs</p>
                <p className="text-2xl font-bold text-white">{stats.unique_users}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Rechercher..."
                className="w-full pl-10 pr-4 py-2 border bg-gray-900 text-white border-gray-600 rounded-lg focus:ring-primary-500 focus:border-primary-500"
              />
              <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            </div>
          </div>
          <input
            type="text"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder="Action (ex: login, create)"
            className="w-48 px-3 py-2 border bg-gray-900 text-white border-gray-600 rounded-lg focus:ring-primary-500 focus:border-primary-500"
          />
          <input
            type="text"
            value={entityTypeFilter}
            onChange={(e) => setEntityTypeFilter(e.target.value)}
            placeholder="Type entité (ex: user, exercise)"
            className="w-48 px-3 py-2 border bg-gray-900 text-white border-gray-600 rounded-lg focus:ring-primary-500 focus:border-primary-500"
          />
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600"
          >
            Filtrer
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Chargement...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Aucun log trouvé</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Utilisateur
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Entité
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  IP
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-700/40">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                    {formatDate(log.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-white">
                      {log.user_username || 'Système'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={clsx('text-sm font-medium', getActionColor(log.action))}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                    {log.entity_type && (
                      <span>
                        {log.entity_type}
                        {log.entity_id && ` #${log.entity_id}`}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                    {log.ip_address || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-gray-800 px-4 py-3 flex items-center justify-between border-t border-gray-700 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-600 text-sm font-medium rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600"
              >
                Précédent
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-600 text-sm font-medium rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600"
              >
                Suivant
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-300">
                  Affichage de <span className="font-medium">{(page - 1) * pageSize + 1}</span> à{' '}
                  <span className="font-medium">{Math.min(page * pageSize, total)}</span> sur{' '}
                  <span className="font-medium">{total}</span> résultats
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-600 bg-gray-700 text-sm font-medium text-gray-300 hover:bg-gray-600"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum = Math.max(1, Math.min(page - 2 + i, totalPages - 4 + i))
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={clsx(
                          'relative inline-flex items-center px-4 py-2 border text-sm font-medium',
                          page === pageNum
                            ? 'z-10 bg-primary-900/30 border-primary-500 text-primary-400'
                            : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                        )}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-600 bg-gray-700 text-sm font-medium text-gray-300 hover:bg-gray-600"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Top Actions & Users */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h3 className="text-lg font-medium text-white mb-4">Actions les plus fréquentes</h3>
            <div className="space-y-3">
              {stats.top_actions.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">{item.action}</span>
                  <span className="text-sm font-medium text-white">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h3 className="text-lg font-medium text-white mb-4">Utilisateurs les plus actifs</h3>
            <div className="space-y-3">
              {stats.top_users.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">{item.username}</span>
                  <span className="text-sm font-medium text-white">{item.count} actions</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
