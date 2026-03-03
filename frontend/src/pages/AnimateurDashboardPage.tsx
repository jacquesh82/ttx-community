/**
 * AnimateurDashboardPage
 * Main interface for exercise facilitators (animateurs)
 * 
 * Features:
 * - Exercise selection
 * - Real-time timeline with inject management
 * - Play/Pause controls
 * - Add/Delete injects
 */
import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Play,
  Pause,
  Square,
  Plus,
  Send,
  Trash2,
  Clock,
  Users,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Zap,
  ChevronDown,
  Wifi,
  WifiOff,
  Mail,
  Tv,
  MessageSquare,
  FileText,
  Settings,
} from 'lucide-react'
import { exercisesApi, injectsApi, crisisManagementApi, Inject, Exercise } from '../services/api'
import { useWebSocket } from '../hooks/useWebSocket'
import { WebSocketMessage } from '../services/websocketService'
import Modal from '../components/Modal'
import { useAppDialog } from '../contexts/AppDialogContext'

// Inject type configuration
const TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  mail: { label: 'Email', color: 'bg-blue-500', icon: Mail },
  twitter: { label: 'Réseau social', color: 'bg-sky-500', icon: MessageSquare },
  tv: { label: 'TV', color: 'bg-purple-500', icon: Tv },
  decision: { label: 'Décision', color: 'bg-orange-500', icon: AlertTriangle },
  score: { label: 'Score', color: 'bg-yellow-500', icon: FileText },
  system: { label: 'Système', color: 'bg-gray-500', icon: Settings },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  draft: { label: 'Brouillon', color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' },
  scheduled: { label: 'Planifié', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  sent: { label: 'Envoyé', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  cancelled: { label: 'Annulé', color: 'bg-red-100 text-red-700', dot: 'bg-red-400' },
}

export default function AnimateurDashboardPage() {
  const appDialog = useAppDialog()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  
  // State
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(null)
  const [showExerciseDropdown, setShowExerciseDropdown] = useState(false)
  const [showAddInjectModal, setShowAddInjectModal] = useState(false)
  const [showConfirmEndModal, setShowConfirmEndModal] = useState(false)
  const [injectForm, setInjectForm] = useState({
    title: '',
    description: '',
    type: 'mail' as string,
    time_offset: '',
    duration_min: '15',
    content_text: '',
  })
  const [timeInfo, setTimeInfo] = useState({
    exerciseTime: 'T+0h00',
    realTime: '--:--',
    elapsedMinutes: 0,
    progressPercent: 0,
  })

  // Fetch exercises list
  const { data: exercisesData } = useQuery({
    queryKey: ['exercises'],
    queryFn: () => exercisesApi.list({ page: 1, page_size: 100 }),
  })

  // Filter exercises that are running, paused, or draft (ready to start)
  const activeExercises = (exercisesData?.exercises || []).filter(
    (e: Exercise) => ['running', 'paused', 'draft'].includes(e.status)
  )

  // Fetch selected exercise data
  const { data: exercise, isLoading: isLoadingExercise } = useQuery({
    queryKey: ['exercise', selectedExerciseId],
    queryFn: () => exercisesApi.get(selectedExerciseId!),
    enabled: !!selectedExerciseId,
  })

  // Fetch injects for selected exercise
  const { data: injectsData, isLoading: isLoadingInjects } = useQuery({
    queryKey: ['injects-control', selectedExerciseId],
    queryFn: () => injectsApi.list({ exercise_id: selectedExerciseId!, page: 1, page_size: 500 }),
    enabled: !!selectedExerciseId,
  })

  // Fetch live dashboard
  const { data: dashboard, isLoading: isLoadingDashboard } = useQuery({
    queryKey: ['live-dashboard', selectedExerciseId],
    queryFn: () => crisisManagementApi.getLiveDashboard(selectedExerciseId!),
    enabled: !!selectedExerciseId && exercise?.status !== 'draft',
    refetchInterval: 5000,
  })

  const injects = injectsData?.injects ?? []
  const teamsState = dashboard?.teams_state ?? []
  const hasTeamsState = teamsState.length > 0

  // WebSocket connection
  const handleWebSocketMessage = useCallback(
    (message: WebSocketMessage) => {
      console.log('[Animateur] WebSocket message:', message.type)
      
      switch (message.type) {
        case 'inject:sent':
        case 'inject:created':
        case 'inject:updated':
        case 'inject:deleted':
          queryClient.invalidateQueries({ queryKey: ['injects-control', selectedExerciseId] })
          break
        case 'exercise:started':
        case 'exercise:paused':
        case 'exercise:ended':
        case 'exercise:updated':
          queryClient.invalidateQueries({ queryKey: ['exercise', selectedExerciseId] })
          queryClient.invalidateQueries({ queryKey: ['live-dashboard', selectedExerciseId] })
          break
        case 'event:new':
          queryClient.invalidateQueries({ queryKey: ['live-dashboard', selectedExerciseId] })
          break
      }
    },
    [queryClient, selectedExerciseId]
  )

  const { isConnected: isWsConnected } = useWebSocket({
    exerciseId: selectedExerciseId,
    enabled: !!selectedExerciseId && exercise?.status === 'running',
    onMessage: handleWebSocketMessage,
  })

  // Start exercise mutation
  const startMutation = useMutation({
    mutationFn: () => exercisesApi.start(selectedExerciseId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise', selectedExerciseId] })
      queryClient.invalidateQueries({ queryKey: ['exercises'] })
    },
  })

  // Pause exercise mutation
  const pauseMutation = useMutation({
    mutationFn: () => exercisesApi.pause(selectedExerciseId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise', selectedExerciseId] })
    },
  })

  // End exercise mutation
  const endMutation = useMutation({
    mutationFn: () => exercisesApi.end(selectedExerciseId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise', selectedExerciseId] })
      queryClient.invalidateQueries({ queryKey: ['exercises'] })
      setShowConfirmEndModal(false)
    },
  })

  // Send inject mutation
  const sendInjectMutation = useMutation({
    mutationFn: (injectId: number) => injectsApi.send(injectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['injects-control', selectedExerciseId] })
      queryClient.invalidateQueries({ queryKey: ['live-dashboard', selectedExerciseId] })
    },
  })

  // Delete inject mutation
  const deleteInjectMutation = useMutation({
    mutationFn: (injectId: number) => injectsApi.delete(injectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['injects-control', selectedExerciseId] })
    },
  })

  // Create inject mutation
  const createInjectMutation = useMutation({
    mutationFn: () =>
      injectsApi.create({
        exercise_id: selectedExerciseId!,
        title: injectForm.title || 'Nouvel inject',
        type: injectForm.type as any,
        description: injectForm.description || undefined,
        time_offset: injectForm.time_offset ? parseInt(injectForm.time_offset) : undefined,
        duration_min: injectForm.duration_min ? parseInt(injectForm.duration_min) : 15,
        content: { text: injectForm.content_text },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['injects-control', selectedExerciseId] })
      setShowAddInjectModal(false)
      setInjectForm({
        title: '',
        description: '',
        type: 'mail',
        time_offset: '',
        duration_min: '15',
        content_text: '',
      })
    },
  })

  // Update time info
  useEffect(() => {
    if (!exercise || !exercise.started_at || exercise.status === 'draft') {
      setTimeInfo({
        exerciseTime: 'T+0h00',
        realTime: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        elapsedMinutes: 0,
        progressPercent: 0,
      })
      return
    }

    const updateTime = () => {
      const startedAt = new Date(exercise.started_at!)
      const now = new Date()
      const elapsedMs = now.getTime() - startedAt.getTime()
      const elapsedMinutes = Math.floor(elapsedMs / 60000)
      const multiplier = parseFloat(exercise.time_multiplier) || 1
      const exerciseMinutes = Math.floor(elapsedMinutes * multiplier)

      const hours = Math.floor(exerciseMinutes / 60)
      const minutes = exerciseMinutes % 60
      const totalDurationMinutes = exercise.target_duration_hours * 60
      const progressPercent = Math.min(100, (exerciseMinutes / totalDurationMinutes) * 100)

      setTimeInfo({
        exerciseTime: `T+${hours}h${minutes.toString().padStart(2, '0')}`,
        realTime: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        elapsedMinutes: exerciseMinutes,
        progressPercent,
      })
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [exercise])

  // Auto-select first active exercise
  useEffect(() => {
    if (!selectedExerciseId && activeExercises.length > 0) {
      // Prefer running exercises, then paused, then draft
      const running = activeExercises.find((e: Exercise) => e.status === 'running')
      const paused = activeExercises.find((e: Exercise) => e.status === 'paused')
      setSelectedExerciseId((running || paused || activeExercises[0]).id)
    }
  }, [activeExercises, selectedExerciseId])

  // Get injects by status
  const upcomingInjects = injects
    .filter((i: Inject) => i.status === 'scheduled' || i.status === 'draft')
    .sort((a: Inject, b: Inject) => (a.time_offset ?? 0) - (b.time_offset ?? 0))

  const sentInjects = injects
    .filter((i: Inject) => i.status === 'sent')
    .sort((a: Inject, b: Inject) => (b.time_offset ?? 0) - (a.time_offset ?? 0))

  const isLoading = isLoadingExercise || isLoadingInjects

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold">🎮 Tableau Animateur</h1>

            {/* Exercise Selector */}
            <div className="relative">
              <button
                onClick={() => setShowExerciseDropdown(!showExerciseDropdown)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
              >
                <span className="font-medium">
                  {exercise?.name || 'Sélectionner un exercice'}
                </span>
                <span
                  className={`px-2 py-0.5 text-xs rounded ${
                    exercise?.status === 'running'
                      ? 'bg-green-600'
                      : exercise?.status === 'paused'
                      ? 'bg-yellow-600'
                      : 'bg-gray-600'
                  }`}
                >
                  {exercise?.status || '---'}
                </span>
                <ChevronDown size={16} />
              </button>

              {showExerciseDropdown && (
                <div className="absolute top-full left-0 mt-1 w-80 bg-gray-700 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
                  {activeExercises.length === 0 ? (
                    <div className="p-4 text-gray-400 text-center">Aucun exercice actif</div>
                  ) : (
                    activeExercises.map((ex: Exercise) => (
                      <button
                        key={ex.id}
                        onClick={() => {
                          setSelectedExerciseId(ex.id)
                          setShowExerciseDropdown(false)
                        }}
                        className={`w-full text-left px-4 py-3 hover:bg-gray-600 transition-colors ${
                          selectedExerciseId === ex.id ? 'bg-gray-600' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{ex.name}</span>
                          <span
                            className={`px-2 py-0.5 text-xs rounded ${
                              ex.status === 'running'
                                ? 'bg-green-600'
                                : ex.status === 'paused'
                                ? 'bg-yellow-600'
                                : 'bg-gray-600'
                            }`}
                          >
                            {ex.status}
                          </span>
                        </div>
                        {ex.description && (
                          <p className="text-sm text-gray-400 mt-1 line-clamp-1">
                            {ex.description}
                          </p>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Time and Controls */}
          <div className="flex items-center gap-6">
            {/* WebSocket Status */}
            <div className="flex items-center gap-2 text-sm">
              {isWsConnected ? (
                <Wifi size={16} className="text-green-500" />
              ) : (
                <WifiOff size={16} className="text-gray-500" />
              )}
              <span className="text-gray-400">
                {isWsConnected ? 'Connecté' : 'Hors ligne'}
              </span>
            </div>

            {/* Exercise Time */}
            {exercise && exercise.status !== 'draft' && (
              <div className="text-center">
                <div className="text-2xl font-mono font-bold text-white">
                  {timeInfo.exerciseTime}
                </div>
                <div className="text-xs text-gray-400">
                  {timeInfo.realTime} (réel)
                </div>
              </div>
            )}

            {/* Progress bar */}
            {exercise && exercise.status !== 'draft' && (
              <div className="w-32">
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-1000"
                    style={{ width: `${timeInfo.progressPercent}%` }}
                  />
                </div>
                <div className="text-xs text-gray-400 text-center mt-1">
                  {Math.round(timeInfo.progressPercent)}%
                </div>
              </div>
            )}

            {/* Control Buttons */}
            {exercise && (
              <div className="flex items-center gap-2">
                {exercise.status === 'draft' && (
                  <button
                    onClick={() => startMutation.mutate()}
                    disabled={startMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    <Play size={18} />
                    Démarrer
                  </button>
                )}

                {exercise.status === 'running' && (
                  <button
                    onClick={() => pauseMutation.mutate()}
                    disabled={pauseMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    <Pause size={18} />
                    Pause
                  </button>
                )}

                {exercise.status === 'paused' && (
                  <button
                    onClick={() => startMutation.mutate()}
                    disabled={startMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    <Play size={18} />
                    Reprendre
                  </button>
                )}

                {(exercise.status === 'running' || exercise.status === 'paused') && (
                  <button
                    onClick={() => setShowConfirmEndModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
                  >
                    <Square size={18} />
                    Terminer
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-73px)]">
        {/* Timeline Panel */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw size={32} className="animate-spin text-gray-500" />
            </div>
          ) : !selectedExerciseId ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Activity size={48} className="mb-4 opacity-50" />
              <p>Sélectionnez un exercice pour commencer</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Upcoming Injects */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Clock size={20} className="text-blue-400" />
                    Injects à venir ({upcomingInjects.length})
                  </h2>
                  <button
                    onClick={() => setShowAddInjectModal(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Plus size={16} />
                    Ajouter
                  </button>
                </div>

                {upcomingInjects.length === 0 ? (
                  <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
                    <Clock size={32} className="mx-auto mb-2 opacity-50" />
                    <p>Aucun inject planifié</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {upcomingInjects.map((inject: Inject) => {
                      const typeCfg = TYPE_CONFIG[inject.type] || TYPE_CONFIG.system
                      const statusCfg = STATUS_CONFIG[inject.status] || STATUS_CONFIG.draft
                      const TypeIcon = typeCfg.icon

                      return (
                        <div
                          key={inject.id}
                          className="bg-gray-800 rounded-lg p-4 flex items-center justify-between hover:bg-gray-750 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-lg ${typeCfg.color}`}>
                              <TypeIcon size={20} />
                            </div>
                            <div>
                              <h3 className="font-medium">{inject.title}</h3>
                              <div className="flex items-center gap-3 text-sm text-gray-400">
                                <span className="font-mono">
                                  T+{Math.floor((inject.time_offset ?? 0) / 60)}h
                                  {((inject.time_offset ?? 0) % 60).toString().padStart(2, '0')}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-xs ${statusCfg.color}`}>
                                  {statusCfg.label}
                                </span>
                                <span>{inject.duration_min} min</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => sendInjectMutation.mutate(inject.id)}
                              disabled={sendInjectMutation.isPending}
                              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                            >
                              <Send size={14} />
                              Envoyer
                            </button>
                            <button
                              onClick={async () => {
                                if (await appDialog.confirm('Supprimer cet inject ?')) {
                                  deleteInjectMutation.mutate(inject.id)
                                }
                              }}
                              disabled={deleteInjectMutation.isPending}
                              className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              {/* Sent Injects */}
              <section>
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                  <CheckCircle size={20} className="text-green-400" />
                  Injects envoyés ({sentInjects.length})
                </h2>

                {sentInjects.length === 0 ? (
                  <div className="bg-gray-800 rounded-lg p-6 text-center text-gray-400">
                    <p>Aucun inject envoyé</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sentInjects.slice(0, 10).map((inject: Inject) => {
                      const typeCfg = TYPE_CONFIG[inject.type] || TYPE_CONFIG.system
                      const TypeIcon = typeCfg.icon

                      return (
                        <div
                          key={inject.id}
                          className="bg-gray-800/50 rounded-lg p-4 flex items-center justify-between opacity-75"
                        >
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-lg ${typeCfg.color}`}>
                              <TypeIcon size={18} />
                            </div>
                            <div>
                              <h3 className="font-medium">{inject.title}</h3>
                              <div className="flex items-center gap-3 text-sm text-gray-400">
                                <span className="font-mono">
                                  T+{Math.floor((inject.time_offset ?? 0) / 60)}h
                                  {((inject.time_offset ?? 0) % 60).toString().padStart(2, '0')}
                                </span>
                                {inject.sent_at && (
                                  <span>
                                    Envoyé à{' '}
                                    {new Date(inject.sent_at).toLocaleTimeString('fr-FR', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <span className="px-2 py-0.5 rounded text-xs bg-green-900/50 text-green-400">
                            Envoyé
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="w-80 bg-gray-800 border-l border-gray-700 overflow-y-auto">
          {selectedExerciseId && (
            <div className="p-4 space-y-6">
              {/* Teams Status */}
              <section>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Users size={16} />
                  Équipes
                </h3>
                {isLoadingDashboard ? (
                  <div className="text-center py-4 text-gray-500">
                    <RefreshCw size={20} className="animate-spin mx-auto" />
                  </div>
                ) : hasTeamsState ? (
                  <div className="space-y-2">
                    {teamsState.map((team: any) => (
                      <div key={team.team_id} className="bg-gray-700/50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">{team.team_name}</span>
                          <span className="text-xs text-gray-400">
                            {team.treated}/{team.total}
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-600 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 transition-all"
                            style={{
                              width: `${team.total > 0 ? (team.treated / team.total) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Aucune équipe assignée</p>
                )}
              </section>

              {/* Indicators */}
              {dashboard?.indicators && (
                <section>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Zap size={16} />
                    Indicateurs
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <IndicatorCard
                      label="Stress"
                      value={dashboard.indicators.stress}
                      color="red"
                    />
                    <IndicatorCard
                      label="Saturation"
                      value={dashboard.indicators.saturation}
                      color="orange"
                    />
                    <IndicatorCard
                      label="Com. externe"
                      value={dashboard.indicators.communication_external}
                      color="blue"
                    />
                    <IndicatorCard
                      label="Maitrise tech."
                      value={dashboard.indicators.technical_mastery}
                      color="green"
                    />
                  </div>
                </section>
              )}

              {/* Recent Events */}
              {dashboard?.timeline_live && dashboard.timeline_live.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Activity size={16} />
                    Derniers événements
                  </h3>
                  <div className="space-y-2">
                    {dashboard.timeline_live.slice(0, 5).map((event: any) => (
                      <div
                        key={event.id}
                        className="bg-gray-700/50 rounded-lg p-2 text-sm"
                      >
                        <div className="font-medium">{event.type}</div>
                        <div className="text-xs text-gray-400">
                          {new Date(event.ts).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Add Inject Modal */}
      <Modal
        isOpen={showAddInjectModal}
        onClose={() => setShowAddInjectModal(false)}
        title="Ajouter un inject"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label>
            <input
              type="text"
              value={injectForm.title}
              onChange={(e) => setInjectForm({ ...injectForm, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Titre de l'inject"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={injectForm.type}
                onChange={(e) => setInjectForm({ ...injectForm, type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>
                    {cfg.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">T+ (minutes)</label>
              <input
                type="number"
                value={injectForm.time_offset}
                onChange={(e) => setInjectForm({ ...injectForm, time_offset: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="0, 30, 60..."
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Durée (min)</label>
            <input
              type="number"
              value={injectForm.duration_min}
              onChange={(e) => setInjectForm({ ...injectForm, duration_min: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              min="1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={injectForm.description}
              onChange={(e) => setInjectForm({ ...injectForm, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contenu</label>
            <textarea
              value={injectForm.content_text}
              onChange={(e) => setInjectForm({ ...injectForm, content_text: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button
              onClick={() => setShowAddInjectModal(false)}
              className="px-4 py-2 text-sm bg-gray-100 rounded hover:bg-gray-200"
            >
              Annuler
            </button>
            <button
              onClick={() => createInjectMutation.mutate()}
              disabled={!injectForm.title.trim() || createInjectMutation.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {createInjectMutation.isPending ? 'Création...' : 'Créer'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirm End Modal */}
      <Modal
        isOpen={showConfirmEndModal}
        onClose={() => setShowConfirmEndModal(false)}
        title="Terminer l'exercice"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            Êtes-vous sûr de vouloir terminer l'exercice <strong>{exercise?.name}</strong> ?
          </p>
          <p className="text-sm text-gray-500">
            Cette action mettra fin à l'exercice pour tous les participants.
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <button
              onClick={() => setShowConfirmEndModal(false)}
              className="px-4 py-2 text-sm bg-gray-100 rounded hover:bg-gray-200"
            >
              Annuler
            </button>
            <button
              onClick={() => endMutation.mutate()}
              disabled={endMutation.isPending}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            >
              {endMutation.isPending ? 'Terminaison...' : 'Terminer'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// Indicator Card Component
function IndicatorCard({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: 'red' | 'orange' | 'blue' | 'green'
}) {
  const colorClasses = {
    red: 'bg-red-900/50 text-red-400',
    orange: 'bg-orange-900/50 text-orange-400',
    blue: 'bg-blue-900/50 text-blue-400',
    green: 'bg-green-900/50 text-green-400',
  }

  return (
    <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
      <div className="text-xs opacity-75">{label}</div>
      <div className="text-lg font-bold">{value ?? 0}</div>
    </div>
  )
}
