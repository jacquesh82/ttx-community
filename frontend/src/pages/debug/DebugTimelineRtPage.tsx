/**
 * DebugTimelineRtPage - Timeline RT viewer for Animateur/Organisateur
 * Displays real-time events from the exercise
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Clock,
  Mail,
  MessageCircle,
  Smartphone,
  Phone,
  Tv,
  FileText,
  AlertTriangle,
  Image,
  Video,
  Newspaper,
  Building2,
  Shield,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  RefreshCw,
  Search,
  Filter,
  X,
  MoreHorizontal,
  User,
  Calendar,
  ArrowRight,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { useDebugEventsWs, getConnectionStateColor, DebugWsMessage } from '../../hooks/useDebugEventsWs'
import { formatVirtualTime } from '../../hooks/useDebugTimeline'
import { debugApi, DebugExercise } from '../../services/debugApi'

type MainTab = 'timeline' | 'events'

// Event type configurations
const EVENT_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bgColor: string; category: string }> = {
  mail: { label: 'Email', icon: Mail, color: 'text-primary-400', bgColor: 'bg-primary-500/20', category: 'communication' },
  twitter: { label: 'Réseau social', icon: MessageCircle, color: 'text-sky-400', bgColor: 'bg-sky-500/20', category: 'social' },
  tv: { label: 'TV / Vidéo', icon: Tv, color: 'text-teal-400', bgColor: 'bg-teal-500/20', category: 'media' },
  decision: { label: 'Décision', icon: AlertTriangle, color: 'text-orange-400', bgColor: 'bg-orange-500/20', category: 'decision' },
  score: { label: 'Score', icon: FileText, color: 'text-yellow-400', bgColor: 'bg-yellow-500/20', category: 'system' },
  system: { label: 'Système', icon: FileText, color: 'text-gray-400', bgColor: 'bg-gray-500/20', category: 'system' },
  message: { label: 'Message', icon: MessageCircle, color: 'text-cyan-400', bgColor: 'bg-cyan-500/20', category: 'social' },
  image: { label: 'Image', icon: Image, color: 'text-purple-400', bgColor: 'bg-purple-500/20', category: 'media' },
  video: { label: 'Vidéo', icon: Video, color: 'text-rose-400', bgColor: 'bg-rose-500/20', category: 'media' },
  document: { label: 'Document', icon: FileText, color: 'text-slate-400', bgColor: 'bg-slate-500/20', category: 'document' },
  social_post: { label: 'Post social', icon: MessageCircle, color: 'text-sky-400', bgColor: 'bg-sky-500/20', category: 'social' },
  canal_press: { label: 'Presse', icon: Newspaper, color: 'text-red-400', bgColor: 'bg-red-500/20', category: 'media' },
  canal_anssi: { label: 'ANSSI', icon: Shield, color: 'text-indigo-400', bgColor: 'bg-indigo-500/20', category: 'official' },
  canal_gouvernement: { label: 'Gouvernement', icon: Building2, color: 'text-violet-400', bgColor: 'bg-violet-500/20', category: 'official' },
  sms: { label: 'SMS', icon: Smartphone, color: 'text-green-400', bgColor: 'bg-green-500/20', category: 'communication' },
  phone: { label: 'Téléphone', icon: Phone, color: 'text-pink-400', bgColor: 'bg-pink-500/20', category: 'communication' },
}

interface TimelineEvent {
  id: number
  type: string
  title: string
  description?: string
  content?: Record<string, unknown>
  virtualTime: number
  timestamp: Date
  severity?: string
  category?: string
}

interface Stats {
  total: number
  byType: Record<string, number>
  byCategory: Record<string, number>
  lastEventTime: number
}

export default function DebugTimelineRtPage() {
  // State
  const [activeTab, setActiveTab] = useState<MainTab>('timeline')
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(null)
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [emitterState, setEmitterState] = useState<{
    state: string
    virtualTime: number
    speed: number
    exerciseId?: number
  } | null>(null)
  const [stats, setStats] = useState<Stats>({
    total: 0,
    byType: {},
    byCategory: {},
    lastEventTime: 0,
  })
  
  const timelineEndRef = useRef<HTMLDivElement>(null)

  // Query exercises
  const { data: exercises, isLoading: isLoadingExercises } = useQuery({
    queryKey: ['debug-exercises'],
    queryFn: debugApi.listExercises,
  })

  // Handle incoming WebSocket messages
  const handleWsMessage = useCallback((message: DebugWsMessage) => {
    if (message.type === 'event' && message.event) {
      const event: TimelineEvent = {
        id: (message.event as any).id || Date.now(),
        type: (message.event as any).type || 'system',
        title: (message.event as any).title || 'Unknown Event',
        description: (message.event as any).description,
        content: (message.event as any).content,
        virtualTime: message.virtual_time || 0,
        timestamp: new Date(),
        severity: (message.event as any).severity,
        category: (message.event as any).category,
      }
      setTimelineEvents(prev => [...prev, event])
      
      // Update stats
      setStats(prev => {
        const type = event.type
        const category = event.category || 'unknown'
        return {
          total: prev.total + 1,
          byType: { ...prev.byType, [type]: (prev.byType[type] || 0) + 1 },
          byCategory: { ...prev.byCategory, [category]: (prev.byCategory[category] || 0) + 1 },
          lastEventTime: event.virtualTime,
        }
      })
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
    clientCount,
    connect,
    disconnect,
  } = useDebugEventsWs({
    onMessage: handleWsMessage,
  })

  // Get event type config
  const getEventConfig = (type: string) => {
    return EVENT_TYPE_CONFIG[type] || EVENT_TYPE_CONFIG.system
  }

  // Get unique categories
  const categories = Object.values(EVENT_TYPE_CONFIG).map(c => c.category)
  const uniqueCategories = [...new Set(categories)]

  // Filter events
  const filteredEvents = timelineEvents.filter(event => {
    const config = getEventConfig(event.type)
    const matchesSearch = 
      event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (event.description && event.description.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesCategory = selectedCategory ? config.category === selectedCategory : true
    return matchesSearch && matchesCategory
  })

  // Clear events
  const handleClearEvents = () => {
    setTimelineEvents([])
    setStats({
      total: 0,
      byType: {},
      byCategory: {},
      lastEventTime: 0,
    })
  }

  // Auto-scroll to bottom
  useEffect(() => {
    if (timelineEndRef.current) {
      timelineEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [filteredEvents])

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-primary-500" />
            <h1 className="text-xl font-bold">Timeline RT - Animateur</h1>
            <span className="px-2 py-0.5 bg-primary-500/20 text-primary-400 text-xs rounded font-medium">
              TEMPS RÉEL
            </span>
          </div>
          
          {/* Tabs */}
          <div className="flex items-center gap-2 bg-gray-900 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('timeline')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'timeline'
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <Clock size={16} />
                Timeline
              </div>
            </button>
            <button
              onClick={() => setActiveTab('events')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'events'
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText size={16} />
                Events
              </div>
            </button>
          </div>
          
          <div className="flex items-center gap-4">
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
              <User size={14} />
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
        {/* Left Panel - Status & Stats */}
        <div className="lg:w-80 bg-gray-800 border-b lg:border-b-0 lg:border-r border-gray-700 p-6 space-y-6">
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
              <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Waiting for emitter...</p>
            </div>
          )}
          
          {/* Stats */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-400">Statistics</h3>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-900 rounded-lg p-3">
                <div className="text-2xl font-bold text-primary-400">{stats.total}</div>
                <div className="text-xs text-gray-500">Total Events</div>
              </div>
              <div className="bg-gray-900 rounded-lg p-3">
                <div className="text-2xl font-bold text-green-400">
                  {Object.keys(stats.byType).length}
                </div>
                <div className="text-xs text-gray-500">Event Types</div>
              </div>
            </div>
            
            {/* Events by Category */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-gray-500 uppercase">By Category</h4>
              {Object.entries(stats.byCategory).map(([category, count]) => (
                <div key={category} className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 capitalize">{category}</span>
                  <span className="text-white font-medium">{count}</span>
                </div>
              ))}
            </div>
            
            {/* Events by Type */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-gray-500 uppercase">By Type</h4>
              {Object.entries(stats.byType).slice(0, 5).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 capitalize">{type}</span>
                  <span className="text-white font-medium">{count}</span>
                </div>
              ))}
              {Object.keys(stats.byType).length > 5 && (
                <div className="text-xs text-gray-500 text-center">
                  +{Object.keys(stats.byType).length - 5} more types
                </div>
              )}
            </div>
          </div>
          
          {/* Clear Button */}
          <button
            onClick={handleClearEvents}
            disabled={timelineEvents.length === 0}
            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 rounded-lg text-sm flex items-center justify-center gap-2"
          >
            <RefreshCw size={14} />
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
        
        {/* Right Panel */}
        <div className="flex-1 p-6">
          {activeTab === 'timeline' ? (
            <>
              {/* Filters */}
              <div className="mb-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search events..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 ${
                      showFilters ? 'bg-primary-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    <Filter size={16} />
                    Filters
                  </button>
                </div>
                
                {/* Category Filters */}
                {showFilters && (
                  <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-2">
                    <button
                      onClick={() => setSelectedCategory(null)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                        selectedCategory === null
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      All
                    </button>
                    {uniqueCategories.map(category => (
                      <button
                        key={category}
                        onClick={() => setSelectedCategory(category)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize ${
                          selectedCategory === category
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Timeline */}
              <div className="relative">
                {/* Timeline Line */}
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-700" />
                
                {filteredEvents.length === 0 ? (
                  <div className="bg-gray-800 rounded-lg p-12 text-center">
                    <Clock className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-400 mb-2">
                      Waiting for Events
                    </h3>
                    <p className="text-gray-500">
                      Events will appear here in real-time.
                    </p>
                    <p className="text-sm text-gray-600 mt-4">
                      Open <Link to="/debug/events_emit" className="text-orange-400 hover:text-orange-300">the emitter page</Link> to start sending events.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 pl-10">
                    {filteredEvents.map((event, index) => {
                      const config = getEventConfig(event.type)
                      const Icon = config.icon
                      
                      return (
                        <div key={`${event.id}-${index}`} className="relative">
                          {/* Timeline Dot */}
                          <div className={`absolute left-0 top-4 w-8 h-8 rounded-full border-4 border-gray-900 flex items-center justify-center ${config.bgColor}`}>
                            <Icon className={`w-4 h-4 ${config.color}`} />
                          </div>
                          
                          {/* Event Card */}
                          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden hover:border-gray-600 transition-colors">
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
                                      <div className="text-sm font-mono text-primary-400">
                                        {formatVirtualTime(event.virtualTime)}
                                      </div>
                                      <div className="text-xs text-gray-500">
                                        {config.label}
                                      </div>
                                    </div>
                                  </div>
                                  
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
                        </div>
                      )
                    })}
                    <div ref={timelineEndRef} />
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">
                  Event Log
                </h2>
                <span className="text-sm text-gray-400">
                  {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''} shown
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
              
              {filteredEvents.length === 0 && connectionState === 'connected' ? (
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
                <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
                  {filteredEvents.map((event, index) => {
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
                                  <div className="text-sm font-mono text-primary-400">
                                    {formatVirtualTime(event.virtualTime)}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {config.label}
                                  </div>
                                </div>
                              </div>
                              
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
          )}
        </div>
      </div>
    </div>
  )
}