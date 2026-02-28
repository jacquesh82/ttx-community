/**
 * useDebugEventsWs Hook
 * WebSocket connection for debug events communication
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuthStore } from '../stores/authStore'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface DebugWsMessage {
  type: string
  exercise_id?: number
  virtual_time?: number
  event?: Record<string, unknown>
  state?: string
  speed?: number
  message?: string
  client_count?: number
  timestamp: string
}

export interface UseDebugEventsWsOptions {
  onMessage?: (message: DebugWsMessage) => void
  onConnect?: () => void
  onDisconnect?: () => void
  extraParams?: Record<string, string>
}

export interface UseDebugEventsWsReturn {
  connectionState: ConnectionState
  clientCount: number
  /** HTTP status of the last failed ticket request (401 or 403), or null */
  authErrorStatus: number | null
  sendMessage: (data: object) => void
  connect: () => void
  disconnect: () => void
}

export function useDebugEventsWs(options: UseDebugEventsWsOptions = {}): UseDebugEventsWsReturn {
  const { onMessage, onConnect, onDisconnect, extraParams } = options

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [clientCount, setClientCount] = useState(0)
  const [authErrorStatus, setAuthErrorStatus] = useState<number | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldReconnectRef = useRef(true)
  const extraParamsRef = useRef(extraParams)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Keep extra params ref current without triggering reconnect
  useEffect(() => {
    extraParamsRef.current = extraParams
  }, [extraParams])

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    // Abort any in-flight ticket request (handles React StrictMode double-invoke)
    abortControllerRef.current?.abort()
    abortControllerRef.current = new AbortController()

    shouldReconnectRef.current = true
    setConnectionState('connecting')

    // Use relative WebSocket URL - Vite proxy will handle routing to backend
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    // Use native fetch (not axios) to avoid the global 401→/login redirect interceptor.
    // Debug pages must fail gracefully without logging the user out.
    let wsTicket: string
    try {
      const csrfToken = useAuthStore.getState().csrfToken
      const ticketRes = await fetch('/api/auth/ws-ticket', {
        method: 'POST',
        credentials: 'include',
        signal: abortControllerRef.current.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify({ scope: 'debug_events', exercise_id: null }),
      })
      if (!ticketRes.ok) {
        console.warn('[Debug WS] WS ticket request failed:', ticketRes.status)
        // Show overlay on auth/permission errors; silently fail on others
        setAuthErrorStatus([401, 403].includes(ticketRes.status) ? ticketRes.status : null)
        setConnectionState('error')
        return
      }
      setAuthErrorStatus(null)
      const ticketData = await ticketRes.json()
      wsTicket = ticketData.ticket
    } catch (error: any) {
      if (error?.name === 'AbortError') return  // StrictMode cleanup — silently cancel
      console.error('[Debug WS] Failed to fetch WS ticket:', error)
      setConnectionState('error')
      return
    }
    const params = extraParamsRef.current
    const extraQuery = params
      ? Object.entries(params)
          .filter(([, v]) => v !== '')
          .map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('')
      : ''
    const url = `${protocol}//${host}/api/debug/ws/events?ticket=${encodeURIComponent(wsTicket)}${extraQuery}`
    
    console.log('[Debug WS] Connecting to:', url)
    
    try {
      const ws = new WebSocket(url)
      wsRef.current = ws
      
      ws.onopen = () => {
        console.log('[Debug WS] Connected')
        setConnectionState('connected')
        onConnect?.()
      }
      
      ws.onmessage = (event) => {
        try {
          const message: DebugWsMessage = JSON.parse(event.data)
          
          if (message.type === 'connected') {
            setClientCount(message.client_count || 1)
          }
          
          if (message.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }))
            return
          }
          
          if (message.type === 'pong') {
            return
          }
          
          onMessage?.(message)
        } catch (error) {
          console.error('[Debug WS] Failed to parse message:', error)
        }
      }
      
      ws.onclose = () => {
        console.log('[Debug WS] Disconnected')
        setConnectionState('disconnected')
        onDisconnect?.()
        
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
        console.error('[Debug WS] Error:', error)
        setConnectionState('error')
      }
    } catch (error) {
      console.error('[Debug WS] Failed to connect:', error)
      setConnectionState('error')
    }
  }, [onMessage, onConnect, onDisconnect])
  
  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false
    abortControllerRef.current?.abort()

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    setConnectionState('disconnected')
  }, [])
  
  const sendMessage = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    } else {
      console.warn('[Debug WS] Cannot send message - not connected')
    }
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
    clientCount,
    authErrorStatus,
    sendMessage,
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
