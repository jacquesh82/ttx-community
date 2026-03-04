import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, Pause, Play, RefreshCw, RotateCcw, Send } from 'lucide-react'
import {
  crisisManagementApi,
  exercisesApi,
  exerciseUsersApi,
  injectBankApi,
  injectsApi,
  type LiveDashboardResponse,
} from '../services/api'
import { INJECT_BANK_KIND_LABELS } from '../config/injectBank'
import { useAppDialog } from '../contexts/AppDialogContext'
import ExerciseSubpageShell from '../components/exercise/ExerciseSubpageShell'
import LiveTimelineLayersBoard from '../components/live/LiveTimelineLayersBoard'
import {
  BANK_KIND_ORDER_FALLBACK,
  BANK_KIND_TO_INJECT_TYPE,
  EMPTY_FORM,
  InjectFormModal,
  type InjectFormData,
} from './ExerciseInjectsPage'

function formatTPlus(minutes?: number) {
  const safe = Math.max(minutes ?? 0, 0)
  const h = Math.floor(safe / 60)
  const m = safe % 60
  return `T+${h}h${String(m).padStart(2, '0')}`
}

export default function ExerciseLiveControlPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const appDialog = useAppDialog()
  const id = parseInt(exerciseId || '0', 10)

  const [speed, setSpeed] = useState('1')
  const [broadcast, setBroadcast] = useState('')
  const [showSurpriseDrawer, setShowSurpriseDrawer] = useState(false)
  const [surpriseError, setSurpriseError] = useState<string | null>(null)
  const [flashLiveUpdate, setFlashLiveUpdate] = useState(false)
  const [controlError, setControlError] = useState<string | null>(null)
  const [liveNowMs, setLiveNowMs] = useState<number>(Date.now())
  const [surpriseDispatchMode, setSurpriseDispatchMode] = useState<'immediate' | 'planned'>('immediate')
  const [surpriseTimelineType, setSurpriseTimelineType] = useState<'business' | 'technical'>('business')
  const [notifications, setNotifications] = useState<Array<{ id: number; kind: 'error' | 'warn' | 'info'; message: string }>>([])
  const [scrubbedNowMin, setScrubbedNowMin] = useState<number | null>(null)

  const pushNotification = (kind: 'error' | 'warn' | 'info', message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setNotifications((prev) => [...prev, { id, kind, message }].slice(-4))
    window.setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    }, 4500)
  }

  const { data: exercise } = useQuery({
    queryKey: ['exercise', id],
    queryFn: () => exercisesApi.get(id),
    enabled: !!id,
  })

  const dashboardQuery = useQuery<LiveDashboardResponse>({
    queryKey: ['live-dashboard', id],
    queryFn: () => crisisManagementApi.getLiveDashboard(id),
    refetchInterval: 5000,
    enabled: !!id,
  })
  const { data: dashboard } = dashboardQuery

  const injectsQuery = useQuery({
    queryKey: ['injects-live', id],
    queryFn: () => injectsApi.list({ exercise_id: id, page: 1, page_size: 100 }),
    enabled: !!id,
  })
  const { data: injects } = injectsQuery
  const { data: exerciseUsersData } = useQuery({
    queryKey: ['exercise-users', id],
    queryFn: () => exerciseUsersApi.listExerciseUsers(id),
    enabled: !!id,
  })

  const { data: phases = [] } = useQuery({
    queryKey: ['exercise-phases', id],
    queryFn: () => crisisManagementApi.listPhases(id),
    enabled: !!id,
  })

  const { data: injectBankKinds = [] } = useQuery({
    queryKey: ['inject-bank-kinds'],
    queryFn: () => injectBankApi.getKinds(),
  })

  useEffect(() => {
    const timer = window.setInterval(() => setLiveNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const err: any = injectsQuery.error
    if (!err) return
    pushNotification('error', err?.response?.data?.detail || 'Erreur de chargement des injects.')
  }, [injectsQuery.error])

  useEffect(() => {
    const err: any = dashboardQuery.error
    if (!err) return
    pushNotification('error', err?.response?.data?.detail || 'Erreur de chargement du cockpit live.')
  }, [dashboardQuery.error])

  const invalidateLive = () => {
    queryClient.invalidateQueries({ queryKey: ['live-dashboard', id] })
    queryClient.invalidateQueries({ queryKey: ['injects-live', id] })
    setFlashLiveUpdate(true)
    window.setTimeout(() => setFlashLiveUpdate(false), 1200)
  }

  const action = useMutation({
    mutationFn: ({ action, payload }: { action: string; payload?: Record<string, any> }) =>
      crisisManagementApi.sendLiveAction(id, action, payload || {}),
    onSuccess: () => {
      setControlError(null)
      invalidateLive()
    },
    onError: (err: any) => {
      setControlError(err?.response?.data?.detail || 'Action live refusée.')
    },
  })

  const createSurprise = useMutation({
    mutationFn: (payload: any) =>
      crisisManagementApi.createSurpriseInject(id, payload),
    onSuccess: () => {
      setSurpriseError(null)
      setShowSurpriseDrawer(false)
      invalidateLive()
    },
    onError: (err: any) => {
      setSurpriseError(err?.response?.data?.detail || 'Création de l’inject surprise impossible.')
    },
  })

  const sendInjectMutation = useMutation({
    mutationFn: (injectId: number) => injectsApi.send(injectId),
    onSuccess: invalidateLive,
  })

  const stopExerciseMutation = useMutation({
    mutationFn: () => exercisesApi.end(id),
    onSuccess: invalidateLive,
    onError: async (err: any) => {
      const message = err?.response?.data?.detail || 'Impossible de terminer l’exercice.'
      await appDialog.alert(String(message), { title: 'Action impossible', confirmLabel: 'OK' })
    },
  })

  const cancelInjectMutation = useMutation({
    mutationFn: (injectId: number) => injectsApi.cancel(injectId),
    onSuccess: invalidateLive,
  })

  const timelines = dashboard?.timelines ?? { business: [], technical: [], realtime: [] }
  const clock = dashboard?.clock
  const derivedVirtualNowMin = useMemo(() => {
    if (!clock) return 0
    if (!clock.started_at || clock.exercise_status === 'completed') return clock.virtual_now_min ?? 0
    const startedAt = new Date(clock.started_at).getTime()
    const elapsedRealMin = Math.max((liveNowMs - startedAt) / 60000, 0)
    const speedMul = parseFloat(clock.time_multiplier || '1') || 1
    if (clock.exercise_status === 'paused' || clock.exercise_status === 'draft') {
      return clock.virtual_now_min ?? 0
    }
    return Math.floor(elapsedRealMin * speedMul)
  }, [clock, liveNowMs])
  const displayNowMin = scrubbedNowMin ?? derivedVirtualNowMin
  const teams = useMemo(() => {
    const base = dashboard?.teams_state ?? []
    return base
      .filter((t) => t.team_id != null)
      .map((t) => ({ id: t.team_id as number, name: t.team_name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [dashboard?.teams_state])
  const exerciseUsers = exerciseUsersData?.users ?? []
  const bankTypeOptions = useMemo(() => {
    const kinds = injectBankKinds.length > 0 ? injectBankKinds : BANK_KIND_ORDER_FALLBACK
    return kinds.map((kind) => ({
      kind,
      injectType: BANK_KIND_TO_INJECT_TYPE[kind] || 'system',
      label: INJECT_BANK_KIND_LABELS[kind] || kind,
    }))
  }, [injectBankKinds])

  const handleSurpriseFormSubmit = (form: InjectFormData) => {
    const audiences = form.recipient_kind && form.recipient_value
      ? [{ kind: form.recipient_kind as 'user' | 'team' | 'role', value: form.recipient_value }]
      : []
    let content: string | Record<string, any> = form.content_text
    const trimmed = form.content_text.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        content = JSON.parse(trimmed)
      } catch {
        content = form.content_text
      }
    }
    createSurprise.mutate({
      title: form.title,
      description: form.description || undefined,
      type: form.bank_kind || form.type,
      timeline_type: surpriseTimelineType,
      content,
      audiences,
      dispatch_mode: surpriseDispatchMode,
      planned_time_offset:
        surpriseDispatchMode === 'planned'
          ? Number.isFinite(Number(form.time_offset))
            ? Number(form.time_offset)
            : derivedVirtualNowMin + 5
          : undefined,
      duration_min: 15,
      channel: form.channel || undefined,
      inject_category: form.inject_category || undefined,
      pressure_level: form.pressure_level || undefined,
    })
  }

  const handleSpeedApply = () => {
    const multiplier = Number(speed)
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      setControlError('La vitesse doit être un nombre > 0.')
      return
    }
    action.mutate({ action: 'speed', payload: { multiplier } })
  }

  const handleBroadcast = () => {
    if (!broadcast.trim()) {
      setControlError('Le message de broadcast est vide.')
      return
    }
    action.mutate({ action: 'broadcast', payload: { message: broadcast.trim() } })
  }

  const handleResetView = () => {
    setControlError(null)
    setScrubbedNowMin(0)
    setSpeed(String(clock?.time_multiplier || dashboard?.time_multiplier || '1'))
  }

  return (
    <>
      <div className="fixed top-4 right-4 z-[70] space-y-2 w-[360px] max-w-[calc(100vw-2rem)]">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`rounded-lg border px-3 py-2 shadow-lg backdrop-blur bg-white/95 text-sm ${
              n.kind === 'error'
                ? 'border-red-200 text-red-800'
                : n.kind === 'warn'
                  ? 'border-amber-200 text-amber-800'
                  : 'border-primary-200 text-primary-800'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span>{n.message}</span>
              <button
                type="button"
                onClick={() => setNotifications((prev) => prev.filter((x) => x.id !== n.id))}
                className="text-xs opacity-70 hover:opacity-100"
              >
                Fermer
              </button>
            </div>
          </div>
        ))}
      </div>

      <ExerciseSubpageShell
        exerciseId={id}
        sectionLabel="Live"
        title="Pilotage live"
        actions={
          <button
            onClick={() => navigate(`/exercises/${id}`)}
            className="px-3 py-2 border border-gray-300 bg-white text-gray-800 rounded text-sm hover:bg-gray-50"
          >
            Ouvrir cockpit
          </button>
        }
      >
        <div className="space-y-4">
          <section className={`sticky top-2 z-20 rounded-2xl border bg-white/95 backdrop-blur p-4 shadow-sm ${flashLiveUpdate ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-gray-200'}`}>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="rounded-xl bg-gray-900 px-3 py-2 text-white">
                  <div className="text-[10px] uppercase tracking-wide text-gray-300">Statut</div>
                  <div className="text-sm font-semibold">{dashboard?.status || exercise?.status || '...'}</div>
                </div>
                <MetricChip label="Temps exercice" value={formatTPlus(displayNowMin)} />
                <MetricChip label="Temps réel" value={new Date(liveNowMs).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} />
                <MetricChip label="Mode" value="Émetteur (polling)" />
                <MetricChip label="Connexions" value={String(dashboard?.ws_connection_count ?? 0)} icon={<Activity size={13} />} />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1">
                  <span className="text-xs text-gray-500">Vitesse</span>
                  <input
                    value={speed}
                    onChange={(e) => setSpeed(e.target.value)}
                    className="w-16 rounded border border-gray-200 px-2 py-1 text-sm"
                  />
                  <button onClick={handleSpeedApply} className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700">
                    OK
                  </button>
                </div>
                <button onClick={() => action.mutate({ action: 'resume' })} className="inline-flex items-center px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
                  <Play size={14} className="mr-1" /> Play
                </button>
                <button onClick={() => action.mutate({ action: 'pause' })} className="inline-flex items-center px-3 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700">
                  <Pause size={14} className="mr-1" /> Pause
                </button>
                <button onClick={() => stopExerciseMutation.mutate()} className="inline-flex items-center px-3 py-2 bg-rose-700 text-white rounded-md hover:bg-rose-800">
                  <RotateCcw size={14} className="mr-1" /> Stop
                </button>
                <button onClick={invalidateLive} className="inline-flex items-center px-3 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50">
                  <RefreshCw size={14} className="mr-1" /> Rafraîchir
                </button>
                <button onClick={handleResetView} className="inline-flex items-center px-3 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50">
                  Reset
                </button>
              </div>
            </div>
          </section>

          <LiveTimelineLayersBoard
            timelines={timelines}
            virtualNowMin={displayNowMin}
            phases={phases}
            onAddSurprise={() => setShowSurpriseDrawer(true)}
            onSendRealtime={(injectId) => sendInjectMutation.mutate(injectId)}
            onCancelRealtime={(injectId) => cancelInjectMutation.mutate(injectId)}
            onVirtualNowChange={setScrubbedNowMin}
          />

          {controlError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {controlError}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <h2 className="font-semibold text-gray-900 mb-3">Équipes</h2>
                <div className="space-y-2">
                  {(dashboard?.teams_state || []).map((t) => {
                    const pct = t.total > 0 ? Math.round((t.treated / t.total) * 100) : 0
                    return (
                      <div key={`${t.team_id}-${t.team_name}`} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <div className="flex items-center justify-between text-sm">
                          <strong className="text-gray-900">{t.team_name}</strong>
                          <span className="text-gray-600">{t.treated}/{t.total}</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-gray-200 overflow-hidden">
                          <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                  {(!dashboard?.teams_state || dashboard.teams_state.length === 0) && (
                    <p className="text-sm text-gray-500">Aucune équipe assignée.</p>
                  )}
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Indicateurs</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Kpi label="Stress" value={dashboard?.indicators?.stress} />
                <Kpi label="Saturation" value={dashboard?.indicators?.saturation} />
                <Kpi label="Com externe" value={dashboard?.indicators?.communication_external} />
                <Kpi label="Maitrise tech" value={dashboard?.indicators?.technical_mastery} />
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Broadcast</label>
                  <div className="flex items-center gap-2">
                    <input value={broadcast} onChange={(e) => setBroadcast(e.target.value)} placeholder="Message global" className="px-3 py-2 border rounded-md flex-1" />
                    <button onClick={handleBroadcast} className="inline-flex items-center px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
                      <Send size={14} className="mr-1" /> Envoyer
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ExerciseSubpageShell>

      <InjectFormModal
        isOpen={showSurpriseDrawer}
        onClose={() => {
          setShowSurpriseDrawer(false)
          setSurpriseError(null)
        }}
        onSubmit={handleSurpriseFormSubmit}
        initial={{
          ...EMPTY_FORM,
          title: '',
          bank_kind: (bankTypeOptions[0]?.kind ?? 'mail') as any,
          type: bankTypeOptions[0]?.injectType ?? 'mail',
          time_offset: String(derivedVirtualNowMin + 5),
          trigger_mode: 'manual',
        }}
        isPending={createSurprise.isPending}
        title="Ajouter un inject surprise (timeline temps réel)"
        submitLabel="Créer inject surprise"
        allInjects={injects?.injects || []}
        phases={phases}
        bankTypeOptions={bankTypeOptions}
        recipientUsers={exerciseUsers}
        recipientTeams={teams}
        maxWidthClassName="max-w-7xl"
        mergeCreateTabs
        extraContent={
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
            {surpriseError && (
              <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-sm text-red-700">
                {surpriseError}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Timeline impactée</label>
                <select
                  value={surpriseTimelineType}
                  onChange={(e) => setSurpriseTimelineType(e.target.value as 'business' | 'technical')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
                >
                  <option value="business">Métier</option>
                  <option value="technical">Technique</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mode d’envoi</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSurpriseDispatchMode('immediate')}
                    className={`px-3 py-2 rounded-md text-sm ${surpriseDispatchMode === 'immediate' ? 'bg-emerald-600 text-white' : 'border border-gray-300 bg-white text-gray-700'}`}
                  >
                    Live
                  </button>
                  <button
                    type="button"
                    onClick={() => setSurpriseDispatchMode('planned')}
                    className={`px-3 py-2 rounded-md text-sm ${surpriseDispatchMode === 'planned' ? 'bg-primary-600 text-white' : 'border border-gray-300 bg-white text-gray-700'}`}
                  >
                    Différé (T+)
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  L’inject est ajouté depuis la TL temps réel, puis impacte la timeline choisie.
                </p>
              </div>
            </div>
          </div>
        }
      />
    </>
  )
}

function MetricChip({
  label,
  value,
  icon,
  tone = 'neutral',
}: {
  label: string
  value: string
  icon?: ReactNode
  tone?: 'neutral' | 'ok' | 'warn'
}) {
  const toneClass = tone === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : tone === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-gray-50 border-gray-200 text-gray-800'
  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-sm font-semibold flex items-center gap-1">
        {icon}
        <span>{value}</span>
      </div>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="p-2 rounded bg-gray-50 border border-gray-200">
      <div className="text-gray-500 text-xs">{label}</div>
      <div className="font-semibold text-gray-900">{typeof value === 'number' ? value : 0}</div>
    </div>
  )
}
