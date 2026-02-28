import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { playerApi, PlayerEvent, Notification, PlayerInject, Decision, ChatRoom } from '../services/playerApi'
import { useAuthStore } from '../stores/authStore'
import { useWebSocket } from '../hooks/useWebSocket'
import { WebSocketMessage } from '../services/websocketService'

interface PlayerContextValue {
  // Context data
  context: any | null
  isLoading: boolean
  error: string | null
  errorCode: number | null
  
  // Timeline
  events: PlayerEvent[]
  isLoadingEvents: boolean
  
  // Injects
  injects: PlayerInject[]
  isLoadingInjects: boolean
  
  // Decisions
  decisions: Decision[]
  isLoadingDecisions: boolean
  
  // Notifications
  notifications: Notification[]
  unreadCount: number
  
  // Chat
  chatRooms: ChatRoom[]
  isLoadingChatRooms: boolean
  
  // Actions
  refetchContext: () => void
  refetchTimeline: () => void
  refetchInjects: () => void
  refetchDecisions: () => void
  refetchNotifications: () => void
  refetchChatRooms: () => void
  
  // Utilities
  getExerciseTime: () => string | null
  getExerciseStatus: () => string
  getTeamInfo: () => { id: number; name: string; code: string } | null
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  
  const exerciseIdNum = parseInt(exerciseId || '0')

  // Context query
  const {
    data: context,
    isLoading: isLoadingContext,
    error: contextError,
    refetch: refetchContext
  } = useQuery({
    queryKey: ['player-context', exerciseIdNum],
    queryFn: () => playerApi.getContext(exerciseIdNum),
    enabled: !!exerciseIdNum,
    refetchInterval: 30000, // Refresh every 30s for exercise time
  })

  // Timeline query
  const {
    data: events,
    isLoading: isLoadingEvents,
    refetch: refetchTimeline
  } = useQuery({
    queryKey: ['player-timeline', exerciseIdNum],
    queryFn: () => playerApi.getTimeline(exerciseIdNum),
    enabled: !!exerciseIdNum,
  })

  // Injects query
  const {
    data: injects,
    isLoading: isLoadingInjects,
    refetch: refetchInjects
  } = useQuery({
    queryKey: ['player-injects', exerciseIdNum],
    queryFn: () => playerApi.getInjects(exerciseIdNum),
    enabled: !!exerciseIdNum,
  })

  // Decisions query
  const {
    data: decisions,
    isLoading: isLoadingDecisions,
    refetch: refetchDecisions
  } = useQuery({
    queryKey: ['player-decisions', exerciseIdNum],
    queryFn: () => playerApi.getDecisions(exerciseIdNum),
    enabled: !!exerciseIdNum,
  })

  // Notifications query
  const {
    data: notificationsData,
    isLoading: isLoadingNotifications,
    refetch: refetchNotifications
  } = useQuery({
    queryKey: ['player-notifications', exerciseIdNum],
    queryFn: () => playerApi.getNotifications(exerciseIdNum),
    enabled: !!exerciseIdNum,
    refetchInterval: 10000, // Refresh every 10s
  })

  // Chat rooms query
  const {
    data: chatRooms,
    isLoading: isLoadingChatRooms,
    refetch: refetchChatRooms
  } = useQuery({
    queryKey: ['player-chat-rooms', exerciseIdNum],
    queryFn: () => playerApi.getChatRooms(exerciseIdNum),
    enabled: !!exerciseIdNum,
  })

  // WebSocket message handler
  const handleWebSocketMessage = useCallback(
    (message: WebSocketMessage) => {
      console.log('[Player] WebSocket message:', message.type)
      
      switch (message.type) {
        case 'inject:sent':
        case 'inject:received':
          // Refresh injects when a new inject is sent/received
          queryClient.invalidateQueries({ queryKey: ['player-injects', exerciseIdNum] })
          queryClient.invalidateQueries({ queryKey: ['player-notifications', exerciseIdNum] })
          queryClient.invalidateQueries({ queryKey: ['player-timeline', exerciseIdNum] })
          break
        case 'exercise:started':
        case 'exercise:paused':
        case 'exercise:ended':
          // Refresh context when exercise state changes
          queryClient.invalidateQueries({ queryKey: ['player-context', exerciseIdNum] })
          break
        case 'event:new':
          // Refresh timeline when new events occur
          queryClient.invalidateQueries({ queryKey: ['player-timeline', exerciseIdNum] })
          queryClient.invalidateQueries({ queryKey: ['player-notifications', exerciseIdNum] })
          break
      }
    },
    [queryClient, exerciseIdNum]
  )

  // WebSocket connection - only connect when exercise is running
  const { isConnected: isWsConnected } = useWebSocket({
    exerciseId: exerciseIdNum,
    enabled: !!exerciseIdNum && context?.exercise?.status === 'running',
    onMessage: handleWebSocketMessage,
  })

  // Handle authentication only - permission errors are displayed in UI
  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }
  }, [user, navigate])

  // Utility functions
  const getExerciseTime = () => {
    return context?.exercise_time || null
  }

  const getExerciseStatus = () => {
    return context?.exercise.status || 'unknown'
  }

  const getTeamInfo = () => {
    if (!context?.team) return null
    return {
      id: context.team.id,
      name: context.team.name,
      code: context.team.code
    }
  }

  // Extract error info from API response
  const getErrorInfo = (): { message: string | null; code: number | null } => {
    if (!contextError) return { message: null, code: null }
    const error = contextError as any
    const message = error?.response?.data?.detail || error?.message || 'Une erreur est survenue'
    const code = error?.response?.status || null
    return { message, code }
  }

  const errorInfo = getErrorInfo()

  const value: PlayerContextValue = {
    // Context
    context,
    isLoading: isLoadingContext,
    error: errorInfo.message,
    errorCode: errorInfo.code,
    
    // Timeline
    events: events?.events || [],
    isLoadingEvents,
    
    // Injects
    injects: injects || [],
    isLoadingInjects,
    
    // Decisions
    decisions: decisions || [],
    isLoadingDecisions,
    
    // Notifications
    notifications: notificationsData?.notifications || [],
    unreadCount: notificationsData?.unread_count || 0,
    
    // Chat
    chatRooms: chatRooms || [],
    isLoadingChatRooms,
    
    // Actions
    refetchContext,
    refetchTimeline,
    refetchInjects,
    refetchDecisions,
    refetchNotifications,
    refetchChatRooms,
    
    // Utilities
    getExerciseTime,
    getExerciseStatus,
    getTeamInfo,
  }

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const context = useContext(PlayerContext)
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider')
  }
  return context
}

// Hook for updating delivery status
export function useUpdateDelivery() {
  const queryClient = useQueryClient()
  const { exerciseId } = useParams<{ exerciseId: string }>()
  
  return useMutation({
    mutationFn: (data: {
      deliveryId: number
      status?: any
      acknowledge?: boolean
      treat?: boolean
    }) => playerApi.updateDelivery(data.deliveryId, {
      status: data.status,
      acknowledge: data.acknowledge,
      treat: data.treat
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['player-context', parseInt(exerciseId!)] })
      queryClient.invalidateQueries({ queryKey: ['player-injects', parseInt(exerciseId!)] })
      queryClient.invalidateQueries({ queryKey: ['player-timeline', parseInt(exerciseId!)] })
    },
  })
}

// Hook for creating decisions
export function useCreateDecision() {
  const queryClient = useQueryClient()
  const { exerciseId } = useParams<{ exerciseId: string }>()
  
  return useMutation({
    mutationFn: (data: {
      title: string
      description?: string
      impact?: string
      source_event_id?: number
      source_inject_id?: number
    }) => playerApi.createDecision(parseInt(exerciseId!), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['player-decisions', parseInt(exerciseId!)] })
      queryClient.invalidateQueries({ queryKey: ['player-context', parseInt(exerciseId!)] })
    },
  })
}

// Hook for sending chat messages
export function useSendChatMessage() {
  const queryClient = useQueryClient()
  const { exerciseId } = useParams<{ exerciseId: string }>()
  
  return useMutation({
    mutationFn: (data: {
      roomId: number
      content: string
    }) => playerApi.sendChatMessage(parseInt(exerciseId!), data.roomId, data.content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['player-chat-rooms', parseInt(exerciseId!)] })
    },
  })
}
