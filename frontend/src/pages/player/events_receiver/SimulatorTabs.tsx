import { useState, useCallback, useEffect } from 'react'
import { Mail, MessageCircle, Smartphone, Phone, Tv, Wifi, WifiOff, Newspaper } from 'lucide-react'
import { useSimulatedWs } from '../../../hooks/useSimulatedWs'
import { useDebugEventsWs, DebugWsMessage } from '../../../hooks/useDebugEventsWs'
import MailSimulator from './MailSimulator'
import ChatSimulator from './ChatSimulator'
import SmsSimulator from './SmsSimulator'
import TelSimulator from './TelSimulator'
import TvSimulator from './TvSimulator'
import SocialSimulator from './SocialSimulator'
import PressSimulator from './PressSimulator'

type SimulatorTab = 'mail' | 'chat' | 'sms' | 'tel' | 'tv' | 'social' | 'press'

interface SimulatorEventState {
  hasNewEvent: boolean
  lastEventTime: number
}

interface SimulatorTabsProps {
  exerciseId: number
}

const tabs: { id: SimulatorTab; label: string; icon: React.ElementType }[] = [
  { id: 'mail', label: 'Mail', icon: Mail },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'sms', label: 'SMS', icon: Smartphone },
  { id: 'tel', label: 'Tel', icon: Phone },
  { id: 'tv', label: 'TV', icon: Tv },
  { id: 'social', label: 'Réseau social', icon: MessageCircle },
  { id: 'press', label: 'Presse', icon: Newspaper },
]

export default function SimulatorTabs({ exerciseId }: SimulatorTabsProps) {
  const [activeTab, setActiveTab] = useState<SimulatorTab>('mail')
  const [refreshKey, setRefreshKey] = useState(0)
  const [eventState, setEventState] = useState<Record<SimulatorTab, SimulatorEventState>>({
    mail: { hasNewEvent: false, lastEventTime: 0 },
    chat: { hasNewEvent: false, lastEventTime: 0 },
    sms: { hasNewEvent: false, lastEventTime: 0 },
    tel: { hasNewEvent: false, lastEventTime: 0 },
    tv: { hasNewEvent: false, lastEventTime: 0 },
    social: { hasNewEvent: false, lastEventTime: 0 },
    press: { hasNewEvent: false, lastEventTime: 0 },
  })

  // Reset event state after 5 seconds
  useEffect(() => {
    const timeoutIds: Record<SimulatorTab, ReturnType<typeof setTimeout> | null> = {
      mail: null,
      chat: null,
      sms: null,
      tel: null,
      tv: null,
      social: null,
      press: null,
    }

    Object.entries(eventState).forEach(([tabKey, state]) => {
      if (state.hasNewEvent && state.lastEventTime > 0) {
        const timeSinceEvent = Date.now() - state.lastEventTime
        if (timeSinceEvent > 5000) {
          setEventState(prev => ({
            ...prev,
            [tabKey as SimulatorTab]: { ...prev[tabKey as SimulatorTab], hasNewEvent: false }
          }))
        }
      }
    })

    return () => {
      Object.values(timeoutIds).forEach(id => {
        if (id) clearTimeout(id)
      })
    }
  }, [eventState])

  const handleWsEvent = useCallback((data?: any) => {
    console.log('[SimulatorTabs] Simulated WS event received:', data)
    setRefreshKey(prev => prev + 1)
    
    // Mark mail as having new event
    setEventState(prev => ({
      ...prev,
      mail: { hasNewEvent: true, lastEventTime: Date.now() }
    }))
  }, [])

  const handleSocialEvent = useCallback((data?: any) => {
    console.log('[SimulatorTabs] Social event received:', data)
    setRefreshKey(prev => prev + 1)
    
    // Mark social as having new event
    setEventState(prev => ({
      ...prev,
      social: { hasNewEvent: true, lastEventTime: Date.now() }
    }))
  }, [])

  const handlePressEvent = useCallback((data?: any) => {
    console.log('[SimulatorTabs] Press event received:', data)
    setRefreshKey(prev => prev + 1)
    
    // Mark press as having new event
    setEventState(prev => ({
      ...prev,
      press: { hasNewEvent: true, lastEventTime: Date.now() }
    }))
  }, [])

  // Handle debug events from event emitter
  const handleDebugMessage = useCallback((message: DebugWsMessage) => {
    console.log('[SimulatorTabs] Debug event received:', message)
    
    if (message.type === 'event' && message.event) {
      const eventType = message.event.type as string
      console.log('[SimulatorTabs] Event type:', eventType)
      
      // For mail events, we need to trigger a refresh AND pass the event data
      if (eventType === 'mail') {
        window.dispatchEvent(new CustomEvent('debug-mail-event', { detail: message.event }))
        setEventState(prev => ({
          ...prev,
          mail: { hasNewEvent: true, lastEventTime: Date.now() }
        }))
      }

      // SMS injects may arrive as "sms" or "message" depending on source mapping
      if (eventType === 'sms' || eventType === 'message') {
        window.dispatchEvent(new CustomEvent('debug-sms-event', { detail: message.event }))
        setEventState(prev => ({
          ...prev,
          sms: { hasNewEvent: true, lastEventTime: Date.now() }
        }))
      }
      
      // Refresh all simulators
      setRefreshKey(prev => prev + 1)
    }
  }, [])

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

  // Also connect to debug WebSocket to receive events from emitter
  const { connectionState: debugConnectionState } = useDebugEventsWs({
    onMessage: handleDebugMessage,
  })

  const isConnected = connectionState === 'connected'
  const isDebugConnected = debugConnectionState === 'connected'

  const getEventBadge = (tabId: SimulatorTab) => {
    const state = eventState[tabId]
    if (state.hasNewEvent) {
      return (
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-gray-800 animate-pulse" />
      )
    }
    return null
  }

  return (
    <div className="h-full flex flex-col">
      {/* WebSocket Status */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                <Icon size={16} />
                {tab.label}
                {getEventBadge(tab.id)}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-4 text-sm">
          {/* Simulated channels connection */}
          <span className={`flex items-center gap-1 ${isConnected ? 'text-green-400' : 'text-gray-400'}`}>
            <Wifi size={14} />
            {isConnected ? 'Sim' : 'Sim...'}
          </span>
          {/* Debug events connection */}
          <span className={`flex items-center gap-1 ${isDebugConnected ? 'text-primary-400' : 'text-gray-400'}`}>
            {isDebugConnected ? 'Events' : 'Events...'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {activeTab === 'mail' && <MailSimulator exerciseId={exerciseId} refreshKey={refreshKey} />}
        {activeTab === 'chat' && <ChatSimulator exerciseId={exerciseId} refreshKey={refreshKey} />}
        {activeTab === 'sms' && <SmsSimulator exerciseId={exerciseId} refreshKey={refreshKey} />}
        {activeTab === 'tel' && <TelSimulator exerciseId={exerciseId} refreshKey={refreshKey} />}
        {activeTab === 'tv' && <TvSimulator exerciseId={exerciseId} refreshKey={refreshKey} />}
        {activeTab === 'social' && <SocialSimulator exerciseId={exerciseId} refreshKey={refreshKey} />}
        {activeTab === 'press' && <PressSimulator exerciseId={exerciseId} refreshKey={refreshKey} />}
      </div>
    </div>
  )
}
