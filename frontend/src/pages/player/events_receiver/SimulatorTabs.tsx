import { useState, useCallback, useEffect, Suspense } from 'react'
import { Wifi } from 'lucide-react'
import { useSimulatedWs } from '../../../hooks/useSimulatedWs'
import { useDebugEventsWs, DebugWsMessage } from '../../../hooks/useDebugEventsWs'
import { getSimulatorPlugins } from '../../../plugins/registry'
import type { PluginManifest } from '../../../plugins/types'

// Build tabs from plugin registry — only plugins with an EventReceiver
const simulatorPlugins = getSimulatorPlugins().filter((p) => p.EventReceiver !== null)

// Map from plugin code to a short tab key (derived from playerRoute)
function getTabKey(plugin: PluginManifest): string {
  if (plugin.playerRoute) return plugin.playerRoute.replace(/^\//, '')
  return plugin.code
}

const pluginTabs = simulatorPlugins.map((p) => ({
  key: getTabKey(p),
  code: p.code,
  label: p.code === 'phone' ? 'Tel' : undefined, // Use short label for phone
  icon: p.icon,
  EventReceiver: p.EventReceiver!,
  plugin: p,
}))

// Mapping from WS event types to tab keys for notification badges
const EVENT_TYPE_TO_TAB: Record<string, string> = {
  mail: 'mail',
  sms: 'sms',
  message: 'sms',
  chat: 'chat',
  call: 'phone',
  tv: 'tv',
  social: 'social',
  press: 'press',
}

interface SimulatorEventState {
  hasNewEvent: boolean
  lastEventTime: number
}

interface SimulatorTabsProps {
  exerciseId: number
}

export default function SimulatorTabs({ exerciseId }: SimulatorTabsProps) {
  const [activeTab, setActiveTab] = useState(pluginTabs[0]?.key ?? '')
  const [refreshKey, setRefreshKey] = useState(0)

  // Initialize event state for all tab keys
  const [eventState, setEventState] = useState<Record<string, SimulatorEventState>>(() => {
    const state: Record<string, SimulatorEventState> = {}
    for (const tab of pluginTabs) {
      state[tab.key] = { hasNewEvent: false, lastEventTime: 0 }
    }
    return state
  })

  // Reset event state after 5 seconds
  useEffect(() => {
    Object.entries(eventState).forEach(([tabKey, state]) => {
      if (state.hasNewEvent && state.lastEventTime > 0) {
        const timeSinceEvent = Date.now() - state.lastEventTime
        if (timeSinceEvent > 5000) {
          setEventState(prev => ({
            ...prev,
            [tabKey]: { ...prev[tabKey], hasNewEvent: false }
          }))
        }
      }
    })
  }, [eventState])

  const markTabEvent = useCallback((tabKey: string) => {
    setEventState(prev => ({
      ...prev,
      [tabKey]: { hasNewEvent: true, lastEventTime: Date.now() }
    }))
  }, [])

  const handleWsEvent = useCallback((_data?: any) => {
    setRefreshKey(prev => prev + 1)
    markTabEvent('mail')
  }, [markTabEvent])

  const handleSocialEvent = useCallback((_data?: any) => {
    setRefreshKey(prev => prev + 1)
    markTabEvent('social')
  }, [markTabEvent])

  const handlePressEvent = useCallback((_data?: any) => {
    setRefreshKey(prev => prev + 1)
    markTabEvent('press')
  }, [markTabEvent])

  // Handle debug events from event emitter
  const handleDebugMessage = useCallback((message: DebugWsMessage) => {
    if (message.type === 'event' && message.event) {
      const eventType = message.event.type as string

      if (eventType === 'mail') {
        window.dispatchEvent(new CustomEvent('debug-mail-event', { detail: message.event }))
        markTabEvent('mail')
      }

      if (eventType === 'sms' || eventType === 'message') {
        window.dispatchEvent(new CustomEvent('debug-sms-event', { detail: message.event }))
        markTabEvent('sms')
      }

      // Also mark the tab from the event type mapping
      const mappedTab = EVENT_TYPE_TO_TAB[eventType]
      if (mappedTab) {
        markTabEvent(mappedTab)
      }

      setRefreshKey(prev => prev + 1)
    }
  }, [markTabEvent])

  const { connectionState } = useSimulatedWs({
    exerciseId,
    onMail: handleWsEvent,
    onChat: handleWsEvent,
    onSms: handleWsEvent,
    onCall: handleWsEvent,
    onTv: handleWsEvent,
    onSocial: handleSocialEvent,
    onPress: handlePressEvent,
  })

  const { connectionState: debugConnectionState } = useDebugEventsWs({
    onMessage: handleDebugMessage,
  })

  const isConnected = connectionState === 'connected'
  const isDebugConnected = debugConnectionState === 'connected'

  const getEventBadge = (tabKey: string) => {
    const state = eventState[tabKey]
    if (state?.hasNewEvent) {
      return (
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-gray-800 animate-pulse" />
      )
    }
    return null
  }

  const activePlugin = pluginTabs.find((t) => t.key === activeTab)

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar + WebSocket Status */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {pluginTabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                <Icon size={16} />
                {tab.label ?? tab.key.charAt(0).toUpperCase() + tab.key.slice(1)}
                {getEventBadge(tab.key)}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className={`flex items-center gap-1 ${isConnected ? 'text-green-400' : 'text-gray-400'}`}>
            <Wifi size={14} />
            {isConnected ? 'Sim' : 'Sim...'}
          </span>
          <span className={`flex items-center gap-1 ${isDebugConnected ? 'text-primary-400' : 'text-gray-400'}`}>
            {isDebugConnected ? 'Events' : 'Events...'}
          </span>
        </div>
      </div>

      {/* Content — render active simulator's EventReceiver */}
      <div className="flex-1 min-h-0">
        {activePlugin && (
          <Suspense fallback={<div className="text-gray-400 text-sm p-4">Chargement...</div>}>
            <activePlugin.EventReceiver exerciseId={exerciseId} refreshKey={refreshKey} />
          </Suspense>
        )}
      </div>
    </div>
  )
}
