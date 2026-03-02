/**
 * DebugEventsReceivePage - Receives events via WebSocket for testing
 * DISABLED IN PRODUCTION
 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Mail,
  Tv,
  MessageCircle,
  FileText,
  AlertTriangle,
  Image,
  Video,
  Newspaper,
  Building2,
  Shield,
  Clock,
  AlertCircle,
  Radio,
  Users,
  Trash2,
  ChevronDown,
  Loader2,
  User,
} from 'lucide-react'
import {
  useDebugEventsWs,
  DebugWsMessage,
  ConnectionState,
} from '../../hooks/useDebugEventsWs'
import { formatVirtualTime } from '../../hooks/useDebugTimeline'
import { debugApi } from '../../services/debugApi'
import SimulatorTabs from '../../pages/player/events_receiver/SimulatorTabs'
import DebugAuthOverlay from '../../components/debug/DebugAuthOverlay'
import DebugAuthBar from '../../components/debug/DebugAuthBar'

type MainTab = 'events' | 'simulator' | 'test_receive'

type AudienceKind = 'role' | 'team' | 'user'

// Event type configurations
const EVENT_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bgColor: string }> = {
  mail: { label: 'Email', icon: Mail, color: 'text-blue-600 dark:text-blue-300', bgColor: 'bg-blue-100 dark:bg-blue-500/20' },
  twitter: { label: 'Réseau social', icon: MessageCircle, color: 'text-sky-600 dark:text-sky-300', bgColor: 'bg-sky-100 dark:bg-sky-500/20' },
  tv: { label: 'TV / Vidéo', icon: Tv, color: 'text-teal-600 dark:text-teal-300', bgColor: 'bg-teal-100 dark:bg-teal-500/20' },
  decision: { label: 'Décision', icon: AlertTriangle, color: 'text-orange-600 dark:text-orange-300', bgColor: 'bg-orange-100 dark:bg-orange-500/20' },
  score: { label: 'Score', icon: FileText, color: 'text-yellow-700 dark:text-yellow-300', bgColor: 'bg-yellow-100 dark:bg-yellow-500/20' },
  system: { label: 'Système', icon: FileText, color: 'text-slate-600 dark:text-slate-300', bgColor: 'bg-slate-100 dark:bg-slate-500/20' },
  message: { label: 'Message', icon: MessageCircle, color: 'text-cyan-600 dark:text-cyan-300', bgColor: 'bg-cyan-100 dark:bg-cyan-500/20' },
  image: { label: 'Image', icon: Image, color: 'text-purple-600 dark:text-purple-300', bgColor: 'bg-purple-100 dark:bg-purple-500/20' },
  video: { label: 'Vidéo', icon: Video, color: 'text-rose-600 dark:text-rose-300', bgColor: 'bg-rose-100 dark:bg-rose-500/20' },
  document: { label: 'Document', icon: FileText, color: 'text-slate-700 dark:text-slate-300', bgColor: 'bg-slate-100 dark:bg-slate-500/20' },
  social_post: { label: 'Post social', icon: MessageCircle, color: 'text-sky-600 dark:text-sky-300', bgColor: 'bg-sky-100 dark:bg-sky-500/20' },
  canal_press: { label: 'Presse', icon: Newspaper, color: 'text-red-600 dark:text-red-300', bgColor: 'bg-red-100 dark:bg-red-500/20' },
  canal_anssi: { label: 'ANSSI', icon: Shield, color: 'text-indigo-600 dark:text-indigo-300', bgColor: 'bg-indigo-100 dark:bg-indigo-500/20' },
  canal_gouvernement: { label: 'Gouvernement', icon: Building2, color: 'text-violet-600 dark:text-violet-300', bgColor: 'bg-violet-100 dark:bg-violet-500/20' },
  sms: { label: 'SMS', icon: MessageCircle, color: 'text-green-600 dark:text-green-300', bgColor: 'bg-green-100 dark:bg-green-500/20' },
}

const ROLE_FALLBACK_OPTIONS = ['joueur', 'animateur', 'observateur', 'participant']

interface AudienceTag {
  kind: string
  value: string
}

interface ReceivedEvent {
  id: number
  type: string
  title: string
  description?: string
  content?: Record<string, unknown>
  audiences?: AudienceTag[]
  virtualTime: number
  timestamp: Date
}

function getConnectionStateLabel(state: ConnectionState): string {
  switch (state) {
    case 'connected':
      return 'Connecté'
    case 'connecting':
      return 'Connexion...'
    case 'error':
      return 'Erreur'
    default:
      return 'Déconnecté'
  }
}

function getConnectionStateClass(state: ConnectionState): string {
  switch (state) {
    case 'connected':
      return 'text-emerald-600 dark:text-emerald-300'
    case 'connecting':
      return 'text-amber-600 dark:text-amber-300'
    case 'error':
      return 'text-red-600 dark:text-red-300'
    default:
      return 'text-slate-500 dark:text-slate-400'
  }
}

function getConnectionDotClass(state: ConnectionState): string {
  switch (state) {
    case 'connected':
      return 'bg-emerald-500'
    case 'connecting':
      return 'bg-amber-500 animate-pulse'
    case 'error':
      return 'bg-red-500'
    default:
      return 'bg-slate-400 dark:bg-slate-500'
  }
}

function isBroadcastAudience(audiences?: AudienceTag[]): boolean {
  return !audiences || audiences.length === 0
}

function hasAudienceMatch(audiences: AudienceTag[] | undefined, kind: AudienceKind, value: string): boolean {
  if (!audiences || audiences.length === 0 || !value) return false
  return audiences.some((audience) => audience.kind === kind && String(audience.value) === value)
}

function sortAudienceValues(values: string[]): string[] {
  return values.sort((a, b) => {
    const aNum = Number(a)
    const bNum = Number(b)
    const aIsNum = !Number.isNaN(aNum)
    const bIsNum = !Number.isNaN(bNum)

    if (aIsNum && bIsNum) return aNum - bNum
    if (aIsNum && !bIsNum) return -1
    if (!aIsNum && bIsNum) return 1
    return a.localeCompare(b)
  })
}

function formatAudienceSummary(audiences?: AudienceTag[]): string {
  if (!audiences || audiences.length === 0) {
    return 'Tous'
  }

  return audiences
    .map((audience) => {
      if (audience.kind === 'team') return `Equipe ${audience.value}`
      if (audience.kind === 'role') return `Role ${audience.value}`
      if (audience.kind === 'user') return `Joueur ${audience.value}`
      return `${audience.kind}:${audience.value}`
    })
    .join(', ')
}

export default function DebugEventsReceivePage() {
  // State
  const [activeTab, setActiveTab] = useState<MainTab>('events')
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(null)
  const [receivedEvents, setReceivedEvents] = useState<ReceivedEvent[]>([])
  const [emitterState, setEmitterState] = useState<{
    state: string
    virtualTime: number
    speed: number
    exerciseId?: number
  } | null>(null)

  // Simulated identity for the "Event logs" tab
  const [simTeamId, setSimTeamId] = useState('')
  const [simRole, setSimRole] = useState('')

  // Filters for the "Test de reception" tab
  const [testRole, setTestRole] = useState('joueur')
  const [testTeamId, setTestTeamId] = useState('')
  const [testPlayerId, setTestPlayerId] = useState('')

  // Query exercises
  const { data: exercises, isLoading: isLoadingExercises } = useQuery({
    queryKey: ['debug-exercises'],
    queryFn: debugApi.listExercises,
  })

  // Query timeline (used for role/team/player options in test tab)
  const { data: timelineForAudienceOptions, isFetching: isFetchingTimelineOptions } = useQuery({
    queryKey: ['debug-timeline-audience-options', selectedExerciseId],
    queryFn: () => debugApi.getExerciseTimeline(selectedExerciseId!),
    enabled: selectedExerciseId !== null,
  })

  // Build extra params for WS URL (used when connecting)
  const extraParams = useMemo(
    () => ({
      ...(simTeamId ? { team_id: simTeamId } : {}),
      ...(simRole ? { role: simRole } : {}),
    }),
    [simRole, simTeamId]
  )

  // Handle incoming WebSocket messages
  const handleWsMessage = useCallback((message: DebugWsMessage) => {
    if (message.type === 'event' && message.event) {
      const ev = message.event as any
      const event: ReceivedEvent = {
        id: ev.id || Date.now(),
        type: ev.type || 'system',
        title: ev.title || 'Unknown Event',
        description: ev.description,
        content: ev.content,
        audiences: ev.audiences || [],
        virtualTime: message.virtual_time || 0,
        timestamp: new Date(),
      }
      setReceivedEvents((prev) => [event, ...prev])
    }

    if (message.type === 'state_update') {
      setEmitterState({
        state: message.state || 'stopped',
        virtualTime: message.virtual_time || 0,
        speed: message.speed || 1,
        exerciseId: message.exercise_id,
      })
    }
  }, [])

  // WebSocket connection
  const {
    connectionState,
    authErrorStatus,
    clientCount,
    connect,
    disconnect,
  } = useDebugEventsWs({
    onMessage: handleWsMessage,
    extraParams,
  })

  // Get event type config
  const getEventConfig = (type: string) => {
    return EVENT_TYPE_CONFIG[type] || EVENT_TYPE_CONFIG.system
  }

  const audiencePools = useMemo(() => {
    const roleSet = new Set<string>(ROLE_FALLBACK_OPTIONS)
    const teamSet = new Set<string>()
    const userSet = new Set<string>()

    const collect = (audiences?: AudienceTag[]) => {
      if (!audiences || audiences.length === 0) return
      audiences.forEach((audience) => {
        if (!audience.value) return
        if (audience.kind === 'role') roleSet.add(String(audience.value))
        if (audience.kind === 'team') teamSet.add(String(audience.value))
        if (audience.kind === 'user') userSet.add(String(audience.value))
      })
    }

    timelineForAudienceOptions?.injects?.forEach((inject) => collect((inject.audiences || []) as AudienceTag[]))
    receivedEvents.forEach((event) => collect(event.audiences))

    const roleValues = Array.from(roleSet)
    const roles = [
      ...ROLE_FALLBACK_OPTIONS.filter((value) => roleValues.includes(value)),
      ...roleValues
        .filter((value) => !ROLE_FALLBACK_OPTIONS.includes(value))
        .sort((a, b) => a.localeCompare(b)),
    ]

    return {
      roles,
      teams: sortAudienceValues(Array.from(teamSet)),
      users: sortAudienceValues(Array.from(userSet)),
    }
  }, [receivedEvents, timelineForAudienceOptions])

  useEffect(() => {
    if (audiencePools.roles.length === 0) return
    if (!audiencePools.roles.includes(testRole)) {
      setTestRole(audiencePools.roles[0])
    }
  }, [audiencePools.roles, testRole])

  useEffect(() => {
    if (audiencePools.teams.length === 0) {
      if (testTeamId) setTestTeamId('')
      return
    }
    if (!testTeamId || !audiencePools.teams.includes(testTeamId)) {
      setTestTeamId(audiencePools.teams[0])
    }
  }, [audiencePools.teams, testTeamId])

  useEffect(() => {
    if (audiencePools.users.length === 0) {
      if (testPlayerId) setTestPlayerId('')
      return
    }
    if (!testPlayerId || !audiencePools.users.includes(testPlayerId)) {
      setTestPlayerId(audiencePools.users[0])
    }
  }, [audiencePools.users, testPlayerId])

  const allAudienceEvents = useMemo(
    () => receivedEvents.filter((event) => isBroadcastAudience(event.audiences)),
    [receivedEvents]
  )

  const roleAudienceEvents = useMemo(() => {
    if (!testRole) return []
    return receivedEvents.filter(
      (event) =>
        isBroadcastAudience(event.audiences) ||
        hasAudienceMatch(event.audiences, 'role', testRole)
    )
  }, [receivedEvents, testRole])

  const teamAudienceEvents = useMemo(() => {
    if (!testTeamId) return []
    return receivedEvents.filter(
      (event) =>
        isBroadcastAudience(event.audiences) ||
        hasAudienceMatch(event.audiences, 'team', testTeamId)
    )
  }, [receivedEvents, testTeamId])

  const playerAudienceEvents = useMemo(() => {
    if (!testPlayerId) return []
    return receivedEvents.filter(
      (event) =>
        isBroadcastAudience(event.audiences) ||
        hasAudienceMatch(event.audiences, 'user', testPlayerId)
    )
  }, [receivedEvents, testPlayerId])

  // Clear events
  const handleClearEvents = () => {
    setReceivedEvents([])
  }

  const renderReceptionTable = (
    title: string,
    subtitle: string,
    events: ReceivedEvent[],
    emptyMessage: string
  ) => (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
          {events.length}
        </span>
      </div>

      <div className="max-h-[25rem] overflow-auto">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
            <tr className="text-left text-slate-500 dark:text-slate-400">
              <th className="px-3 py-2 font-medium">Reçu</th>
              <th className="px-3 py-2 font-medium">T virtuel</th>
              <th className="px-3 py-2 font-medium">Inject</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Destinataires</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {events.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              events.map((event, index) => {
                const config = getEventConfig(event.type)
                const Icon = config.icon
                return (
                  <tr key={`${event.id}-${index}-${event.timestamp.getTime()}`}>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                      {event.timestamp.toLocaleTimeString('fr-FR')}
                    </td>
                    <td className="px-3 py-2 font-mono text-blue-600 dark:text-blue-300">
                      {formatVirtualTime(event.virtualTime)}
                    </td>
                    <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                      <p className="max-w-[20rem] truncate font-medium">{event.title}</p>
                      {event.description && (
                        <p className="max-w-[22rem] truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {event.description}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 ${config.bgColor} ${config.color}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {config.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                      {formatAudienceSummary(event.audiences)}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 md:px-6 md:py-6">
      {/* Auth overlay — shown on 401 (not logged in) or 403 (wrong role) */}
      {authErrorStatus && <DebugAuthOverlay status={authErrorStatus} onLogin={connect} />}

      <div className="mx-auto w-full max-w-[1600px] space-y-4">
        {/* Header */}
        <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Clock className="h-6 w-6 text-blue-600 dark:text-blue-300" />
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Debug Events - Receiver</h1>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                RECEIVE
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-950/70">
              <button
                onClick={() => setActiveTab('events')}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'events'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  <FileText size={16} />
                  Event logs
                </span>
              </button>

              <button
                onClick={() => setActiveTab('test_receive')}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'test_receive'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Users size={16} />
                  Test de reception
                </span>
              </button>

              <button
                onClick={() => setActiveTab('simulator')}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'simulator'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Tv size={16} />
                  Simulateur
                </span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <DebugAuthBar onReconnect={connect} />

              <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800">
                <span className={`h-2.5 w-2.5 rounded-full ${getConnectionDotClass(connectionState)}`} />
                <span className={getConnectionStateClass(connectionState)}>{getConnectionStateLabel(connectionState)}</span>
              </div>

              <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <Users size={14} />
                {clientCount} connectés
              </div>

              <Link
                to="/debug/events_emit"
                className="text-sm font-medium text-orange-600 hover:text-orange-700 dark:text-orange-300 dark:hover:text-orange-200"
              >
                Ouvrir Emitter →
              </Link>
            </div>
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
          {/* Left panel */}
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            {activeTab === 'events' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Identité simulée WS
                  </p>
                  <div className="space-y-2">
                    <input
                      placeholder="Team ID (ex: 1)"
                      value={simTeamId}
                      onChange={(e) => setSimTeamId(e.target.value)}
                      disabled={connectionState === 'connected'}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />

                    <select
                      value={simRole}
                      onChange={(e) => setSimRole(e.target.value)}
                      disabled={connectionState === 'connected'}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="">Tous rôles</option>
                      <option value="joueur">Joueur</option>
                      <option value="participant">Participant</option>
                      <option value="observateur">Observateur</option>
                      <option value="animateur">Animateur</option>
                    </select>
                  </div>

                  {(simTeamId || simRole) && (
                    <div className="rounded-md bg-indigo-50 px-2 py-1.5 text-xs text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                      {simTeamId && <span>Equipe {simTeamId}</span>}
                      {simTeamId && simRole && <span> · </span>}
                      {simRole && <span>{simRole}</span>}
                    </div>
                  )}

                  {connectionState === 'connected' && (
                    <p className="text-xs italic text-slate-500 dark:text-slate-400">
                      Déconnectez-vous pour modifier l'identité simulée.
                    </p>
                  )}
                </div>

                {emitterState ? (
                  <>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-700 dark:bg-slate-800">
                      <p className="text-3xl font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatVirtualTime(emitterState.virtualTime)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Temps virtuel (emitter)</p>
                    </div>

                    <div
                      className={`rounded-lg py-2 text-center text-sm font-medium ${
                        emitterState.state === 'playing'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                          : emitterState.state === 'paused'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {emitterState.state === 'playing' && `Playing x${emitterState.speed}`}
                      {emitterState.state === 'paused' && 'Pause'}
                      {emitterState.state === 'stopped' && 'Arrêté'}
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                    <Radio size={22} className="mx-auto mb-2" />
                    <p className="text-sm">En attente d'un emitter...</p>
                  </div>
                )}

                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Events reçus</span>
                    <span className="font-semibold text-blue-700 dark:text-blue-300">{receivedEvents.length}</span>
                  </div>
                </div>

                <button
                  onClick={handleClearEvents}
                  disabled={receivedEvents.length === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Trash2 size={14} />
                  Vider les events
                </button>

                <div className="space-y-2">
                  {connectionState === 'disconnected' && (
                    <button
                      onClick={connect}
                      className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      Reconnecter
                    </button>
                  )}
                  {connectionState === 'connected' && (
                    <button
                      onClick={disconnect}
                      className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                    >
                      Déconnecter
                    </button>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'simulator' && (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Exercice
                  </label>
                  {isLoadingExercises ? (
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Chargement...
                    </div>
                  ) : (
                    <div className="relative">
                      <select
                        value={selectedExerciseId ?? ''}
                        onChange={(e) => setSelectedExerciseId(e.target.value ? Number(e.target.value) : null)}
                        className="w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      >
                        <option value="">Sélectionnez un exercice...</option>
                        {exercises?.map((exercise) => (
                          <option key={exercise.id} value={exercise.id}>
                            {exercise.name} ({exercise.status})
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    </div>
                  )}
                </div>

                {!selectedExerciseId && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                    <Tv size={22} className="mx-auto mb-2" />
                    <p className="text-sm">Sélectionnez un exercice pour ouvrir les simulateurs.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'test_receive' && (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Exercice (optionnel)
                  </label>
                  {isLoadingExercises ? (
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Chargement...
                    </div>
                  ) : (
                    <div className="relative">
                      <select
                        value={selectedExerciseId ?? ''}
                        onChange={(e) => setSelectedExerciseId(e.target.value ? Number(e.target.value) : null)}
                        className="w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      >
                        <option value="">Tous exercices</option>
                        {exercises?.map((exercise) => (
                          <option key={exercise.id} value={exercise.id}>
                            {exercise.name} ({exercise.status})
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    </div>
                  )}
                  {isFetchingTimelineOptions && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Chargement des destinataires de l'exercice...
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Filtre rôle</label>
                  <select
                    value={testRole}
                    onChange={(e) => setTestRole(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {audiencePools.roles.map((roleValue) => (
                      <option key={roleValue} value={roleValue}>
                        {roleValue}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Filtre équipe</label>
                  <select
                    value={testTeamId}
                    onChange={(e) => setTestTeamId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    disabled={audiencePools.teams.length === 0}
                  >
                    {audiencePools.teams.length === 0 ? (
                      <option value="">Aucune équipe détectée</option>
                    ) : (
                      audiencePools.teams.map((teamValue) => (
                        <option key={teamValue} value={teamValue}>
                          Equipe {teamValue}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Filtre joueur</label>
                  <select
                    value={testPlayerId}
                    onChange={(e) => setTestPlayerId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    disabled={audiencePools.users.length === 0}
                  >
                    {audiencePools.users.length === 0 ? (
                      <option value="">Aucun joueur ciblé détecté</option>
                    ) : (
                      audiencePools.users.map((userValue) => (
                        <option key={userValue} value={userValue}>
                          Joueur {userValue}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <button
                  onClick={handleClearEvents}
                  disabled={receivedEvents.length === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Trash2 size={14} />
                  Réinitialiser les tableaux
                </button>
              </div>
            )}
          </aside>

          {/* Right panel */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            {activeTab === 'events' && (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Event log</h2>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {receivedEvents.length} event{receivedEvents.length > 1 ? 's' : ''} reçu{receivedEvents.length > 1 ? 's' : ''}
                  </span>
                </div>

                {connectionState !== 'connected' && (
                  <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-8 text-center dark:border-amber-500/40 dark:bg-amber-500/10">
                    <AlertCircle className="mx-auto mb-3 h-12 w-12 text-amber-600 dark:text-amber-300" />
                    <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-200">Non connecté</h3>
                    <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">En attente de la connexion WebSocket...</p>
                  </div>
                )}

                {receivedEvents.length === 0 && connectionState === 'connected' ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-800">
                    <Clock className="mx-auto mb-3 h-12 w-12 text-slate-400 dark:text-slate-500" />
                    <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">En attente d'injects</h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Les injects apparaîtront ici dès le démarrage de l'emitter.
                    </p>
                    <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                      Ouvrez{' '}
                      <Link to="/debug/events_emit" className="font-medium text-orange-600 hover:text-orange-700 dark:text-orange-300 dark:hover:text-orange-200">
                        la page emitter
                      </Link>{' '}
                      pour lancer l'envoi.
                    </p>
                  </div>
                ) : (
                  <div className="max-h-[calc(100vh-260px)] space-y-3 overflow-y-auto pr-1">
                    {receivedEvents.map((event, index) => {
                      const config = getEventConfig(event.type)
                      const Icon = config.icon

                      return (
                        <article
                          key={`${event.id}-${index}-${event.timestamp.getTime()}`}
                          className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                        >
                          <div className="p-4">
                            <div className="flex items-start gap-3">
                              <div className={`rounded-lg p-2 ${config.bgColor}`}>
                                <Icon className={`h-5 w-5 ${config.color}`} />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="font-medium text-slate-900 dark:text-slate-100">{event.title}</p>
                                    {event.description && (
                                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{event.description}</p>
                                    )}
                                  </div>

                                  <div className="text-right">
                                    <p className="font-mono text-sm text-blue-600 dark:text-blue-300">
                                      {formatVirtualTime(event.virtualTime)}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{config.label}</p>
                                  </div>
                                </div>

                                <div className="mt-2 flex flex-wrap gap-1">
                                  {isBroadcastAudience(event.audiences) ? (
                                    <span className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
                                      Tous
                                    </span>
                                  ) : (
                                    event.audiences?.map((audience, audienceIndex) => (
                                      <span
                                        key={`${event.id}-${audienceIndex}`}
                                        className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300"
                                      >
                                        {formatAudienceSummary([audience])}
                                      </span>
                                    ))
                                  )}
                                </div>

                                {event.content && Object.keys(event.content).length > 0 && (
                                  <details className="mt-2">
                                    <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                                      Voir le contenu
                                    </summary>
                                    <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-100 p-2 text-xs text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                                      {JSON.stringify(event.content, null, 2)}
                                    </pre>
                                  </details>
                                )}
                              </div>
                            </div>
                          </div>

                          <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                            <span>ID: {event.id} · Type: {event.type}</span>
                            <span>Reçu: {event.timestamp.toLocaleTimeString('fr-FR')}</span>
                          </footer>
                        </article>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {activeTab === 'simulator' && (
              selectedExerciseId ? (
                <div className="events-receive-simulators">
                  <SimulatorTabs exerciseId={selectedExerciseId} />
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-800">
                  <Tv className="mx-auto mb-3 h-12 w-12 text-slate-400 dark:text-slate-500" />
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Sélectionnez un exercice</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Choisissez un exercice dans le panneau de gauche pour accéder aux simulateurs.
                  </p>
                </div>
              )
            )}

            {activeTab === 'test_receive' && (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Test de reception par destinataire</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Grille de contrôle des injects reçus (tous, rôle, équipe, joueur).
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <User size={14} />
                    {receivedEvents.length} inject{receivedEvents.length > 1 ? 's' : ''}
                  </div>
                </div>

                {connectionState !== 'connected' && (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                    Le test de reception fonctionne mieux quand la connexion WebSocket est active.
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                  {renderReceptionTable(
                    'Tous',
                    "Injects en diffusion globale (sans audience ciblée)",
                    allAudienceEvents,
                    'Aucun inject global reçu.'
                  )}

                  {renderReceptionTable(
                    `Par rôle (${testRole || 'n/a'})`,
                    'Injects reçus pour ce rôle + injects globaux',
                    roleAudienceEvents,
                    'Aucun inject reçu pour ce rôle.'
                  )}

                  {renderReceptionTable(
                    `Par équipe (${testTeamId ? `Equipe ${testTeamId}` : 'non sélectionnée'})`,
                    'Injects reçus pour cette équipe + injects globaux',
                    teamAudienceEvents,
                    testTeamId ? 'Aucun inject reçu pour cette équipe.' : 'Sélectionnez une équipe.'
                  )}

                  {renderReceptionTable(
                    `Par joueur (${testPlayerId ? `Joueur ${testPlayerId}` : 'non sélectionné'})`,
                    'Injects reçus pour ce joueur + injects globaux',
                    playerAudienceEvents,
                    testPlayerId ? 'Aucun inject reçu pour ce joueur.' : 'Sélectionnez un joueur.'
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
