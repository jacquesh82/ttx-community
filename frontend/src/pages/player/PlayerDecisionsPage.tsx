import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { playerApi, Decision } from '../../services/playerApi'
import { FileText, Plus, CheckCircle, Clock, ChevronRight, X } from 'lucide-react'

export default function PlayerDecisionsPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(searchParams.get('action') === 'new')

  // Fetch decisions
  const { data: decisions = [], isLoading } = useQuery({
    queryKey: ['player-decisions', exerciseId],
    queryFn: () => playerApi.getDecisions(parseInt(exerciseId!)),
    enabled: !!exerciseId,
  })

  // Create decision mutation
  const createMutation = useMutation({
    mutationFn: (data: { title: string; description: string; impact: string }) =>
      playerApi.createDecision(parseInt(exerciseId!), data),
    onSuccess: () => {
      setShowForm(false)
      setSearchParams({})
      queryClient.invalidateQueries({ queryKey: ['player-decisions', exerciseId] })
      queryClient.invalidateQueries({ queryKey: ['player-context', exerciseId] })
    },
  })

  const handleCreateDecision = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    createMutation.mutate({
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      impact: formData.get('impact') as string,
    })
  }

  const formatTime = (dateString?: string | null) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Décisions</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          <Plus size={20} />
          Nouvelle décision
        </button>
      </div>

      {/* Create decision form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">Nouvelle décision</h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-1 hover:bg-gray-700 rounded"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleCreateDecision} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Titre *</label>
                <input
                  type="text"
                  name="title"
                  required
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  placeholder="Titre de la décision"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Description</label>
                <textarea
                  name="description"
                  rows={3}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  placeholder="Décrivez la décision prise..."
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Impact</label>
                <textarea
                  name="impact"
                  rows={2}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  placeholder="Impact de cette décision..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2"
                >
                  {createMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Création...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={18} />
                      Enregistrer
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-900/50 rounded-lg">
              <CheckCircle className="text-green-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-400">Total décisions</p>
              <p className="text-2xl font-bold text-white">{decisions.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-900/50 rounded-lg">
              <Clock className="text-blue-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-400">Aujourd'hui</p>
              <p className="text-2xl font-bold text-white">
                {decisions.filter((d) => {
                  if (!d.decided_at) return false
                  const today = new Date()
                  const decidedAt = new Date(d.decided_at)
                  return (
                    today.getDate() === decidedAt.getDate() &&
                    today.getMonth() === decidedAt.getMonth() &&
                    today.getFullYear() === decidedAt.getFullYear()
                  )
                }).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-900/50 rounded-lg">
              <FileText className="text-yellow-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-400">Cette semaine</p>
              <p className="text-2xl font-bold text-white">
                {decisions.filter((d) => {
                  if (!d.decided_at) return false
                  const weekAgo = new Date()
                  weekAgo.setDate(weekAgo.getDate() - 7)
                  return new Date(d.decided_at) >= weekAgo
                }).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Decisions list */}
      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Historique des décisions</h2>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4">Chargement...</p>
          </div>
        ) : decisions.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <FileText size={48} className="mx-auto mb-3 opacity-50" />
            <p>Aucune décision enregistrée</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-sm"
            >
              Créer une première décision
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-gray-700">
            {decisions.map((decision) => (
              <li key={decision.id}>
                <div className="p-4 hover:bg-gray-700/50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-green-900/50 rounded-lg flex-shrink-0">
                      <FileText size={18} className="text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-white">{decision.title}</p>
                          {decision.description && (
                            <p className="text-sm text-gray-400 mt-1">
                              {decision.description}
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm text-gray-400">
                            {formatDate(decision.decided_at)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatTime(decision.decided_at)}
                          </p>
                        </div>
                      </div>
                      {decision.impact && (
                        <div className="mt-2 p-2 bg-gray-700/50 rounded text-sm text-gray-300">
                          <span className="font-medium text-gray-400">Impact :</span>{' '}
                          {decision.impact}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
