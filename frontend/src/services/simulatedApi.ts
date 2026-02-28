/**
 * API service for simulated communication channels
 */
import api from './api'

// ============== TYPES ==============

// Mail
export interface SimulatedMail {
  id: number
  exercise_id: number
  from_contact_id: number | null
  to_contact_id: number | null
  from_name: string
  from_email: string | null
  to_name: string
  to_email: string | null
  subject: string
  body: string | null
  attachments: any[] | null
  is_from_player: boolean
  is_inject: boolean
  is_read: boolean
  is_starred: boolean
  parent_mail_id: number | null
  sent_at: string
  read_at: string | null
  created_at: string
}

export interface SimulatedMailList {
  mails: SimulatedMail[]
  total: number
  unread_count: number
}

// Chat
export interface SimulatedChatRoom {
  id: number
  exercise_id: number
  name: string
  room_type: string
  description: string | null
  participant_ids: number[]
  is_active: boolean
  created_at: string
  unread_count: number
  last_message_at: string | null
  last_message_preview: string | null
}

export interface SimulatedChatMessage {
  id: number
  room_id: number
  exercise_id: number
  sender_contact_id: number | null
  sender_name: string
  sender_type: string
  content: string
  message_type: string
  is_from_player: boolean
  is_pinned: boolean
  reactions: Record<string, number[]>
  sent_at: string
  edited_at: string | null
}

export interface SimulatedChatRoomDetail extends SimulatedChatRoom {
  messages: SimulatedChatMessage[]
}

// SMS
export interface SimulatedSms {
  id: number
  exercise_id: number
  from_contact_id: number | null
  to_contact_id: number | null
  from_name: string
  from_phone: string | null
  to_name: string
  to_phone: string | null
  content: string
  is_from_player: boolean
  is_inject: boolean
  is_read: boolean
  sent_at: string
  read_at: string | null
  created_at: string
}

export interface SimulatedSmsConversation {
  contact_id: number | null
  contact_name: string
  contact_phone: string | null
  messages: SimulatedSms[]
  unread_count: number
}

// Call
export type CallStatus = 'RINGING' | 'ANSWERED' | 'MISSED' | 'ENDED' | 'REJECTED'

export interface SimulatedCall {
  id: number
  exercise_id: number
  caller_contact_id: number | null
  callee_contact_id: number | null
  caller_name: string
  caller_phone: string | null
  callee_name: string
  callee_phone: string | null
  call_type: string
  status: CallStatus
  is_from_player: boolean
  is_inject: boolean
  started_at: string | null
  ended_at: string | null
  duration_seconds: number | null
  voicemail_transcript: string | null
  created_at: string
}

// Social
export interface SimulatedSocialPost {
  id: number
  exercise_id: number
  author_name: string
  author_handle: string
  author_avatar: string | null
  is_verified: boolean
  content: string
  media_urls: string[]
  likes_count: number
  retweets_count: number
  replies_count: number
  views_count: number
  player_liked: boolean
  player_retweeted: boolean
  is_inject: boolean
  is_breaking: boolean
  posted_at: string
  seen_at: string | null
  created_at: string
}

export interface SimulatedSocialFeed {
  posts: SimulatedSocialPost[]
  total: number
  unseen_count: number
}

export interface SimulatedSocialPostFromInjectPayload {
  author_name: string
  author_handle: string
  author_avatar?: string | null
  is_verified?: boolean
  content: string
  media_urls?: string[]
  likes_count?: number
  retweets_count?: number
  replies_count?: number
  views_count?: number
  is_breaking?: boolean
}

// Press
export interface SimulatedPressArticle {
  id: number
  exercise_id: number
  source: string
  source_logo: string | null
  title: string
  content: string | null
  summary: string | null
  image_url: string | null
  article_url: string | null
  category: string | null
  is_inject: boolean
  is_breaking_news: boolean
  is_read: boolean
  published_at: string
  read_at: string | null
  created_at: string
}

export interface SimulatedPressFeed {
  articles: SimulatedPressArticle[]
  total: number
  unread_count: number
}

// TV
export interface SimulatedTvEvent {
  id: number
  exercise_id: number
  channel: string
  channel_logo: string | null
  title: string
  description: string | null
  video_url: string | null
  thumbnail_url: string | null
  event_type: string
  is_inject: boolean
  is_live: boolean
  is_breaking: boolean
  is_seen: boolean
  broadcast_at: string
  seen_at: string | null
  duration_seconds: number | null
  created_at: string
}

export interface SimulatedTvFeed {
  events: SimulatedTvEvent[]
  total: number
  unseen_count: number
  current_live: SimulatedTvEvent | null
}

// WebSocket Event
export interface SimulatedWsEvent {
  event_type: 'mail' | 'chat' | 'sms' | 'message' | 'call' | 'social' | 'press' | 'tv' | 'system'
  action: 'new' | 'update' | 'delete' | 'connected'
  data: Record<string, any>
  timestamp: string
  exercise_id: number
}


// ============== API ==============

export const simulatedApi = {
  // ----- MAIL -----
  getMails: async (
    exerciseId: number,
    folder: 'inbox' | 'sent' | 'starred' = 'inbox',
    page: number = 1
  ): Promise<SimulatedMailList> => {
    const response = await api.get(`/simulated/${exerciseId}/mails`, {
      params: { folder, page }
    })
    return response.data
  },

  getMail: async (exerciseId: number, mailId: number): Promise<SimulatedMail> => {
    const response = await api.get(`/simulated/${exerciseId}/mails/${mailId}`)
    return response.data
  },

  sendMail: async (
    exerciseId: number,
    data: { to_contact_id: number; subject: string; body?: string; parent_mail_id?: number }
  ): Promise<SimulatedMail> => {
    const response = await api.post(`/simulated/${exerciseId}/mails`, data)
    return response.data
  },

  toggleStarMail: async (exerciseId: number, mailId: number): Promise<{ starred: boolean }> => {
    const response = await api.post(`/simulated/${exerciseId}/mails/${mailId}/star`)
    return response.data
  },

  // ----- CHAT -----
  getChatRooms: async (exerciseId: number): Promise<SimulatedChatRoom[]> => {
    const response = await api.get(`/simulated/${exerciseId}/chat/rooms`)
    return response.data
  },

  getChatRoom: async (exerciseId: number, roomId: number): Promise<SimulatedChatRoomDetail> => {
    const response = await api.get(`/simulated/${exerciseId}/chat/rooms/${roomId}`)
    return response.data
  },

  sendChatMessage: async (
    exerciseId: number,
    roomId: number,
    content: string
  ): Promise<SimulatedChatMessage> => {
    const response = await api.post(`/simulated/${exerciseId}/chat/rooms/${roomId}/messages`, {
      content,
      message_type: 'text'
    })
    return response.data
  },

  createChatRoom: async (
    exerciseId: number,
    data: { name: string; room_type?: string; description?: string; participant_ids?: number[] }
  ): Promise<SimulatedChatRoom> => {
    const response = await api.post(`/simulated/${exerciseId}/chat/rooms`, data)
    return response.data
  },

  // ----- SMS -----
  getSmsConversations: async (exerciseId: number): Promise<SimulatedSmsConversation[]> => {
    const response = await api.get(`/simulated/${exerciseId}/sms/conversations`)
    return response.data
  },

  sendSms: async (
    exerciseId: number,
    toContactId: number,
    content: string
  ): Promise<SimulatedSms> => {
    const response = await api.post(`/simulated/${exerciseId}/sms`, {
      to_contact_id: toContactId,
      content
    })
    return response.data
  },

  markSmsRead: async (exerciseId: number, smsId: number): Promise<void> => {
    await api.post(`/simulated/${exerciseId}/sms/${smsId}/read`)
  },

  // ----- CALLS -----
  getCalls: async (exerciseId: number, includeEnded: boolean = false): Promise<SimulatedCall[]> => {
    const response = await api.get(`/simulated/${exerciseId}/calls`, {
      params: { include_ended: includeEnded }
    })
    return response.data
  },

  getActiveCall: async (exerciseId: number): Promise<SimulatedCall | null> => {
    const response = await api.get(`/simulated/${exerciseId}/calls/active`)
    return response.data
  },

  handleCallAction: async (
    exerciseId: number,
    callId: number,
    action: 'answer' | 'reject' | 'end'
  ): Promise<SimulatedCall> => {
    const response = await api.post(`/simulated/${exerciseId}/calls/${callId}/action`, { action })
    return response.data
  },

  // ----- SOCIAL -----
  getSocialFeed: async (
    exerciseId: number,
    page: number = 1
  ): Promise<SimulatedSocialFeed> => {
    const response = await api.get(`/simulated/${exerciseId}/social`, {
      params: { page }
    })
    return response.data
  },

  reactToSocialPost: async (
    exerciseId: number,
    postId: number,
    reactionType: 'like' | 'retweet'
  ): Promise<SimulatedSocialPost> => {
    const response = await api.post(`/simulated/${exerciseId}/social/${postId}/react`, {
      reaction_type: reactionType
    })
    return response.data
  },

  createSocialPostFromInject: async (
    exerciseId: number,
    data: SimulatedSocialPostFromInjectPayload
  ): Promise<SimulatedSocialPost> => {
    const response = await api.post(`/simulated/${exerciseId}/social/inject`, data)
    return response.data
  },

  // ----- PRESS -----
  getPressFeed: async (
    exerciseId: number,
    page: number = 1
  ): Promise<SimulatedPressFeed> => {
    const response = await api.get(`/simulated/${exerciseId}/press`, {
      params: { page }
    })
    return response.data
  },

  getPressArticle: async (exerciseId: number, articleId: number): Promise<SimulatedPressArticle> => {
    const response = await api.get(`/simulated/${exerciseId}/press/${articleId}`)
    return response.data
  },

  // ----- TV -----
  getTvFeed: async (
    exerciseId: number,
    page: number = 1
  ): Promise<SimulatedTvFeed> => {
    const response = await api.get(`/simulated/${exerciseId}/tv`, {
      params: { page }
    })
    return response.data
  },

  markTvEventSeen: async (exerciseId: number, eventId: number): Promise<void> => {
    await api.post(`/simulated/${exerciseId}/tv/${eventId}/seen`)
  },

  // ----- WEBSOCKET -----
  getWebSocketUrl: (exerciseId: number): string => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    return `${protocol}//${host}/api/simulated/${exerciseId}/ws`
  },
}

export default simulatedApi
