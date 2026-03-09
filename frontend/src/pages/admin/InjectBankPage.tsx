import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as d3 from 'd3'
import {
  adminApi,
  injectBankApi,
  mediaApi,
  InjectDataFormat,
  InjectBankItem,
  InjectBankKind,
  InjectBankStatus,
} from '../../services/api'
import { INJECT_BANK_KIND_LABELS, INJECT_BANK_STATUS_LABELS } from '../../config/injectBank'
import { useInjectBankStatuses } from '../../hooks/useInjectBank'
import { Plus, Pencil, Trash2, Search, LibraryBig, Tag, Upload, Download, Eye, FileArchive, FileJson, Mail, MessageSquare, BookOpen, Shield, Newspaper, Link2, Lightbulb, FileText, Users, ExternalLink, X, Image as ImageIcon, Video, File as FileIcon, ZoomIn, ZoomOut, RotateCw, Maximize2, Play, Pause, Volume2, VolumeX, Repeat2, Heart, BarChart3 } from 'lucide-react'
import Modal from '../../components/Modal'
import MediaViewer from '../../components/MediaViewer'
import { useAppDialog } from '../../contexts/AppDialogContext'
import { formatSchemaError, validateWithSchema } from '../../utils/jsonSchemaValidation'


const SCHEMA_INJECT_KINDS: InjectBankKind[] = ['mail', 'sms', 'call', 'socialnet', 'tv', 'doc', 'directory', 'story']
const SCHEMA_INJECT_KIND_SET = new Set<InjectBankKind>(SCHEMA_INJECT_KINDS)

const ATTACHMENT_SUPPORTED_KINDS = SCHEMA_INJECT_KIND_SET

const getAttachmentAccept = (kind: InjectBankKind, dataFormat: InjectDataFormat): string => {
  if (dataFormat === 'video') return 'video/*'
  if (dataFormat === 'image') return 'image/*'
  if (dataFormat === 'audio') return 'audio/*'
  if (kind === 'doc') return '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,application/pdf'
  return '*/*'
}

const getMediaSourceUrl = (dataFormat: InjectDataFormat, mediaId: number): string => {
  if (dataFormat === 'video') return `/api/media/${mediaId}/stream`
  if (dataFormat === 'image') return `/api/media/${mediaId}/preview`
  return `/api/media/${mediaId}/download`
}

const getExistingAttachmentName = (payload: Record<string, any>): string | null => {
  const attachment = payload?.attachment
  if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) return null

  const filename = (attachment as Record<string, unknown>).original_filename
  if (typeof filename === 'string' && filename.trim()) return filename.trim()

  return null
}

const hasUploadedAttachment = (item: InjectBankItem): boolean => {
  if (!ATTACHMENT_SUPPORTED_KINDS.has(item.kind)) return false

  const attachment = item.payload?.attachment
  if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) return false

  const mediaId = (attachment as Record<string, unknown>).media_id
  return typeof mediaId === 'number' && Number.isFinite(mediaId)
}

const getAttachmentUrlByKind = (dataFormat: InjectDataFormat, attachment: Record<string, unknown>): string | null => {
  const streamUrl = typeof attachment.stream_url === 'string' ? attachment.stream_url : ''
  const previewUrl = typeof attachment.preview_url === 'string' ? attachment.preview_url : ''
  const downloadUrl = typeof attachment.download_url === 'string' ? attachment.download_url : ''

  if (dataFormat === 'video') return streamUrl || previewUrl || downloadUrl || null
  if (dataFormat === 'image') return previewUrl || downloadUrl || streamUrl || null
  if (dataFormat === 'audio') return streamUrl || downloadUrl || previewUrl || null
  return previewUrl || downloadUrl || null
}

const getPreviewUrlForItem = (item: InjectBankItem): string | null => {
  const attachment = item.payload?.attachment
  if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) return null

  const attachmentRecord = attachment as Record<string, unknown>
  const mediaId = attachmentRecord.media_id
  if (typeof mediaId !== 'number' || !Number.isFinite(mediaId)) return null

  const urlFromAttachment = getAttachmentUrlByKind(item.data_format, attachmentRecord)
  if (urlFromAttachment) return urlFromAttachment

  return getMediaSourceUrl(item.data_format, mediaId)
}

type FormState = {
  title: string
  inject_type: string
  kind: InjectBankKind
  status: InjectBankStatus
  data_format: InjectDataFormat
  summary: string
  content: string
  source_url: string
  tags_csv: string
  payload_json: string
}

type InjectBankCreatePayload = {
  title: string
  kind: InjectBankKind
  status: InjectBankStatus
  category?: string
  data_format: InjectDataFormat
  summary?: string
  content?: string
  source_url?: string
  payload: Record<string, any>
  tags: string[]
}

const EMPTY_FORM: FormState = {
  title: '',
  inject_type: 'mail',
  kind: 'mail',
  status: 'draft',
  data_format: 'text',
  summary: '',
  content: '',
  source_url: '',
  tags_csv: '',
  payload_json: '{}',
}

type ChronogramPoint = {
  order: number
  label: string
  description?: string
  date?: Date
}

const CHRONOGRAM_DATE_FIELDS = [
  'date',
  'datetime',
  'timestamp',
  'at',
  'time',
  'scheduled_at',
  'starts_at',
  'start_at',
  'start',
  'created_at',
]

const CHRONOGRAM_LABEL_FIELDS = [
  'title',
  'label',
  'name',
  'event',
  'step',
]

const CHRONOGRAM_DESCRIPTION_FIELDS = [
  'description',
  'details',
  'content',
  'summary',
]

const CHRONOGRAM_ARRAY_KEYS = [
  'events',
  'timeline',
  'items',
  'steps',
  'entries',
  'chronogram',
]

type TimelineInjectTypeFormatConfig = {
  type: string
  formats: InjectDataFormat[]
  simulator: string | null
}

const DEFAULT_TIMELINE_INJECT_TYPE_FORMATS: TimelineInjectTypeFormatConfig[] = [
  { type: 'mail', formats: ['text'] as InjectDataFormat[], simulator: 'mail' },
  { type: 'sms', formats: ['text', 'image'] as InjectDataFormat[], simulator: 'sms' },
  { type: 'call', formats: ['audio'] as InjectDataFormat[], simulator: 'tel' },
  { type: 'socialnet', formats: ['text', 'video', 'image'] as InjectDataFormat[], simulator: 'social' },
  { type: 'tv', formats: ['video'] as InjectDataFormat[], simulator: 'tv' },
  { type: 'doc', formats: ['text', 'image'] as InjectDataFormat[], simulator: 'mail' },
  { type: 'directory', formats: ['text'] as InjectDataFormat[], simulator: null },
  { type: 'story', formats: ['text'] as InjectDataFormat[], simulator: null },
]

const TIMELINE_ALLOWED_TYPE_NAMES = new Set(
  DEFAULT_TIMELINE_INJECT_TYPE_FORMATS.map((row) => row.type.toLowerCase())
)

const normalizeTimelineTypeName = (value: string): string => {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'mail' || normalized === 'email') return 'mail'
  if (normalized === 'sms' || normalized === 'message') return 'sms'
  if (normalized === 'call' || normalized === 'tel') return 'call'
  if (normalized === 'social network' || normalized === 'social') return 'socialnet'
  if (normalized === 'tv') return 'tv'
  if (normalized === 'document' || normalized === 'doc') return 'doc'
  if (normalized === 'annuaire de crise' || normalized === 'directory') return 'directory'
  if (normalized === 'scenario' || normalized === 'scénario' || normalized === 'story') return 'story'
  return normalized
}

const normalizeTimelineInjectTypeRows = (
  rows: TimelineInjectTypeFormatConfig[]
): TimelineInjectTypeFormatConfig[] => {
  const byType = new Map<string, TimelineInjectTypeFormatConfig>()
  for (const row of rows) {
    const normalizedType = normalizeTimelineTypeName(row.type)
    if (!TIMELINE_ALLOWED_TYPE_NAMES.has(normalizedType) || byType.has(normalizedType)) {
      continue
    }
    byType.set(normalizedType, row)
  }

  return DEFAULT_TIMELINE_INJECT_TYPE_FORMATS.map((defaultRow) => {
    const source = byType.get(defaultRow.type.toLowerCase())
    if (!source) return defaultRow
    const formats = source.formats.filter((format): format is InjectDataFormat =>
      ['text', 'audio', 'video', 'image'].includes(format)
    )
    return {
      type: defaultRow.type,
      formats: formats.length > 0 ? Array.from(new Set(formats)) : defaultRow.formats,
      simulator: source.simulator,
    }
  })
}

const normalizeTimelineFormat = (value: unknown): InjectDataFormat | null => {
  if (typeof value !== 'string') return null
  const upper = value.trim().toUpperCase()
  if (upper === 'TXT' || upper === 'TEXT') return 'text'
  if (upper === 'AUDIO') return 'audio'
  if (upper === 'VIDEO') return 'video'
  if (upper === 'IMAGE') return 'image'
  return null
}

const parseTimelineInjectTypeFormats = (raw: string | null): TimelineInjectTypeFormatConfig[] => {
  if (!raw) return DEFAULT_TIMELINE_INJECT_TYPE_FORMATS
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_TIMELINE_INJECT_TYPE_FORMATS
    const normalized = parsed
      .filter((row) => row && typeof row.type === 'string' && row.type.trim().length > 0)
      .map((row) => {
        const formats = Array.isArray(row.formats)
          ? row.formats
            .map((format: unknown) => normalizeTimelineFormat(format))
            .filter((format: InjectDataFormat | null): format is InjectDataFormat => format !== null)
          : []
        return {
          type: row.type.trim(),
          formats: formats.length > 0 ? Array.from(new Set(formats)) : ['text'],
          simulator: typeof row.simulator === 'string' && row.simulator.trim().length > 0 ? row.simulator.trim() : null,
        }
      })
    if (normalized.length === 0) return DEFAULT_TIMELINE_INJECT_TYPE_FORMATS
    return normalizeTimelineInjectTypeRows(normalized)
  } catch {
    return DEFAULT_TIMELINE_INJECT_TYPE_FORMATS
  }
}

const buildPayloadSkeletonByType = (injectType: string): Record<string, any> => {
  const normalizedType = injectType.trim().toLowerCase()

  if (normalizedType === 'mail') {
    return {
      from: 'expediteur@organisation.local',
      to: ['destinataire@organisation.local'],
      cc: [],
      subject: 'Sujet du message',
      timestamp: new Date().toISOString(),
      body: 'Contenu de l email...',
    }
  }
  if (normalizedType === 'sms') {
    return {
      from: '+33600000000',
      to: ['+33611111111'],
      message: 'Texte du SMS...',
      timestamp: new Date().toISOString(),
    }
  }
  if (normalizedType === 'call') {
    return {
      from: '+33600000000',
      to: '+33611111111',
      duration_sec: 90,
      transcript: 'Resume de l appel...',
      timestamp: new Date().toISOString(),
    }
  }
  if (normalizedType === 'socialnet') {
    return {
      author_name: 'Cellule Communication',
      author_handle: '@organisation',
      text: 'Texte du post...',
      timestamp: new Date().toISOString(),
      replies: 0,
      reposts: 0,
      likes: 0,
      views: 0,
    }
  }
  if (normalizedType === 'tv') {
    return {
      channel: 'TV News',
      headline: 'Titre du bandeau',
      body: 'Contenu du flash info...',
      timestamp: new Date().toISOString(),
    }
  }
  if (normalizedType === 'doc') {
    return {
      document_type: 'note_interne',
      title: 'Titre du document',
      body: 'Contenu du document...',
      issued_at: new Date().toISOString(),
    }
  }
  if (normalizedType === 'directory') {
    return {
      directory_type: 'contacts_crise',
      entries: [
        {
          partner: 'Nom contact',
          contact: 'Role / service',
          phone: '+33000000000',
          priority: 'moyenne',
        },
      ],
    }
  }
  if (normalizedType === 'story') {
    return {
      scenario_title: 'Intitule scenario',
      context: 'Contexte narratif...',
      key_points: ['Point 1', 'Point 2'],
    }
  }

  return {}
}

/** In the schema world, inject_type IS the kind (both use canonical schema values). */
const resolveInjectBankKindFromType = (injectType: string): InjectBankKind => {
  const normalized = injectType.trim().toLowerCase() as InjectBankKind
  return SCHEMA_INJECT_KIND_SET.has(normalized) ? normalized : 'doc'
}

const toValidDate = (value: unknown): Date | null => {
  if (value === null || value === undefined) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value

  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value < 1e11 ? value * 1000 : value
    const candidate = new Date(millis)
    return Number.isNaN(candidate.getTime()) ? null : candidate
  }

  if (typeof value === 'string' && value.trim()) {
    const raw = value.trim()
    const numeric = Number(raw)
    if (!Number.isNaN(numeric)) {
      const millis = numeric < 1e11 ? numeric * 1000 : numeric
      const candidate = new Date(millis)
      if (!Number.isNaN(candidate.getTime())) return candidate
    }
    const candidate = new Date(raw)
    return Number.isNaN(candidate.getTime()) ? null : candidate
  }

  return null
}

const toObjectArray = (value: unknown): Array<Record<string, unknown>> => {
  if (!Array.isArray(value)) return []
  return value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) as Array<Record<string, unknown>>
}

const extractTimelineNodes = (payload: Record<string, any>): unknown[] | null => {
  const directTimeline = Array.isArray(payload.timeline) ? payload.timeline : []
  if (directTimeline.length > 0) return directTimeline

  if (payload.timeline && typeof payload.timeline === 'object' && !Array.isArray(payload.timeline)) {
    const timelineObject = payload.timeline as Record<string, unknown>
    const timelineNodes = Array.isArray(timelineObject.nodes) ? timelineObject.nodes : []
    if (timelineNodes.length > 0) return timelineNodes
  }

  const directNodes = Array.isArray(payload.nodes) ? payload.nodes : []
  if (directNodes.length > 0) return directNodes

  return null
}

const extractChronogramEntries = (payload: Record<string, any>): Array<Record<string, unknown>> => {
  const entries: Array<Record<string, unknown>> = []

  CHRONOGRAM_ARRAY_KEYS.forEach((key) => {
    entries.push(...toObjectArray(payload[key]))
  })

  if (entries.length > 0) return entries

  if (payload && typeof payload === 'object') {
    entries.push(payload as Record<string, unknown>)
  }

  return entries
}

const parseChronogramPoints = (payload: Record<string, any>): { points: ChronogramPoint[]; timelineNodeCount: number } => {
  const timelineNodes = extractTimelineNodes(payload)
  const entries: unknown[] = timelineNodes ?? extractChronogramEntries(payload)
  const parsed: ChronogramPoint[] = []

  entries.forEach((entry, index) => {
    const node = entry && typeof entry === 'object' && !Array.isArray(entry)
      ? (entry as Record<string, unknown>)
      : ({ label: String(entry ?? '').trim() } as Record<string, unknown>)

    let eventDate: Date | undefined
    CHRONOGRAM_DATE_FIELDS.some((fieldName) => {
      const parsedDate = toValidDate(node[fieldName])
      eventDate = parsedDate || undefined
      return Boolean(eventDate)
    })

    let label = ''
    CHRONOGRAM_LABEL_FIELDS.some((fieldName) => {
      const value = node[fieldName]
      if (typeof value === 'string' && value.trim()) {
        label = value.trim()
        return true
      }
      return false
    })

    if (!label) label = `Etape ${index + 1}`

    let description = ''
    CHRONOGRAM_DESCRIPTION_FIELDS.some((fieldName) => {
      const value = node[fieldName]
      if (typeof value === 'string' && value.trim()) {
        description = value.trim()
        return true
      }
      return false
    })

    parsed.push({
      order: index,
      label,
      description: description || undefined,
      date: eventDate,
    })
  })

  return {
    points: parsed,
    timelineNodeCount: timelineNodes?.length ?? parsed.length,
  }
}

// Preview components for each inject type
function MailPreview({ payload, fallbackBody }: { payload: Record<string, any>; fallbackBody?: string }) {
  const content =
    payload?.content && typeof payload.content === 'object' && !Array.isArray(payload.content)
      ? payload.content
      : payload

  const locateValue = (paths: string[]): any => {
    const sources = [content, payload]
    for (const source of sources) {
      if (!source || typeof source !== 'object') continue
      for (const path of paths) {
        const parts = path.split('.')
        let current: any = source
        for (const part of parts) {
          if (!current || typeof current !== 'object') {
            current = undefined
            break
          }
          current = current[part]
        }
        if (current != null && current !== '') {
          return current
        }
      }
    }
    return undefined
  }

  const rawFrom = locateValue([
    'from',
    'headers.from',
    'headers.From',
    'sender',
    'metadata.from',
    'envelope.from',
    'payload.from',
    'payload.headers.from',
    'payload.headers.From',
  ])
  const rawTo =
    locateValue([
      'to',
      'headers.to',
      'headers.To',
      'recipients.to',
      'envelope.to',
      'payload.to',
      'payload.headers.to',
      'payload.headers.To',
    ]) ??
    locateValue(['recipients', 'headers.recipients', 'payload.recipients', 'payload.headers.recipients'])
  const rawCc = locateValue(['cc', 'headers.cc', 'headers.Cc', 'recipients.cc', 'payload.cc', 'payload.headers.cc', 'payload.headers.Cc'])
  const rawSubject = locateValue(['subject', 'headers.subject', 'headers.Subject', 'metadata.subject', 'payload.subject', 'payload.headers.subject', 'payload.headers.Subject'])
  const timestamp = locateValue(['timestamp', 'sent_at', 'date', 'headers.date', 'headers.Date', 'payload.timestamp', 'payload.sent_at', 'payload.date', 'payload.headers.date', 'payload.headers.Date'])
  const rawBody = locateValue(['body', 'message', 'text', 'content', 'payload.body', 'payload.message', 'payload.text', 'payload.content'])
  const subject = typeof rawSubject === 'string' ? rawSubject : ''
  const body =
    (typeof rawBody === 'string' ? rawBody : '') ||
    fallbackBody ||
    ''

  const formatRecipients = (value: string | string[] | Record<string, any> | undefined) => {
    if (!value && value !== 0) return ''
    if (Array.isArray(value)) {
      const filtered = value
        .map((entry) => {
          if (typeof entry === 'string') return entry.trim()
          if (entry && typeof entry === 'object') {
            return (
              entry.email ||
              entry.address ||
              entry.value ||
              entry.name ||
              entry.label ||
              ''
            )
          }
          return ''
        })
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry)
      return filtered.join(', ')
    }
    if (typeof value === 'object') {
      return (
        (value.email || value.address || value.value || value.name || value.label || '') as string
      ).trim()
    }
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
    return ''
  }

  const formattedFrom = formatRecipients(rawFrom)
  const formattedTo = formatRecipients(rawTo)
  const formattedCc = formatRecipients(rawCc)
  const parsedDate =
    typeof timestamp === 'string' || typeof timestamp === 'number'
      ? new Date(timestamp)
      : null
  const formattedTimestamp =
    parsedDate && !Number.isNaN(parsedDate.getTime())
      ? parsedDate.toLocaleString('fr-FR', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : timestamp

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800">
      <div className="border-b border-gray-700 bg-gray-900 px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <Mail className="h-4 w-4 text-gray-400" />
          <span className="font-medium text-gray-300">Email</span>
        </div>
      </div>
      <div className="space-y-1 p-3 text-sm">
        <div className="flex gap-2">
          <span className="w-12 shrink-0 text-gray-400">De:</span>
          <span className="text-white">{formattedFrom || '-'}</span>
        </div>
        <div className="flex gap-2">
          <span className="w-12 shrink-0 text-gray-400">À:</span>
          <span className="text-white">{formattedTo || '-'}</span>
        </div>
        {formattedCc && (
          <div className="flex gap-2">
            <span className="w-12 shrink-0 text-gray-400">Cc:</span>
            <span className="text-white">{formattedCc}</span>
          </div>
        )}
        <div className="flex gap-2">
          <span className="w-12 shrink-0 text-gray-400">Sujet:</span>
          <span className="font-medium text-white">{subject || '-'}</span>
        </div>
        {formattedTimestamp && (
          <div className="flex gap-2">
            <span className="w-12 shrink-0 text-gray-400">Date:</span>
            <span className="text-white">{formattedTimestamp}</span>
          </div>
        )}
      </div>
      {body && (
        <div className="border-t border-gray-700 bg-gray-900 p-3">
          <pre className="whitespace-pre-wrap font-sans text-sm text-gray-300">{body}</pre>
        </div>
      )}
    </div>
  )
}

function MessagePreview({ payload }: { payload: Record<string, any> }) {
  const content = payload?.content || payload
  const channel = content?.channel || payload?.channel || ''
  const message = content?.message || payload?.message || ''
  const sender = content?.from || payload?.from || content?.sender || payload?.sender || ''
  const rawTimestamp = content?.timestamp || payload?.timestamp || content?.received_at || payload?.received_at || ''
  const parsedTimestamp = typeof rawTimestamp === 'string' || typeof rawTimestamp === 'number'
    ? new Date(rawTimestamp)
    : null
  const receptionDate = parsedTimestamp && !Number.isNaN(parsedTimestamp.getTime())
    ? parsedTimestamp.toLocaleString('fr-FR')
    : ''

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-3">
      <div className="flex items-center justify-center rounded border border-gray-700 bg-gray-900 p-4">
        <div className="relative h-[460px] w-[240px] rounded-[32px] border-[10px] border-gray-900 bg-gradient-to-b from-slate-800 to-slate-900 shadow-xl">
          <div className="absolute left-1/2 top-2 h-1.5 w-16 -translate-x-1/2 rounded-full bg-gray-700" />
          <div className="absolute inset-[10px] rounded-[18px] bg-slate-100 p-3">
            <div className="mb-2 flex items-center justify-center gap-2 text-[11px] font-medium text-slate-500">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>{channel || 'SMS'}</span>
            </div>
            {sender && (
              <div className="mb-2 text-center text-[11px] text-slate-600">
                {sender}
              </div>
            )}
            {receptionDate && (
              <div className="mb-2 text-center text-[10px] text-slate-500">
                Recu le {receptionDate}
              </div>
            )}
            <div className="ml-auto max-w-[96%] rounded-2xl rounded-tr-sm bg-emerald-500 px-3 py-2 text-xs text-white shadow">
              {message || '-'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SocialPostPreview({ payload, fallbackText }: { payload: Record<string, any>; fallbackText?: string }) {
  const content = payload?.content || payload
  const authorName = content?.author_name || content?.author || payload?.author_name || payload?.author || 'Compte officiel'
  const handleRaw = content?.author_handle || content?.handle || payload?.author_handle || payload?.handle || 'organisation'
  const handle = String(handleRaw).startsWith('@') ? String(handleRaw) : `@${handleRaw}`
  const message =
    content?.message ||
    content?.post ||
    content?.text ||
    payload?.message ||
    payload?.post ||
    payload?.text ||
    fallbackText ||
    ''
  const timestamp = content?.timestamp || content?.published_at || payload?.timestamp || payload?.published_at || ''
  const parsedTimestamp = typeof timestamp === 'string' || typeof timestamp === 'number' ? new Date(timestamp) : null
  const formattedTimestamp = parsedTimestamp && !Number.isNaN(parsedTimestamp.getTime())
    ? parsedTimestamp.toLocaleString('fr-FR')
    : ''
  const replies = Number(content?.replies ?? payload?.replies ?? content?.comments ?? payload?.comments ?? 12)
  const reposts = Number(content?.reposts ?? payload?.reposts ?? content?.retweets ?? payload?.retweets ?? 27)
  const likes = Number(content?.likes ?? payload?.likes ?? 143)
  const views = Number(content?.views ?? payload?.views ?? 3200)

  const fmt = (value: number) => {
    if (!Number.isFinite(value)) return '0'
    return new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-gray-700 bg-gray-800">
        <div className="flex items-start gap-3 p-4">
          <div className="mt-0.5 h-11 w-11 shrink-0 rounded-full bg-slate-900 text-sm font-semibold text-white flex items-center justify-center">
            {String(authorName).trim().slice(0, 2).toUpperCase() || 'XO'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-white">{authorName}</p>
              <p className="truncate text-sm text-gray-400">{handle}</p>
            </div>
            {message && (
              <p className="mt-2 whitespace-pre-wrap text-[15px] leading-6 text-white">{message}</p>
            )}
            {formattedTimestamp && (
              <p className="mt-2 text-xs text-gray-400">{formattedTimestamp}</p>
            )}
            <div className="mt-3 grid grid-cols-4 gap-2 border-t border-gray-700 pt-3 text-gray-400">
              <div className="inline-flex items-center gap-1.5 text-sm">
                <MessageSquare className="h-4 w-4" />
                <span>{fmt(replies)}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 text-sm">
                <Repeat2 className="h-4 w-4" />
                <span>{fmt(reposts)}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 text-sm">
                <Heart className="h-4 w-4" />
                <span>{fmt(likes)}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 text-sm">
                <BarChart3 className="h-4 w-4" />
                <span>{fmt(views)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DirectoryPreview({ payload }: { payload: Record<string, any> }) {
  const content = payload?.content || payload
  const entries = content?.entries || payload?.entries || []
  const directoryType = content?.directory_type || payload?.directory_type || ''

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800">
      <div className="border-b border-gray-700 bg-gray-900 px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-gray-400" />
          <span className="font-medium text-gray-300">{directoryType || 'Annuaire'}</span>
        </div>
      </div>
      {Array.isArray(entries) && entries.length > 0 ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-900">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Nom</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Contact</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Téléphone</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Priorité</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {entries.map((entry: any, idx: number) => (
                <tr key={idx} className="hover:bg-gray-700/50">
                  <td className="px-3 py-2 text-white">{entry?.partner || entry?.name || '-'}</td>
                  <td className="px-3 py-2 text-gray-300">{entry?.contact || '-'}</td>
                  <td className="px-3 py-2 text-gray-300">{entry?.phone || '-'}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${
                      entry?.priority === 'haute' ? 'bg-red-900/30 text-red-400' :
                      entry?.priority === 'moyenne' ? 'bg-yellow-900/30 text-yellow-400' :
                      'bg-green-900/30 text-green-400'
                    }`}>
                      {entry?.priority || '-'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-4 text-sm text-gray-400">Aucune entrée</div>
      )}
    </div>
  )
}

function CanalAnssiPreview({ payload }: { payload: Record<string, any> }) {
  const content = payload?.content || payload
  const refNumber = content?.reference_number || payload?.reference_number || ''
  const commType = content?.communication_type || payload?.communication_type || ''
  const message = content?.official_message || content?.message || payload?.message || ''
  const contactPoint = content?.contact_point || payload?.contact_point || ''

  return (
    <div className="rounded-lg border border-primary-900/30 bg-primary-900/20">
      <div className="border-b border-primary-900/30 bg-primary-900/30 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Shield className="h-4 w-4 text-primary-400" />
            <span className="font-medium text-primary-400">ANSSI</span>
          </div>
          {refNumber && (
            <span className="rounded bg-primary-900/30 px-2 py-0.5 text-xs text-primary-400">{refNumber}</span>
          )}
        </div>
      </div>
      <div className="space-y-2 p-3 text-sm">
        {commType && (
          <div className="text-xs text-primary-400 uppercase">{commType}</div>
        )}
        {message && (
          <pre className="whitespace-pre-wrap font-sans text-gray-300">{message}</pre>
        )}
        {contactPoint && (
          <div className="mt-2 rounded bg-primary-100 px-2 py-1 text-xs text-primary-700">
            Contact: {contactPoint}
          </div>
        )}
      </div>
    </div>
  )
}

function CanalGouvernementPreview({ payload }: { payload: Record<string, any> }) {
  const content = payload?.content || payload
  const refNumber = content?.reference_number || payload?.reference_number || ''
  const commType = content?.communication_type || payload?.communication_type || ''
  const message = content?.official_message || content?.message || payload?.message || ''
  const contactPoint = content?.contact_point || payload?.contact_point || ''

  return (
    <div className="rounded-lg border border-purple-900/30 bg-purple-900/20">
      <div className="border-b border-purple-900/30 bg-purple-900/30 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Shield className="h-4 w-4 text-purple-400" />
            <span className="font-medium text-purple-400">Gouvernement</span>
          </div>
          {refNumber && (
            <span className="rounded bg-purple-900/30 px-2 py-0.5 text-xs text-purple-400">{refNumber}</span>
          )}
        </div>
      </div>
      <div className="space-y-2 p-3 text-sm">
        {commType && (
          <div className="text-xs text-purple-400 uppercase">{commType}</div>
        )}
        {message && (
          <pre className="whitespace-pre-wrap font-sans text-gray-300">{message}</pre>
        )}
        {contactPoint && (
          <div className="mt-2 rounded bg-purple-100 px-2 py-1 text-xs text-purple-700">
            Contact: {contactPoint}
          </div>
        )}
      </div>
    </div>
  )
}

function CanalPressPreview({ payload }: { payload: Record<string, any> }) {
  const content = payload?.content || payload
  const mediaName = content?.media_name || payload?.media_name || ''
  const journalist = content?.journalist || payload?.journalist || ''
  const headline = content?.headline || payload?.headline || ''
  const articleBody = content?.article_body || content?.body || payload?.body || ''
  const tone = content?.tone || payload?.tone || ''
  const pubDate = content?.publication_datetime || payload?.publication_datetime || ''

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800">
      <div className="border-b border-gray-700 bg-gray-900 px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <Newspaper className="h-4 w-4 text-gray-400" />
          <span className="font-medium text-gray-300">{mediaName || 'Presse'}</span>
          {journalist && <span className="text-gray-400">• {journalist}</span>}
        </div>
      </div>
      <div className="space-y-2 p-3">
        {headline && (
          <h4 className="text-lg font-semibold text-white">{headline}</h4>
        )}
        {articleBody && (
          <p className="whitespace-pre-wrap text-sm text-gray-300">{articleBody}</p>
        )}
        <div className="flex gap-2 text-xs text-gray-400">
          {tone && <span className="rounded bg-gray-700 px-2 py-0.5">{tone}</span>}
          {pubDate && <span>{new Date(pubDate).toLocaleString('fr-FR')}</span>}
        </div>
      </div>
    </div>
  )
}

function ReferenceUrlPreview({ payload }: { payload: Record<string, any> }) {
  const content = payload?.content || payload
  const url = content?.url || payload?.url || payload?.source_url || ''
  const description = content?.description || payload?.description || ''

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <div className="flex items-center gap-2 text-sm">
        <Link2 className="h-4 w-4 text-gray-400" />
        <span className="font-medium text-gray-300">URL de référence</span>
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-center gap-1 text-primary-400 hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          <span className="truncate">{url}</span>
        </a>
      )}
      {description && (
        <p className="mt-2 text-sm text-gray-400">{description}</p>
      )}
    </div>
  )
}

function IdeaPreview({ item }: { item: InjectBankItem }) {
  return (
    <div className="rounded-lg border border-amber-900/30 bg-amber-900/20 p-4">
      <div className="flex items-center gap-2 text-sm">
        <Lightbulb className="h-4 w-4 text-amber-400" />
        <span className="font-medium text-amber-400">Idée</span>
      </div>
      {item.summary && (
        <p className="mt-2 text-sm text-gray-300">{item.summary}</p>
      )}
      {item.content && (
        <p className="mt-2 text-sm text-gray-400">{item.content}</p>
      )}
      {item.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {item.tags.map((t: string) => (
            <span key={t} className="rounded bg-amber-900/30 px-2 py-0.5 text-xs text-amber-400">{t}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function GenericPreview({ payload }: { payload: Record<string, any> }) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800">
      <div className="border-b border-gray-700 bg-gray-900 px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <FileText className="h-4 w-4 text-gray-400" />
          <span className="font-medium text-gray-300">Contenu</span>
        </div>
      </div>
      <div className="max-h-64 overflow-auto p-3">
        <pre className="whitespace-pre-wrap font-mono text-xs text-gray-300">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </div>
    </div>
  )
}

function InjectPreview({ item }: { item: InjectBankItem }) {
  const payload = item.payload || {}

  switch (item.kind) {
    case 'mail':
      return <MailPreview payload={payload} fallbackBody={item.content} />
    case 'sms':
      return <MessagePreview payload={payload} />
    case 'directory':
      return <DirectoryPreview payload={payload} />
    case 'socialnet':
      return <SocialPostPreview payload={payload} fallbackText={item.content} />
    default:
      return <GenericPreview payload={payload} />
  }
}

function ChronogramD3Viewer({ item }: { item: InjectBankItem }) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const { points, timelineNodeCount } = useMemo(() => parseChronogramPoints(item.payload || {}), [item.payload])

  useEffect(() => {
    const svgElement = svgRef.current
    if (!svgElement) return

    const svg = d3.select(svgElement)
    svg.selectAll('*').remove()

    if (points.length === 0) return

    const width = 920
    const rowHeight = 74
    const height = Math.max(260, points.length * rowHeight + 36)
    const margin = { top: 24, right: 24, bottom: 24, left: 24 }
    const lineX = 130
    const contentX = 180
    const y = d3
      .scalePoint<string>()
      .domain(points.map((p) => String(p.order)))
      .range([margin.top, height - margin.bottom])
      .padding(0.5)

    const g = svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .append('g')

    g.append('line')
      .attr('x1', lineX)
      .attr('x2', lineX)
      .attr('y1', margin.top)
      .attr('y2', height - margin.bottom)
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 2)

    const pointGroup = g
      .selectAll('g.chrono-point')
      .data(points)
      .enter()
      .append('g')
      .attr('class', 'chrono-point')
      .attr('transform', (d) => `translate(0, ${y(String(d.order)) ?? margin.top})`)

    pointGroup
      .append('line')
      .attr('x1', lineX)
      .attr('x2', contentX - 10)
      .attr('y1', 0)
      .attr('y2', 0)
      .attr('stroke', '#94a3b8')
      .attr('stroke-width', 1.5)

    pointGroup
      .append('circle')
      .attr('cx', lineX)
      .attr('cy', 0)
      .attr('r', 5)
      .attr('fill', '#2563eb')

    pointGroup
      .append('text')
      .attr('x', lineX - 14)
      .attr('y', 4)
      .attr('text-anchor', 'end')
      .attr('fill', '#64748b')
      .style('font-size', '11px')
      .text((_, i) => `#${i + 1}`)

    pointGroup
      .append('text')
      .attr('x', contentX)
      .attr('y', -4)
      .attr('text-anchor', 'start')
      .attr('fill', '#1f2937')
      .style('font-size', '12px')
      .style('font-weight', '600')
      .text((d) => (d.label.length > 56 ? `${d.label.slice(0, 56)}...` : d.label))

    pointGroup
      .append('text')
      .attr('x', contentX)
      .attr('y', 14)
      .attr('text-anchor', 'start')
      .attr('fill', '#64748b')
      .style('font-size', '11px')
      .text((d) => (d.date ? d3.timeFormat('%d/%m/%Y %H:%M')(d.date) : 'Sans date'))

    pointGroup
      .append('title')
      .text((d) => `${d.label}\n${d.date ? d3.timeFormat('%d/%m/%Y %H:%M')(d.date) : 'Sans date'}${d.description ? `\n${d.description}` : ''}`)
  }, [points])

  return (
    <div className="space-y-3">
      {points.length === 0 ? (
        <div className="rounded border border-amber-900/30 bg-amber-900/20 p-3 text-sm text-amber-400">
          Aucun noeud exploitable n&apos;a ete detecte dans le payload de ce chronogramme.
        </div>
      ) : (
        <>
          <div className="rounded border border-gray-700 bg-gray-800 p-3">
            <svg ref={svgRef} className="w-full" role="img" aria-label="Visualisation chronogramme verticale" />
          </div>
          <p className="text-xs text-gray-400">
            {points.length} point(s) affiches pour {timelineNodeCount} noeud(s) timeline. Survoler un point pour voir les details.
          </p>
        </>
      )}
    </div>
  )
}

export default function InjectBankPage() {
  const appDialog = useAppDialog()
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<InjectBankKind | ''>('')
  const [status, setStatus] = useState<InjectBankStatus | ''>('')
  const [tag, setTag] = useState('')
  const { data: statuses } = useInjectBankStatuses()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [chronogramPreviewItem, setChronogramPreviewItem] = useState<InjectBankItem | null>(null)
  const [mediaPreviewItem, setMediaPreviewItem] = useState<InjectBankItem | null>(null)
  const [previewItem, setPreviewItem] = useState<InjectBankItem | null>(null)
  const [editingItem, setEditingItem] = useState<InjectBankItem | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [importMode, setImportMode] = useState<'zip' | 'text'>('zip')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importJsonText, setImportJsonText] = useState('')
  const [importError, setImportError] = useState('')
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [pendingClearImport, setPendingClearImport] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [dragCounter, setDragCounter] = useState(0)
  const [dragImportStatus, setDragImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isDragImporting, setIsDragImporting] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['inject-bank', page, search, kind, status, tag],
    queryFn: () => {
      return injectBankApi.list({
        page,
        page_size: 12,
        search: search || undefined,
        kind: kind || undefined,
        status: status || undefined,
        tag: tag || undefined,
        sort_by: 'updated_at',
        order: 'desc',
      })
    },
  })

  const { data: stats } = useQuery({
    queryKey: ['inject-bank-stats'],
    queryFn: () => injectBankApi.getStats(),
  })

  const { data: schemaPayload } = useQuery({
    queryKey: ['inject-bank-schema'],
    queryFn: () => injectBankApi.getSchema(),
  })
  const { data: appConfig } = useQuery({
    queryKey: ['app-configuration'],
    queryFn: adminApi.getAppConfiguration,
  })

  const withUploadedAttachment = async (payload: InjectBankCreatePayload, file: File | null): Promise<InjectBankCreatePayload> => {
    if (!file || !ATTACHMENT_SUPPORTED_KINDS.has(payload.kind)) return payload

    const uploadResult = await mediaApi.upload(file, {
      title: payload.title,
      description: payload.summary || payload.content,
      visibility: 'global',
    })
    const media = uploadResult.media
    const sourceUrl = getMediaSourceUrl(payload.data_format || 'text', media.id)

    return {
      ...payload,
      source_url: payload.source_url || sourceUrl,
      payload: {
        ...payload.payload,
        attachment: {
          media_id: media.id,
          original_filename: media.original_filename,
          mime_type: media.mime_type,
          size: media.size,
          download_url: `/api/media/${media.id}/download`,
          preview_url: `/api/media/${media.id}/preview`,
          stream_url: `/api/media/${media.id}/stream`,
        },
      },
    }
  }

  const createMutation = useMutation({
    mutationFn: async ({ payload, file }: { payload: InjectBankCreatePayload; file: File | null }) => {
      const payloadWithAttachment = await withUploadedAttachment(payload, file)
      return injectBankApi.create(payloadWithAttachment)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inject-bank'] })
      queryClient.invalidateQueries({ queryKey: ['inject-bank-stats'] })
      closeModal()
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Erreur lors de la creation')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload, file }: { id: number; payload: InjectBankCreatePayload; file: File | null }) => {
      const payloadWithAttachment = await withUploadedAttachment(payload, file)
      return injectBankApi.update(id, payloadWithAttachment)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inject-bank'] })
      queryClient.invalidateQueries({ queryKey: ['inject-bank-stats'] })
      closeModal()
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Erreur lors de la mise a jour')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => injectBankApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inject-bank'] })
      queryClient.invalidateQueries({ queryKey: ['inject-bank-stats'] })
    },
  })

  const importMutation = useMutation({
    mutationFn: ({ file, clearBefore }: { file: File; clearBefore: boolean }) =>
      injectBankApi.importZip(file, clearBefore),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['inject-bank'] })
      queryClient.invalidateQueries({ queryKey: ['inject-bank-stats'] })
      closeImportModal()
      // Show result with skipped count
      if (result.skipped > 0) {
        setDragImportStatus({
          type: 'success',
          message: `${result.imported} importe(s), ${result.skipped} ignore(s) (deja existants) sur ${result.total_in_zip}`
        })
      }
    },
    onError: (err: any) => {
      setImportError(err.response?.data?.detail || 'Erreur lors de l\'import')
    },
  })

  const importTextMutation = useMutation({
    mutationFn: async (itemsToImport: InjectBankCreatePayload[]) => {
      for (let i = 0; i < itemsToImport.length; i += 1) {
        try {
          await injectBankApi.create(itemsToImport[i])
        } catch (err: any) {
          const detail = err.response?.data?.detail || 'Erreur lors de l\'import'
          throw new Error(`Element ${i + 1}: ${detail}`)
        }
      }
      return itemsToImport.length
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inject-bank'] })
      queryClient.invalidateQueries({ queryKey: ['inject-bank-stats'] })
      closeImportModal()
    },
    onError: (err: any) => {
      setImportError(err.message || 'Erreur lors de l\'import')
    },
  })

  const exportMutation = useMutation({
    mutationFn: () => injectBankApi.exportZip(),
  })

  const items = data?.items || []
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / 12))

  const kindLabelMap = INJECT_BANK_KIND_LABELS as Record<string, string>

  const statusLabelMap = useMemo(() => {
    return statuses ? Object.fromEntries(statuses.map((s) => [s, INJECT_BANK_STATUS_LABELS[s] || s])) : {}
  }, [statuses])

  const kindOptions = useMemo(() => {
    return SCHEMA_INJECT_KINDS.map((k) => ({ value: k, label: INJECT_BANK_KIND_LABELS[k] }))
  }, [])

  const statusOptions = useMemo(() => {
    return statuses ? statuses.map((s) => ({ value: s, label: INJECT_BANK_STATUS_LABELS[s] || s })) : []
  }, [statuses])

  const timelineInjectTypeOptions = useMemo(() => {
    return parseTimelineInjectTypeFormats(appConfig?.timeline_phase_type_format_config || null)
  }, [appConfig?.timeline_phase_type_format_config])

  const selectedInjectTypeConfig = useMemo(() => {
    return (
      timelineInjectTypeOptions.find((entry) => entry.type === form.inject_type) ||
      timelineInjectTypeOptions[0] ||
      DEFAULT_TIMELINE_INJECT_TYPE_FORMATS[0]
    )
  }, [timelineInjectTypeOptions, form.inject_type])

  const allowedFormatOptions = selectedInjectTypeConfig?.formats?.length
    ? selectedInjectTypeConfig.formats
    : (['text', 'audio', 'video', 'image'] as InjectDataFormat[])

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingItem(null)
    setForm(EMPTY_FORM)
    setAttachmentFile(null)
    setAttachmentPreview(null)
    setError('')
  }

  const openCreateModal = () => {
    const defaultInjectType = timelineInjectTypeOptions[0] || DEFAULT_TIMELINE_INJECT_TYPE_FORMATS[0]
    const defaultFormat = defaultInjectType.formats[0] || 'text'
    const payloadSkeleton = buildPayloadSkeletonByType(defaultInjectType.type)
    setEditingItem(null)
    setForm({
      ...EMPTY_FORM,
      inject_type: defaultInjectType.type,
      data_format: defaultFormat,
      kind: resolveInjectBankKindFromType(defaultInjectType.type),
      payload_json: JSON.stringify(payloadSkeleton, null, 2),
    })
    setAttachmentFile(null)
    setAttachmentPreview(null)
    setIsModalOpen(true)
    setError('')
  }

  const closeImportModal = () => {
    setIsImportModalOpen(false)
    setImportMode('zip')
    setImportFile(null)
    setImportJsonText('')
    setImportError('')
  }

  const closeChronogramPreview = () => {
    setChronogramPreviewItem(null)
  }

  const closeMediaPreview = () => {
    setMediaPreviewItem(null)
  }

  const closePreview = () => {
    setPreviewItem(null)
  }

  const openPreview = (item: InjectBankItem) => {
    if (hasUploadedAttachment(item)) {
      setMediaPreviewItem(item)
    } else {
      setPreviewItem(item)
    }
  }

  const openImportModal = (mode: 'zip' | 'text' = 'zip') => {
    setIsImportModalOpen(true)
    setImportMode(mode)
    setImportError('')
  }

  const openEditModal = (item: InjectBankItem) => {
    const selectedInjectType = item.category || item.kind
    setEditingItem(item)
    setAttachmentFile(null)
    setAttachmentPreview(null)
    setForm({
      title: item.title,
      inject_type: selectedInjectType,
      kind: item.kind,
      status: item.status,
      data_format: item.data_format || 'text',
      summary: item.summary || '',
      content: item.content || '',
      source_url: item.source_url || '',
      tags_csv: item.tags.join(', '),
      payload_json: JSON.stringify(item.payload || {}, null, 2),
    })
    setIsModalOpen(true)
    setError('')
  }

  const parseForm = () => {
    const tags = form.tags_csv
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    let payload: Record<string, any> = {}
    if (form.payload_json.trim()) {
      payload = JSON.parse(form.payload_json)
      if (payload === null || Array.isArray(payload) || typeof payload !== 'object') {
        throw new Error('Le payload JSON doit etre un objet')
      }
    }

    const injectType = form.inject_type.trim()
    if (!injectType) {
      throw new Error("Le type d'inject est requis")
    }
    const kind = resolveInjectBankKindFromType(injectType)

    const candidate: InjectBankCreatePayload = {
      title: form.title.trim(),
      kind,
      status: form.status,
      category: injectType,
      data_format: form.data_format,
      summary: form.summary.trim() || undefined,
      content: form.content.trim() || undefined,
      source_url: form.source_url.trim() || undefined,
      tags,
      payload,
    }

    if (!schemaPayload?.schema) {
      throw new Error('Schema JSON de la banque indisponible')
    }
    const validation = validateWithSchema(schemaPayload.schema, candidate)
    if (!validation.valid) {
      throw new Error(formatSchemaError(validation.errors[0]))
    }
    return candidate
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      const payload = parseForm()
      if (editingItem) {
        updateMutation.mutate({ id: editingItem.id, payload, file: attachmentFile })
      } else {
        createMutation.mutate({ payload, file: attachmentFile })
      }
    } catch (err: any) {
      setError(err.message || 'Formulaire invalide')
    }
  }

  const handleDelete = async (id: number) => {
    if (await appDialog.confirm('Supprimer cette brique de la banque d\'inject ?')) {
      deleteMutation.mutate(id)
    }
  }

  const parseImportJson = (rawText: string): InjectBankCreatePayload[] => {
    let parsed: unknown
    try {
      parsed = JSON.parse(rawText)
    } catch {
      throw new Error('JSON invalide')
    }

    let entries: unknown[] = []
    if (Array.isArray(parsed)) {
      entries = parsed
    } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray((parsed as Record<string, unknown>).items)) {
      entries = (parsed as Record<string, unknown>).items as unknown[]
    } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      entries = [parsed]
    } else {
      throw new Error('Le JSON doit etre un objet, un tableau, ou un objet avec "items"')
    }

    if (entries.length === 0) {
      throw new Error('Aucun element a importer')
    }

    if (!schemaPayload?.schema) {
      throw new Error('Schema JSON de la banque indisponible')
    }

    return entries.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error(`Element ${index + 1}: format invalide`)
      }

      const item = entry as Record<string, unknown>
      const validation = validateWithSchema(schemaPayload.schema, item)
      if (!validation.valid) {
        throw new Error(`Element ${index + 1}: ${formatSchemaError(validation.errors[0])}`)
      }

      const rawKind = typeof item.kind === 'string' ? item.kind.trim().toLowerCase() : ''
      if (!SCHEMA_INJECT_KIND_SET.has(rawKind as InjectBankKind)) {
        throw new Error(`Element ${index + 1}: "kind" invalide (${rawKind})`)
      }
      const mappedKind = rawKind as InjectBankKind

      const candidate: InjectBankCreatePayload = {
        title: item.title as string,
        kind: mappedKind,
        status: item.status as InjectBankStatus,
        data_format: item.data_format as InjectDataFormat,
        summary: typeof item.summary === 'string' ? item.summary : undefined,
        content: typeof item.content === 'string' ? item.content : undefined,
        source_url: typeof item.source_url === 'string' ? item.source_url : undefined,
        payload: item.payload as Record<string, any>,
        tags: item.tags as string[],
      }
      return candidate
    })
  }

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setImportError('')

    if (importMode === 'zip') {
      if (!importFile) {
        setImportError('Selectionnez un fichier ZIP')
        return
      }
      // Show confirmation dialog asking if user wants to clear before import
      setPendingClearImport(importFile)
      setShowClearConfirm(true)
      return
    }

    try {
      const itemsToImport = parseImportJson(importJsonText)
      importTextMutation.mutate(itemsToImport)
    } catch (err: any) {
      setImportError(err.message || 'Import invalide')
    }
  }

  const handleConfirmImport = (clearBefore: boolean) => {
    if (!pendingClearImport) return
    setShowClearConfirm(false)
    importMutation.mutate({ file: pendingClearImport, clearBefore })
    setPendingClearImport(null)
  }

  const handleCancelClearConfirm = () => {
    setShowClearConfirm(false)
    setPendingClearImport(null)
  }

  const handleExportZip = async () => {
    setImportError('')

    try {
      const blob = await exportMutation.mutateAsync()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      link.href = url
      link.download = `inject-bank-${timestamp}.zip`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      await appDialog.alert(err?.response?.data?.detail || 'Erreur lors de l\'export')
    }
  }

  const cardStatusColor: Record<InjectBankStatus, string> = {
    draft: 'bg-yellow-700/50 text-yellow-100',
    ready: 'bg-green-700/50 text-green-100',
    archived: 'bg-gray-700 text-gray-300',
  }

  const formatBadge: Record<string, { label: string; cls: string }> = {
    text:  { label: 'Texte',  cls: 'bg-blue-800/50 text-blue-100' },
    image: { label: 'Image',  cls: 'bg-purple-800/50 text-purple-100' },
    audio: { label: 'Audio',  cls: 'bg-orange-800/50 text-orange-100' },
    video: { label: 'Vidéo',  cls: 'bg-pink-800/50 text-pink-100' },
  }

  // Drag & Drop handlers - use counter to prevent flickering
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragCounter((c) => c + 1)
    if (!isDragOver) {
      setIsDragOver(true)
    }
  }, [isDragOver])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragCounter((c) => {
      const newCount = c - 1
      if (newCount === 0) {
        setIsDragOver(false)
      }
      return newCount
    })
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragCounter(0)
    setIsDragOver(false)

    if (isDragImporting) return

    setDragImportStatus(null)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) {
      setDragImportStatus({ type: 'error', message: 'Aucun fichier detecte' })
      return
    }

    // Debug: log files to see what's detected
    console.log('Dropped files:', files.map(f => ({ name: f.name, type: f.type, size: f.size })))

    // Separate ZIP and JSON files
    const zipFiles = files.filter((f) => {
      const name = f.name.toLowerCase()
      return name.endsWith('.zip')
    })
    const jsonFiles = files.filter((f) => {
      const name = f.name.toLowerCase()
      return name.endsWith('.json')
    })

    console.log('ZIP files:', zipFiles.length, 'JSON files:', jsonFiles.length)

    if (zipFiles.length === 0 && jsonFiles.length === 0) {
      setDragImportStatus({ type: 'error', message: `Aucun fichier ZIP ou JSON detecte (${files.length} fichier(s) reçu(s): ${files.map(f => f.name).join(', ')})` })
      return
    }

    setIsDragImporting(true)

    try {
      let totalImported = 0
      let totalInFiles = 0
      const errors: string[] = []

      // Process ZIP files
      for (const zipFile of zipFiles) {
        try {
          const result = await injectBankApi.importZip(zipFile)
          totalImported += result.imported
          totalInFiles += result.total_in_zip
        } catch (err: any) {
          const detail = err.response?.data?.detail || 'Erreur lors de l\'import ZIP'
          errors.push(`${zipFile.name}: ${detail}`)
        }
      }

      // Process JSON files
      for (const jsonFile of jsonFiles) {
        try {
          const text = await jsonFile.text()
          const itemsToImport = parseImportJson(text)
          totalInFiles += itemsToImport.length

          for (let i = 0; i < itemsToImport.length; i++) {
            try {
              await injectBankApi.create(itemsToImport[i])
              totalImported++
            } catch (err: any) {
              throw new Error(`Element ${i + 1}: ${err.response?.data?.detail || 'Erreur'}`)
            }
          }
        } catch (err: any) {
          errors.push(`${jsonFile.name}: ${err.message || 'Erreur lors de l\'import JSON'}`)
        }
      }

      // Show result
      if (totalImported > 0) {
        queryClient.invalidateQueries({ queryKey: ['inject-bank'] })
        queryClient.invalidateQueries({ queryKey: ['inject-bank-stats'] })

        let message = `${totalImported} inject(s) importe(s)`
        if (totalInFiles > totalImported) {
          message += ` sur ${totalInFiles}`
        }
        if (errors.length > 0) {
          message += ` (${errors.length} erreur(s))`
        }
        setDragImportStatus({ type: 'success', message })
      } else if (errors.length > 0) {
        setDragImportStatus({ type: 'error', message: errors.slice(0, 3).join(' | ') })
      } else if (totalInFiles > 0) {
        // Items were processed but none imported - likely all skipped due to duplicates
        setDragImportStatus({ type: 'success', message: `${totalInFiles} element(s) deja existant(s) - import ignore` })
      } else {
        setDragImportStatus({ type: 'error', message: 'Aucun element importe' })
      }
    } finally {
      setIsDragImporting(false)
    }
  }, [queryClient, isDragImporting])

  // Auto-hide success message after 5 seconds
  useEffect(() => {
    if (dragImportStatus?.type === 'success') {
      const timer = setTimeout(() => {
        setDragImportStatus(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [dragImportStatus])

  useEffect(() => {
    if (!isModalOpen || timelineInjectTypeOptions.length === 0) return
    const current = timelineInjectTypeOptions.find((entry) => entry.type === form.inject_type)
    if (current) {
      if (!current.formats.includes(form.data_format)) {
        const nextFormat = current.formats[0] || 'text'
        setForm((prev) => ({
          ...prev,
          data_format: nextFormat,
          kind: resolveInjectBankKindFromType(current.type),
        }))
      }
      return
    }
    const fallback = timelineInjectTypeOptions[0]
    const fallbackFormat = fallback.formats[0] || 'text'
    setForm((prev) => ({
      ...prev,
      inject_type: fallback.type,
      data_format: fallbackFormat,
      kind: resolveInjectBankKindFromType(fallback.type),
    }))
  }, [isModalOpen, timelineInjectTypeOptions, form.inject_type, form.data_format])

  return (
    <div
      className="options-theme space-y-6 relative min-h-screen"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Overlay - covers entire viewport */}
      {isDragOver && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-primary-500/20 backdrop-blur-sm transition-all"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="rounded-xl border-2 border-dashed border-primary-500 bg-gray-900/95 p-16 text-center shadow-2xl pointer-events-none">
            <div className="mb-4 flex justify-center gap-4">
              <FileArchive className="h-16 w-16 text-primary-400" />
              <FileJson className="h-16 w-16 text-primary-400" />
            </div>
            <p className="text-xl font-bold text-white">
              {isDragImporting ? 'Import en cours...' : 'Deposez vos fichiers ZIP ou JSON'}
            </p>
            <p className="mt-2 text-sm text-gray-400">
              Import rapide d'injects dans la banque - plusieurs fichiers acceptes
            </p>
            {isDragImporting && (
              <div className="mt-4">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-primary-400 border-r-transparent"></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import Status Toast */}
      {dragImportStatus && (
        <div className={`fixed top-4 right-4 z-50 rounded-lg p-4 shadow-lg ${
          dragImportStatus.type === 'success'
            ? 'bg-green-900/30 border border-green-700/50 text-green-400'
            : 'bg-red-900/30 border border-red-700/50 text-red-400'
        }`}>
          <p className="text-sm font-medium">{dragImportStatus.message}</p>
        </div>
      )}

      {/* Unified header block */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Banque d'injects</h1>
            <p className="text-sm text-gray-400 mt-1">Bibliothèque de scénarios et d'événements</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Groupe import / export */}
            <div className="flex items-center rounded-lg border border-gray-600 bg-gray-700 overflow-hidden divide-x divide-gray-600">
              <button
                onClick={handleExportZip}
                disabled={exportMutation.isPending}
                className="inline-flex items-center px-3 py-2 text-sm text-gray-300 hover:bg-gray-600 disabled:opacity-50"
                title="Exporter la banque (ZIP)"
              >
                <Download size={15} className="mr-1.5" />
                {exportMutation.isPending ? 'Export…' : 'Export'}
              </button>
              <button
                onClick={() => openImportModal('zip')}
                className="inline-flex items-center px-3 py-2 text-sm text-gray-300 hover:bg-gray-600"
                title="Importer un ZIP"
              >
                <Upload size={15} className="mr-1.5" />
                ZIP
              </button>
              <button
                onClick={() => openImportModal('text')}
                className="inline-flex items-center px-3 py-2 text-sm text-gray-300 hover:bg-gray-600"
                title="Importer du texte / JSON"
              >
                <FileText size={15} className="mr-1.5" />
                Texte
              </button>
            </div>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
            >
              <Plus className="mr-2" size={16} />
              Nouvelle brique
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
          <p className="text-xs uppercase text-gray-400">Total</p>
          <p className="text-2xl font-semibold text-white">{stats?.total || 0}</p>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
          <p className="text-xs uppercase text-gray-400">Pretes</p>
          <p className="text-2xl font-semibold text-green-400">{stats?.by_status?.ready || 0}</p>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
          <p className="text-xs uppercase text-gray-400">Brouillons</p>
          <p className="text-2xl font-semibold text-amber-400">{stats?.by_status?.draft || 0}</p>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
          <p className="text-xs uppercase text-gray-400">Types utilises</p>
          <p className="text-2xl font-semibold text-primary-700">{Object.keys(stats?.by_kind || {}).length}</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
            <input
              value={search}
              onChange={(e) => {
                setPage(1)
                setSearch(e.target.value)
              }}
              placeholder="Rechercher titre, contenu, tags"
              className="w-full rounded-lg border border-gray-600 bg-gray-900 text-white py-2 pl-9 pr-3 text-sm placeholder-gray-400"
            />
          </div>

          <select
            value={kind}
            onChange={(e) => {
              setPage(1)
              setKind((e.target.value || '') as InjectBankKind | '')
            }}
            className="rounded-lg border border-gray-600 bg-gray-900 text-white px-3 py-2 text-sm"
          >
            <option value="">Tous les types</option>
            {kindOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => {
              setPage(1)
              setStatus((e.target.value || '') as InjectBankStatus | '')
            }}
            className="rounded-lg border border-gray-600 bg-gray-900 text-white px-3 py-2 text-sm"
          >
            <option value="">Tous les statuts</option>
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <input
            value={tag}
            onChange={(e) => {
              setPage(1)
              setTag(e.target.value)
            }}
            placeholder="Tag exact"
            className="rounded-lg border border-gray-600 bg-gray-900 text-white px-3 py-2 text-sm placeholder-gray-400"
          />
        </div>
      </div>

      <div className="rounded-xl border border-gray-700 bg-gray-800">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Chargement...</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <LibraryBig className="mx-auto mb-2" size={34} />
            Aucune brique pour les filtres courants.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
            {items.map((item: InjectBankItem) => (
              <article
                key={item.id}
                onClick={() => openPreview(item)}
                className="cursor-pointer rounded-lg border border-gray-700 p-4 transition-all hover:border-primary-300 hover:shadow-md"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-white">{item.title}</h3>
                    <p className="text-xs text-gray-400">
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {formatBadge[item.data_format] && (
                      <span className={`rounded px-2 py-1 text-xs font-medium ${formatBadge[item.data_format].cls}`}>
                        {formatBadge[item.data_format].label}
                      </span>
                    )}
                    <span className={`rounded px-2 py-1 text-xs font-medium ${cardStatusColor[item.status]}`}>
                      {statusLabelMap[item.status] || item.status}
                    </span>
                  </div>
                </div>

                {item.summary && <p className="mb-3 text-sm text-gray-300">{item.summary}</p>}

                {item.tags.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1">
                    {item.tags.map((t: string) => (
                      <span key={`${item.id}-${t}`} className="inline-flex items-center rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300">
                        <Tag className="mr-1" size={12} />
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>Mise a jour {new Date(item.updated_at).toLocaleDateString('fr-FR')}</span>
                  <div className="space-x-2" onClick={(e) => e.stopPropagation()}>
                    {hasUploadedAttachment(item) && (
                      <button
                        onClick={() => setMediaPreviewItem(item)}
                        className="inline-flex items-center rounded border border-primary-200 px-2 py-1 text-primary-700 hover:bg-primary-900/30"
                      >
                        <Eye className="mr-1" size={12} />
                        Voir
                      </button>
                    )}
                    <button
                      onClick={() => openEditModal(item)}
                      className="inline-flex items-center rounded border border-gray-600 px-2 py-1 text-gray-400 hover:bg-gray-700/50"
                    >
                      <Pencil className="mr-1" size={12} />
                      Modifier
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="inline-flex items-center rounded border border-red-200 px-2 py-1 text-red-400 hover:bg-red-900/30"
                    >
                      <Trash2 className="mr-1" size={12} />
                      Supprimer
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-gray-700 px-4 py-3">
          <p className="text-sm text-gray-400">{total} elements</p>
          <div className="space-x-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-gray-600 px-3 py-1 text-sm text-gray-300 disabled:opacity-40"
            >
              Precedent
            </button>
            <span className="text-sm text-gray-400">Page {page}/{totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded border border-gray-600 px-3 py-1 text-sm text-gray-300 disabled:opacity-40"
            >
              Suivant
            </button>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingItem ? 'Modifier la brique' : 'Nouvelle brique'}
        maxWidthClassName="max-w-6xl"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <div className="rounded bg-red-900/30 border border-red-700/50 p-2 text-sm text-red-400">{error}</div>}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <section className="space-y-4 rounded-xl border border-gray-700 bg-gray-900 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Metadonnees</p>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Titre</label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 text-white px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">Type d&apos;inject</label>
                  <select
                    value={form.inject_type}
                    onChange={(e) => {
                      const nextType = e.target.value
                      const nextConfig =
                        timelineInjectTypeOptions.find((entry) => entry.type === nextType) ||
                        timelineInjectTypeOptions[0] ||
                        DEFAULT_TIMELINE_INJECT_TYPE_FORMATS[0]
                      const nextFormat = nextConfig.formats.includes(form.data_format)
                        ? form.data_format
                        : (nextConfig.formats[0] || 'text')
                      const nextPayload = editingItem
                        ? form.payload_json
                        : JSON.stringify(buildPayloadSkeletonByType(nextType), null, 2)
                      setForm((f) => ({
                        ...f,
                        inject_type: nextType,
                        data_format: nextFormat,
                        kind: resolveInjectBankKindFromType(nextType),
                        payload_json: nextPayload,
                      }))
                    }}
                    className="w-full rounded-lg border border-gray-600 bg-gray-900 text-white px-3 py-2 text-sm"
                  >
                    {timelineInjectTypeOptions.map((entry) => (
                      <option key={entry.type} value={entry.type}>
                        {INJECT_BANK_KIND_LABELS[entry.type as InjectBankKind] || entry.type}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">Statut</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as InjectBankStatus }))}
                    className="w-full rounded-lg border border-gray-600 bg-gray-900 text-white px-3 py-2 text-sm"
                  >
                    {statusOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">Format</label>
                  <select
                    value={form.data_format}
                    onChange={(e) => {
                      const nextFormat = e.target.value as InjectDataFormat
                      setForm((f) => ({
                        ...f,
                        data_format: nextFormat,
                        kind: resolveInjectBankKindFromType(f.inject_type),
                      }))
                    }}
                    className="w-full rounded-lg border border-gray-600 bg-gray-900 text-white px-3 py-2 text-sm"
                  >
                    {allowedFormatOptions.map((format) => (
                      <option key={format} value={format}>
                        {format === 'text' ? 'Texte' : format === 'audio' ? 'Audio' : format === 'video' ? 'Video' : 'Image'}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">Tags (virgules)</label>
                  <input
                    value={form.tags_csv}
                    onChange={(e) => setForm((f) => ({ ...f, tags_csv: e.target.value }))}
                    placeholder="rancon, comex, urgence"
                    className="w-full rounded-lg border border-gray-600 bg-gray-900 text-white px-3 py-2 text-sm placeholder-gray-400"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">URL source</label>
                <input
                  value={form.source_url}
                  onChange={(e) => setForm((f) => ({ ...f, source_url: e.target.value }))}
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 text-white px-3 py-2 text-sm"
                  placeholder="https://..."
                />
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-gray-700 bg-gray-800 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Contenu</p>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Résumé</label>
                <textarea
                  value={form.summary}
                  onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 text-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Contenu brut</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 text-white px-3 py-2 text-sm"
                />
              </div>

              {ATTACHMENT_SUPPORTED_KINDS.has(form.kind) && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">Piece jointe</label>
                  <div
                    className={`relative rounded-lg border-2 border-dashed p-4 transition-all ${
                      attachmentFile ? 'border-green-300 bg-green-900/20' : 'border-gray-600 hover:border-primary-400 hover:bg-primary-900/20'
                    }`}
                  >
                    {attachmentFile ? (
                      <div className="space-y-2">
                        {form.data_format === 'image' && attachmentPreview && (
                          <div className="flex justify-center">
                            <img
                              src={attachmentPreview}
                              alt="Preview"
                              className="max-h-40 rounded object-contain"
                            />
                          </div>
                        )}
                        {form.data_format === 'video' && attachmentPreview && (
                          <div className="flex justify-center">
                            <video
                              src={attachmentPreview}
                              controls
                              className="max-h-40 rounded"
                            />
                          </div>
                        )}
                        {form.data_format === 'audio' && attachmentPreview && (
                          <div className="flex justify-center">
                            <audio src={attachmentPreview} controls className="w-full max-w-md" />
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {form.data_format === 'image' && <ImageIcon className="h-5 w-5 text-green-400" />}
                            {form.data_format === 'video' && <Video className="h-5 w-5 text-green-400" />}
                            {form.data_format === 'audio' && <FileIcon className="h-5 w-5 text-green-400" />}
                            {form.kind === 'doc' && form.data_format === 'text' && <FileIcon className="h-5 w-5 text-green-400" />}
                            <span className="text-sm font-medium text-green-400">{attachmentFile.name}</span>
                            <span className="text-xs text-gray-400">
                              ({(attachmentFile.size / 1024 / 1024).toFixed(2)} Mo)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setAttachmentFile(null)
                              setAttachmentPreview(null)
                            }}
                            className="rounded p-1 text-gray-400 hover:bg-red-900/30 hover:text-red-400"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center">
                        <input
                          type="file"
                          accept={getAttachmentAccept(form.kind, form.data_format)}
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null
                            setAttachmentFile(file)
                            if (file && ['image', 'video', 'audio'].includes(form.data_format)) {
                              setAttachmentPreview(URL.createObjectURL(file))
                            } else {
                              setAttachmentPreview(null)
                            }
                          }}
                          className="absolute inset-0 cursor-pointer opacity-0"
                        />
                        <div className="flex flex-col items-center gap-2">
                          {form.data_format === 'image' && <ImageIcon className="h-10 w-10 text-gray-400" />}
                          {form.data_format === 'video' && <Video className="h-10 w-10 text-gray-400" />}
                          {form.data_format === 'audio' && <FileIcon className="h-10 w-10 text-gray-400" />}
                          {form.kind === 'doc' && form.data_format === 'text' && <FileIcon className="h-10 w-10 text-gray-400" />}
                          <div>
                            <p className="text-sm font-medium text-gray-300">
                              Glissez-deposez ou cliquez pour selectionner
                            </p>
                            <p className="text-xs text-gray-400">
                              {form.data_format === 'image' && 'PNG, JPG, GIF, WebP...'}
                              {form.data_format === 'video' && 'MP4, WebM, MOV...'}
                              {form.data_format === 'audio' && 'MP3, WAV, OGG...'}
                              {form.kind === 'doc' && form.data_format === 'text' && 'PDF, Word, Excel, PowerPoint, TXT...'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {!attachmentFile && editingItem && getExistingAttachmentName(editingItem.payload || {}) && (
                    <p className="mt-2 text-xs text-gray-400">
                      <span className="font-medium">Fichier actuel:</span> {getExistingAttachmentName(editingItem.payload || {})}
                    </p>
                  )}
                </div>
              )}

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-300">Payload JSON</label>
                  {!editingItem && (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, payload_json: JSON.stringify(buildPayloadSkeletonByType(f.inject_type), null, 2) }))}
                      className="inline-flex items-center rounded-lg border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600"
                    >
                      Generer squelette
                    </button>
                  )}
                </div>
                <textarea
                  value={form.payload_json}
                  onChange={(e) => setForm((f) => ({ ...f, payload_json: e.target.value }))}
                  rows={10}
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 text-white px-3 py-2 font-mono text-xs"
                />
              </div>
            </section>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={closeModal} className="text-gray-300 bg-gray-700 rounded-lg px-3 py-2 text-sm hover:bg-gray-600">
              Annuler
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="rounded-lg bg-primary-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {createMutation.isPending || updateMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(chronogramPreviewItem)}
        onClose={closeChronogramPreview}
        title={chronogramPreviewItem ? `Chronogramme: ${chronogramPreviewItem.title}` : 'Chronogramme'}
      >
        {chronogramPreviewItem && (
          <div className="space-y-3">
            {chronogramPreviewItem.summary && (
              <p className="text-sm text-gray-300">{chronogramPreviewItem.summary}</p>
            )}

            {chronogramPreviewItem.content && (
              <div>
                <p className="mb-1 text-sm font-medium text-gray-300">Description</p>
                <p className="rounded-lg border border-gray-700 bg-gray-900 p-2 text-sm text-gray-300">
                  {chronogramPreviewItem.content}
                </p>
              </div>
            )}

            <div>
              <p className="mb-1 text-sm font-medium text-gray-300">Visualisateur chronogramme</p>
              <ChronogramD3Viewer item={chronogramPreviewItem} />
            </div>

            <div>
              <p className="mb-1 text-sm font-medium text-gray-300">Payload brut</p>
              <pre className="max-h-[30vh] overflow-auto rounded-lg border border-gray-700 bg-gray-900 p-3 font-mono text-xs text-gray-300">
                {JSON.stringify(chronogramPreviewItem.payload || {}, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end">
              <button
                onClick={closeChronogramPreview}
                className="inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(mediaPreviewItem)}
        onClose={closeMediaPreview}
        title={mediaPreviewItem ? `${kindLabelMap[mediaPreviewItem.kind] || mediaPreviewItem.kind}: ${mediaPreviewItem.title}` : 'Apercu media'}
      >
        {mediaPreviewItem && (
          <div className="space-y-3">
            {mediaPreviewItem.summary && (
              <p className="text-sm text-gray-300">{mediaPreviewItem.summary}</p>
            )}

            {mediaPreviewItem.content && (
              <div>
                <p className="mb-1 text-sm font-medium text-gray-300">Description</p>
                <p className="rounded-lg border border-gray-700 bg-gray-900 p-2 text-sm text-gray-300">
                  {mediaPreviewItem.content}
                </p>
              </div>
            )}

            <div>
              <p className="mb-1 text-sm font-medium text-gray-300">Apercu</p>
              <div className="rounded-lg border border-gray-700 bg-gray-900 p-2">
                {(() => {
                  const previewUrl = getPreviewUrlForItem(mediaPreviewItem)

                  if (!previewUrl) {
                    return (
                      <p className="text-sm text-gray-400">
                        Impossible d&apos;afficher l&apos;apercu (URL manquante).
                      </p>
                    )
                  }

                  if (mediaPreviewItem.data_format === 'video') {
                    return (
                      <video
                        controls
                        src={previewUrl}
                        className="max-h-[60vh] w-full rounded bg-black"
                      />
                    )
                  }

                  if (mediaPreviewItem.data_format === 'image') {
                    return (
                      <img
                        src={previewUrl}
                        alt={mediaPreviewItem.title}
                        className="max-h-[60vh] w-full rounded object-contain"
                      />
                    )
                  }

                  if (mediaPreviewItem.data_format === 'audio') {
                    return (
                      <audio controls src={previewUrl} className="w-full" />
                    )
                  }

                  return (
                    <iframe
                      title={`Apercu document ${mediaPreviewItem.title}`}
                      src={previewUrl}
                      className="h-[65vh] w-full rounded border border-gray-700 bg-gray-800"
                    />
                  )
                })()}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              {mediaPreviewItem.source_url && (
                <a
                  href={mediaPreviewItem.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-600"
                >
                  Ouvrir source
                </a>
              )}
              <button
                onClick={closeMediaPreview}
                className="inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Generic Preview Modal */}
      <Modal
        isOpen={Boolean(previewItem)}
        onClose={closePreview}
        title={previewItem ? `${kindLabelMap[previewItem.kind] || previewItem.kind}: ${previewItem.title}` : 'Apercu'}
        maxWidthClassName={(previewItem?.kind === 'mail' || previewItem?.kind === 'sms' || previewItem?.kind === 'socialnet') ? 'max-w-2xl' : 'max-w-md'}
      >
        {previewItem && (
          <div className="space-y-3">
            {previewItem.summary && previewItem.kind !== 'sms' && (
              <p className="text-sm text-gray-300">{previewItem.summary}</p>
            )}

            {previewItem.content && previewItem.kind !== 'sms' && (
              <div>
                <p className="mb-1 text-sm font-medium text-gray-300">Description</p>
                <p className="rounded-lg border border-gray-700 bg-gray-900 p-2 text-sm text-gray-300">
                  {previewItem.content}
                </p>
              </div>
            )}

            <div>
              <p className="mb-1 text-sm font-medium text-gray-300">Contenu</p>
              <InjectPreview item={previewItem} />
            </div>

            {previewItem.tags.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium text-gray-300">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {previewItem.tags.map((t: string) => (
                    <span key={t} className="inline-flex items-center rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300">
                      <Tag className="mr-1" size={12} />
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              {previewItem.source_url && (
                <a
                  href={previewItem.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-600"
                >
                  <ExternalLink className="mr-1" size={14} />
                  Ouvrir source
                </a>
              )}
              <button
                onClick={() => {
                  closePreview()
                  openEditModal(previewItem)
                }}
                className="inline-flex items-center rounded-lg border border-primary-600 px-4 py-2 text-sm text-primary-600 hover:bg-primary-900/30"
              >
                <Pencil className="mr-1" size={14} />
                Modifier
              </button>
              <button
                onClick={closePreview}
                className="inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Clear Confirmation Modal */}
      <Modal
        isOpen={showClearConfirm}
        onClose={handleCancelClearConfirm}
        title="Options d'import"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-300">
            Voulez-vous vider la banque d'injects avant d'importer ?
          </p>
          <p className="text-xs text-gray-400">
            Cette action supprimera tous les elements existants avant d'importer le nouveau fichier ZIP.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleCancelClearConfirm}
              className="text-gray-300 bg-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-600"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => handleConfirmImport(false)}
              disabled={importMutation.isPending}
              className="rounded-lg border border-primary-600 px-4 py-2 text-sm text-primary-600 hover:bg-primary-900/30 disabled:opacity-50"
            >
              Importer sans vider
            </button>
            <button
              type="button"
              onClick={() => handleConfirmImport(true)}
              disabled={importMutation.isPending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
            >
              Vider puis importer
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isImportModalOpen}
        onClose={closeImportModal}
        title={importMode === 'zip' ? 'Import ZIP' : 'Import TEXT'}
      >
        <form onSubmit={handleImportSubmit} className="space-y-3">
          {importError && <div className="rounded bg-red-900/30 border border-red-700/50 p-2 text-sm text-red-400">{importError}</div>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setImportMode('zip')}
              className={`rounded-lg px-3 py-1.5 text-sm ${importMode === 'zip' ? 'bg-primary-600 text-white' : 'bg-gray-700 text-gray-300'}`}
            >
              Mode ZIP
            </button>
            <button
              type="button"
              onClick={() => setImportMode('text')}
              className={`rounded-lg px-3 py-1.5 text-sm ${importMode === 'text' ? 'bg-primary-600 text-white' : 'bg-gray-700 text-gray-300'}`}
            >
              Mode TEXT
            </button>
          </div>

          {importMode === 'zip' ? (
            <>
              <p className="text-sm text-gray-400">
                Importez un fichier ZIP contenant un JSON exporte depuis la banque d'injects.
              </p>
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="w-full rounded-lg border border-gray-600 bg-gray-900 text-white px-3 py-2 text-sm"
              />
            </>
          ) : (
            <>
              <p className="text-sm text-gray-400">
                Collez un objet JSON, un tableau d'objets, ou un objet avec une cle <code>items</code>.
                Champs requis: <code>id</code>, <code>type</code>, <code>title</code>, <code>status</code>, <code>created_at</code>.
              </p>
              <textarea
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                rows={12}
                placeholder='[{"id":"inj-001","type":"mail","title":"Alerte SOC","status":"validated","created_at":"2026-02-19T10:00:00Z"}]'
                className="w-full rounded-lg border border-gray-600 bg-gray-900 text-white px-3 py-2 font-mono text-xs placeholder-gray-400"
              />
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={closeImportModal} className="text-gray-300 bg-gray-700 rounded-lg px-3 py-2 text-sm hover:bg-gray-600">
              Annuler
            </button>
            <button
              type="submit"
              disabled={importMutation.isPending || importTextMutation.isPending}
              className="rounded-lg bg-primary-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {importMutation.isPending || importTextMutation.isPending ? 'Import en cours...' : 'Importer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Fullscreen Media Viewer */}
      {mediaPreviewItem && (mediaPreviewItem.data_format === 'image' || mediaPreviewItem.data_format === 'video') && (
        <MediaViewer
          isOpen={Boolean(mediaPreviewItem)}
          onClose={closeMediaPreview}
          title={mediaPreviewItem.title}
          imageUrl={mediaPreviewItem.data_format === 'image' ? getPreviewUrlForItem(mediaPreviewItem) : null}
          videoUrl={mediaPreviewItem.data_format === 'video' ? getPreviewUrlForItem(mediaPreviewItem) : null}
          showDownload={true}
          downloadUrl={mediaPreviewItem.kind === 'doc' ? getPreviewUrlForItem(mediaPreviewItem) : null}
        />
      )}
    </div>
  )
}
