import api from './api'

// Types
export interface PlayerTeamInfo {
  id: number
  name: string
  code: string
}

export interface PlayerExerciseInfo {
  id: number
  name: string
  status: string
  started_at: string | null
  time_multiplier: string
}

export interface PlayerStats {
  injects_pending: number
  injects_in_progress: number
  injects_treated: number
  messages_unread: number
  decisions_count: number
}

export interface PlayerContext {
  exercise: PlayerExerciseInfo
  team: PlayerTeamInfo | null
  role: string
  exercise_time: string | null
  stats: PlayerStats
}

export interface PlayerEvent {
  id: number
  type: string
  entity_type: string | null
  entity_id: number | null
  actor_type: string
  actor_label: string | null
  payload: Record<string, any> | null
  ts: string
  exercise_time: string | null
  title: string
  description: string | null
  icon: string
  visibility: string
  channel: string
  criticity: string
  is_read: boolean
  actions: string[]
}

export interface PlayerInject {
  id: number
  type: string
  title: string
  description: string | null
  status: string
  delivery_id: number | null
  delivery_status: string | null
  scheduled_at: string | null
  sent_at: string | null
  delivered_at: string | null
  opened_at: string | null
  acknowledged_at: string | null
  treated_at: string | null
  is_public: boolean
  target_type: string
  criticity: string
  created_at: string
}

export interface Notification {
  id: string
  type: string
  title: string
  message: string
  entity_type: string | null
  entity_id: number | null
  criticity: string
  created_at: string
  is_read: boolean
}

export interface Decision {
  id: number
  exercise_id: number
  team_id: number | null
  user_id: number | null
  title: string
  description: string | null
  impact: string | null
  decided_at: string | null
  created_at: string
  created_by?: string | null
  decided_by?: string | null
  source_event_id?: number | null
  source_inject_id?: number | null
}

export interface ChatRoom {
  id: number
  name: string
  room_type: string
  unread_count: number
  last_message_at: string | null
  last_message_preview: string | null
  participants?: Array<{ id: number; name?: string }>
  messages?: Array<{
    id: number
    content: string
    created_at: string
    is_current_user?: boolean
    sender_name?: string
  }>
}

export interface ChatMessage {
  id: number
  room_id: number
  author_type: string
  author_id: number | null
  author_label: string
  content: string
  created_at: string
  is_pinned: boolean
  reactions: Record<string, number[]>
}

// Player API
export const playerApi = {
  // Context
  getContext: async (exerciseId: number): Promise<PlayerContext> => {
    const response = await api.get(`/player/exercises/${exerciseId}/context`)
    return response.data
  },

  // Timeline
  getTimeline: async (
    exerciseId: number,
    params?: {
      channel?: string
      scope?: string
      criticity?: string
      page?: number
      page_size?: number
    }
  ): Promise<{ events: PlayerEvent[]; total: number; page: number; page_size: number }> => {
    const response = await api.get(`/player/exercises/${exerciseId}/timeline`, { params })
    return response.data
  },

  // Injects
  getInjects: async (
    exerciseId: number,
    params?: { status?: string }
  ): Promise<PlayerInject[]> => {
    const response = await api.get(`/player/exercises/${exerciseId}/injects`, { params })
    return response.data
  },

  updateDelivery: async (
    deliveryId: number,
    data: {
      status?: string
      acknowledge?: boolean
      treat?: boolean
    }
  ): Promise<{
    id: number
    status: string
    acknowledged_at: string | null
    treated_at: string | null
    treated_by: number | null
  }> => {
    const response = await api.patch(`/player/deliveries/${deliveryId}`, data)
    return response.data
  },

  // Decisions
  getDecisions: async (exerciseId: number): Promise<Decision[]> => {
    const response = await api.get(`/player/exercises/${exerciseId}/decisions`)
    return response.data
  },

  createDecision: async (
    exerciseId: number,
    data: {
      title: string
      description?: string
      impact?: string
      source_event_id?: number
      source_inject_id?: number
    }
  ): Promise<Decision> => {
    const response = await api.post(`/player/exercises/${exerciseId}/decisions`, data)
    return response.data
  },

  // Notifications
  getNotifications: async (
    exerciseId: number
  ): Promise<{ notifications: Notification[]; unread_count: number }> => {
    const response = await api.get(`/player/exercises/${exerciseId}/notifications`)
    return response.data
  },

  // Chat
  getChatRooms: async (exerciseId: number): Promise<ChatRoom[]> => {
    const response = await api.get(`/player/exercises/${exerciseId}/chat/rooms`)
    return response.data
  },

  getChatMessages: async (
    exerciseId: number,
    roomId: number
  ): Promise<ChatMessage[]> => {
    const response = await api.get(
      `/player/exercises/${exerciseId}/chat/rooms/${roomId}/messages`
    )
    return response.data
  },

  sendChatMessage: async (
    exerciseId: number,
    roomId: number,
    content: string
  ): Promise<ChatMessage> => {
    const response = await api.post(
      `/player/exercises/${exerciseId}/chat/rooms/${roomId}/messages`,
      { content }
    )
    return response.data
  },
}

export default playerApi
