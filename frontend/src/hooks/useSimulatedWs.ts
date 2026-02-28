/**
 * useSimulatedWs Hook
 * WebSocket connection for simulated communication channels
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { SimulatedWsEvent } from '../services/simulatedApi'
import { authApi } from '../services/api'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface UseSimulatedWsOptions {
  exerciseId: number
  onMail?: (mail: any) => void
  onChat?: (message: any) => void
  onSms?: (sms: any) => void
  onCall?: (call: any) => void
  onSocial?: (post: any) => void
  onPress?: (article: any) => void
  onTv?: (event: any) => void
  onConnect?: () => void
  onDisconnect?: () => void
}

export interface UseSimulatedWsReturn {
  connectionState: ConnectionState
  connect: () => void
  disconnect: () => void
}

export function useSimulatedWs(options: UseSimulatedWsOptions): UseSimulatedWsReturn {
  const {
    exerciseId,
    onMail,
    onChat,
    onSms,
    onCall,
    onSocial,
    onPress,
    onTv,
    onConnect,
    onDisconnect,
  } = options

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldReconnectRef = useRef(true)
  
  // Use refs to store callbacks to avoid stale closures and reconnecting on every render
  const onMailRef = useRef(onMail)
  const onChatRef = useRef(onChat)
  const onSmsRef = useRef(onSms)
  const onCallRef = useRef(onCall)
  const onSocialRef = useRef(onSocial)
  const onPressRef = useRef(onPress)
  const onTvRef = useRef(onTv)
  const onConnectRef = useRef(onConnect)
  const onDisconnectRef = useRef(onDisconnect)
  const exerciseIdRef = useRef(exerciseId)
  
  // Keep refs updated
  useEffect(() => {
    onMailRef.current = onMail
    onChatRef.current = onChat
    onSmsRef.current = onSms
    onCallRef.current = onCall
    onSocialRef.current = onSocial
    onPressRef.current = onPress
    onTvRef.current = onTv
    onConnectRef.current = onConnect
    onDisconnectRef.current = onDisconnect
    exerciseIdRef.current = exerciseId
  }, [onMail, onChat, onSms, onCall, onSocial, onPress, onTv, onConnect, onDisconnect, exerciseId])

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    shouldReconnectRef.current = true
    setConnectionState('connecting')

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    let wsTicket: string
    try {
      const ticketRes = await authApi.createWsTicket('simulated_channels', exerciseIdRef.current)
      wsTicket = ticketRes.ticket
    } catch (error) {
      console.error('[Simulated WS] Failed to fetch WS ticket:', error)
      setConnectionState('error')
      return
    }
    const url = `${protocol}//${host}/api/simulated/${exerciseIdRef.current}/ws?ticket=${encodeURIComponent(wsTicket)}`

    console.log('[Simulated WS] Connecting to:', url)

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[Simulated WS] Connected')
        setConnectionState('connected')
        onConnectRef.current?.()
      }

      ws.onmessage = (event) => {
        try {
          const message: SimulatedWsEvent = JSON.parse(event.data)
          console.log('[Simulated WS] Received:', message)

          // Handle system messages
          if (message.event_type === 'system') {
            console.log('[Simulated WS] System message:', message.data)
            return
          }

          // Dispatch to appropriate handler based on event type
          switch (message.event_type) {
            case 'mail':
              onMailRef.current?.(message.data)
              break
            case 'chat':
              onChatRef.current?.(message.data)
              break
            case 'sms':
            case 'message': // alias used by some emitters
              onSmsRef.current?.(message.data)
              break
            case 'call':
              onCallRef.current?.(message.data)
              break
            case 'social':
              onSocialRef.current?.(message.data)
              break
            case 'press':
              onPressRef.current?.(message.data)
              break
            case 'tv':
              onTvRef.current?.(message.data)
              break
            default:
              console.log('[Simulated WS] Unknown event type:', message.event_type)
          }
        } catch (error) {
          console.error('[Simulated WS] Failed to parse message:', error)
        }
      }

      ws.onclose = () => {
        console.log('[Simulated WS] Disconnected')
        setConnectionState('disconnected')
        onDisconnectRef.current?.()

        // Auto reconnect
        if (shouldReconnectRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            if (shouldReconnectRef.current) {
              void connect()
            }
          }, 3000)
        }
      }

      ws.onerror = (error) => {
        console.error('[Simulated WS] Error:', error)
        setConnectionState('error')
      }
    } catch (error) {
      console.error('[Simulated WS] Failed to connect:', error)
      setConnectionState('error')
    }
  }, [])

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false

    if (reconnectTimeoutRef.current !== null) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (wsRef.current !== null) {
      wsRef.current.close()
      wsRef.current = null
    }

    setConnectionState('disconnected')
  }, [])

  // Auto-connect on mount
  useEffect(() => {
    void connect()

    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  return {
    connectionState,
    connect,
    disconnect,
  }
}

/**
 * Get connection state color
 */
export function getConnectionStateColor(state: ConnectionState): string {
  switch (state) {
    case 'connected':
      return 'text-green-400'
    case 'connecting':
      return 'text-yellow-400'
    case 'error':
      return 'text-red-400'
    default:
      return 'text-gray-400'
  }
}

/**
 * Get connection state label
 */
export function getConnectionStateLabel(state: ConnectionState): string {
  switch (state) {
    case 'connected':
      return 'Connected'
    case 'connecting':
      return 'Connecting...'
    case 'error':
      return 'Error'
    default:
      return 'Disconnected'
  }
}
