import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as d3 from 'd3'
import {
  injectBankApi,
  mediaApi,
  InjectDataFormat,
  InjectBankItem,
  InjectBankKind,
  InjectBankStatus,
} from '../../services/api'
import { INJECT_BANK_KIND_LABELS, INJECT_BANK_STATUS_LABELS } from '../../config/injectBank'
import { useInjectBankKinds, useInjectBankStatuses } from '../../hooks/useInjectBank'
import { Plus, Pencil, Trash2, Search, LibraryBig, Tag, Upload, Download, Eye, FileArchive, FileJson, Mail, MessageSquare, BookOpen, Shield, Newspaper, Link2, Lightbulb, FileText, Users, ExternalLink, X, Image as ImageIcon, Video, File as FileIcon, ZoomIn, ZoomOut, RotateCw, Maximize2, Play, Pause, Volume2, VolumeX } from 'lucide-react'
import Modal from '../../components/Modal'
import MediaViewer from '../../components/MediaViewer'
import { useAppDialog } from '../../contexts/AppDialogContext'


const SCHEMA_STATUS_TO_BANK_STATUS: Record<string, InjectBankStatus> = {
  draft: 'draft',
  validated: 'ready',
  ready: 'ready',
  played: 'archived',
  archived: 'archived',
}

function normalizeTypeToBankKind(typeValue: string, allowedKinds: Set<InjectBankKind>): InjectBankKind | null {
  const raw = typeValue.trim()
  if (!raw) return null

  const exact = raw as InjectBankKind
  if (allowedKinds.has(exact)) return exact

  const lower = raw.toLowerCase() as InjectBankKind
  if (allowedKinds.has(lower)) return lower

  return null
}

const ATTACHMENT_SUPPORTED_KINDS = new Set<InjectBankKind>(['video', 'image', 'document'])

const getAttachmentAccept = (kind: InjectBankKind): string => {
  if (kind === 'video') return 'video/*'
  if (kind === 'image') return 'image/*'
  if (kind === 'document') return '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,application/pdf'
  return '*/*'
}

const getMediaSourceUrl = (kind: InjectBankKind, mediaId: number): string => {
  if (kind === 'video') return `/api/media/${mediaId}/stream`
  if (kind === 'image') return `/api/media/${mediaId}/preview`
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

const getAttachmentUrlByKind = (kind: InjectBankKind, attachment: Record<string, unknown>): string | null => {
  const streamUrl = typeof attachment.stream_url === 'string' ? attachment.stream_url : ''
  const previewUrl = typeof attachment.preview_url === 'string' ? attachment.preview_url : ''
  const downloadUrl = typeof attachment.download_url === 'string' ? attachment.download_url : ''

  if (kind === 'video') return streamUrl || previewUrl || downloadUrl || null
  if (kind === 'image') return previewUrl || downloadUrl || streamUrl || null
  if (kind === 'document') return previewUrl || downloadUrl || null
  return null
}

const getPreviewUrlForItem = (item: InjectBankItem): string | null => {
  if (!ATTACHMENT_SUPPORTED_KINDS.has(item.kind)) return null

  const attachment = item.payload?.attachment
  if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) return null

  const attachmentRecord = attachment as Record<string, unknown>
  const mediaId = attachmentRecord.media_id
  if (typeof mediaId !== 'number' || !Number.isFinite(mediaId)) return null

  const urlFromAttachment = getAttachmentUrlByKind(item.kind, attachmentRecord)
  if (urlFromAttachment) return urlFromAttachment

  return getMediaSourceUrl(item.kind, mediaId)
}

type FormState = {
  title: string
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
  data_format: InjectDataFormat
  summary?: string
  content?: string
  source_url?: string
  payload: Record<string, any>
  tags: string[]
}

const EMPTY_FORM: FormState = {
  title: '',
  kind: 'idea',
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
function MailPreview({ payload }: { payload: Record<string, any> }) {
  const content = payload?.content || payload
  const from = content?.from || payload?.from || ''
  const to = content?.to || payload?.to || ''
  const subject = content?.subject || payload?.subject || ''
  const body = content?.body || payload?.body || content?.message || ''

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <Mail className="h-4 w-4 text-gray-500" />
          <span className="font-medium text-gray-700">Email</span>
        </div>
      </div>
      <div className="space-y-1 p-3 text-sm">
        <div className="flex gap-2">
          <span className="w-12 shrink-0 text-gray-500">De:</span>
          <span className="text-gray-900">{from || '-'}</span>
        </div>
        <div className="flex gap-2">
          <span className="w-12 shrink-0 text-gray-500">À:</span>
          <span className="text-gray-900">{to || '-'}</span>
        </div>
        <div className="flex gap-2">
          <span className="w-12 shrink-0 text-gray-500">Sujet:</span>
          <span className="font-medium text-gray-900">{subject || '-'}</span>
        </div>
      </div>
      {body && (
        <div className="border-t border-gray-200 bg-gray-50 p-3">
          <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700">{body}</pre>
        </div>
      )}
    </div>
  )
}

function MessagePreview({ payload }: { payload: Record<string, any> }) {
  const content = payload?.content || payload
  const channel = content?.channel || payload?.channel || ''
  const sender = content?.sender || payload?.sender || ''
  const message = content?.message || payload?.message || ''

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <MessageSquare className="h-4 w-4 text-gray-500" />
          <span className="font-medium text-gray-700">{channel || 'Message'}</span>
        </div>
      </div>
      <div className="p-3 text-sm">
        <div className="mb-2 text-xs text-gray-500">{sender || 'Expéditeur inconnu'}</div>
        <div className="rounded-lg bg-blue-50 p-3 text-gray-800">{message || '-'}</div>
      </div>
    </div>
  )
}

function DirectoryPreview({ payload }: { payload: Record<string, any> }) {
  const content = payload?.content || payload
  const entries = content?.entries || payload?.entries || []
  const directoryType = content?.directory_type || payload?.directory_type || ''

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-gray-500" />
          <span className="font-medium text-gray-700">{directoryType || 'Annuaire'}</span>
        </div>
      </div>
      {Array.isArray(entries) && entries.length > 0 ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Nom</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Contact</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Téléphone</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Priorité</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((entry: any, idx: number) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-900">{entry?.partner || entry?.name || '-'}</td>
                  <td className="px-3 py-2 text-gray-700">{entry?.contact || '-'}</td>
                  <td className="px-3 py-2 text-gray-700">{entry?.phone || '-'}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${
                      entry?.priority === 'haute' ? 'bg-red-100 text-red-700' :
                      entry?.priority === 'moyenne' ? 'bg-amber-100 text-amber-700' :
                      'bg-green-100 text-green-700'
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
        <div className="p-4 text-sm text-gray-500">Aucune entrée</div>
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
    <div className="rounded-lg border border-blue-200 bg-blue-50">
      <div className="border-b border-blue-200 bg-blue-100 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Shield className="h-4 w-4 text-blue-600" />
            <span className="font-medium text-blue-800">ANSSI</span>
          </div>
          {refNumber && (
            <span className="rounded bg-blue-200 px-2 py-0.5 text-xs text-blue-800">{refNumber}</span>
          )}
        </div>
      </div>
      <div className="space-y-2 p-3 text-sm">
        {commType && (
          <div className="text-xs text-blue-600 uppercase">{commType}</div>
        )}
        {message && (
          <pre className="whitespace-pre-wrap font-sans text-gray-700">{message}</pre>
        )}
        {contactPoint && (
          <div className="mt-2 rounded bg-blue-100 px-2 py-1 text-xs text-blue-700">
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
    <div className="rounded-lg border border-purple-200 bg-purple-50">
      <div className="border-b border-purple-200 bg-purple-100 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Shield className="h-4 w-4 text-purple-600" />
            <span className="font-medium text-purple-800">Gouvernement</span>
          </div>
          {refNumber && (
            <span className="rounded bg-purple-200 px-2 py-0.5 text-xs text-purple-800">{refNumber}</span>
          )}
        </div>
      </div>
      <div className="space-y-2 p-3 text-sm">
        {commType && (
          <div className="text-xs text-purple-600 uppercase">{commType}</div>
        )}
        {message && (
          <pre className="whitespace-pre-wrap font-sans text-gray-700">{message}</pre>
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
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <Newspaper className="h-4 w-4 text-gray-500" />
          <span className="font-medium text-gray-700">{mediaName || 'Presse'}</span>
          {journalist && <span className="text-gray-500">• {journalist}</span>}
        </div>
      </div>
      <div className="space-y-2 p-3">
        {headline && (
          <h4 className="text-lg font-semibold text-gray-900">{headline}</h4>
        )}
        {articleBody && (
          <p className="whitespace-pre-wrap text-sm text-gray-700">{articleBody}</p>
        )}
        <div className="flex gap-2 text-xs text-gray-500">
          {tone && <span className="rounded bg-gray-100 px-2 py-0.5">{tone}</span>}
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
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 text-sm">
        <Link2 className="h-4 w-4 text-gray-500" />
        <span className="font-medium text-gray-700">URL de référence</span>
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-center gap-1 text-primary-600 hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          <span className="truncate">{url}</span>
        </a>
      )}
      {description && (
        <p className="mt-2 text-sm text-gray-600">{description}</p>
      )}
    </div>
  )
}

function IdeaPreview({ item }: { item: InjectBankItem }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2 text-sm">
        <Lightbulb className="h-4 w-4 text-amber-500" />
        <span className="font-medium text-amber-800">Idée</span>
      </div>
      {item.summary && (
        <p className="mt-2 text-sm text-gray-700">{item.summary}</p>
      )}
      {item.content && (
        <p className="mt-2 text-sm text-gray-600">{item.content}</p>
      )}
      {item.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {item.tags.map((t: string) => (
            <span key={t} className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{t}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function GenericPreview({ payload }: { payload: Record<string, any> }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <FileText className="h-4 w-4 text-gray-500" />
          <span className="font-medium text-gray-700">Contenu</span>
        </div>
      </div>
      <div className="max-h-64 overflow-auto p-3">
        <pre className="whitespace-pre-wrap font-mono text-xs text-gray-700">
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
      return <MailPreview payload={payload} />
    case 'message':
      return <MessagePreview payload={payload} />
    case 'directory':
      return <DirectoryPreview payload={payload} />
    case 'canal_anssi':
      return <CanalAnssiPreview payload={payload} />
    case 'canal_gouvernement':
      return <CanalGouvernementPreview payload={payload} />
    case 'canal_press':
      return <CanalPressPreview payload={payload} />
    case 'reference_url':
      return <ReferenceUrlPreview payload={payload} />
    case 'idea':
      return <IdeaPreview item={item} />
    case 'chronogram':
      return <ChronogramD3Viewer item={item} />
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
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Aucun noeud exploitable n&apos;a ete detecte dans le payload de ce chronogramme.
        </div>
      ) : (
        <>
          <div className="rounded border border-gray-200 bg-white p-3">
            <svg ref={svgRef} className="w-full" role="img" aria-label="Visualisation chronogramme verticale" />
          </div>
          <p className="text-xs text-gray-500">
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
  const { data: kinds } = useInjectBankKinds()
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

  const withUploadedAttachment = async (payload: InjectBankCreatePayload, file: File | null): Promise<InjectBankCreatePayload> => {
    if (!file || !ATTACHMENT_SUPPORTED_KINDS.has(payload.kind)) return payload

    const uploadResult = await mediaApi.upload(file, {
      title: payload.title,
      description: payload.summary || payload.content,
      visibility: 'global',
    })
    const media = uploadResult.media
    const sourceUrl = getMediaSourceUrl(payload.kind, media.id)

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

  const kindLabelMap = useMemo(() => {
    return kinds ? Object.fromEntries(kinds.map((k) => [k, INJECT_BANK_KIND_LABELS[k] || k])) : {}
  }, [kinds])

  const statusLabelMap = useMemo(() => {
    return statuses ? Object.fromEntries(statuses.map((s) => [s, INJECT_BANK_STATUS_LABELS[s] || s])) : {}
  }, [statuses])

  const kindOptions = useMemo(() => {
    return kinds ? kinds.map((k) => ({ value: k, label: INJECT_BANK_KIND_LABELS[k] || k })) : []
  }, [kinds])

  const statusOptions = useMemo(() => {
    return statuses ? statuses.map((s) => ({ value: s, label: INJECT_BANK_STATUS_LABELS[s] || s })) : []
  }, [statuses])

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingItem(null)
    setForm(EMPTY_FORM)
    setAttachmentFile(null)
    setError('')
  }

  const openCreateModal = () => {
    setEditingItem(null)
    setForm(EMPTY_FORM)
    setAttachmentFile(null)
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
    // Les types avec preview spécialisé restent sur leurs boutons dédiés
    if (item.kind === 'chronogram') {
      setChronogramPreviewItem(item)
    } else if (ATTACHMENT_SUPPORTED_KINDS.has(item.kind) && hasUploadedAttachment(item)) {
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
    setEditingItem(item)
    setAttachmentFile(null)
    setForm({
      title: item.title,
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

    return {
      title: form.title.trim(),
      kind: form.kind,
      status: form.status,
      data_format: form.data_format,
      summary: form.summary.trim() || undefined,
      content: form.content.trim() || undefined,
      source_url: form.source_url.trim() || undefined,
      tags,
      payload,
    }
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

    const allowedKinds = new Set(kinds || [])
    const schemaRequired = Array.isArray(schemaPayload?.schema?.required)
      ? schemaPayload.schema.required.filter((fieldName: unknown): fieldName is string => typeof fieldName === 'string')
      : ['id', 'type', 'title', 'status', 'created_at']
    const schemaStatusEnums = Array.isArray(schemaPayload?.schema?.properties?.status?.enum)
      ? schemaPayload.schema.properties.status.enum.filter((value: unknown): value is string => typeof value === 'string')
      : Object.keys(SCHEMA_STATUS_TO_BANK_STATUS)
    const allowedSchemaStatuses = new Set(schemaStatusEnums)

    return entries.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error(`Element ${index + 1}: format invalide`)
      }

      const item = entry as Record<string, unknown>
      const typeRaw = typeof item.type === 'string'
        ? item.type.trim()
        : typeof item.kind === 'string'
          ? item.kind.trim()
          : ''
      const statusRaw = typeof item.status === 'string' ? item.status : ''
      const title = typeof item.title === 'string' ? item.title.trim() : ''

      const requiredFieldValues: Record<string, unknown> = {
        id: item.id,
        type: item.type ?? item.kind,
        title: item.title,
        status: item.status,
        created_at: item.created_at,
      }
      const missingField = schemaRequired.find((fieldName) => {
        const value = requiredFieldValues[fieldName]
        if (typeof value === 'string') return value.trim().length === 0
        return value === null || value === undefined
      })
      if (missingField) {
        throw new Error(`Element ${index + 1}: "${missingField}" est obligatoire`)
      }
      if (!title) {
        throw new Error(`Element ${index + 1}: "title" est obligatoire`)
      }
      const mappedKind = normalizeTypeToBankKind(typeRaw, allowedKinds)
      if (!mappedKind) {
        throw new Error(`Element ${index + 1}: "type" invalide`)
      }
      if (!allowedSchemaStatuses.has(statusRaw)) {
        throw new Error(`Element ${index + 1}: "status" invalide`)
      }
      const mappedStatus = SCHEMA_STATUS_TO_BANK_STATUS[statusRaw]
      if (!mappedStatus) {
        throw new Error(`Element ${index + 1}: mapping "status" impossible`)
      }
      const payloadRaw = item
      if (payloadRaw === null || typeof payloadRaw !== 'object' || Array.isArray(payloadRaw)) {
        throw new Error(`Element ${index + 1}: payload invalide`)
      }

      let tags: string[] = []
      if (Array.isArray(item.tags)) {
        tags = item.tags
          .filter((tagValue): tagValue is string => typeof tagValue === 'string')
          .map((tagValue) => tagValue.trim())
          .filter(Boolean)
      } else if (typeof item.tags === 'string') {
        tags = item.tags
          .split(',')
          .map((tagValue) => tagValue.trim())
          .filter(Boolean)
      }

      const contentObject = item.content && typeof item.content === 'object' && !Array.isArray(item.content)
        ? (item.content as Record<string, unknown>)
        : null
      const sourceUrlFromContent = contentObject && typeof contentObject.url === 'string'
        ? contentObject.url.trim()
        : ''

      const summaryRaw = typeof item.summary === 'string' && item.summary.trim() ? item.summary.trim() : undefined
      const descriptionRaw = typeof item.description === 'string' && item.description.trim() ? item.description.trim() : undefined
      const sourceUrlRaw = typeof item.source_url === 'string' && item.source_url.trim()
        ? item.source_url.trim()
        : sourceUrlFromContent || undefined
      const dataFormatRaw = typeof item.data_format === 'string' ? item.data_format.trim().toLowerCase() : ''
      const dataFormat: InjectDataFormat =
        dataFormatRaw === 'audio' || dataFormatRaw === 'video' || dataFormatRaw === 'image'
          ? (dataFormatRaw as InjectDataFormat)
          : 'text'

      return {
        title,
        kind: mappedKind,
        status: mappedStatus,
        data_format: dataFormat,
        summary: summaryRaw,
        content: descriptionRaw,
        source_url: sourceUrlRaw,
        payload: payloadRaw as Record<string, any>,
        tags,
      }
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
    draft: 'bg-amber-100 text-amber-800',
    ready: 'bg-green-100 text-green-800',
    archived: 'bg-gray-100 text-gray-700',
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

  return (
    <div 
      className="space-y-6 relative min-h-screen"
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
          <div className="rounded-xl border-2 border-dashed border-primary-500 bg-white/95 p-16 text-center shadow-2xl pointer-events-none">
            <div className="mb-4 flex justify-center gap-4">
              <FileArchive className="h-16 w-16 text-primary-600" />
              <FileJson className="h-16 w-16 text-primary-600" />
            </div>
            <p className="text-xl font-bold text-gray-900">
              {isDragImporting ? 'Import en cours...' : 'Deposez vos fichiers ZIP ou JSON'}
            </p>
            <p className="mt-2 text-sm text-gray-500">
              Import rapide d'injects dans la banque - plusieurs fichiers acceptes
            </p>
            {isDragImporting && (
              <div className="mt-4">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-primary-600 border-r-transparent"></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import Status Toast */}
      {dragImportStatus && (
        <div className={`fixed top-4 right-4 z-50 rounded-lg p-4 shadow-lg ${
          dragImportStatus.type === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-800' 
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          <p className="text-sm font-medium">{dragImportStatus.message}</p>
        </div>
      )}

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Banque d'inject</h1>
          <p className="text-sm text-gray-500">
            Bibliotheque de briques LEGO pour composer les exercices de demain.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Groupe import / export */}
          <div className="flex items-center rounded-md border border-gray-300 bg-white overflow-hidden divide-x divide-gray-300">
            <button
              onClick={handleExportZip}
              disabled={exportMutation.isPending}
              className="inline-flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              title="Exporter la banque (ZIP)"
            >
              <Download size={15} className="mr-1.5" />
              {exportMutation.isPending ? 'Export…' : 'Export'}
            </button>
            <button
              onClick={() => openImportModal('zip')}
              className="inline-flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              title="Importer un ZIP"
            >
              <Upload size={15} className="mr-1.5" />
              ZIP
            </button>
            <button
              onClick={() => openImportModal('text')}
              className="inline-flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              title="Importer du texte / JSON"
            >
              <FileText size={15} className="mr-1.5" />
              Texte
            </button>
          </div>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center rounded-md bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
          >
            <Plus className="mr-2" size={16} />
            Nouvelle brique
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-500">Total</p>
          <p className="text-2xl font-semibold text-gray-900">{stats?.total || 0}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-500">Pretes</p>
          <p className="text-2xl font-semibold text-green-700">{stats?.by_status?.ready || 0}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-500">Brouillons</p>
          <p className="text-2xl font-semibold text-amber-700">{stats?.by_status?.draft || 0}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-500">Types utilises</p>
          <p className="text-2xl font-semibold text-blue-700">{Object.keys(stats?.by_kind || {}).length}</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
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
              className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm"
            />
          </div>

          <select
            value={kind}
            onChange={(e) => {
              setPage(1)
              setKind((e.target.value || '') as InjectBankKind | '')
            }}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
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
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
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
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Chargement...</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-gray-500">
            <LibraryBig className="mx-auto mb-2" size={34} />
            Aucune brique pour les filtres courants.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
            {items.map((item: InjectBankItem) => (
              <article
                key={item.id}
                onClick={() => openPreview(item)}
                className="cursor-pointer rounded-lg border border-gray-200 p-4 transition-all hover:border-primary-300 hover:shadow-md"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{item.title}</h3>
                    <p className="text-xs text-gray-500">
                      {kindLabelMap[item.kind] || item.kind} · format {(item.data_format || 'text')}
                    </p>
                  </div>
                  <span className={`rounded px-2 py-1 text-xs font-medium ${cardStatusColor[item.status]}`}>
                    {statusLabelMap[item.status] || item.status}
                  </span>
                </div>

                {item.summary && <p className="mb-3 text-sm text-gray-700">{item.summary}</p>}

                {item.tags.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1">
                    {item.tags.map((t: string) => (
                      <span key={`${item.id}-${t}`} className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                        <Tag className="mr-1" size={12} />
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Mise a jour {new Date(item.updated_at).toLocaleDateString('fr-FR')}</span>
                  <div className="space-x-2" onClick={(e) => e.stopPropagation()}>
                    {item.kind === 'chronogram' && (
                      <button
                        onClick={() => setChronogramPreviewItem(item)}
                        className="inline-flex items-center rounded border border-blue-200 px-2 py-1 text-blue-700 hover:bg-blue-50"
                      >
                        <Eye className="mr-1" size={12} />
                        Voir le chrono
                      </button>
                    )}
                    {hasUploadedAttachment(item) && (
                      <button
                        onClick={() => setMediaPreviewItem(item)}
                        className="inline-flex items-center rounded border border-blue-200 px-2 py-1 text-blue-700 hover:bg-blue-50"
                      >
                        <Eye className="mr-1" size={12} />
                        Voir
                      </button>
                    )}
                    <button
                      onClick={() => openEditModal(item)}
                      className="inline-flex items-center rounded border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50"
                    >
                      <Pencil className="mr-1" size={12} />
                      Modifier
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="inline-flex items-center rounded border border-red-200 px-2 py-1 text-red-700 hover:bg-red-50"
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

        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
          <p className="text-sm text-gray-500">{total} elements</p>
          <div className="space-x-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-40"
            >
              Precedent
            </button>
            <span className="text-sm text-gray-500">Page {page}/{totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-40"
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
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <div className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}

          {/* Titre — pleine largeur */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Titre</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {/* Ligne 1 : Type · Statut · Format */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
              <select
                value={form.kind}
                onChange={(e) => {
                  const nextKind = e.target.value as InjectBankKind
                  setForm((f) => ({ ...f, kind: nextKind }))
                  if (!ATTACHMENT_SUPPORTED_KINDS.has(nextKind)) {
                    setAttachmentFile(null)
                  }
                }}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                {kindOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Statut</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as InjectBankStatus }))}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Ligne 2 : Format · Tags */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Format</label>
              <select
                value={form.data_format}
                onChange={(e) => setForm((f) => ({ ...f, data_format: e.target.value as InjectDataFormat }))}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900"
              >
                <option value="text">Texte</option>
                <option value="audio">Audio</option>
                <option value="video">Video</option>
                <option value="image">Image</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Tags (virgules)</label>
              <input
                value={form.tags_csv}
                onChange={(e) => setForm((f) => ({ ...f, tags_csv: e.target.value }))}
                placeholder="rancon, comex, urgence"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Ligne 3 : Résumé · URL source */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Résumé</label>
              <textarea
                value={form.summary}
                onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                rows={3}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Contenu brut</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                rows={3}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">URL source</label>
            <input
              value={form.source_url}
              onChange={(e) => setForm((f) => ({ ...f, source_url: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="https://..."
            />
          </div>

          {ATTACHMENT_SUPPORTED_KINDS.has(form.kind) && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Piece jointe</label>
              
              {/* Zone de drop avec prévisualisation */}
              <div 
                className={`relative rounded-lg border-2 border-dashed p-4 transition-all ${
                  attachmentFile ? 'border-green-300 bg-green-50' : 'border-gray-300 hover:border-primary-400 hover:bg-primary-50'
                }`}
              >
                {attachmentFile ? (
                  <div className="space-y-2">
                    {/* Prévisualisation */}
                    {form.kind === 'image' && attachmentPreview && (
                      <div className="flex justify-center">
                        <img 
                          src={attachmentPreview} 
                          alt="Preview" 
                          className="max-h-40 rounded object-contain"
                        />
                      </div>
                    )}
                    {form.kind === 'video' && attachmentPreview && (
                      <div className="flex justify-center">
                        <video 
                          src={attachmentPreview} 
                          controls
                          className="max-h-40 rounded"
                        />
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {form.kind === 'image' && <ImageIcon className="h-5 w-5 text-green-600" />}
                        {form.kind === 'video' && <Video className="h-5 w-5 text-green-600" />}
                        {form.kind === 'document' && <FileIcon className="h-5 w-5 text-green-600" />}
                        <span className="text-sm font-medium text-green-700">{attachmentFile.name}</span>
                        <span className="text-xs text-gray-500">
                          ({(attachmentFile.size / 1024 / 1024).toFixed(2)} Mo)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachmentFile(null)
                          setAttachmentPreview(null)
                        }}
                        className="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <input
                      type="file"
                      accept={getAttachmentAccept(form.kind)}
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null
                        setAttachmentFile(file)
                        if (file && form.kind === 'image') {
                          const url = URL.createObjectURL(file)
                          setAttachmentPreview(url)
                        } else if (file && form.kind === 'video') {
                          const url = URL.createObjectURL(file)
                          setAttachmentPreview(url)
                        } else {
                          setAttachmentPreview(null)
                        }
                      }}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                    <div className="flex flex-col items-center gap-2">
                      {form.kind === 'image' && <ImageIcon className="h-10 w-10 text-gray-400" />}
                      {form.kind === 'video' && <Video className="h-10 w-10 text-gray-400" />}
                      {form.kind === 'document' && <FileIcon className="h-10 w-10 text-gray-400" />}
                      <div>
                        <p className="text-sm font-medium text-gray-700">
                          Glissez-deposez ou cliquez pour selectionner
                        </p>
                        <p className="text-xs text-gray-500">
                          {form.kind === 'image' && 'PNG, JPG, GIF, WebP...'}
                          {form.kind === 'video' && 'MP4, WebM, MOV...'}
                          {form.kind === 'document' && 'PDF, Word, Excel, PowerPoint, TXT...'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Fichier existant */}
              {!attachmentFile && editingItem && getExistingAttachmentName(editingItem.payload || {}) && (
                <p className="mt-2 text-xs text-gray-500">
                  <span className="font-medium">Fichier actuel:</span> {getExistingAttachmentName(editingItem.payload || {})}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Payload JSON (optionnel)</label>
            <textarea
              value={form.payload_json}
              onChange={(e) => setForm((f) => ({ ...f, payload_json: e.target.value }))}
              rows={4}
              className="w-full rounded border border-gray-300 px-3 py-2 font-mono text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={closeModal} className="rounded bg-gray-100 px-3 py-2 text-sm text-gray-700">
              Annuler
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="rounded bg-primary-600 px-3 py-2 text-sm text-white disabled:opacity-50"
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
              <p className="text-sm text-gray-700">{chronogramPreviewItem.summary}</p>
            )}

            {chronogramPreviewItem.content && (
              <div>
                <p className="mb-1 text-sm font-medium text-gray-700">Description</p>
                <p className="rounded border border-gray-200 bg-gray-50 p-2 text-sm text-gray-700">
                  {chronogramPreviewItem.content}
                </p>
              </div>
            )}

            <div>
              <p className="mb-1 text-sm font-medium text-gray-700">Visualisateur chronogramme</p>
              <ChronogramD3Viewer item={chronogramPreviewItem} />
            </div>

            <div>
              <p className="mb-1 text-sm font-medium text-gray-700">Payload brut</p>
              <pre className="max-h-[30vh] overflow-auto rounded border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-700">
                {JSON.stringify(chronogramPreviewItem.payload || {}, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end">
              <button
                onClick={closeChronogramPreview}
                className="inline-flex items-center rounded-md bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
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
              <p className="text-sm text-gray-700">{mediaPreviewItem.summary}</p>
            )}

            {mediaPreviewItem.content && (
              <div>
                <p className="mb-1 text-sm font-medium text-gray-700">Description</p>
                <p className="rounded border border-gray-200 bg-gray-50 p-2 text-sm text-gray-700">
                  {mediaPreviewItem.content}
                </p>
              </div>
            )}

            <div>
              <p className="mb-1 text-sm font-medium text-gray-700">Apercu</p>
              <div className="rounded border border-gray-200 bg-gray-50 p-2">
                {(() => {
                  const previewUrl = getPreviewUrlForItem(mediaPreviewItem)

                  if (!previewUrl) {
                    return (
                      <p className="text-sm text-gray-600">
                        Impossible d&apos;afficher l&apos;apercu (URL manquante).
                      </p>
                    )
                  }

                  if (mediaPreviewItem.kind === 'video') {
                    return (
                      <video
                        controls
                        src={previewUrl}
                        className="max-h-[60vh] w-full rounded bg-black"
                      />
                    )
                  }

                  if (mediaPreviewItem.kind === 'image') {
                    return (
                      <img
                        src={previewUrl}
                        alt={mediaPreviewItem.title}
                        className="max-h-[60vh] w-full rounded object-contain"
                      />
                    )
                  }

                  return (
                    <iframe
                      title={`Apercu document ${mediaPreviewItem.title}`}
                      src={previewUrl}
                      className="h-[65vh] w-full rounded border border-gray-200 bg-white"
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
                  className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Ouvrir source
                </a>
              )}
              <button
                onClick={closeMediaPreview}
                className="inline-flex items-center rounded-md bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
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
      >
        {previewItem && (
          <div className="space-y-3">
            {previewItem.summary && (
              <p className="text-sm text-gray-700">{previewItem.summary}</p>
            )}

            {previewItem.content && (
              <div>
                <p className="mb-1 text-sm font-medium text-gray-700">Description</p>
                <p className="rounded border border-gray-200 bg-gray-50 p-2 text-sm text-gray-700">
                  {previewItem.content}
                </p>
              </div>
            )}

            <div>
              <p className="mb-1 text-sm font-medium text-gray-700">Contenu</p>
              <InjectPreview item={previewItem} />
            </div>

            {previewItem.tags.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium text-gray-700">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {previewItem.tags.map((t: string) => (
                    <span key={t} className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
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
                  className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
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
                className="inline-flex items-center rounded-md border border-primary-600 px-4 py-2 text-sm text-primary-600 hover:bg-primary-50"
              >
                <Pencil className="mr-1" size={14} />
                Modifier
              </button>
              <button
                onClick={closePreview}
                className="inline-flex items-center rounded-md bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
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
          <p className="text-sm text-gray-700">
            Voulez-vous vider la banque d'injects avant d'importer ?
          </p>
          <p className="text-xs text-gray-500">
            Cette action supprimera tous les elements existants avant d'importer le nouveau fichier ZIP.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleCancelClearConfirm}
              className="rounded bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => handleConfirmImport(false)}
              disabled={importMutation.isPending}
              className="rounded border border-primary-600 px-4 py-2 text-sm text-primary-600 hover:bg-primary-50 disabled:opacity-50"
            >
              Importer sans vider
            </button>
            <button
              type="button"
              onClick={() => handleConfirmImport(true)}
              disabled={importMutation.isPending}
              className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
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
          {importError && <div className="rounded bg-red-50 p-2 text-sm text-red-700">{importError}</div>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setImportMode('zip')}
              className={`rounded px-3 py-1.5 text-sm ${importMode === 'zip' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              Mode ZIP
            </button>
            <button
              type="button"
              onClick={() => setImportMode('text')}
              className={`rounded px-3 py-1.5 text-sm ${importMode === 'text' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              Mode TEXT
            </button>
          </div>

          {importMode === 'zip' ? (
            <>
              <p className="text-sm text-gray-600">
                Importez un fichier ZIP contenant un JSON exporte depuis la banque d'injects.
              </p>
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Collez un objet JSON, un tableau d'objets, ou un objet avec une cle <code>items</code>.
                Champs requis: <code>id</code>, <code>type</code>, <code>title</code>, <code>status</code>, <code>created_at</code>.
              </p>
              <textarea
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                rows={12}
                placeholder='[{"id":"inj-001","type":"mail","title":"Alerte SOC","status":"validated","created_at":"2026-02-19T10:00:00Z"}]'
                className="w-full rounded border border-gray-300 px-3 py-2 font-mono text-xs"
              />
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={closeImportModal} className="rounded bg-gray-100 px-3 py-2 text-sm text-gray-700">
              Annuler
            </button>
            <button
              type="submit"
              disabled={importMutation.isPending || importTextMutation.isPending}
              className="rounded bg-primary-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {importMutation.isPending || importTextMutation.isPending ? 'Import en cours...' : 'Importer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Fullscreen Media Viewer */}
      {mediaPreviewItem && (
        <MediaViewer
          isOpen={Boolean(mediaPreviewItem)}
          onClose={closeMediaPreview}
          title={mediaPreviewItem.title}
          imageUrl={mediaPreviewItem.kind === 'image' ? getPreviewUrlForItem(mediaPreviewItem) : null}
          videoUrl={mediaPreviewItem.kind === 'video' ? getPreviewUrlForItem(mediaPreviewItem) : null}
          showDownload={true}
          downloadUrl={mediaPreviewItem.kind === 'document' ? getPreviewUrlForItem(mediaPreviewItem) : null}
        />
      )}
    </div>
  )
}
