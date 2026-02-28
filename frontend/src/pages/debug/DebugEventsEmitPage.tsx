/**
 * DebugEventsEmitPage - Emits events via WebSocket for testing
 * DISABLED IN PRODUCTION
 */
import { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Play,
  Pause,
  Square,
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
  ChevronDown,
  AlertCircle,
  Zap,
  Info,
  Loader2,
  Radio,
  Users,
} from 'lucide-react'
import { debugApi, DebugInject } from '../../services/debugApi'
import { useDebugTimeline, formatVirtualTime, TimelineEvent } from '../../hooks/useDebugTimeline'
import {
  useDebugEventsWs,
  getConnectionStateColor,
  getConnectionStateLabel,
  ConnectionState,
} from '../../hooks/useDebugEventsWs'
import DebugAuthOverlay from '../../components/debug/DebugAuthOverlay'
import DebugAuthBar from '../../components/debug/DebugAuthBar'

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

export default function DebugEventsEmitPage() {
  // State
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(null)
  const [speed, setSpeed] = useState(5)
  const [showDebugInfo, setShowDebugInfo] = useState(false)
  
  // WebSocket connection
  const {
    connectionState,
    authErrorStatus,
    clientCount,
    sendMessage,
    connect,
  } = useDebugEventsWs()
  
  // Query debug status
  const { data: debugStatus } = useQuery({
    queryKey: ['debug-status'],
    queryFn: debugApi.getDebugStatus,
  })
  
  // Query exercises
  const { data: exercises, isLoading: isLoadingExercises } = useQuery({
    queryKey: ['debug-exercises'],
    queryFn: debugApi.listExercises,
    enabled: debugStatus?.enabled !== false,
  })
  
  // Query timeline
  const { data: timeline, isLoading: isLoadingTimeline } = useQuery({
    queryKey: ['debug-timeline', selectedExerciseId],
    queryFn: () => debugApi.getExerciseTimeline(selectedExerciseId!),
    enabled: selectedExerciseId !== null,
  })
  
  // Event triggered callback - send via WebSocket
  const handleEventTriggered = useCallback((event: TimelineEvent, virtualTimeMinutes: number) => {
    // Broadcast event to receivers (audience-filtered on backend)
    sendMessage({
      type: 'event',
      exercise_id: selectedExerciseId,
      virtual_time: virtualTimeMinutes,
      event: {
        id: event.id,
        title: event.title,
        type: event.type,
        description: event.description,
        content: event.content,
        time_offset: event.time_offset,
        audiences: event.audiences || [],
      },
    })
  }, [sendMessage, selectedExerciseId])
  
  // Timeline hook
  const {
    playbackState,
    virtualTimeMinutes,
    speed: currentSpeed,
    events,
    triggeredEvents,
    pendingEvents,
    play,
    pause,
    stop,
    setSpeed: setTimelineSpeed,
    reset,
  } = useDebugTimeline({
    injects: timeline?.injects ?? [],
    speed,
    onEventTriggered: handleEventTriggered,
  })
  
  // Broadcast state changes
  useEffect(() => {
    if (selectedExerciseId) {
      sendMessage({
        type: 'state_update',
        exercise_id: selectedExerciseId,
        state: playbackState,
        virtual_time: virtualTimeMinutes,
        speed: currentSpeed,
      })
    }
  }, [playbackState, virtualTimeMinutes, currentSpeed, selectedExerciseId, sendMessage])
  
  // Clear events when changing exercise
  useEffect(() => {
    reset()
  }, [selectedExerciseId, reset])
  
  // Handle speed change
  const handleSpeedChange = (newSpeed: number) => {
    setSpeed(newSpeed)
    setTimelineSpeed(newSpeed)
  }
  
  // Handle exercise selection
  const handleExerciseSelect = (exerciseId: number) => {
    stop()
    setSelectedExerciseId(exerciseId)
  }
  
  // Get event type config
  const getEventConfig = (type: string) => {
    return EVENT_TYPE_CONFIG[type] || EVENT_TYPE_CONFIG.system
  }
  
  // Check if debug is disabled
  if (debugStatus && !debugStatus.enabled) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-lg p-8 max-w-md text-center border border-red-500/50">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Debug Mode Disabled</h1>
          <p className="text-gray-400 mb-4">
            Debug endpoints are disabled in production environment.
          </p>
          <p className="text-sm text-gray-500">
            Current environment: <code className="bg-gray-700 px-2 py-1 rounded">{debugStatus.environment}</code>
          </p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Auth overlay — shown on 401 (not logged in) or 403 (wrong role) */}
      {authErrorStatus && <DebugAuthOverlay status={authErrorStatus} onLogin={connect} />}

      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Radio className="w-6 h-6 text-orange-500" />
            <h1 className="text-xl font-bold">Debug Events - Emitter</h1>
            <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 text-xs rounded font-medium">
              EMIT
            </span>
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
                {getConnectionStateLabel(connectionState)}
              </span>
            </div>

            {/* Client count */}
            <div className="flex items-center gap-1 text-sm text-gray-400">
              <Users size={14} />
              {clientCount} connected
            </div>

            <Link
              to="/debug/events_receive"
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              Open Receiver →
            </Link>

            <button
              onClick={() => setShowDebugInfo(!showDebugInfo)}
              className="text-gray-400 hover:text-white text-sm flex items-center gap-1"
            >
              <Info size={14} />
              Debug Info
            </button>
          </div>
        </div>
      </header>
      
      <div className="flex flex-col lg:flex-row">
        {/* Left Panel - Controls */}
        <div className="lg:w-80 bg-gray-800 border-b lg:border-b-0 lg:border-r border-gray-700 p-6 space-y-6">
          {/* Exercise Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Exercise
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
                  onChange={(e) => handleExerciseSelect(parseInt(e.target.value))}
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
          
          {/* Virtual Clock */}
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <div className="text-4xl font-mono font-bold text-white mb-1">
              {formatVirtualTime(virtualTimeMinutes)}
            </div>
            <div className="text-sm text-gray-500">
              Virtual Time
            </div>
          </div>
          
          {/* Playback Controls */}
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={play}
                disabled={playbackState === 'playing' || !selectedExerciseId || connectionState !== 'connected'}
                className="p-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors"
                title="Play"
              >
                <Play className="w-5 h-5" />
              </button>
              <button
                onClick={pause}
                disabled={playbackState !== 'playing'}
                className="p-3 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors"
                title="Pause"
              >
                <Pause className="w-5 h-5" />
              </button>
              <button
                onClick={stop}
                disabled={playbackState === 'stopped'}
                className="p-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors"
                title="Stop & Reset"
              >
                <Square className="w-5 h-5" />
              </button>
            </div>
            
            {/* Speed Control */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Speed: {currentSpeed}x
              </label>
              <div className="flex gap-1 flex-wrap">
                {[0.5, 1, 2, 5, 10, 30, 60].map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSpeedChange(s)}
                    className={`px-3 py-1.5 text-sm rounded transition-colors ${
                      currentSpeed === s
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          {/* Stats */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Total Events</span>
              <span className="text-white font-medium">{events.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Sent</span>
              <span className="text-green-400 font-medium">{triggeredEvents.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Pending</span>
              <span className="text-yellow-400 font-medium">{pendingEvents.length}</span>
            </div>
          </div>
          
          {/* Playback State Indicator */}
          <div className={`text-center py-2 rounded-lg ${
            playbackState === 'playing' ? 'bg-green-500/20 text-green-400' :
            playbackState === 'paused' ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-gray-700 text-gray-400'
          }`}>
            {playbackState === 'playing' && '▶ Emitting...'}
            {playbackState === 'paused' && '⏸ Paused'}
            {playbackState === 'stopped' && '⏹ Stopped'}
          </div>
        </div>
        
        {/* Right Panel - Event List */}
        <div className="flex-1 p-6">
          {/* Timeline Info */}
          {timeline && (
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {timeline.exercise_name} - {events.length} events
              </h2>
              <button
                onClick={() => reset()}
                className="text-sm text-gray-400 hover:text-white px-3 py-1 border border-gray-600 rounded hover:bg-gray-700"
              >
                Reset timeline
              </button>
            </div>
          )}
          
          {!selectedExerciseId ? (
            <div className="bg-gray-800 rounded-lg p-12 text-center">
              <Radio className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-400 mb-2">
                Select an Exercise
              </h3>
              <p className="text-gray-500">
                Choose an exercise to start emitting events.
              </p>
            </div>
          ) : isLoadingTimeline ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : events.length === 0 ? (
            <div className="bg-gray-800 rounded-lg p-12 text-center">
              <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-400 mb-2">
                No Events Found
              </h3>
              <p className="text-gray-500">
                This exercise has no injects with time offsets configured.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto">
              {events.map((event) => {
                const config = getEventConfig(event.type)
                const Icon = config.icon
                const isTriggered = triggeredEvents.some(e => e.id === event.id)
                
                return (
                  <div
                    key={event.id}
                    className={`bg-gray-800 rounded-lg border ${
                      isTriggered ? 'border-green-500/50' : 'border-gray-700'
                    } overflow-hidden`}
                  >
                    <div className="p-3 flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${config.bgColor}`}>
                        <Icon className={`w-4 h-4 ${config.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-white text-sm">
                            {event.title}
                          </p>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 font-mono">
                              T+{event.time_offset ?? 0}m
                            </span>
                            {isTriggered && (
                              <span className="text-xs text-green-400">✓ Sent</span>
                            )}
                          </div>
                        </div>
                        {event.audiences && event.audiences.length > 0 ? (
                          <div className="flex gap-1 flex-wrap mt-0.5">
                            {event.audiences.map((a) => (
                              <span
                                key={`${a.kind}-${a.value}`}
                                className="text-[10px] bg-gray-700 text-gray-300 rounded px-1.5 py-0.5"
                              >
                                {a.kind === 'team' ? `Équipe ${a.value}` : `${a.kind}:${a.value}`}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[10px] text-gray-500 italic">→ Tous</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      
      {/* Debug Info Panel */}
      {showDebugInfo && (
        <div className="fixed bottom-4 right-4 bg-gray-800 rounded-lg p-4 text-xs font-mono max-w-md border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400">Debug Info</span>
            <button
              onClick={() => setShowDebugInfo(false)}
              className="text-gray-500 hover:text-white"
            >
              ×
            </button>
          </div>
          <div className="space-y-1 text-gray-300">
            <div>WS State: {connectionState}</div>
            <div>Clients: {clientCount}</div>
            <div>Playback: {playbackState}</div>
            <div>Virtual Time: {virtualTimeMinutes.toFixed(2)} min</div>
            <div>Speed: {currentSpeed}x</div>
            <div>Exercise: {selectedExerciseId ?? 'None'}</div>
          </div>
        </div>
      )}
    </div>
  )
}
