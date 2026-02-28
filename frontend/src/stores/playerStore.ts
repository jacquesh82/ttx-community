import { create } from 'zustand'
import { playerApi, PlayerContext, PlayerEvent, Notification } from '../services/playerApi'

interface PlayerState {
  // Context
  context: PlayerContext | null
  isLoadingContext: boolean
  contextError: string | null
  
  // Timeline
  events: PlayerEvent[]
  isLoadingEvents: boolean
  
  // Notifications
  notifications: Notification[]
  unreadCount: number
  
  // Right panel
  rightPanelOpen: boolean
  
  // Actions
  fetchContext: (exerciseId: number) => Promise<void>
  fetchTimeline: (exerciseId: number, params?: {
    channel?: string
    scope?: string
    criticity?: string
  }) => Promise<void>
  fetchNotifications: (exerciseId: number) => Promise<void>
  setRightPanelOpen: (open: boolean) => void
  clearContext: () => void
  
  // Computed helpers (called from components)
  getExerciseTime: () => string | null
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  // Initial state
  context: null,
  isLoadingContext: false,
  contextError: null,
  events: [],
  isLoadingEvents: false,
  notifications: [],
  unreadCount: 0,
  rightPanelOpen: true,
  
  // Actions
  fetchContext: async (exerciseId: number) => {
    set({ isLoadingContext: true, contextError: null })
    try {
      const context = await playerApi.getContext(exerciseId)
      set({ context, isLoadingContext: false })
    } catch (error: any) {
      set({
        contextError: error.response?.data?.detail || 'Failed to load context',
        isLoadingContext: false
      })
    }
  },
  
  fetchTimeline: async (exerciseId: number, params?: {
    channel?: string
    scope?: string
    criticity?: string
  }) => {
    set({ isLoadingEvents: true })
    try {
      const response = await playerApi.getTimeline(exerciseId, params)
      set({ events: response.events, isLoadingEvents: false })
    } catch (error) {
      set({ isLoadingEvents: false })
    }
  },
  
  fetchNotifications: async (exerciseId: number) => {
    try {
      const response = await playerApi.getNotifications(exerciseId)
      set({ notifications: response.notifications, unreadCount: response.unread_count })
    } catch (error) {
      // Silently fail for notifications
    }
  },
  
  setRightPanelOpen: (open: boolean) => {
    set({ rightPanelOpen: open })
  },
  
  clearContext: () => {
    set({
      context: null,
      events: [],
      notifications: [],
      unreadCount: 0
    })
  },
  
  getExerciseTime: () => {
    const { context } = get()
    return context?.exercise_time || null
  }
}))

// Hook for polling exercise time updates
export const useExerciseTimePolling = (exerciseId: number | null, intervalMs: number = 30000) => {
  const fetchContext = usePlayerStore(state => state.fetchContext)
  
  // Effect for periodic context refresh (for exercise time)
  if (exerciseId && intervalMs > 0) {
    setInterval(() => {
      fetchContext(exerciseId)
    }, intervalMs)
  }
}

// Hook for polling notifications
export const useNotificationPolling = (exerciseId: number | null, intervalMs: number = 10000) => {
  const fetchNotifications = usePlayerStore(state => state.fetchNotifications)
  
  if (exerciseId && intervalMs > 0) {
    setInterval(() => {
      fetchNotifications(exerciseId)
    }, intervalMs)
  }
}