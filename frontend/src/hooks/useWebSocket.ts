/**
 * useWebSocket Hook
 * React hook for WebSocket connection management
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuthStore } from '../stores/authStore'
import { authApi } from '../services/api'
import {
  websocketService,
  WebSocketMessage,
  WebSocketEventType,
} from '../services/websocketService'

interface UseWebSocketOptions {
  exerciseId: number | null
  enabled?: boolean
  onMessage?: (message: WebSocketMessage) => void
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Event) => void
}

interface UseWebSocketReturn {
  isConnected: boolean
  lastMessage: WebSocketMessage | null
  sendMessage: (data: object) => void
  disconnect: () => void
  reconnect: () => void
}

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const { exerciseId, enabled = true, onMessage, onConnect, onDisconnect, onError } = options
  const { user } = useAuthStore()
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)
  const callbacksRef = useRef({ onMessage, onConnect, onDisconnect, onError })

  // Keep callbacks ref updated
  useEffect(() => {
    callbacksRef.current = { onMessage, onConnect, onDisconnect, onError }
  }, [onMessage, onConnect, onDisconnect, onError])

  // Handle incoming messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    setLastMessage(message)
    callbacksRef.current.onMessage?.(message)
  }, [])

  // Handle connection
  const handleConnect = useCallback(() => {
    setIsConnected(true)
    callbacksRef.current.onConnect?.()
  }, [])

  // Handle disconnection
  const handleDisconnect = useCallback(() => {
    setIsConnected(false)
    callbacksRef.current.onDisconnect?.()
  }, [])

  // Handle error
  const handleError = useCallback((error: Event) => {
    callbacksRef.current.onError?.(error)
  }, [])

  // Connect/disconnect based on exerciseId and enabled
  useEffect(() => {
    if (!exerciseId || !enabled || !user) {
      if (isConnected) {
        websocketService.disconnect()
        setIsConnected(false)
      }
      return
    }

    websocketService.connect(exerciseId, {
      getTicket: async () => {
        const res = await authApi.createWsTicket('exercise_updates', exerciseId)
        return res.ticket
      },
      onMessage: handleMessage,
      onConnect: handleConnect,
      onDisconnect: handleDisconnect,
      onError: handleError,
      reconnect: true,
      reconnectInterval: 3000,
      maxReconnectAttempts: 10,
    })

    return () => {
      websocketService.disconnect()
      setIsConnected(false)
    }
  }, [exerciseId, enabled, user, handleMessage, handleConnect, handleDisconnect, handleError])

  // Send message function
  const sendMessage = useCallback((data: object) => {
    websocketService.send(data)
  }, [])

  // Disconnect function
  const disconnect = useCallback(() => {
    websocketService.disconnect()
    setIsConnected(false)
  }, [])

  // Reconnect function
  const reconnect = useCallback(() => {
    if (exerciseId && user) {
      websocketService.disconnect()
      websocketService.connect(exerciseId, {
        getTicket: async () => {
          const res = await authApi.createWsTicket('exercise_updates', exerciseId)
          return res.ticket
        },
        onMessage: handleMessage,
        onConnect: handleConnect,
        onDisconnect: handleDisconnect,
        onError: handleError,
        reconnect: true,
        reconnectInterval: 3000,
        maxReconnectAttempts: 10,
      })
    }
  }, [exerciseId, user, handleMessage, handleConnect, handleDisconnect, handleError])

  return {
    isConnected,
    lastMessage,
    sendMessage,
    disconnect,
    reconnect,
  }
}

/**
 * Hook for handling specific WebSocket events
 */
export function useWebSocketEvent(
  eventType: WebSocketEventType | WebSocketEventType[],
  handler: (data: any, message: WebSocketMessage) => void
) {
  const eventTypes = Array.isArray(eventType) ? eventType : [eventType]

  return useCallback(
    (message: WebSocketMessage) => {
      if (eventTypes.includes(message.type)) {
        handler(message.data, message)
      }
    },
    [eventTypes, handler]
  )
}
