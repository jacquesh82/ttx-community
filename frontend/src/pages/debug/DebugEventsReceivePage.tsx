/**
 * DebugEventsReceivePage - Receives events via WebSocket for testing
 * DISABLED IN PRODUCTION
 */
import { useState, useCallback } from 'react'
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
} from 'lucide-react'
import {
  useDebugEventsWs,
  getConnectionStateColor,
  DebugWsMessage,
} from '../../hooks/useDebugEventsWs'
import { formatVirtualTime } from '../../hooks/useDebugTimeline'
import { debugApi } from '../../services/debugApi'
import SimulatorTabs from '../../pages/player/events_receiver/SimulatorTabs'
import DebugAuthOverlay from '../../components/debug/DebugAuthOverlay'
import DebugAuthBar from '../../components/debug/DebugAuthBar'

type MainTab = 'events' | 'simulator'

// Event type configurations
const EVENT_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bgColor: string }> = {
  mail: { label: 'Email', icon: Mail, color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  twitter: { label: 'Réseau social', icon: MessageCircle, color: 'text-sky-400', bgColor: 'bg-sky-500/20' },
  tv: { label: 'TV / Vidéo', icon: Tv, color: 'text-teal-400', bgColor: 'bg-teal-500/20' },
  decision: { label: 'Décision', icon: AlertTriangle, color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
  score: { label: 'Score', icon: FileText, color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' },
  system: { label: 'Système', icon: FileText, color: 'text-gray-400', bgColor: 'bg-gray-500/20' },
  message: { label: 'Message', icon: MessageCircle, color: 'text-cyan-400', bgColor: 'bg-cyan-500/20' },
  image: { label: 'Image', icon: Image, color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
  video: { label: 'Vidéo', icon: Video, color: 'text-rose-400', bgColor: 'bg-rose-500/20' },
  document: { label: 'Document', icon: FileText, color: 'text-slate-400', bgColor: 'bg-slate-500/20' },
  social_post: { label: 'Post social', icon: MessageCircle, color: 'text-sky-400', bgColor: 'bg-sky-500/20' },
  canal_press: { label: 'Presse', icon: Newspaper, color: 'text-red-400', bgColor: 'bg-red-500/20' },
  canal_anssi: { label: 'ANSSI', icon: Shield, color: 'text-indigo-400', bgColor: 'bg-indigo-500/20' },
  canal_gouvernement: { label: 'Gouvernement', icon: Building2, color: 'text-violet-400', bgColor: 'bg-violet-500/20' },
  sms: { label: 'SMS', icon: MessageCircle, color: 'text-green-400', bgColor: 'bg-green-500/20' },
}

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

  // Simulated identity for audience filtering
  const [simTeamId, setSimTeamId] = useState('')
  const [simRole, setSimRole] = useState('')
  
  // Query exercises
  const { data: exercises, isLoading: isLoadingExercises } = useQuery({
    queryKey: ['debug-exercises'],
    queryFn: debugApi.listExercises,
  })
  
  // Build extra params for WS URL (used when connecting)
  const extraParams = {
    ...(simTeamId ? { team_id: simTeamId } : {}),
    ...(simRole ? { role: simRole } : {}),
  }

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
      setReceivedEvents(prev => [event, ...prev])
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
  
  // Clear events
  const handleClearEvents = () => {
    setReceivedEvents([])
  }
  
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Auth overlay — shown on 401 (not logged in) or 403 (wrong role) */}
      {authErrorStatus && <DebugAuthOverlay status={authErrorStatus} onLogin={connect} />}

      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-blue-500" />
            <h1 className="text-xl font-bold">Debug Events - Receiver</h1>
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded font-medium">
              RECEIVE
            </span>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 bg-gray-900 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('events')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'events'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText size={16} />
                Event Logs
              </div>
            </button>
            <button
              onClick={() => setActiveTab('simulator')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'simulator'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <Tv size={16} />
                Simulateur
              </div>
            </button>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Auth context */}
            <DebugAuthBar onReconnect={connect} />

            {/* Connection Status */}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                connectionState === 'connected' ? 'bg-green-500 animate-pulse' :
                connectionState === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                connectionState === 'error' ? 'bg-red-500' :
                'bg-gray-500'
              }`} />
              <span className={`text-sm ${getConnectionStateColor(connectionState)}`}>
                {connectionState === 'connected' ? 'Connected' :
                 connectionState === 'connecting' ? 'Connecting...' :
                 connectionState === 'error' ? 'Error' : 'Disconnected'}
              </span>
            </div>

            {/* Client count */}
            <div className="flex items-center gap-1 text-sm text-gray-400">
              <Users size={14} />
              {clientCount} connected
            </div>

            <Link
              to="/debug/events_emit"
              className="text-sm text-orange-400 hover:text-orange-300"
            >
              Open Emitter →
            </Link>
          </div>
        </div>
      </header>
      
      <div className="flex flex-col lg:flex-row">
        {/* Left Panel - Status */}
        {activeTab === 'events' && (
        <div className="lg:w-80 bg-gray-800 border-b lg:border-b-0 lg:border-r border-gray-700 p-6 space-y-6">
          {/* Simulated Identity */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Identité simulée</p>
            <div className="flex gap-2">
              <input
                placeholder="Team ID (ex: 1)"
                value={simTeamId}
                onChange={(e) => setSimTeamId(e.target.value)}
                disabled={connectionState === 'connected'}
                className="w-28 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <select
                value={simRole}
                onChange={(e) => setSimRole(e.target.value)}
                disabled={connectionState === 'connected'}
                className="flex-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">Tous rôles</option>
                <option value="participant">Participant</option>
                <option value="observateur">Observateur</option>
                <option value="animateur">Animateur</option>
              </select>
            </div>
            {(simTeamId || simRole) && (
              <div className="text-xs bg-indigo-900/60 text-indigo-300 rounded px-2 py-1 flex items-center gap-1">
                <span>→</span>
                {simTeamId && <span>Équipe {simTeamId}</span>}
                {simTeamId && simRole && <span>·</span>}
                {simRole && <span className="capitalize">{simRole}</span>}
              </div>
            )}
            {connectionState === 'connected' && (
              <p className="text-[10px] text-gray-500 italic">Déconnecter pour changer l'identité</p>
            )}
          </div>

          {/* Emitter State */}
          {emitterState && (
            <>
              {/* Virtual Clock from Emitter */}
              <div className="bg-gray-900 rounded-lg p-4 text-center">
                <div className="text-4xl font-mono font-bold text-white mb-1">
                  {formatVirtualTime(emitterState.virtualTime)}
                </div>
                <div className="text-sm text-gray-500">
                  Virtual Time (from emitter)
                </div>
              </div>
              
              {/* Emitter State */}
              <div className={`text-center py-2 rounded-lg ${
                emitterState.state === 'playing' ? 'bg-green-500/20 text-green-400' :
                emitterState.state === 'paused' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-gray-700 text-gray-400'
              }`}>
                {emitterState.state === 'playing' && `▶ Playing at ${emitterState.speed}x`}
                {emitterState.state === 'paused' && '⏸ Paused'}
                {emitterState.state === 'stopped' && '⏹ Stopped'}
              </div>
            </>
          )}
          
          {!emitterState && (
            <div className="bg-gray-900 rounded-lg p-4 text-center text-gray-500">
              <Radio size={24} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Waiting for emitter...</p>
            </div>
          )}
          
          {/* Stats */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Events Received</span>
              <span className="text-blue-400 font-medium">{receivedEvents.length}</span>
            </div>
          </div>
          
          {/* Clear Button */}
          <button
            onClick={handleClearEvents}
            disabled={receivedEvents.length === 0}
            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 rounded-lg text-sm flex items-center justify-center gap-2"
          >
            <Trash2 size={14} />
            Clear events
          </button>
          
          {/* Connection Controls */}
          <div className="space-y-2">
            {connectionState === 'disconnected' && (
              <button
                onClick={connect}
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm"
              >
                Reconnect
              </button>
            )}
            {connectionState === 'connected' && (
              <button
                onClick={disconnect}
                className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
        )}
        
        {/* Left Panel - Simulator Exercise Selector */}
        {activeTab === 'simulator' && (
        <div className="lg:w-80 bg-gray-800 border-b lg:border-b-0 lg:border-r border-gray-700 p-6 space-y-6">
          {/* Exercise Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Exercice
            </label>
            {isLoadingExercises ? (
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading...
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedExerciseId ?? ''}
                  onChange={(e) => setSelectedExerciseId(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select an exercise...</option>
                  {exercises?.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name} ({ex.status})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            )}
          </div>
          
          {!selectedExerciseId && (
            <div className="bg-gray-900 rounded-lg p-4 text-center text-gray-500">
              <Tv size={24} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Sélectionnez un exercice pour accéder aux simulateurs</p>
            </div>
          )}
        </div>
        )}
        
        {/* Right Panel */}
        <div className="flex-1 p-6">
          {activeTab === 'events' ? (
          <>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              Event Log
            </h2>
            <span className="text-sm text-gray-400">
              {receivedEvents.length} event{receivedEvents.length !== 1 ? 's' : ''} received
            </span>
          </div>
          
          {connectionState !== 'connected' && (
            <div className="bg-gray-800 rounded-lg p-12 text-center mb-4">
              <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-400 mb-2">
                Not Connected
              </h3>
              <p className="text-gray-500">
                Waiting for WebSocket connection...
              </p>
            </div>
          )}
          
          {receivedEvents.length === 0 && connectionState === 'connected' ? (
            <div className="bg-gray-800 rounded-lg p-12 text-center">
              <Clock className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-400 mb-2">
                Waiting for Events
              </h3>
              <p className="text-gray-500">
                Events will appear here when the emitter starts playing.
              </p>
              <p className="text-sm text-gray-600 mt-4">
                Open <Link to="/debug/events_emit" className="text-orange-400 hover:text-orange-300">the emitter page</Link> to start sending events.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto">
              {receivedEvents.map((event, index) => {
                const config = getEventConfig(event.type)
                const Icon = config.icon
                
                return (
                  <div
                    key={`${event.id}-${index}`}
                    className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden hover:border-gray-600 transition-colors"
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${config.bgColor}`}>
                          <Icon className={`w-5 h-5 ${config.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-white">
                                {event.title}
                              </p>
                              {event.description && (
                                <p className="text-sm text-gray-400 mt-1">
                                  {event.description}
                                </p>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="text-sm font-mono text-blue-400">
                                {formatVirtualTime(event.virtualTime)}
                              </div>
                              <div className="text-xs text-gray-500">
                                {config.label}
                              </div>
                            </div>
                          </div>
                          
                          {/* Audiences */}
                          {event.audiences && event.audiences.length > 0 ? (
                            <div className="flex gap-1 flex-wrap mt-1">
                              {event.audiences.map((a, i) => (
                                <span
                                  key={i}
                                  className="text-[10px] bg-blue-900/40 text-blue-300 border border-blue-800 rounded px-1.5 py-0.5"
                                >
                                  {a.kind === 'team' ? `Équipe ${a.value}` : `${a.kind}:${a.value}`}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] text-gray-500 italic">broadcast all</span>
                          )}

                          {/* Content preview */}
                          {event.content && Object.keys(event.content).length > 0 && (
                            <details className="mt-2">
                              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                                View content
                              </summary>
                              <pre className="mt-2 text-xs bg-gray-900 rounded p-2 overflow-x-auto text-gray-300">
                                {JSON.stringify(event.content, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Footer */}
                    <div className="px-4 py-2 bg-gray-900/50 border-t border-gray-700 flex items-center justify-between text-xs text-gray-500">
                      <span>
                        ID: {event.id} | Type: {event.type}
                      </span>
                      <span>
                        Received: {event.timestamp.toLocaleTimeString('fr-FR')}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          </>
          ) : (
            selectedExerciseId ? (
              <SimulatorTabs exerciseId={selectedExerciseId} />
            ) : (
              <div className="bg-gray-800 rounded-lg p-12 text-center">
                <Tv className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-400 mb-2">
                  Sélectionnez un exercice
                </h3>
                <p className="text-gray-500">
                  Choisissez un exercice dans le panneau de gauche pour accéder aux simulateurs.
                </p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
