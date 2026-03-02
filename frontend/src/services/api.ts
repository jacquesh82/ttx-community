import axios from 'axios'
import { useAuthStore } from '../stores/authStore'

// User Types
export type ExerciseRole = 'animateur' | 'observateur' | 'joueur'
export type ExerciseType = 'cyber' | 'it_outage' | 'ransomware' | 'mixed'
export type ExerciseMaturityLevel = 'beginner' | 'intermediate' | 'expert'
export type ExerciseMode = 'real_time' | 'compressed' | 'simulated'
export type InjectVisibilityScope = 'team_only' | 'user_only' | 'all'

export interface ExerciseUser {
  id: number
  user_id: number
  exercise_id: number
  role: ExerciseRole
  team_id: number | null
  assigned_at: string
  assigned_by: number | null
  user_username: string
  user_email: string
  team_name: string | null
  organization?: string | null
  real_function?: string | null
  can_social?: boolean
  can_tv?: boolean
  can_mail?: boolean
  visibility_scope?: InjectVisibilityScope
}

export interface AuditLog {
  id: number
  user_id: number | null
  action: string
  entity_type: string | null
  entity_id: number | null
  old_values: Record<string, any> | null
  new_values: Record<string, any> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
  user_username: string | null
}

export interface TenantSummary {
  id: number
  slug: string
  name: string
}

export type WsTicketScope = 'exercise_updates' | 'simulated_channels' | 'debug_events'

export interface WsTicketResponse {
  ticket: string
  expires_at: string
  scope: WsTicketScope
}

export type InjectBankKind =
  | 'idea'
  | 'video'
  | 'audio'
  | 'scenario'
  | 'chronogram'
  | 'image'
  | 'mail'
  | 'message'
  | 'directory'
  | 'reference_url'
  | 'social_post'
  | 'document'
  | 'canal_press'
  | 'canal_anssi'
  | 'canal_gouvernement'
  | 'other'

export type InjectBankStatus = 'draft' | 'ready' | 'archived'
export type InjectDataFormat = 'text' | 'audio' | 'video' | 'image'

export interface InjectBankItem {
  id: number
  title: string
  kind: InjectBankKind
  status: InjectBankStatus
  category: string | null
  data_format: InjectDataFormat
  summary: string | null
  content: string | null
  source_url: string | null
  payload: Record<string, any>
  tags: string[]
  created_by: number | null
  created_at: string
  updated_at: string
}

export interface InjectBankListResponse {
  items: InjectBankItem[]
  total: number
  page: number
  page_size: number
}

export interface InjectBankStats {
  by_kind: Record<string, number>
  by_status: Record<string, number>
  total: number
}

export interface InjectBankImportResponse {
  imported: number
  skipped: number
  total_in_zip: number
}

export interface InjectBankSchemaPayload {
  schema: Record<string, any>
}

// Plugin Types
export type PluginType = string

export interface PluginInfo {
  type: PluginType
  name: string
  description: string
  icon: string
  color: string
  default_enabled: boolean
  coming_soon: boolean
  sort_order: number
}

export interface ExercisePlugin {
  plugin_type: PluginType
  enabled: boolean
  configuration: Record<string, any> | null
  info: PluginInfo
}

export interface Exercise {
  id: number
  name: string
  description: string | null
  status: string
  time_multiplier: string
  exercise_type: ExerciseType
  target_duration_hours: number
  maturity_level: ExerciseMaturityLevel
  mode: ExerciseMode
  planned_date: string | null
  business_objective: string | null
  technical_objective: string | null
  lead_organizer_user_id: number | null
  started_at: string | null
  ended_at: string | null
  created_by: number | null
  created_at: string
  updated_at: string
  plugins: ExercisePlugin[]
  simulator_config: string | null
}

export interface TeamSummary {
  id: number
  name: string
  description: string | null
  color: string
}

export type ExerciseSetupSectionStatus = 'todo' | 'partial' | 'complete'
export type ExercisePresetId = 'ransomware_4h' | 'it_outage_8h' | 'mixed_24h'

export interface ExerciseSetupSectionResult {
  status: ExerciseSetupSectionStatus
  summary: string
  completed: boolean
}

export interface ExerciseSetupChecklist {
  sections: {
    socle: ExerciseSetupSectionResult
    scenario: ExerciseSetupSectionResult
    actors: ExerciseSetupSectionResult
    timelineInjects: ExerciseSetupSectionResult
    validation: ExerciseSetupSectionResult
  }
  completedCount: number
  totalCount: number
  missingItems: string[]
}

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add CSRF token
api.interceptors.request.use((config) => {
  const csrfToken = useAuthStore.getState().csrfToken
  if (csrfToken) {
    config.headers['X-CSRF-Token'] = csrfToken
  }
  return config
})

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api

// Auth API
export const authApi = {
  login: async (usernameOrEmail: string, password: string) => {
    const response = await api.post('/auth/login', {
      username_or_email: usernameOrEmail,
      password,
    })
    return response.data
  },
  logout: async () => {
    const response = await api.post('/auth/logout')
    return response.data
  },
  getMe: async () => {
    const response = await api.get('/auth/me')
    return response.data
  },
  createWsTicket: async (scope: WsTicketScope, exerciseId?: number | null): Promise<WsTicketResponse> => {
    const response = await api.post('/auth/ws-ticket', {
      scope,
      exercise_id: exerciseId ?? null,
    })
    return response.data
  },
  devLogin: async (role: 'admin' | 'animateur' | 'observateur' | 'participant') => {
    const response = await api.post(`/auth/dev-login/${role}`)
    return response.data
  },
  updateProfile: async (body: { display_name?: string | null; avatar_url?: string | null; username?: string }) => {
    const response = await api.patch('/auth/profile', body)
    return response.data
  },
}

// Exercises API
export const exercisesApi = {
  list: async (params?: { page?: number; page_size?: number; status?: string }) => {
    const response = await api.get('/exercises', { params })
    return response.data
  },
  get: async (id: number): Promise<Exercise> => {
    const response = await api.get(`/exercises/${id}`)
    return response.data
  },
  listTeams: async (id: number): Promise<{ teams: TeamSummary[] }> => {
    const response = await api.get(`/exercises/${id}/teams`)
    return response.data
  },
  attachTeam: async (exerciseId: number, teamId: number): Promise<TeamSummary> => {
    const response = await api.post(`/exercises/${exerciseId}/teams/${teamId}`)
    return response.data
  },
  detachTeam: async (exerciseId: number, teamId: number) => {
    const response = await api.delete(`/exercises/${exerciseId}/teams/${teamId}`)
    return response.data
  },
  update: async (id: number, data: {
    name?: string
    description?: string
    status?: string
    time_multiplier?: number
    exercise_type?: ExerciseType
    target_duration_hours?: number
    maturity_level?: ExerciseMaturityLevel
    mode?: ExerciseMode
    planned_date?: string
    business_objective?: string
    technical_objective?: string
    lead_organizer_user_id?: number
  }): Promise<Exercise> => {
    const response = await api.put(`/exercises/${id}`, data)
    return response.data
  },
  create: async (data: {
    name: string
    description?: string
    time_multiplier?: number
    exercise_type?: ExerciseType
    target_duration_hours?: number
    maturity_level?: ExerciseMaturityLevel
    mode?: ExerciseMode
    planned_date?: string
    lead_organizer_user_id?: number
    team_ids?: number[]
    enabled_plugins?: PluginType[]
  }): Promise<Exercise> => {
    const response = await api.post('/exercises', data)
    return response.data
  },
  start: async (id: number) => {
    const response = await api.post(`/exercises/${id}/start`)
    return response.data
  },
  pause: async (id: number) => {
    const response = await api.post(`/exercises/${id}/pause`)
    return response.data
  },
  end: async (id: number) => {
    const response = await api.post(`/exercises/${id}/end`)
    return response.data
  },
  restart: async (id: number) => {
    const response = await api.post(`/exercises/${id}/restart`)
    return response.data
  },
  delete: async (id: number) => {
    const response = await api.delete(`/exercises/${id}`)
    return response.data
  },
  getAvailablePlugins: async (): Promise<PluginInfo[]> => {
    const response = await api.get('/exercises/plugins/available')
    return response.data
  },
  togglePlugin: async (exerciseId: number, pluginType: PluginType, enabled: boolean): Promise<ExercisePlugin> => {
    const response = await api.put(`/exercises/${exerciseId}/plugins/${pluginType}`, null, {
      params: { enabled },
    })
    return response.data
  },
}

// Inject Types
export type InjectType = 'mail' | 'twitter' | 'tv' | 'decision' | 'score' | 'system'
export type InjectStatus = 'draft' | 'scheduled' | 'sent' | 'cancelled'
export type TimelineType = 'business' | 'technical'
export type InjectCategory =
  | 'information'
  | 'incident'
  | 'decision'
  | 'media'
  | 'technical'
  | 'legal'
  | 'canal_press'
  | 'canal_anssi'
  | 'canal_gouvernement'
export type InjectChannel = 'mail' | 'phone' | 'press' | 'siem' | 'tv' | 'social_network' | 'official_mail'
export type TargetAudience = 'direction' | 'dsi' | 'com' | 'legal' | 'care' | 'all'
export type TestedCompetence = 'coordination' | 'arbitration' | 'communication' | 'technical' | 'governance'
export type PressureLevel = 'low' | 'medium' | 'high' | 'critical'
export type AudienceKind = 'role' | 'team' | 'user' | 'tag'
export interface AudienceTarget {
  kind: AudienceKind
  value: string | number
}

export interface Inject {
  id: number
  exercise_id: number
  custom_id: string | null
  type: InjectType
  timeline_type: TimelineType
  is_surprise: boolean
  inject_category: InjectCategory | null
  channel: InjectChannel | null
  data_format: InjectDataFormat
  title: string
  description: string | null
  content: Record<string, any>
  time_offset: number | null
  duration_min: number
  scheduled_at: string | null
  sent_at: string | null
  status: InjectStatus
  target_audience: TargetAudience | null
  pedagogical_objective: string | null
  tested_competence: TestedCompetence | null
  pressure_level: PressureLevel | null
  dependency_ids: number[] | null
  phase_id: number | null
  created_by: number | null
  created_at: string
  updated_at: string
  audiences: AudienceTarget[]
}

export interface InjectListResponse {
  injects: Inject[]
  total: number
  page: number
  page_size: number
}

// Injects API
export const injectsApi = {
  list: async (params?: {
    exercise_id?: number
    page?: number
    page_size?: number
    type?: InjectType
    status?: InjectStatus
  }): Promise<InjectListResponse> => {
    const response = await api.get('/injects', { params })
    return response.data
  },
  get: async (id: number): Promise<Inject> => {
    const response = await api.get(`/injects/${id}`)
    return response.data
  },
  create: async (data: {
    exercise_id: number
    title: string
    description?: string
    type: InjectType
    content: Record<string, any>
    data_format?: InjectDataFormat
    scheduled_at?: string
    time_offset?: number
    duration_min?: number
    target_user_ids?: number[]
    target_team_ids?: number[]
    custom_id?: string
    inject_category?: InjectCategory
    channel?: InjectChannel
    target_audience?: TargetAudience
    pedagogical_objective?: string
    tested_competence?: TestedCompetence
    pressure_level?: PressureLevel
    dependency_ids?: number[]
    phase_id?: number
    timeline_type?: TimelineType
    is_surprise?: boolean
    audiences?: AudienceTarget[]
  }): Promise<Inject> => {
    const response = await api.post('/injects', data)
    return response.data
  },
  update: async (id: number, data: {
    title?: string
    description?: string
    content?: Record<string, any>
    data_format?: InjectDataFormat
    scheduled_at?: string
    status?: InjectStatus
    custom_id?: string
    inject_category?: InjectCategory
    channel?: InjectChannel
    target_audience?: TargetAudience
    pedagogical_objective?: string
    tested_competence?: TestedCompetence
    pressure_level?: PressureLevel
    dependency_ids?: number[]
    time_offset?: number
    duration_min?: number
    phase_id?: number
    timeline_type?: TimelineType
    is_surprise?: boolean
    audiences?: AudienceTarget[]
  }): Promise<Inject> => {
    const response = await api.put(`/injects/${id}`, data)
    return response.data
  },
  delete: async (id: number) => {
    const response = await api.delete(`/injects/${id}`)
    return response.data
  },
  send: async (id: number) => {
    const response = await api.post(`/injects/${id}/send`)
    return response.data
  },
  schedule: async (id: number, scheduledAt: string) => {
    const response = await api.post(`/injects/${id}/schedule`, null, {
      params: { scheduled_at: scheduledAt },
    })
    return response.data
  },
  cancel: async (id: number) => {
    const response = await api.post(`/injects/${id}/cancel`)
    return response.data
  },
  getDeliveries: async (id: number) => {
    const response = await api.get(`/injects/${id}/deliveries`)
    return response.data
  },
  // CSV Import
  importCsv: async (exerciseId: number, file: File): Promise<{
    success: number
    errors: Array<{ row: number; error: string }>
    injects: Inject[]
  }> => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post('/injects/import-csv', formData, {
      params: { exercise_id: exerciseId },
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },
  downloadTemplate: async (): Promise<Blob> => {
    const response = await api.get('/injects/template/csv', {
      responseType: 'blob',
    })
    return response.data
  },
  // Media management
  getMedia: async (injectId: number): Promise<Array<{
    id: number
    inject_id: number
    media_id: number
    position: number
    created_at: string
  }>> => {
    const response = await api.get(`/injects/${injectId}/media`)
    return response.data
  },
  addMedia: async (injectId: number, mediaId: number, position?: number) => {
    const response = await api.post(`/injects/${injectId}/media`, {
      media_id: mediaId,
      position,
    })
    return response.data
  },
  removeMedia: async (injectId: number, mediaId: number) => {
    const response = await api.delete(`/injects/${injectId}/media/${mediaId}`)
    return response.data
  },
  reorderMedia: async (injectId: number, mediaIds: number[]) => {
    const response = await api.put(`/injects/${injectId}/media/reorder`, mediaIds)
    return response.data
  },
  getTypes: async (): Promise<InjectType[]> => {
    const response = await api.get('/injects/types')
    return response.data.types
  },
}

// Events API
export const eventsApi = {
  list: async (params?: { exercise_id?: number; page?: number }) => {
    const response = await api.get('/events', { params })
    return response.data
  },
}

// Users API
export const usersApi = {
  list: async (params?: { page?: number; page_size?: number; role?: string }) => {
    const response = await api.get('/users', { params })
    return response.data
  },
  create: async (data: any) => {
    const response = await api.post('/users', data)
    return response.data
  },
  update: async (id: number, data: any) => {
    const response = await api.put(`/users/${id}`, data)
    return response.data
  },
  delete: async (id: number) => {
    const response = await api.delete(`/users/${id}`)
    return response.data
  },
}

// Teams API
export const teamsApi = {
  list: async (params?: { page?: number; page_size?: number }) => {
    const safeParams = params
      ? {
          ...params,
          page_size: params.page_size ? Math.min(params.page_size, 100) : params.page_size,
        }
      : undefined
    const response = await api.get('/teams', { params: safeParams })
    return response.data
  },
  get: async (id: number) => {
    const response = await api.get(`/teams/${id}`)
    return response.data
  },
  create: async (data: any) => {
    const response = await api.post('/teams', data)
    return response.data
  },
  update: async (id: number, data: { name?: string; description?: string; color?: string }) => {
    const response = await api.put(`/teams/${id}`, data)
    return response.data
  },
  delete: async (id: number) => {
    const response = await api.delete(`/teams/${id}`)
    return response.data
  },
  addMember: async (teamId: number, userId: number, isLeader?: boolean) => {
    const response = await api.post(`/teams/${teamId}/members/${userId}`, null, {
      params: { is_leader: isLeader },
    })
    return response.data
  },
  removeMember: async (teamId: number, userId: number) => {
    const response = await api.delete(`/teams/${teamId}/members/${userId}`)
    return response.data
  },
}

// Webmail API
export const webmailApi = {
  listConversations: async (exerciseId: number, params?: { page?: number; page_size?: number; unread_only?: boolean }) => {
    const response = await api.get('/webmail/conversations', {
      params: { exercise_id: exerciseId, ...params },
    })
    return response.data
  },
  getConversation: async (conversationId: number) => {
    const response = await api.get(`/webmail/conversations/${conversationId}`)
    return response.data
  },
  createConversation: async (data: {
    exercise_id: number
    subject: string
    to_participants?: string[]
    cc_participants?: string[]
    body_text: string
  }) => {
    const response = await api.post('/webmail/conversations', data)
    return response.data
  },
  sendMessage: async (data: {
    conversation_id?: number
    exercise_id?: number
    subject?: string
    to_participants?: string[]
    body_text: string
    parent_message_id?: number
  }) => {
    const response = await api.post('/webmail/messages', data)
    return response.data
  },
  markMessageRead: async (messageId: number) => {
    const response = await api.post(`/webmail/messages/${messageId}/read`)
    return response.data
  },
  markConversationRead: async (conversationId: number) => {
    const response = await api.post(`/webmail/conversations/${conversationId}/read-all`)
    return response.data
  },
}

// Crisis Contacts API
export const crisisContactsApi = {
  list: async (exerciseId: number, params?: { 
    page?: number
    page_size?: number
    search?: string
    category?: string
    priority?: string
  }) => {
    const response = await api.get('/crisis-contacts', {
      params: { exercise_id: exerciseId, ...params },
    })
    return response.data
  },
  get: async (contactId: number) => {
    const response = await api.get(`/crisis-contacts/${contactId}`)
    return response.data
  },
  create: async (data: {
    exercise_id: number
    name: string
    function?: string
    organization?: string
    email?: string
    phone?: string
    mobile?: string
    category?: string
    priority?: string
    notes?: string
    availability?: string
  }) => {
    const response = await api.post('/crisis-contacts', data)
    return response.data
  },
  update: async (contactId: number, data: {
    name?: string
    function?: string
    organization?: string
    email?: string
    phone?: string
    mobile?: string
    category?: string
    priority?: string
    notes?: string
    availability?: string
  }) => {
    const response = await api.put(`/crisis-contacts/${contactId}`, data)
    return response.data
  },
  delete: async (contactId: number) => {
    const response = await api.delete(`/crisis-contacts/${contactId}`)
    return response.data
  },
  import: async (exerciseId: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post(`/crisis-contacts/import?exercise_id=${exerciseId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },
  downloadTemplate: async () => {
    const response = await api.get('/crisis-contacts/template/csv', {
      responseType: 'blob',
    })
    return response.data
  },
}

// Exercise Users API
export const exerciseUsersApi = {
  listExerciseUsers: async (exerciseId: number, params?: { role?: ExerciseRole; page?: number; page_size?: number }) => {
    const response = await api.get(`/exercises/${exerciseId}/users`, { params })
    return response.data
  },
  assignUser: async (exerciseId: number, data: {
    user_id: number
    role: ExerciseRole
    team_id?: number
    organization?: string
    real_function?: string
    can_social?: boolean
    can_tv?: boolean
    can_mail?: boolean
    visibility_scope?: InjectVisibilityScope
  }) => {
    const response = await api.post(`/exercises/${exerciseId}/users`, data)
    return response.data
  },
  updateUserRole: async (exerciseId: number, userId: number, data: {
    role?: ExerciseRole
    team_id?: number
    organization?: string
    real_function?: string
    can_social?: boolean
    can_tv?: boolean
    can_mail?: boolean
    visibility_scope?: InjectVisibilityScope
  }) => {
    const response = await api.put(`/exercises/${exerciseId}/users/${userId}`, data)
    return response.data
  },
  removeUser: async (exerciseId: number, userId: number) => {
    const response = await api.delete(`/exercises/${exerciseId}/users/${userId}`)
    return response.data
  },
  getAvailableUsers: async (exerciseId: number, search?: string) => {
    const response = await api.get(`/exercises/${exerciseId}/available-users`, {
      params: { search },
    })
    return response.data
  },
}

// Audit API
export const auditApi = {
  listLogs: async (params?: {
    page?: number
    page_size?: number
    user_id?: number
    action?: string
    entity_type?: string
    start_date?: string
    end_date?: string
    search?: string
  }) => {
    const response = await api.get('/audit', { params })
    return response.data
  },
  getStats: async () => {
    const response = await api.get('/audit/stats')
    return response.data
  },
  getLog: async (logId: number) => {
    const response = await api.get(`/audit/${logId}`)
    return response.data
  },
  exportCsv: async (params?: {
    user_id?: number
    action?: string
    entity_type?: string
    start_date?: string
    end_date?: string
  }) => {
    const response = await api.get('/audit/export/csv', {
      params,
      responseType: 'blob',
    })
    return response.data
  },
}

export const injectBankApi = {
  list: async (params?: {
    page?: number
    page_size?: number
    kind?: InjectBankKind
    status?: InjectBankStatus
    category?: string
    tag?: string
    search?: string
    sort_by?: 'updated_at' | 'created_at' | 'title'
    order?: 'asc' | 'desc'
  }): Promise<InjectBankListResponse> => {
    const response = await api.get('/inject-bank', { params })
    return response.data
  },
  getStats: async (): Promise<InjectBankStats> => {
    const response = await api.get('/inject-bank/stats')
    return response.data
  },
  getCategories: async (): Promise<string[]> => {
    const response = await api.get('/inject-bank/categories')
    return response.data
  },
  getSchema: async (): Promise<InjectBankSchemaPayload> => {
    const response = await api.get('/inject-bank/schema')
    return response.data
  },
  create: async (data: {
    title: string
    kind: InjectBankKind
    status?: InjectBankStatus
    category?: string
    summary?: string
    data_format?: InjectDataFormat
    content?: string
    source_url?: string
    payload?: Record<string, any>
    tags?: string[]
  }): Promise<InjectBankItem> => {
    const response = await api.post('/inject-bank', data)
    return response.data
  },
  update: async (
    id: number,
    data: {
      title?: string
      kind?: InjectBankKind
      status?: InjectBankStatus
      category?: string
      summary?: string
      data_format?: InjectDataFormat
      content?: string
      source_url?: string
      payload?: Record<string, any>
      tags?: string[]
    }
  ): Promise<InjectBankItem> => {
    const response = await api.put(`/inject-bank/${id}`, data)
    return response.data
  },
  delete: async (id: number) => {
    await api.delete(`/inject-bank/${id}`)
  },
  exportZip: async (): Promise<Blob> => {
    const response = await api.get('/inject-bank/export/zip', {
      responseType: 'blob',
    })
    return response.data
  },
  importZip: async (file: File, clearBefore: boolean = false): Promise<InjectBankImportResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    
    // Use fetch instead of axios for reliable FormData handling
    // Axios default Content-Type header interferes with FormData boundary
    const csrfToken = useAuthStore.getState().csrfToken
    const url = `/api/inject-bank/import/zip?clear_before=${clearBefore}`
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
      body: formData,
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Import failed' }))
      throw { response: { data: errorData, status: response.status } }
    }
    
    return response.json()
  },
  getKinds: async (): Promise<InjectBankKind[]> => {
    const response = await api.get('/inject-bank/kinds')
    return response.data.kinds
  },
  getStatuses: async (): Promise<InjectBankStatus[]> => {
    const response = await api.get('/inject-bank/statuses')
    return response.data.statuses
  },
}

export type EscalationAxisType = 'technical' | 'communication' | 'legal' | 'political' | 'media'
export type TriggerMode = 'auto' | 'manual' | 'conditional'
export type ExerciseImportComponent =
  | 'socle'
  | 'scenario'
  | 'actors'
  | 'timeline'
  | 'injects'
  | 'plugins'
  | 'full'

export interface ExerciseScenario {
  exercise_id: number
  strategic_intent: string | null
  initial_context: string | null
  initial_situation: string | null
  implicit_hypotheses: string | null
  hidden_brief: string | null
  pedagogical_objectives: string[]
  evaluation_criteria: string[]
  stress_factors: string[]
}

export interface ExercisePhase {
  id: number
  exercise_id: number
  name: string
  description: string | null
  phase_order: number
  start_offset_min: number | null
  end_offset_min: number | null
}

export interface ExerciseEscalationAxis {
  id: number
  exercise_id: number
  axis_type: EscalationAxisType
  intensity: number
  notes: string | null
}

export interface InjectTriggerRule {
  id: number
  exercise_id: number
  inject_id: number
  trigger_mode: TriggerMode
  expression: Record<string, any> | null
}

export interface LiveTimelineItem {
  id: number
  title: string
  type: InjectType | string
  status: InjectStatus | string
  timeline_type: TimelineType
  is_surprise: boolean
  time_offset: number | null
  duration_min: number
  sent_at: string | null
  created_at: string | null
  phase_id: number | null
  target_summary: string
  audiences: AudienceTarget[]
  badge: string | null
  meta: {
    description?: string | null
    content_preview?: Record<string, string>
  }
}

export interface LiveDashboardResponse {
  exercise_id: number
  status: string
  time_multiplier: string
  clock?: {
    exercise_status: string
    started_at: string | null
    time_multiplier: string
    virtual_now_min: number
    real_now: string
  }
  timelines?: {
    business: LiveTimelineItem[]
    technical: LiveTimelineItem[]
    realtime: LiveTimelineItem[]
  }
  ws_connection_count?: number
  timeline_live: any[]
  teams_state: Array<{
    team_id: number | null
    team_name: string
    total: number
    treated: number
  }>
  indicators?: {
    stress: number
    saturation: number
    communication_external: number
    technical_mastery: number
  }
}

export const crisisManagementApi = {
  getScenario: async (exerciseId: number): Promise<ExerciseScenario> => {
    const response = await api.get(`/exercises/${exerciseId}/scenario`)
    return response.data
  },
  upsertScenario: async (exerciseId: number, data: Omit<ExerciseScenario, 'exercise_id'>) => {
    const response = await api.put(`/exercises/${exerciseId}/scenario`, data)
    return response.data
  },
  listEscalationAxes: async (exerciseId: number): Promise<ExerciseEscalationAxis[]> => {
    const response = await api.get(`/exercises/${exerciseId}/escalation-axes`)
    return response.data
  },
  createEscalationAxis: async (exerciseId: number, data: {
    axis_type: EscalationAxisType
    intensity: number
    notes?: string
  }): Promise<ExerciseEscalationAxis> => {
    const response = await api.post(`/exercises/${exerciseId}/escalation-axes`, data)
    return response.data
  },
  updateEscalationAxis: async (exerciseId: number, axisId: number, data: {
    axis_type: EscalationAxisType
    intensity: number
    notes?: string
  }): Promise<ExerciseEscalationAxis> => {
    const response = await api.put(`/exercises/${exerciseId}/escalation-axes/${axisId}`, data)
    return response.data
  },
  deleteEscalationAxis: async (exerciseId: number, axisId: number) => {
    await api.delete(`/exercises/${exerciseId}/escalation-axes/${axisId}`)
  },
  listPhases: async (exerciseId: number): Promise<ExercisePhase[]> => {
    const response = await api.get(`/exercises/${exerciseId}/phases`)
    return response.data
  },
  createPhase: async (exerciseId: number, data: {
    name: string
    description?: string
    phase_order: number
    start_offset_min?: number
    end_offset_min?: number
  }): Promise<ExercisePhase> => {
    const response = await api.post(`/exercises/${exerciseId}/phases`, data)
    return response.data
  },
  updatePhase: async (exerciseId: number, phaseId: number, data: {
    name: string
    description?: string
    phase_order: number
    start_offset_min?: number
    end_offset_min?: number
  }): Promise<ExercisePhase> => {
    const response = await api.put(`/exercises/${exerciseId}/phases/${phaseId}`, data)
    return response.data
  },
  deletePhase: async (exerciseId: number, phaseId: number) => {
    await api.delete(`/exercises/${exerciseId}/phases/${phaseId}`)
  },
  listInjectTriggers: async (exerciseId: number): Promise<InjectTriggerRule[]> => {
    const response = await api.get(`/exercises/${exerciseId}/inject-triggers`)
    return response.data
  },
  upsertInjectTrigger: async (exerciseId: number, data: {
    inject_id: number
    trigger_mode: TriggerMode
    expression?: Record<string, any> | null
  }): Promise<InjectTriggerRule> => {
    const response = await api.post(`/exercises/${exerciseId}/inject-triggers`, data)
    return response.data
  },
  deleteInjectTrigger: async (exerciseId: number, ruleId: number) => {
    await api.delete(`/exercises/${exerciseId}/inject-triggers/${ruleId}`)
  },
  getLiveDashboard: async (exerciseId: number): Promise<LiveDashboardResponse> => {
    const response = await api.get(`/exercises/${exerciseId}/live-dashboard`)
    return response.data
  },
  createSurpriseInject: async (exerciseId: number, data: {
    title: string
    description?: string
    type: string
    timeline_type: TimelineType
    content: Record<string, any> | string
    audiences: AudienceTarget[]
    dispatch_mode: 'immediate' | 'planned'
    planned_time_offset?: number
    duration_min?: number
    channel?: InjectChannel
    inject_category?: InjectCategory
    pressure_level?: PressureLevel
  }) => {
    const response = await api.post(`/exercises/${exerciseId}/live/surprise-injects`, data)
    return response.data
  },
  sendLiveAction: async (exerciseId: number, action: string, payload: Record<string, any> = {}) => {
    const response = await api.post(`/exercises/${exerciseId}/live/actions`, { action, payload })
    return response.data
  },
  getEvaluation: async (exerciseId: number) => {
    const response = await api.get(`/exercises/${exerciseId}/evaluation`)
    return response.data
  },
  generateRetex: async (exerciseId: number) => {
    const response = await api.post(`/exercises/${exerciseId}/retex/generate`)
    return response.data
  },
  exportRetexJson: async (exerciseId: number): Promise<Blob> => {
    const response = await api.get(`/exercises/${exerciseId}/retex/export.json`, { responseType: 'blob' })
    return response.data
  },
  exportRetexPdf: async (exerciseId: number): Promise<Blob> => {
    const response = await api.get(`/exercises/${exerciseId}/retex/export.pdf`, { responseType: 'blob' })
    return response.data
  },
  exportRetexAnssi: async (exerciseId: number): Promise<Blob> => {
    const response = await api.get(`/exercises/${exerciseId}/retex/export.anssi.json`, { responseType: 'blob' })
    return response.data
  },
  getOrgChart: async (exerciseId: number) => {
    const response = await api.get(`/exercises/${exerciseId}/actors/orgchart`)
    return response.data
  },
  importComponent: async (
    exerciseId: number,
    component: ExerciseImportComponent,
    file: File,
    updateInjectBank = false,
    options?: { teamRenameMap?: Record<string, string> }
  ) => {
    const formData = new FormData()
    formData.append('file', file)
    if (options?.teamRenameMap && Object.keys(options.teamRenameMap).length > 0) {
      formData.append('team_rename_map', JSON.stringify(options.teamRenameMap))
    }
    const response = await api.post(
      `/exercises/${exerciseId}/imports/${component}`,
      formData,
      {
        params: { update_inject_bank: updateInjectBank },
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    )
    return response.data
  },
  importComponentFromBank: async (
    exerciseId: number,
    component: ExerciseImportComponent,
    kind: InjectBankKind,
    category?: string,
    limit = 25
  ) => {
    const response = await api.post(`/exercises/${exerciseId}/imports/${component}/from-bank`, null, {
      params: { kind, category, limit },
    })
    return response.data
  },
  importComponentFromBankSelection: async (
    exerciseId: number,
    component: ExerciseImportComponent,
    itemIds: number[]
  ) => {
    const response = await api.post(`/exercises/${exerciseId}/imports/${component}/from-bank-selection`, {
      item_ids: itemIds,
    })
    return response.data
  },
}

// Media Types
export interface Media {
  id: number
  exercise_id: number | null
  owner_team_id: number | null
  filename: string
  original_filename: string
  mime_type: string
  size: number
  sha256: string
  title: string | null
  description: string | null
  tags: string[] | null
  visibility: 'private' | 'team' | 'exercise' | 'global'
  status: 'uploading' | 'processing' | 'ready' | 'failed'
  uploaded_by: number
  created_at: string
  updated_at: string
  is_image: boolean
  is_video: boolean
  is_audio: boolean
  is_pdf: boolean
}

export interface MediaListResponse {
  media: Media[]
  total: number
  page: number
  page_size: number
}

// Media API
export const mediaApi = {
  list: async (params?: {
    exercise_id?: number
    page?: number
    page_size?: number
    mime_type?: string
    search?: string
    tags?: string
    visibility?: string
  }): Promise<MediaListResponse> => {
    const response = await api.get('/media', { params })
    return response.data
  },
  get: async (mediaId: number): Promise<Media> => {
    const response = await api.get(`/media/${mediaId}`)
    return response.data
  },
  upload: async (
    file: File,
    params?: {
      exercise_id?: number
      owner_team_id?: number
      title?: string
      description?: string
      visibility?: string
    }
  ): Promise<{ media: Media; is_duplicate: boolean; message: string }> => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post('/media/upload', formData, {
      params,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },
  update: async (
    mediaId: number,
    data: {
      title?: string
      description?: string
      tags?: string[]
      visibility?: string
    }
  ): Promise<Media> => {
    const response = await api.patch(`/media/${mediaId}`, data)
    return response.data
  },
  delete: async (mediaId: number, hardDelete?: boolean) => {
    const response = await api.delete(`/media/${mediaId}`, {
      params: { hard_delete: hardDelete },
    })
    return response.data
  },
  getDownloadUrl: (mediaId: number) => `/api/media/${mediaId}/download`,
  getStreamUrl: (mediaId: number) => `/api/media/${mediaId}/stream`,
  getPreviewUrl: (mediaId: number) => `/api/media/${mediaId}/preview`,
}

// TV Types
export interface TickerItem {
  text: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
}

export interface TVLiveState {
  channel_id: number
  status: 'idle' | 'playing' | 'paused' | 'ended'
  on_air_type: string | null
  on_air_id: number | null
  on_air_media_id: number | null
  started_at: string | null
  banner_text: string | null
  ticker_items: TickerItem[]
  version: number
}

export interface TVChannel {
  id: number
  exercise_id: number
  name: string
  logo_url: string | null
  is_active: boolean
  created_at: string
}

export interface TVSegment {
  id: number
  channel_id: number
  segment_type: 'breaking' | 'news' | 'interview' | 'report' | 'ticker' | 'commercial'
  title: string | null
  banner_text: string | null
  ticker_text: string | null
  script: string | null
  status: 'prepared' | 'live' | 'ended'
  inject_id: number | null
  created_by: number | null
  created_at: string
  scheduled_start: string | null
  scheduled_end: string | null
  actual_start: string | null
  actual_end: string | null
}

export interface TVPlaylistItem {
  id: number
  channel_id: number
  exercise_id: number
  item_type: string
  title: string | null
  media_id: number | null
  ref_id: number | null
  banner_text: string | null
  ticker_items: TickerItem[] | null
  play_mode: string
  takeover: boolean
  planned_at: string | null
  position: number
  status: 'queued' | 'on_air' | 'done' | 'skipped'
  created_at: string
  updated_at: string
}

// TV API
export const tvApi = {
  // Channels
  listChannels: async (exerciseId: number): Promise<TVChannel[]> => {
    const response = await api.get(`/tv/channels/${exerciseId}`)
    return response.data
  },
  createChannel: async (
    exerciseId: number,
    name: string,
    logoUrl?: string
  ): Promise<TVChannel> => {
    const response = await api.post('/tv/channels', null, {
      params: { exercise_id: exerciseId, name, logo_url: logoUrl },
    })
    return response.data
  },

  // Live State
  getLiveState: async (exerciseId: number, channelId?: number): Promise<TVLiveState> => {
    const response = await api.get(`/tv/${exerciseId}/live`, {
      params: { channel_id: channelId },
    })
    return response.data
  },
  updateBanner: async (
    exerciseId: number,
    text: string | null,
    channelId?: number
  ) => {
    const response = await api.post(`/tv/${exerciseId}/live/banner`, { text }, {
      params: { channel_id: channelId },
    })
    return response.data
  },
  updateTicker: async (
    exerciseId: number,
    op: 'add' | 'remove' | 'clear',
    item?: TickerItem,
    index?: number,
    channelId?: number
  ) => {
    const response = await api.post(`/tv/${exerciseId}/live/ticker`, { op, item, index }, {
      params: { channel_id: channelId },
    })
    return response.data
  },
  control: async (
    exerciseId: number,
    action: 'start' | 'stop' | 'pause' | 'resume' | 'skip',
    targetId?: number,
    channelId?: number
  ) => {
    const response = await api.post(`/tv/${exerciseId}/live/control`, { action, target_id: targetId }, {
      params: { channel_id: channelId },
    })
    return response.data
  },

  // Segments
  listSegments: async (
    exerciseId: number,
    channelId?: number,
    status?: string
  ): Promise<TVSegment[]> => {
    const response = await api.get(`/tv/${exerciseId}/segments`, {
      params: { channel_id: channelId, status },
    })
    return response.data
  },
  createSegment: async (data: {
    channel_id: number
    segment_type: string
    title?: string
    banner_text?: string
    ticker_text?: string
    script?: string
    scheduled_start?: string
    scheduled_end?: string
    media_ids?: number[]
  }): Promise<TVSegment> => {
    const response = await api.post('/tv/segments', data)
    return response.data
  },
  startSegment: async (segmentId: number) => {
    const response = await api.post(`/tv/segments/${segmentId}/start`)
    return response.data
  },
  endSegment: async (segmentId: number) => {
    const response = await api.post(`/tv/segments/${segmentId}/end`)
    return response.data
  },

  // Playlist
  getPlaylist: async (exerciseId: number, channelId?: number): Promise<TVPlaylistItem[]> => {
    const response = await api.get(`/tv/${exerciseId}/playlist`, {
      params: { channel_id: channelId },
    })
    return response.data
  },
  addToPlaylist: async (
    exerciseId: number,
    data: {
      channel_id: number
      item_type: string
      title?: string
      media_id?: number
      ref_id?: number
      banner_text?: string
      ticker_items?: TickerItem[]
      play_mode?: string
      takeover?: boolean
      planned_at?: string
    }
  ): Promise<TVPlaylistItem> => {
    const response = await api.post(`/tv/${exerciseId}/playlist`, data)
    return response.data
  },
  reorderPlaylist: async (exerciseId: number, channelId: number, itemIds: number[]) => {
    const response = await api.patch(`/tv/${exerciseId}/playlist/reorder`, itemIds, {
      params: { channel_id: channelId },
    })
    return response.data
  },
  removeFromPlaylist: async (itemId: number) => {
    const response = await api.delete(`/tv/playlist/${itemId}`)
    return response.data
  },
}

// Welcome Kit Types
export type WelcomeKitKind = 'player' | 'facilitator'

export interface WelcomeKitTemplate {
  id: number
  name: string
  kind: WelcomeKitKind
  template_markdown: string
  variables: Record<string, string> | null
  is_default: boolean
  created_by: number | null
  created_at: string
  updated_at: string
}

// Plugin Configuration API
export interface PluginConfiguration {
  plugin_type: PluginType
  name: string
  description: string | null
  icon: string
  color: string
  default_enabled: boolean
  coming_soon: boolean
  sort_order: number
}

export interface OptionsExportPayload {
  exported_at: string
  app_configuration: AppConfiguration
  plugins: PluginConfiguration[]
}

export interface OptionsImportPayload {
  app_configuration?: Partial<AppConfiguration>
  plugins?: PluginConfiguration[]
}

export interface ApiKeyItem {
  id: number
  name: string
  key_preview: string
  is_active: boolean
  created_at: string
  last_used_at: string | null
}

export interface ApiKeyCreated extends ApiKeyItem {
  key: string
}

// App Configuration API
export interface AppConfiguration {
  organization_name: string
  organization_logo_url: string | null
  organization_description: string | null
  organization_reference_url: string | null
  organization_keywords: string | null
  default_exercise_duration_hours: number
  default_time_multiplier: number
  default_maturity_level: string
  default_exercise_mode: string
  enable_tv_plugin: boolean
  enable_social_plugin: boolean
  enable_welcome_kits: boolean
  enable_scoring: boolean
  session_timeout_minutes: number
  max_login_attempts: number
  password_min_length: number
  smtp_enabled: boolean
  smtp_host: string | null
  smtp_port: number | null
  smtp_user: string | null
  smtp_from: string | null
  simulator_inject_mapping: string | null
  default_phases_config: string | null
  default_phases_preset: string | null
}

export interface PublicConfigurationResponse {
  organization_name: string
  organization_logo_url: string | null
  tenant_slug?: string | null
}

export const adminApi = {
  // Public Configuration (no auth required)
  getPublicConfiguration: async (): Promise<PublicConfigurationResponse> => {
    const response = await api.get('/admin/public/config')
    return response.data
  },
  // App Configuration
  getAppConfiguration: async (): Promise<AppConfiguration> => {
    const response = await api.get('/admin/config')
    return response.data
  },
  updateAppConfiguration: async (
    data: Partial<AppConfiguration>
  ): Promise<AppConfiguration> => {
    const response = await api.put('/admin/config', data)
    return response.data
  },
  // Plugin Configuration
  getPluginConfigurations: async (): Promise<PluginConfiguration[]> => {
    const response = await api.get('/admin/plugins')
    return response.data
  },
  updatePluginConfiguration: async (
    pluginType: PluginType,
    data: Partial<Omit<PluginConfiguration, 'plugin_type'>>
  ): Promise<PluginConfiguration> => {
    const response = await api.put(`/admin/plugins/${pluginType}`, data)
    return response.data
  },
  resetPluginConfigurations: async (): Promise<PluginConfiguration[]> => {
    const response = await api.post('/admin/plugins/reset')
    return response.data
  },
  exportOptionsConfiguration: async (): Promise<OptionsExportPayload> => {
    const response = await api.get('/admin/config/export')
    return response.data
  },
  importOptionsConfiguration: async (
    payload: OptionsImportPayload
  ): Promise<OptionsExportPayload> => {
    const response = await api.post('/admin/config/import', payload)
    return response.data
  },
  listApiKeys: async (): Promise<ApiKeyItem[]> => {
    const response = await api.get('/admin/api-keys')
    return response.data
  },
  createApiKey: async (name: string): Promise<ApiKeyCreated> => {
    const response = await api.post('/admin/api-keys', { name })
    return response.data
  },
  revokeApiKey: async (keyId: number): Promise<void> => {
    await api.delete(`/admin/api-keys/${keyId}`)
  },
}

// Welcome Kit API
export const welcomeKitApi = {
  listTemplates: async (kind?: WelcomeKitKind): Promise<{
    templates: WelcomeKitTemplate[]
    available_variables: Record<string, string>
  }> => {
    const response = await api.get('/welcome-kits/templates', {
      params: { kind },
    })
    return response.data
  },
  getTemplate: async (templateId: number): Promise<WelcomeKitTemplate> => {
    const response = await api.get(`/welcome-kits/templates/${templateId}`)
    return response.data
  },
  createTemplate: async (data: {
    name: string
    kind: WelcomeKitKind
    template_markdown: string
    variables?: Record<string, string>
    is_default?: boolean
  }): Promise<WelcomeKitTemplate> => {
    const response = await api.post('/welcome-kits/templates', data)
    return response.data
  },
  updateTemplate: async (
    templateId: number,
    data: {
      name?: string
      template_markdown?: string
      variables?: Record<string, string>
      is_default?: boolean
    }
  ): Promise<WelcomeKitTemplate> => {
    const response = await api.put(`/welcome-kits/templates/${templateId}`, data)
    return response.data
  },
  deleteTemplate: async (templateId: number) => {
    await api.delete(`/welcome-kits/templates/${templateId}`)
  },
  previewWelcomeKit: async (
    exerciseId: number,
    userId: number,
    kind?: WelcomeKitKind,
    templateId?: number
  ): Promise<{
    template_id: number
    template_name: string
    context: Record<string, string>
    rendered_markdown: string
    rendered_html: string
  }> => {
    const response = await api.get(`/welcome-kits/exercises/${exerciseId}/preview/${userId}`, {
      params: { kind, template_id: templateId },
    })
    return response.data
  },
  generateUserPdf: async (
    exerciseId: number,
    userId: number,
    kind?: WelcomeKitKind,
    templateId?: number
  ): Promise<Blob> => {
    const response = await api.get(`/welcome-kits/exercises/${exerciseId}/generate/${userId}`, {
      params: { kind, template_id: templateId },
      responseType: 'blob',
    })
    return response.data
  },
  generateAllKits: async (
    exerciseId: number,
    kind?: WelcomeKitKind,
    templateId?: number
  ): Promise<{
    message: string
    exercise_id: number
    kind: string
    generated_count: number
    skipped_count: number
    participants: Array<{ user_id: number; exercise_user_id: number; role: string }>
    skipped: Array<{ user_id: number; reason: string }>
  }> => {
    const response = await api.post(`/welcome-kits/exercises/${exerciseId}/generate-all`, null, {
      params: { kind, template_id: templateId },
    })
    return response.data
  },
  downloadAllKits: async (
    exerciseId: number,
    kind?: WelcomeKitKind,
    templateId?: number
  ): Promise<Blob> => {
    const response = await api.post(`/welcome-kits/exercises/${exerciseId}/download-all`, null, {
      params: { kind, template_id: templateId },
      responseType: 'blob',
    })
    return response.data
  },
  ensurePasswords: async (exerciseId: number): Promise<{
    message: string
    created: number
    existing: number
    total: number
  }> => {
    const response = await api.post(`/welcome-kits/exercises/${exerciseId}/ensure-passwords`)
    return response.data
  },
}
