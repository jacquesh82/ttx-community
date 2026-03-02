import { useState, useEffect, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as d3 from 'd3'
import { useAuthStore } from '../../stores/authStore'
import {
  injectsApi,
  exerciseUsersApi,
  exercisesApi,
  crisisManagementApi,
  mediaApi,
  injectBankApi,
  Inject,
  InjectType,
  InjectStatus,
  ExercisePhase,
  Media,
  InjectBankItem,
  InjectBankKind,
  InjectDataFormat,
  AudienceTarget,
} from '../../services/api'
import { INJECT_BANK_KIND_LABELS } from '../../config/injectBank'
import { useInjectBankKinds, useInjectTypes } from '../../hooks/useInjectBank'
import {
  Plus,
  Copy,
  Send,
  Trash2,
  XCircle,
  Mail,
  Tv,
  Twitter,
  AlertCircle,
  Star,
  Settings,
  ChevronLeft,
  ChevronRight,
  CalendarClock,
  Film,
  Database,
  Download,
  Eraser,
  Edit3,
  FileText,
  MessageSquare,
  Lightbulb,
  Maximize2,
  MoveHorizontal,
  Upload,
} from 'lucide-react'
import Modal from '../Modal'
import { useAppDialog } from '../../contexts/AppDialogContext'

const BANK_KIND_CONFIG_BASE: Record<InjectBankKind, { bg: string; color: string; icon: React.ElementType }> = {
  idea: { bg: '#f59e0b', color: '#b45309', icon: Lightbulb },          // amber
  video: { bg: '#06b6d4', color: '#0e7490', icon: Film },               // cyan
  audio: { bg: '#a855f7', color: '#7e22ce', icon: MessageSquare },      // purple
  scenario: { bg: '#f97316', color: '#c2410c', icon: AlertCircle },     // orange
  chronogram: { bg: '#eab308', color: '#a16207', icon: CalendarClock }, // yellow
  image: { bg: '#3b82f6', color: '#1d4ed8', icon: FileText },           // blue
  mail: { bg: '#6366f1', color: '#4338ca', icon: Mail },                // indigo
  message: { bg: '#10b981', color: '#047857', icon: MessageSquare },    // emerald
  directory: { bg: '#94a3b8', color: '#475569', icon: Database },       // slate
  reference_url: { bg: '#f43f5e', color: '#be123c', icon: Settings },   // rose
  social_post: { bg: '#ec4899', color: '#be185d', icon: Twitter },      // pink
  document: { bg: '#6b7280', color: '#374151', icon: FileText },        // gray
  canal_press: { bg: '#ef4444', color: '#b91c1c', icon: AlertCircle },  // red
  canal_anssi: { bg: '#2563eb', color: '#1d4ed8', icon: Mail },         // blue-deep
  canal_gouvernement: { bg: '#84cc16', color: '#4d7c0f', icon: Mail },  // lime
  other: { bg: '#6b7280', color: '#374151', icon: Settings },
}

const BANK_KIND_FALLBACK = { bg: '#6b7280', color: '#374151', icon: Settings }

const BANK_KIND_TO_INJECT_TYPE: Record<InjectBankKind, InjectType> = {
  idea: 'decision',
  video: 'tv',
  audio: 'tv',
  scenario: 'decision',
  chronogram: 'score',
  image: 'tv',
  mail: 'mail',
  message: 'twitter',
  directory: 'system',
  reference_url: 'system',
  social_post: 'twitter',
  document: 'system',
  canal_press: 'tv',
  canal_anssi: 'mail',
  canal_gouvernement: 'mail',
  other: 'system', // gardé pour compatibilité mais non proposé dans le prompt/catalogue
}

const INJECT_TYPE_TO_BANK_KIND: Record<InjectType, InjectBankKind> = {
  mail: 'mail',
  twitter: 'social_post',
  tv: 'video',
  decision: 'scenario',
  score: 'chronogram',
  system: 'directory',
}

const BANK_KIND_ORDER_FALLBACK: InjectBankKind[] = [
  'mail',
  'social_post',
  'message',
  'scenario',
  'chronogram',
  'video',
  'audio',
  'image',
  'document',
  'directory',
  'reference_url',
  'idea',
]

const isInjectType = (value: unknown): value is InjectType => {
  return typeof value === 'string' && ['mail', 'twitter', 'tv', 'decision', 'score', 'system'].includes(value)
}

const DATA_FORMAT_LABELS: Record<InjectDataFormat, string> = {
  text: 'Texte',
  audio: 'Audio',
  video: 'Video',
  image: 'Image',
}

const AUDIENCE_KIND_LABELS: Record<string, string> = {
  role: 'Role',
  team: 'Equipe',
  user: 'Personne',
  tag: 'Tag',
}

type RecipientKind = '' | 'user' | 'team' | 'role'

const resolveInjectBankKind = (inject: Inject): InjectBankKind => {
  const rawKind = inject.content?.bank_kind ?? inject.content?.inject_bank_kind ?? inject.content?.kind
  if (typeof rawKind === 'string' && rawKind in BANK_KIND_CONFIG_BASE) {
    return rawKind as InjectBankKind
  }
  return INJECT_TYPE_TO_BANK_KIND[inject.type] ?? 'other'
}

const formatOffsetLabel = (offsetMin: number | null | undefined): string => {
  const total = offsetMin ?? 0
  const h = Math.floor(total / 60)
  const m = total % 60
  return `T+${h}h${m > 0 ? m.toString().padStart(2, '0') : ''}`
}

const STATUS_CONFIG: Record<InjectStatus, { label: string; color: string; dot: string }> = {
  draft:     { label: 'Brouillon',  color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' },
  scheduled: { label: 'Planifié',   color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  sent:      { label: 'Envoyé',     color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  cancelled: { label: 'Annulé',     color: 'bg-red-100 text-red-700', dot: 'bg-red-400' },
}

// Types pour les grains de temps
type TimeGrain = '1min' | '10min' | '30min' | '1h'

const TIME_GRAIN_CONFIG: Record<TimeGrain, { label: string; minutes: number; tickFormat: string }> = {
  '1min':   { label: '1 min',   minutes: 1,    tickFormat: '%H:%M' },
  '10min':  { label: '10 min',  minutes: 10,   tickFormat: '%H:%M' },
  '30min':  { label: '30 min',  minutes: 30,   tickFormat: '%H:%M' },
  '1h':     { label: '1 heure', minutes: 60,   tickFormat: '%Hh' },
}

// Constantes
const HOURS_PER_PAGE = 12
const HEADER_HEIGHT = 40
const PHASE_LABEL_WIDTH = 120
const MIN_BLOCK_WIDTH = 30
const INJECT_HEIGHT = 32 // Hauteur d'un bloc inject
const INJECT_GAP = 4 // Espace vertical entre injects empilés
const ROW_HEIGHT = 60 // Hauteur par défaut d'une phase (si un seul inject)
const RESIZE_HANDLE_WIDTH = 8 // Largeur de la zone de redimensionnement sur les bords

// Phases par défaut d'un exercice de crise
const DEFAULT_PHASES = [
  { name: 'Détection', order: 1 },
  { name: 'Qualification', order: 2 },
  { name: 'Activation', order: 3 },
  { name: 'Endiguement', order: 4 },
  { name: 'Remédiation', order: 5 },
  { name: 'Rétablissement', order: 6 },
  { name: 'RETEX', order: 7 },
]

type TimelineType = 'business' | 'technical'

interface TimelineGanttProps {
  exerciseId: number
  targetDurationHours?: number
  showFullscreenLink?: boolean
  compact?: boolean
  initialTimelineType?: TimelineType
  onTimelineTypeChange?: (timelineType: TimelineType) => void
  businessObjective?: string | null
  technicalObjective?: string | null
  showControls?: boolean
}

export default function TimelineGantt({
  exerciseId,
  targetDurationHours = 4,
  showFullscreenLink = false,
  compact = false,
  initialTimelineType = 'business',
  onTimelineTypeChange,
  businessObjective,
  technicalObjective,
  showControls = true,
}: TimelineGanttProps) {
  const appDialog = useAppDialog()
  const queryClient = useQueryClient()

  const { data: bankKinds } = useInjectBankKinds()
  const { data: injectTypes } = useInjectTypes()

  const bankTypeOptions = useMemo(() => {
    const kinds = bankKinds && bankKinds.length > 0 ? bankKinds : BANK_KIND_ORDER_FALLBACK
    return kinds.map((kind) => ({
      kind,
      injectType: BANK_KIND_TO_INJECT_TYPE[kind] || 'system',
      label: INJECT_BANK_KIND_LABELS[kind] || kind,
    }))
  }, [bankKinds])

  // Dynamic TYPE_CONFIG based on API
  const TYPE_CONFIG = useMemo(() => {
    const icons: Record<string, React.ElementType> = {
      mail: Mail,
      twitter: Twitter,
      tv: Tv,
      decision: AlertCircle,
      score: Star,
      system: Settings,
    }
    const colors: Record<string, { bg: string; color: string }> = {
      mail: { bg: '#3b82f6', color: '#1e40af' },
      twitter: { bg: '#0ea5e9', color: '#0369a1' },
      tv: { bg: '#14b8a6', color: '#0f766e' },
      decision: { bg: '#f97316', color: '#c2410c' },
      score: { bg: '#eab308', color: '#a16207' },
      system: { bg: '#6b7280', color: '#374151' },
    }
    const config: Record<InjectType, { label: string; bg: string; color: string; icon: React.ElementType }> = {} as any
    const types = injectTypes || ['mail', 'twitter', 'tv', 'decision', 'score', 'system']
    for (const t of types) {
      config[t as InjectType] = {
        label: t.charAt(0).toUpperCase() + t.slice(1),
        ...(colors[t] || { bg: '#6b7280', color: '#374151' }),
        icon: icons[t] || Settings,
      }
    }
    return config
  }, [injectTypes])
  
  // Refs
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  // State
  const [currentPage, setCurrentPage] = useState(0)
  const [timeGrain, setTimeGrain] = useState<TimeGrain>('30min')
  const [timelineType, setTimelineType] = useState<TimelineType>(initialTimelineType)
  const [selectedInject, setSelectedInject] = useState<Inject | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showMediaModal, setShowMediaModal] = useState(false)
  const [injectMedia, setInjectMedia] = useState<Media[]>([])
  const [containerWidth, setContainerWidth] = useState(1200)
  const [showBankModal, setShowBankModal] = useState(false)
  const [bankSearch, setBankSearch] = useState('')
  const [bankKindFilter, setBankKindFilter] = useState<InjectBankKind | ''>('')
  const [selectedBankItem, setSelectedBankItem] = useState<InjectBankItem | null>(null)
  const [showExportDropdown, setShowExportDropdown] = useState(false)
  const [selectedPhaseId, setSelectedPhaseId] = useState<number | null>(null)
  const [showPhaseEditModal, setShowPhaseEditModal] = useState(false)
  const [phaseEditText, setPhaseEditText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [scrollMode, setScrollMode] = useState(false)
  const [fitEndMin, setFitEndMin] = useState<number | null>(null)
  const [hoveredInject, setHoveredInject] = useState<Inject | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const [mouseX, setMouseX] = useState<number | null>(null)
  const [mouseTimeMin, setMouseTimeMin] = useState<number | null>(null)
  const exportDropdownRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [editFormFile, setEditFormFile] = useState<File | null>(null)

  // Form state for edit
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    time_offset: '',
    duration_min: '15',
    bank_kind: 'mail' as InjectBankKind,
    type: 'mail' as InjectType,
    data_format: 'text' as InjectDataFormat,
    recipient_kind: '' as RecipientKind,
    recipient_value: '',
    phase_id: '',
    content_text: '',
    timeline_type: 'business' as TimelineType,
  })
  
  // Queries
  const { data: injectsData, isLoading } = useQuery({
    queryKey: ['injects', exerciseId, 'all'],
    queryFn: () => injectsApi.list({ exercise_id: exerciseId, page: 1, page_size: 100 }),
  })
  
  const { data: phases } = useQuery({
    queryKey: ['exercise-phases', exerciseId],
    queryFn: () => crisisManagementApi.listPhases(exerciseId),
  })
  
  const { data: scenario } = useQuery({
    queryKey: ['exercise-scenario', exerciseId],
    queryFn: () => crisisManagementApi.getScenario(exerciseId),
  })
  
  const { data: allMedia } = useQuery({
    queryKey: ['media', exerciseId],
    queryFn: () => mediaApi.list({ exercise_id: exerciseId, page_size: 100 }),
  })
  
  
  // Get current user for role check
  const currentUser = useAuthStore((state) => state.user)

  const { data: exerciseUsersData } = useQuery({
    queryKey: ['exercise-users', exerciseId],
    queryFn: () => exerciseUsersApi.listExerciseUsers(exerciseId),
  })

  const { data: exerciseTeamsData } = useQuery({
    queryKey: ['exercise-teams', exerciseId],
    queryFn: () => exercisesApi.listTeams(exerciseId),
  })
  
  // Query pour le catalogue de la banque d'injects
  const { data: bankCatalog, isFetching: isFetchingBank } = useQuery({
    queryKey: ['inject-bank-catalog', showBankModal, bankSearch, bankKindFilter],
    queryFn: () =>
      injectBankApi.list({
        page: 1,
        page_size: 50,
        search: bankSearch || undefined,
        kind: bankKindFilter || undefined,
        sort_by: 'updated_at',
        order: 'desc',
      }),
    enabled: showBankModal,
  })

  const BANK_KIND_CONFIG = useMemo(() => {
    const config: Record<string, { label: string; bg: string; color: string; icon: React.ElementType }> = {}
    const allKinds = (bankKinds && bankKinds.length > 0 ? bankKinds : Object.keys(BANK_KIND_CONFIG_BASE)) as InjectBankKind[]
    for (const kind of allKinds) {
      const base = BANK_KIND_CONFIG_BASE[kind as InjectBankKind] || BANK_KIND_FALLBACK
      config[kind] = {
        label: INJECT_BANK_KIND_LABELS[kind as InjectBankKind] || kind,
        ...base,
      }
    }
    return config as Record<InjectBankKind, { label: string; bg: string; color: string; icon: React.ElementType }>
  }, [bankKinds])
  
  const injects = injectsData?.injects ?? []
  const exerciseUsers = exerciseUsersData?.users ?? []
  const exerciseTeams = exerciseTeamsData?.teams ?? []

  const buildAudiencesFromEditForm = (): AudienceTarget[] => {
    if (!editForm.recipient_kind || !editForm.recipient_value) return []
    return [{ kind: editForm.recipient_kind as AudienceTarget['kind'], value: editForm.recipient_value }]
  }

  const formatAudienceLabel = (audience?: AudienceTarget | null): string => {
    if (!audience) return 'Tout le monde'
    const kindLabel = AUDIENCE_KIND_LABELS[audience.kind] ?? audience.kind
    if (audience.kind === 'team') {
      const team = exerciseTeams.find((t: any) => String(t.id) === String(audience.value))
      return team ? `${kindLabel}: ${team.name}` : `${kindLabel}: ${String(audience.value)}`
    }
    if (audience.kind === 'user') {
      const user = exerciseUsers.find((u: any) => String(u.user_id) === String(audience.value))
      if (user) return `${kindLabel}: ${user.user_username || user.user_email || String(audience.value)}`
    }
    return `${kindLabel}: ${String(audience.value)}`
  }

  const getRecipientFromInject = (inject: Inject): { recipient_kind: RecipientKind; recipient_value: string } => {
    const first = inject.audiences?.[0]
    if (!first) return { recipient_kind: '', recipient_value: '' }
    if (first.kind === 'user' || first.kind === 'team' || first.kind === 'role') {
      return { recipient_kind: first.kind, recipient_value: String(first.value) }
    }
    return { recipient_kind: '', recipient_value: '' }
  }

  const exerciseTeamsPromptSection = exerciseTeams.length > 0
    ? exerciseTeams
        .map((team: any) => `- [${team.id}] ${team.name}: ${team.description?.trim() || 'Sans description'}`)
        .join('\n')
    : '- Aucune equipe rattachee'

  const recipientPromptRulesSection = [
    'Destinataire de l inject:',
    '- Si l inject vise tout le monde: mettre "audiences": [] (ou omettre le champ).',
    '- Si l inject vise une equipe: utiliser {"kind":"team","value":"<id_equipe>"} avec un ID ci-dessous.',
    '- Si l inject vise une personne: utiliser {"kind":"user","value":"<id_user_exercice>"} si pertinent.',
    '- Si l inject vise un role: utiliser {"kind":"role","value":"joueur|animateur|observateur"}.',
    '- Un seul destinataire principal attendu (premier element du tableau).',
  ].join('\n')
  
  const timelinePrompt = useMemo(() => {
    const sortedInjects = [...injects].sort((a, b) => (a.time_offset ?? 0) - (b.time_offset ?? 0))
    const phaseNameById = new Map<number, string>()
    ;(phases ?? []).forEach((p: ExercisePhase) => phaseNameById.set(p.id, p.name))
    
    const statusCounts = injects.reduce<Record<string, number>>((acc, inject) => {
      acc[inject.status] = (acc[inject.status] || 0) + 1
      return acc
    }, {})
    
    const kindCounts = injects.reduce<Record<string, number>>((acc, inject) => {
      const kind = resolveInjectBankKind(inject)
      acc[kind] = (acc[kind] || 0) + 1
      return acc
    }, {})
    
    const phasesSection =
      (phases ?? []).length > 0
        ? phases!
            .slice()
            .sort((a, b) => a.phase_order - b.phase_order)
            .map((p) => `- ${p.phase_order}. ${p.name}`)
            .join('\n')
        : DEFAULT_PHASES.map((p) => `- ${p.order}. ${p.name}`).join('\n')
    
    const injectsSection =
      sortedInjects.length > 0
        ? sortedInjects
            .map((inject, idx) => {
              const kind = resolveInjectBankKind(inject)
              const phaseLabel = inject.phase_id ? (phaseNameById.get(inject.phase_id) ?? `Phase #${inject.phase_id}`) : 'Sans phase'
              const description = inject.description?.trim() ? ` | description: ${inject.description.trim()}` : ''
              return `${idx + 1}. ${formatOffsetLabel(inject.time_offset)} | ${inject.duration_min} min | ${phaseLabel} | ${BANK_KIND_CONFIG[kind]?.label || kind} | ${inject.status} | ${inject.title}${description}`
            })
            .join('\n')
        : '- Aucun inject défini'
    
    const statusSection = Object.entries(statusCounts)
      .map(([status, count]) => `- ${status}: ${count}`)
      .join('\n') || '- Aucun'
    
    const kindsSection = Object.entries(kindCounts)
      .map(([kind, count]) => `- ${(BANK_KIND_CONFIG[kind as InjectBankKind]?.label) || kind}: ${count}`)
      .join('\n') || '- Aucun'
    
    return [
      'Tu es un expert en préparation d exercice de gestion de crise.',
      'Rédige une description exploitable de cet exercice à partir de la timeline ci-dessous.',
      'Objectif: fournir un brief clair pour animateurs et participants.',
      '',
      `Contexte: exercice #${exerciseId}`,
      `Durée cible: ${targetDurationHours}h`,
      `Nombre total d injects: ${injects.length}`,
      '',
      'Phases:',
      phasesSection,
      '',
      'Répartition des statuts:',
      statusSection,
      '',
      'Répartition des catégories (banque d injects):',
      kindsSection,
      '',
      'Timeline détaillée des injects:',
      injectsSection,
      '',
      'Livrable attendu:',
      '- 1) Résumé narratif de la progression de crise',
      '- 2) Objectifs pédagogiques implicites par phase',
      '- 3) Points de vigilance pour l animation',
      '- 4) Suggestions d ajustement (rythme, dépendances, canaux)',
    ].join('\n')
  }, [injects, phases, exerciseId, targetDurationHours])
  
  // Handler for timeline type change
  const handleTimelineTypeChange = (newType: TimelineType) => {
    setTimelineType(newType)
    onTimelineTypeChange?.(newType)
  }
  
  // Filter injects by timeline type - doit être avant totalDurationMin
  const filteredInjects = useMemo(() => {
    return injects.filter((i: Inject) => {
      return (i.timeline_type ?? 'business') === timelineType
    })
  }, [injects, timelineType])
  
  // Calcul de la durée totale de l'exercice
  const totalDurationMin = useMemo(() => {
    // En mode fit, utiliser la durée réelle des injects
    if (fitEndMin !== null) {
      return fitEndMin
    }
    // En mode scroll, utiliser la durée réelle des injects
    if (scrollMode && filteredInjects.length > 0) {
      const maxEnd = Math.max(...filteredInjects.map((i: Inject) => (i.time_offset ?? 0) + (i.duration_min ?? 15)))
      return Math.max(maxEnd, targetDurationHours * 60)
    }
    return targetDurationHours * 60
  }, [targetDurationHours, scrollMode, filteredInjects, fitEndMin])
  
  const totalPages = Math.ceil(totalDurationMin / (HOURS_PER_PAGE * 60))
  
  // plage de temps pour la page courante
  const timeRange = useMemo(() => {
    // En mode scroll, afficher toute la timeline
    if (scrollMode) {
      return { startMin: 0, endMin: totalDurationMin }
    }
    // Sinon, pagination normale
    const startMin = currentPage * HOURS_PER_PAGE * 60
    const endMin = Math.min(startMin + HOURS_PER_PAGE * 60, totalDurationMin)
    return { startMin, endMin }
  }, [currentPage, totalDurationMin, scrollMode])
  
  // Legend based on filtered injects
  const legendKinds = useMemo(() => {
    if (filteredInjects.length === 0) {
      return ['mail', 'social_post', 'scenario', 'video', 'document'] as InjectBankKind[]
    }
    const usedKinds = new Set<InjectBankKind>()
    filteredInjects.forEach((inject: Inject) => {
      usedKinds.add(resolveInjectBankKind(inject))
    })
    const order = bankKinds || BANK_KIND_ORDER_FALLBACK
    return order.filter((kind) => usedKinds.has(kind))
  }, [filteredInjects, bankKinds])
  
  // Filtrer les injects pour la page courante (à partir des injects filtrés par timeline_type)
  const visibleInjects = useMemo(() => {
    return filteredInjects.filter((i: Inject) => {
      const offset = i.time_offset ?? 0
      const end = offset + (i.duration_min ?? 15)
      return offset < timeRange.endMin && end > timeRange.startMin
    })
  }, [filteredInjects, timeRange])
  
  // Grouper les injects par phase
  const injectsByPhase = useMemo(() => {
    const grouped: Record<number, Inject[]> = { 0: [] } // 0 = sans phase
    phases?.forEach((p: ExercisePhase) => { grouped[p.id] = [] })
    visibleInjects.forEach((inject: Inject) => {
      const phaseId = inject.phase_id ?? 0
      if (!grouped[phaseId]) grouped[phaseId] = []
      grouped[phaseId].push(inject)
    })
    return grouped
  }, [visibleInjects, phases])
  
  // Ordre des phases pour affichage - utiliser les phases par défaut si aucune en base
  const orderedPhases = useMemo(() => {
    // Si des phases existent en base, les utiliser
    if (phases && phases.length > 0) {
      const ordered: (ExercisePhase | null)[] = [null] // null = sans phase
      phases.sort((a: ExercisePhase, b: ExercisePhase) => a.phase_order - b.phase_order).forEach((p: ExercisePhase) => ordered.push(p))
      return ordered
    }
    // Sinon, utiliser les phases par défaut localement (sans ID)
    const defaultOrdered: (ExercisePhase | null)[] = [null]
    DEFAULT_PHASES.forEach((p) => {
      defaultOrdered.push({
        id: -p.order, // ID négatif pour indiquer que c'est une phase locale
        exercise_id: exerciseId,
        name: p.name,
        phase_order: p.order,
        description: null,
        start_time: null,
        end_time: null,
        start_offset_min: null,
        end_offset_min: null,
      } as ExercisePhase)
    })
    return defaultOrdered
  }, [phases, exerciseId])
  
  // Initialisation automatique des phases par défaut
  const initDefaultPhasesMutation = useMutation({
    mutationFn: async () => {
      // Créer les phases par défaut une par une
      for (const phase of DEFAULT_PHASES) {
        await crisisManagementApi.createPhase(exerciseId, {
          name: phase.name,
          phase_order: phase.order,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise-phases', exerciseId] })
    },
  })
  
  // Initialiser les phases par défaut si aucune n'existe
  useEffect(() => {
    if (phases !== undefined && phases.length === 0 && !initDefaultPhasesMutation.isPending) {
      initDefaultPhasesMutation.mutate()
    }
  }, [phases])
  
  // Mesurer la largeur du conteneur
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth)
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  
  // Fermer le dropdown d'export quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setShowExportDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  // Fonction d'export des timelines
  const exportTimeline = (type: 'current' | 'all') => {
    const injectsToExport = type === 'current' ? filteredInjects : injects
    const sortedInjects = [...injectsToExport].sort((a, b) => (a.time_offset ?? 0) - (b.time_offset ?? 0))
    
    const phaseNameById = new Map<number, string>()
    ;(phases ?? []).forEach((p: ExercisePhase) => phaseNameById.set(p.id, p.name))
    
    const exportData = {
      exercise_id: exerciseId,
      exported_at: new Date().toISOString(),
      timeline_type: type === 'current' ? timelineType : 'all',
      total_injects: sortedInjects.length,
      phases: (phases ?? []).map((p: ExercisePhase) => ({
        id: p.id,
        name: p.name,
        order: p.phase_order,
      })),
      injects: sortedInjects.map((inject) => ({
        id: inject.id,
        title: inject.title,
        type: inject.type,
        status: inject.status,
        timeline_type: inject.timeline_type ?? 'business',
        time_offset: inject.time_offset,
        time_label: formatOffsetLabel(inject.time_offset),
        duration_min: inject.duration_min,
        phase_id: inject.phase_id,
        phase_name: inject.phase_id ? (phaseNameById.get(inject.phase_id) ?? null) : null,
        description: inject.description,
        content: inject.content,
      })),
    }
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `timeline_${type === 'current' ? timelineType : 'all'}_exercise_${exerciseId}_${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setShowExportDropdown(false)
  }
  
  // Calculer les positions Y des injects pour gérer les superpositions
  const phaseRowLayouts = useMemo(() => {
    const layouts: {
      phaseId: number
      rows: number // nombre de lignes nécessaires
      injectRows: Map<number, number> // injectId -> rowIndex
    }[] = []
    
    orderedPhases.forEach((phase) => {
      const phaseId = phase?.id ?? 0
      const phaseInjects = injectsByPhase[phaseId] || []
      
      // Algorithme pour assigner les lignes aux injects (interval scheduling)
      // Trier par temps de début
      const sorted = [...phaseInjects].sort((a, b) => (a.time_offset ?? 0) - (b.time_offset ?? 0))
      
      // Pour chaque inject, trouver la première ligne disponible
      const injectRows = new Map<number, number>()
      const rowEndTimes: number[] = [] // temps de fin de la dernière tâche sur chaque ligne
      
      sorted.forEach(inject => {
        const start = inject.time_offset ?? 0
        const end = start + (inject.duration_min ?? 15)
        
        // Chercher une ligne où l'inject peut s'insérer
        let assignedRow = 0
        for (let r = 0; r < rowEndTimes.length; r++) {
          if (rowEndTimes[r] <= start) {
            assignedRow = r
            break
          }
          assignedRow = r + 1
        }
        
        if (assignedRow >= rowEndTimes.length) {
          rowEndTimes.push(end)
        } else {
          rowEndTimes[assignedRow] = end
        }
        
        injectRows.set(inject.id, assignedRow)
      })
      
      layouts.push({
        phaseId,
        rows: Math.max(1, rowEndTimes.length),
        injectRows,
      })
    })
    
    return layouts
  }, [orderedPhases, injectsByPhase])
  
  // Calculer la largeur du SVG (étendue en mode scroll)
  const svgWidth = useMemo(() => {
    if (scrollMode && filteredInjects.length > 0) {
      // En mode scroll, calculer une largeur qui permet d'afficher tous les injects
      // avec un minimum de 5 pixels par minute pour la lisibilité
      const minWidthPerMinute = 5
      const neededWidth = totalDurationMin * minWidthPerMinute + PHASE_LABEL_WIDTH + 20
      return Math.max(neededWidth, containerWidth)
    }
    return containerWidth
  }, [scrollMode, filteredInjects, totalDurationMin, containerWidth])
  
  // Calculer la hauteur totale nécessaire
  const totalHeight = useMemo(() => {
    let h = HEADER_HEIGHT
    phaseRowLayouts.forEach((layout) => {
      const phaseHeight = Math.max(ROW_HEIGHT, layout.rows * (INJECT_HEIGHT + INJECT_GAP) + INJECT_GAP)
      h += phaseHeight
    })
    return h + 20
  }, [phaseRowLayouts])
  
  // Rendu D3
  useEffect(() => {
    if (!svgRef.current || isLoading) return
    
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    
    // En mode scroll, utiliser svgWidth pour le timelineWidth
    const timelineWidth = svgWidth - PHASE_LABEL_WIDTH - 20
    
    // Échelle de temps
    const xScale = d3.scaleLinear()
      .domain([timeRange.startMin, timeRange.endMin])
      .range([0, timelineWidth])
    
    // Grille et axes
    const g = svg.append('g')
      .attr('transform', `translate(${PHASE_LABEL_WIDTH}, 0)`)
    
    // Lignes verticales (grille)
    const grainMinutes = TIME_GRAIN_CONFIG[timeGrain].minutes
    const tickCount = Math.ceil((timeRange.endMin - timeRange.startMin) / grainMinutes)
    
    for (let i = 0; i <= tickCount; i++) {
      const mins = timeRange.startMin + i * grainMinutes
      const x = xScale(mins)
      if (x >= 0 && x <= timelineWidth) {
        g.append('line')
          .attr('x1', x)
          .attr('x2', x)
          .attr('y1', HEADER_HEIGHT)
          .attr('y2', totalHeight)
          .attr('stroke', '#e5e7eb')
          .attr('stroke-width', i === 0 ? 2 : 1)
      }
    }
    
    // Labels de temps
    for (let i = 0; i <= tickCount; i++) {
      const mins = timeRange.startMin + i * grainMinutes
      const x = xScale(mins)
      if (x >= 0 && x <= timelineWidth) {
        const hours = Math.floor(mins / 60)
        const minutes = mins % 60
        const label = `T+${hours}h${minutes > 0 ? minutes.toString().padStart(2, '0') : ''}`
        g.append('text')
          .attr('x', x)
          .attr('y', 25)
          .attr('text-anchor', 'middle')
          .attr('class', 'text-xs fill-gray-500')
          .text(label)
      }
    }
    
    // Calculer les positions Y de chaque phase
    let currentY = HEADER_HEIGHT
    const phaseYPositions: number[] = []
    const phaseHeights: number[] = []
    
    phaseRowLayouts.forEach((layout) => {
      phaseYPositions.push(currentY)
      const phaseHeight = Math.max(ROW_HEIGHT, layout.rows * (INJECT_HEIGHT + INJECT_GAP) + INJECT_GAP)
      phaseHeights.push(phaseHeight)
      currentY += phaseHeight
    })
    
    // Fond rouge translucide pour le dépassement de temps (au-delà de targetDurationHours)
    const targetDurationMin = targetDurationHours * 60
    if (timeRange.endMin > targetDurationMin) {
      const overflowStartX = xScale(targetDurationMin)
      const overflowWidth = xScale(timeRange.endMin) - overflowStartX
      
      if (overflowStartX < timelineWidth && overflowWidth > 0) {
        // Rectangle rouge translucide sur toute la hauteur
        g.append('rect')
          .attr('x', Math.max(0, overflowStartX))
          .attr('y', HEADER_HEIGHT)
          .attr('width', Math.min(overflowWidth, timelineWidth - Math.max(0, overflowStartX)))
          .attr('height', totalHeight - HEADER_HEIGHT)
          .attr('fill', 'rgba(220, 38, 38, 0.15)')
          .attr('stroke', 'rgba(220, 38, 38, 0.3)')
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '4,2')
        
        // Ligne verticale à la limite
        if (overflowStartX >= 0 && overflowStartX <= timelineWidth) {
          g.append('line')
            .attr('x1', overflowStartX)
            .attr('x2', overflowStartX)
            .attr('y1', HEADER_HEIGHT)
            .attr('y2', totalHeight)
            .attr('stroke', 'rgba(220, 38, 38, 0.5)')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '6,3')
          
          // Label "Durée cible dépassée"
          g.append('text')
            .attr('x', overflowStartX + 5)
            .attr('y', HEADER_HEIGHT + 15)
            .attr('class', 'text-xs fill-red-600')
            .attr('font-weight', '500')
            .text(`Durée cible (${targetDurationHours}h) dépassée`)
        }
      }
    }
    
    // Rendu des swimlanes (phases)
    phaseRowLayouts.forEach((layout, phaseIndex) => {
      const y = phaseYPositions[phaseIndex]
      const h = phaseHeights[phaseIndex]
      
      // Fond de ligne
      g.append('rect')
        .attr('x', 0)
        .attr('y', y)
        .attr('width', timelineWidth)
        .attr('height', h)
        .attr('fill', phaseIndex % 2 === 0 ? '#f9fafb' : '#ffffff')
        .attr('stroke', '#e5e7eb')
        .attr('stroke-width', 0.5)
    })
    
    // Rendu des blocs injects
    phaseRowLayouts.forEach((layout, phaseIndex) => {
      const phaseId = layout.phaseId
      const phaseInjects = injectsByPhase[phaseId] || []
      const phaseY = phaseYPositions[phaseIndex]
      
      phaseInjects.forEach(inject => {
        const startMin = inject.time_offset ?? 0
        const duration = inject.duration_min ?? 15
        const x = xScale(startMin)
        const width = Math.max(MIN_BLOCK_WIDTH, xScale(startMin + duration) - x)
        
        // Position Y basée sur la ligne assignée
        const injectRowIndex = layout.injectRows.get(inject.id) ?? 0
        const y = phaseY + INJECT_GAP + injectRowIndex * (INJECT_HEIGHT + INJECT_GAP)
        
        const bankKind = resolveInjectBankKind(inject)
        const typeCfg = BANK_KIND_CONFIG[bankKind] || { label: bankKind, bg: '#6b7280', color: '#374151', icon: Settings }
        const statusCfg = STATUS_CONFIG[inject.status] || { label: inject.status, color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' }
        
        // Groupe pour le bloc
        const blockG = g.append('g')
          .attr('class', 'inject-block')
          .attr('transform', `translate(${x}, ${y})`)
          .attr('data-inject-id', inject.id)
          .style('cursor', 'pointer')
        
        // Rectangle du bloc
        blockG.append('rect')
          .attr('width', width)
          .attr('height', INJECT_HEIGHT)
          .attr('rx', 4)
          .attr('fill', typeCfg.bg)
          .attr('fill-opacity', inject.status === 'cancelled' ? 0.4 : 0.9)
          .attr('stroke', typeCfg.color)
          .attr('stroke-width', 2)
          .attr('class', 'transition-all hover:brightness-110')
        
        // Barre de statut
        blockG.append('rect')
          .attr('width', 4)
          .attr('height', INJECT_HEIGHT)
          .attr('rx', 2)
          .attr('fill', statusCfg.dot)
        
        // Titre
        if (width > 40) {
          blockG.append('text')
            .attr('x', 10)
            .attr('y', 14)
            .attr('class', 'text-xs font-medium fill-white')
            .text(inject.title.substring(0, Math.floor(width / 7)))
            .append('title')
            .text(inject.title)
        }
        
        // Durée
        if (width > 60) {
          blockG.append('text')
            .attr('x', 10)
            .attr('y', 26)
            .attr('class', 'text-xs fill-white fill-opacity-80')
            .text(`${duration}min`)
        }
        
        // Interaction - clic sur le bloc (pas sur les poignées)
        blockG.on('click', function(event) {
          // Vérifier si le clic est sur une poignée de redimensionnement
          const target = event.target as SVGElement
          if (target.classList.contains('resize-handle')) {
            return // Ne pas ouvrir la modal si on clique sur une poignée
          }
          handleBlockClick(inject)
        })
        
        // Handle de redimensionnement gauche (modifier time_offset et durée)
        const leftHandle = blockG.append('rect')
          .attr('class', 'resize-handle resize-handle-left')
          .attr('x', 0)
          .attr('y', 0)
          .attr('width', RESIZE_HANDLE_WIDTH)
          .attr('height', INJECT_HEIGHT)
          .attr('fill', 'transparent')
          .attr('cursor', 'ew-resize')
          .attr('rx', 4)
        
        // Handle de redimensionnement droit (modifier durée uniquement)
        const rightHandle = blockG.append('rect')
          .attr('class', 'resize-handle resize-handle-right')
          .attr('x', width - RESIZE_HANDLE_WIDTH)
          .attr('y', 0)
          .attr('width', RESIZE_HANDLE_WIDTH)
          .attr('height', INJECT_HEIGHT)
          .attr('fill', 'transparent')
          .attr('cursor', 'ew-resize')
          .attr('rx', 4)
        
        // Drag behavior pour redimensionnement gauche
        const resizeLeftDrag = d3.drag<SVGRectElement, unknown>()
          .on('start', function() {
            d3.select(this.parentNode as SVGGElement).raise()
            d3.select(this.parentNode as SVGGElement).select('rect:not(.resize-handle)').attr('stroke-width', 3).attr('stroke', '#000')
          })
          .on('drag', function(event) {
            const parent = d3.select(this.parentNode as SVGGElement)
            const transform = parent.attr('transform')
            const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/)
            const currentX = match ? parseFloat(match[1]) : x
            
            // Calculer nouveau X (déplacement du bord gauche)
            const deltaX = event.dx
            const newX = Math.max(0, currentX + deltaX)
            const newWidth = Math.max(MIN_BLOCK_WIDTH, width - (newX - x))
            
            // Mettre à jour la position et la largeur
            parent.attr('transform', `translate(${newX}, ${y})`)
            parent.select('rect:not(.resize-handle)').attr('width', newWidth)
            parent.select('.resize-handle-right').attr('x', newWidth - RESIZE_HANDLE_WIDTH)
            
            // Mettre à jour le texte si visible
            parent.selectAll('text').remove()
            if (newWidth > 40) {
              parent.append('text')
                .attr('x', 10)
                .attr('y', 14)
                .attr('class', 'text-xs font-medium fill-white')
                .text(inject.title.substring(0, Math.floor(newWidth / 7)))
            }
            if (newWidth > 60) {
              // Estimation de la nouvelle durée pour l'affichage
              const estDuration = Math.round(newWidth / (xScale(startMin + duration) - xScale(startMin)) * duration)
              parent.append('text')
                .attr('x', 10)
                .attr('y', 26)
                .attr('class', 'text-xs fill-white fill-opacity-80')
                .text(`${estDuration}min`)
            }
          })
          .on('end', function() {
            const parent = d3.select(this.parentNode as SVGGElement)
            const transform = parent.attr('transform')
            const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/)
            const newX = match ? parseFloat(match[1]) : x
            const rectWidth = parent.select('rect:not(.resize-handle)').attr('width')
            const newWidth = parseFloat(rectWidth || width.toString())
            
            // Calculer le nouveau time_offset et la nouvelle durée
            const newTimeOffset = Math.round(xScale.invert(newX))
            const endMin = startMin + duration
            const newDuration = Math.max(1, Math.round(endMin - newTimeOffset))
            
            // Reset visuel
            parent.select('rect:not(.resize-handle)').attr('stroke-width', 2).attr('stroke', typeCfg.color)
            
            // Appeler le handler
            handleResizeEnd(inject, newTimeOffset, newDuration)
          })
        
        // Drag behavior pour redimensionnement droit
        const resizeRightDrag = d3.drag<SVGRectElement, unknown>()
          .on('start', function() {
            d3.select(this.parentNode as SVGGElement).raise()
            d3.select(this.parentNode as SVGGElement).select('rect:not(.resize-handle)').attr('stroke-width', 3).attr('stroke', '#000')
          })
          .on('drag', function(event) {
            const parent = d3.select(this.parentNode as SVGGElement)
            const rect = parent.select('rect:not(.resize-handle)')
            const currentWidth = parseFloat(rect.attr('width') || width.toString())
            
            // Calculer nouvelle largeur
            const newWidth = Math.max(MIN_BLOCK_WIDTH, currentWidth + event.dx)
            
            // Mettre à jour la largeur
            rect.attr('width', newWidth)
            parent.select('.resize-handle-right').attr('x', newWidth - RESIZE_HANDLE_WIDTH)
            
            // Mettre à jour le texte si visible
            parent.selectAll('text').remove()
            if (newWidth > 40) {
              parent.append('text')
                .attr('x', 10)
                .attr('y', 14)
                .attr('class', 'text-xs font-medium fill-white')
                .text(inject.title.substring(0, Math.floor(newWidth / 7)))
            }
            if (newWidth > 60) {
              // Estimation de la nouvelle durée pour l'affichage
              const estDuration = Math.round(newWidth / (xScale(startMin + duration) - xScale(startMin)) * duration)
              parent.append('text')
                .attr('x', 10)
                .attr('y', 26)
                .attr('class', 'text-xs fill-white fill-opacity-80')
                .text(`${estDuration}min`)
            }
          })
          .on('end', function() {
            const parent = d3.select(this.parentNode as SVGGElement)
            const rectWidth = parent.select('rect:not(.resize-handle)').attr('width')
            const newWidth = parseFloat(rectWidth || width.toString())
            
            // Calculer la nouvelle durée
            const pixelsPerMin = (xScale(startMin + duration) - xScale(startMin)) / duration
            const newDuration = Math.max(1, Math.round(newWidth / pixelsPerMin))
            
            // Reset visuel
            parent.select('rect:not(.resize-handle)').attr('stroke-width', 2).attr('stroke', typeCfg.color)
            
            // Appeler le handler
            handleResizeEnd(inject, inject.time_offset ?? 0, newDuration)
          })
        
        // Drag behavior - horizontal (temps) et vertical (phase) - uniquement sur le corps du bloc
        const bodyDrag = d3.drag<SVGGElement, unknown>()
          .filter(function(event) {
            // Ne pas déclencher le drag si on est sur une poignée de redimensionnement
            const target = event.target as SVGElement
            return !target.classList.contains('resize-handle')
          })
          .on('start', function() {
            d3.select(this).raise()
            d3.select(this).select('rect:not(.resize-handle)').attr('stroke-width', 3).attr('stroke', '#000')
          })
          .on('drag', function(event) {
            const transform = d3.select(this).attr('transform')
            const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/)
            const currentX = match ? parseFloat(match[1]) : x
            const currentY = match ? parseFloat(match[2]) : y
            
            // Calculer nouvelles positions
            const newX = Math.max(0, Math.min(timelineWidth - width, currentX + event.dx))
            const newY = Math.max(HEADER_HEIGHT, Math.min(totalHeight - INJECT_HEIGHT, currentY + event.dy))
            
            d3.select(this).attr('transform', `translate(${newX}, ${newY})`)
          })
          .on('end', function() {
            const transform = d3.select(this).attr('transform')
            const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/)
            const newX = match ? parseFloat(match[1]) : x
            const newY = match ? parseFloat(match[2]) : y
            
            // Calculer le nouveau time_offset
            const newTimeOffset = Math.round(xScale.invert(newX))
            
            // Calculer la nouvelle phase basée sur la position Y
            let targetPhaseIndex = 0
            for (let i = phaseYPositions.length - 1; i >= 0; i--) {
              if (newY >= phaseYPositions[i]) {
                targetPhaseIndex = i
                break
              }
            }
            const targetPhase = orderedPhases[targetPhaseIndex]
            const newPhaseId = targetPhase?.id ?? null
            
            // Reset visuel
            d3.select(this).select('rect:not(.resize-handle)').attr('stroke-width', 2).attr('stroke', typeCfg.color)
            
            // Appeler le handler avec les nouvelles valeurs
            handleDragEnd(inject, newTimeOffset, newPhaseId)
          })
        
        // Appliquer les behaviors
        leftHandle.call(resizeLeftDrag)
        rightHandle.call(resizeRightDrag)
        d3.select(blockG.node()!).call(bodyDrag)
      })
    })
    
    // Labels des phases avec sélection, bouton IA et double-clic
    const phaseLabelG = svg.append('g')
    phaseRowLayouts.forEach((layout, phaseIndex) => {
      const y = phaseYPositions[phaseIndex]
      const h = phaseHeights[phaseIndex]
      const phase = orderedPhases[phaseIndex]
      const phaseId = phase?.id ?? null
      const isSelected = selectedPhaseId === phaseId
      const isLoading = false
      
      // Fond du label de phase
      const phaseRect = phaseLabelG.append('rect')
        .attr('x', 0)
        .attr('y', y)
        .attr('width', PHASE_LABEL_WIDTH - 5)
        .attr('height', h)
        .attr('fill', isSelected ? '#dbeafe' : (phaseIndex % 2 === 0 ? '#f3f4f6' : '#f9fafb'))
        .attr('stroke', isSelected ? '#3b82f6' : '#e5e7eb')
        .attr('stroke-width', isSelected ? 2 : 1)
        .attr('class', 'phase-label-rect')
        .style('cursor', 'pointer')
      
      // Texte du label
      const phaseText = phaseLabelG.append('text')
        .attr('x', 10)
        .attr('y', y + h / 2 + 5)
        .attr('class', `text-xs font-medium ${isSelected ? 'fill-blue-700' : 'fill-gray-700'}`)
        .text(phase?.name ?? 'Sans phase')
        .style('cursor', 'pointer')
      
      
      // Clic pour sélectionner la phase
      phaseRect.on('click', function() {
        setSelectedPhaseId(prev => prev === phaseId ? null : phaseId)
      })
      phaseText.on('click', function() {
        setSelectedPhaseId(prev => prev === phaseId ? null : phaseId)
      })
      
      // Double-clic pour éditer la phase
      phaseRect.on('dblclick', function() {
        const phaseName = phase?.name ?? 'Sans phase'
        const phaseInjects = injectsByPhase[phaseId ?? 0] || []
        const injectsText = phaseInjects.length > 0
          ? phaseInjects
              .sort((a, b) => (a.time_offset ?? 0) - (b.time_offset ?? 0))
              .map(i => `- T+${formatOffsetLabel(i.time_offset)} | ${i.title}`)
              .join('\n')
          : 'Aucun inject'
        setPhaseEditText(`Phase: ${phaseName}\n\nInjects:\n${injectsText}`)
        setShowPhaseEditModal(true)
      })
      phaseText.on('dblclick', function() {
        const phaseName = phase?.name ?? 'Sans phase'
        const phaseInjects = injectsByPhase[phaseId ?? 0] || []
        const injectsText = phaseInjects.length > 0
          ? phaseInjects
              .sort((a, b) => (a.time_offset ?? 0) - (b.time_offset ?? 0))
              .map(i => `- T+${formatOffsetLabel(i.time_offset)} | ${i.title}`)
              .join('\n')
          : 'Aucun inject'
        setPhaseEditText(`Phase: ${phaseName}\n\nInjects:\n${injectsText}`)
        setShowPhaseEditModal(true)
      })
    })
    
  }, [visibleInjects, timeRange, orderedPhases, injectsByPhase, phaseRowLayouts, timeGrain, svgWidth, isLoading, phases, totalHeight, selectedPhaseId])
  
  // Effet pour gérer les événements souris (ligne verticale et tooltip)
  useEffect(() => {
    if (!svgRef.current || isLoading) return
    
    const svg = svgRef.current
    const timelineWidth = svgWidth - PHASE_LABEL_WIDTH - 20
    
    // Échelle de temps
    const xScale = d3.scaleLinear()
      .domain([timeRange.startMin, timeRange.endMin])
      .range([0, timelineWidth])
    
    // Gestionnaire mousemove sur le SVG pour la ligne verticale
    const handleMouseMove = (event: MouseEvent) => {
      const rect = svg.getBoundingClientRect()
      const x = event.clientX - rect.left - PHASE_LABEL_WIDTH
      
      if (x >= 0 && x <= timelineWidth) {
        const timeMin = xScale.invert(x)
        setMouseX(x + PHASE_LABEL_WIDTH)
        setMouseTimeMin(Math.round(timeMin))
      } else {
        setMouseX(null)
        setMouseTimeMin(null)
      }
    }
    
    const handleMouseLeave = () => {
      setMouseX(null)
      setMouseTimeMin(null)
      setHoveredInject(null)
    }
    
    // Ajouter les écouteurs
    svg.addEventListener('mousemove', handleMouseMove)
    svg.addEventListener('mouseleave', handleMouseLeave)
    
    return () => {
      svg.removeEventListener('mousemove', handleMouseMove)
      svg.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [timeRange, svgWidth, isLoading])
  
  // Effet pour ajouter les événements hover sur les blocs injects
  useEffect(() => {
    if (!svgRef.current || isLoading || visibleInjects.length === 0) return
    
    const svg = svgRef.current
    const container = containerRef.current
    if (!container) return
    
    const containerRect = container.getBoundingClientRect()
    
    // Parcourir tous les blocs injects et ajouter les événements hover
    const injectBlocks = svg.querySelectorAll('.inject-block')
    
    injectBlocks.forEach((block) => {
      const injectId = parseInt(block.getAttribute('data-inject-id') || '0')
      const inject = visibleInjects.find((i: Inject) => i.id === injectId)
      if (!inject) return
      
      const handleMouseEnter = (event: MouseEvent) => {
        setHoveredInject(inject)
        const blockRect = (block as SVGElement).getBoundingClientRect()
        setTooltipPosition({
          x: blockRect.left + blockRect.width / 2,
          y: blockRect.top - 18,
        })
      }
      
      const handleMouseMoveBlock = (event: MouseEvent) => {
        setTooltipPosition({
          x: event.clientX,
          y: event.clientY - 18,
        })
      }
      
      const handleMouseLeave = () => {
        setHoveredInject(null)
      }
      
      block.addEventListener('mouseenter', handleMouseEnter as EventListener)
      block.addEventListener('mousemove', handleMouseMoveBlock as EventListener)
      block.addEventListener('mouseleave', handleMouseLeave as EventListener)
    })
    
    return () => {
      injectBlocks.forEach((block) => {
        block.removeEventListener('mouseenter', () => {})
        block.removeEventListener('mousemove', () => {})
        block.removeEventListener('mouseleave', () => {})
      })
    }
  }, [visibleInjects, isLoading])
  
  // Handlers
  const handleBlockClick = (inject: Inject) => {
    setSelectedInject(inject)
    const bankKind =
      ((inject.content as Record<string, any> | null | undefined)?.bank_kind as InjectBankKind | undefined) ||
      INJECT_TYPE_TO_BANK_KIND[inject.type]
    setEditForm({
      ...getRecipientFromInject(inject),
      title: inject.title,
      description: inject.description ?? '',
      time_offset: inject.time_offset?.toString() ?? '',
      duration_min: inject.duration_min?.toString() ?? '15',
      bank_kind: bankKind,
      type: BANK_KIND_TO_INJECT_TYPE[bankKind] || inject.type,
      phase_id: inject.phase_id?.toString() ?? '',
      content_text: inject.content?.text ?? '',
      data_format: (inject.data_format as InjectDataFormat) || 'text',
      timeline_type: (inject.timeline_type as TimelineType) ?? 'business',
    })
    setEditModalTab('manual')
    setEditModalAiPrompt('')
    setEditModalAiError(null)
    setEditFormFile(null)
    setShowEditModal(true)
  }

  const handleDragEnd = async (inject: Inject, newTimeOffset: number, newPhaseId: number | null) => {
    try {
      const updates: { time_offset?: number; phase_id?: number } = {}
      
      // Toujours mettre à jour le time_offset
      if (newTimeOffset !== inject.time_offset) {
        updates.time_offset = newTimeOffset
      }
      
      // Mettre à jour la phase si elle a changé
      // Convertir null en undefined pour l'API (phase_id ne peut pas être null dans l'update)
      if (newPhaseId !== inject.phase_id) {
        // Si newPhaseId est null, on ne passe pas phase_id dans l'update (undefined)
        // L'API ne supporte pas null, il faut utiliser undefined pour retirer la phase
        updates.phase_id = newPhaseId ?? undefined
      }
      
      // Ne faire l'appel API que s'il y a des changements
      if (Object.keys(updates).length > 0) {
        await injectsApi.update(inject.id, updates)
        queryClient.invalidateQueries({ queryKey: ['injects', exerciseId] })
      }
    } catch (error) {
      console.error('Erreur lors du déplacement:', error)
    }
  }
  
  const handleResizeEnd = async (inject: Inject, newTimeOffset: number, newDuration: number) => {
    try {
      const updates: { time_offset?: number; duration_min?: number } = {}
      
      // Mettre à jour le time_offset si changé
      if (newTimeOffset !== inject.time_offset) {
        updates.time_offset = newTimeOffset
      }
      
      // Mettre à jour la durée si changée
      if (newDuration !== inject.duration_min) {
        updates.duration_min = newDuration
      }
      
      // Ne faire l'appel API que s'il y a des changements
      if (Object.keys(updates).length > 0) {
        await injectsApi.update(inject.id, updates)
        queryClient.invalidateQueries({ queryKey: ['injects', exerciseId] })
      }
    } catch (error) {
      console.error('Erreur lors du redimensionnement:', error)
    }
  }
  
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInject) return
      const bankKind = editForm.bank_kind || INJECT_TYPE_TO_BANK_KIND[editForm.type] || 'other'
      await injectsApi.update(selectedInject.id, {
        title: editForm.title,
        description: editForm.description || undefined,
        time_offset: editForm.time_offset ? parseInt(editForm.time_offset) : undefined,
        duration_min: editForm.duration_min ? parseInt(editForm.duration_min) : undefined,
        phase_id: editForm.phase_id ? parseInt(editForm.phase_id) : undefined,
        data_format: editForm.data_format,
        audiences: buildAudiencesFromEditForm(),
        content: { text: editForm.content_text, bank_kind: bankKind },
      })
      if (editFormFile) {
        const { media } = await mediaApi.upload(editFormFile, { exercise_id: exerciseId, title: editFormFile.name })
        await injectsApi.addMedia(selectedInject.id, media.id)
      }
    },
    onSuccess: () => {
      setEditFormFile(null)
      queryClient.invalidateQueries({ queryKey: ['injects', exerciseId] })
      setShowEditModal(false)
    },
  })
  
  const sendMutation = useMutation({
    mutationFn: (id: number) => injectsApi.send(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['injects', exerciseId] })
      setShowEditModal(false)
    },
  })
  
  const deleteMutation = useMutation({
    mutationFn: (id: number) => injectsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['injects', exerciseId] })
      setShowEditModal(false)
    },
  })
  
  const createMutation = useMutation({
    mutationFn: async () => {
      const bankKind = editForm.bank_kind || INJECT_TYPE_TO_BANK_KIND[editForm.type] || 'other'
      const injectType = BANK_KIND_TO_INJECT_TYPE[bankKind] || editForm.type
      const inject = await injectsApi.create({
        exercise_id: exerciseId,
        title: editForm.title || 'Nouvel inject',
        type: injectType,
        description: editForm.description || undefined,
        time_offset: editForm.time_offset ? parseInt(editForm.time_offset) : timeRange.startMin,
        duration_min: editForm.duration_min ? parseInt(editForm.duration_min) : 15,
        phase_id: editForm.phase_id ? parseInt(editForm.phase_id) : undefined,
        data_format: editForm.data_format,
        audiences: buildAudiencesFromEditForm(),
        content: { text: editForm.content_text, bank_kind: bankKind },
        timeline_type: timelineType,
      })
      if (editFormFile) {
        const { media } = await mediaApi.upload(editFormFile, { exercise_id: exerciseId, title: editFormFile.name })
        await injectsApi.addMedia(inject.id, media.id)
      }
      return inject
    },
    onSuccess: () => {
      setEditFormFile(null)
      queryClient.invalidateQueries({ queryKey: ['injects', exerciseId] })
      queryClient.refetchQueries({ queryKey: ['injects', exerciseId, 'all'] })
      setShowEditModal(false)
    },
  })
  
  const handleAddInject = () => {
    setSelectedInject(null)
    setEditForm({
      title: '',
      description: '',
      time_offset: (currentPage * HOURS_PER_PAGE * 60).toString(),
      duration_min: '15',
      bank_kind: bankTypeOptions[0]?.kind || 'mail',
      type: bankTypeOptions[0]?.injectType || 'mail',
      data_format: 'text',
      recipient_kind: '',
      recipient_value: '',
      phase_id: phases?.[0]?.id?.toString() ?? '',
      content_text: '',
      timeline_type: timelineType,
    })
    setEditModalTab('manual')
    setEditModalAiPrompt('')
    setEditModalAiError(null)
    setEditFormFile(null)
    setShowEditModal(true)
  }

  const handleSave = () => {
    if (selectedInject) {
      updateMutation.mutate()
    } else {
      createMutation.mutate()
    }
  }
  
  const handleShowMedia = async () => {
    if (!selectedInject) return
    const mediaAssoc = await injectsApi.getMedia(selectedInject.id)
    const mediaIds = mediaAssoc.map(m => m.media_id)
    const mediaList = await Promise.all(
      mediaIds.map(id => mediaApi.get(id))
    )
    setInjectMedia(mediaList)
    setShowMediaModal(true)
  }
  
  const handleAddMediaToInject = async (mediaId: number) => {
    if (!selectedInject) return
    await injectsApi.addMedia(selectedInject.id, mediaId)
    handleShowMedia()
  }
  
  const handleRemoveMedia = async (mediaId: number) => {
    if (!selectedInject) return
    await injectsApi.removeMedia(selectedInject.id, mediaId)
    handleShowMedia()
  }

  
  // Mutation pour créer un inject depuis la banque
  const createFromBankMutation = useMutation({
    mutationFn: async (bankItem: InjectBankItem) => {
      // Créer l'inject sans phase (phase_id = null)
      // Déterminer le type d'inject depuis le kind ou le payload
      const payloadType = bankItem.payload?.inject_type
      const injectType = isInjectType(payloadType)
        ? payloadType
        : BANK_KIND_TO_INJECT_TYPE[bankItem.kind]
      return injectsApi.create({
        exercise_id: exerciseId,
        title: bankItem.title,
        type: injectType,
        data_format: bankItem.data_format || 'text',
        description: bankItem.summary || undefined,
        time_offset: timeRange.startMin, // Positionné au début de la page courante
        duration_min: bankItem.payload?.duration_min || 15,
        phase_id: undefined, // Sans phase par défaut
        timeline_type: timelineType, // Utilise la timeline active
        content: {
          ...(bankItem.payload || {}),
          bank_kind: bankItem.kind,
          inject_bank_kind: bankItem.kind,
          bank_item_id: bankItem.id,
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['injects', exerciseId] })
      setShowBankModal(false)
      setSelectedBankItem(null)
    },
  })
  // Vider la timeline courante
  const clearTimelineMutation = useMutation({
    mutationFn: async () => {
      // Supprimer tous les injects de la timeline courante
      const injectsToDelete = filteredInjects
      for (const inject of injectsToDelete) {
        await injectsApi.delete(inject.id)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['injects', exerciseId] })
    },
  })
  
  // Vider la phase sélectionnée
  const clearPhaseMutation = useMutation({
    mutationFn: async (phaseId: number) => {
      // Supprimer tous les injects de la phase
      const phaseInjects = injects.filter((i: Inject) => i.phase_id === phaseId)
      for (const inject of phaseInjects) {
        await injectsApi.delete(inject.id)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['injects', exerciseId] })
      setShowPhaseEditModal(false)
    },
  })
  
  // Interface pour les injects importés depuis JSON
  interface ImportedInject {
    title: string
    type: InjectType
    time_offset: number
    duration_min: number
    phase_id?: number | null
    description?: string
    data_format?: InjectDataFormat
    audiences?: AudienceTarget[]
    content?: { text?: string; [key: string]: unknown }
  }
  
  // Mutation pour importer des injects depuis JSON
  const importInjectsMutation = useMutation({
    mutationFn: async () => {
      setImportError(null)
      
      // Parser le JSON
      let injectsToImport: ImportedInject[]
      try {
        // Nettoyer le texte (enlever les blocs markdown si présents)
        let cleanedText = phaseEditText.trim()
        if (cleanedText.startsWith('```json')) {
          cleanedText = cleanedText.slice(7)
        }
        if (cleanedText.startsWith('```')) {
          cleanedText = cleanedText.slice(3)
        }
        if (cleanedText.endsWith('```')) {
          cleanedText = cleanedText.slice(0, -3)
        }
        cleanedText = cleanedText.trim()
        
        injectsToImport = JSON.parse(cleanedText)
        if (!Array.isArray(injectsToImport)) {
          throw new Error('Le JSON doit être un tableau d\'injects')
        }
      } catch (e) {
        throw new Error('JSON invalide: ' + (e as Error).message)
      }
      
      // Récupérer les IDs de phases valides pour cet exercice
      const validPhaseIds = new Set((phases ?? []).map((p: ExercisePhase) => p.id))
      
      // Valider et créer chaque inject
      const errors: string[] = []
      const created: string[] = []
      
      for (let i = 0; i < injectsToImport.length; i++) {
        const inj = injectsToImport[i]
        
        // Validation
        if (!inj.title) {
          errors.push(`Inject #${i + 1}: titre manquant`)
          continue
        }
        if (!inj.type || !isInjectType(inj.type)) {
          errors.push(`Inject #${i + 1}: type invalide (doit être mail, twitter, tv, decision, score ou system)`)
          continue
        }
        if (typeof inj.time_offset !== 'number') {
          errors.push(`Inject #${i + 1}: time_offset manquant ou non numérique`)
          continue
        }
        
        // Résoudre le phase_id: 
        // - Si une phase est sélectionnée, l'utiliser (prioritaire)
        // - Sinon, utiliser le phase_id de l'IA SEULEMENT s'il existe vraiment
        // - Sinon, sans phase
        let resolvedPhaseId: number | undefined = undefined
        if (selectedPhaseId && selectedPhaseId > 0 && validPhaseIds.has(selectedPhaseId)) {
          // Phase sélectionnée = prioritaire, on ignore le phase_id de l'IA
          resolvedPhaseId = selectedPhaseId
        } else if (inj.phase_id && validPhaseIds.has(inj.phase_id)) {
          // Sinon, utiliser le phase_id de l'IA SEULEMENT s'il existe vraiment
          resolvedPhaseId = inj.phase_id
        }
        // Sinon, on laisse undefined (sans phase)
        
        // Créer l'inject
        try {
          await injectsApi.create({
            exercise_id: exerciseId,
            title: inj.title,
            type: inj.type,
            time_offset: inj.time_offset,
            duration_min: inj.duration_min || 15,
            phase_id: resolvedPhaseId,
            description: inj.description,
            data_format: inj.data_format || 'text',
            audiences: Array.isArray(inj.audiences) ? inj.audiences : [],
            content: inj.content || {},
            timeline_type: timelineType,
          })
          created.push(inj.title)
        } catch (e) {
          errors.push(`Inject #${i + 1} (${inj.title}): ${(e as Error).message}`)
        }
      }
      
      if (errors.length > 0) {
        throw new Error(errors.join('\n'))
      }
      
      return created
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['injects', exerciseId] })
      setShowPhaseEditModal(false)
      setPhaseEditText('')
      setImportError(null)
      void appDialog.alert(`${created.length} inject(s) importé(s) avec succès !`, { title: 'Import terminé' })
    },
    onError: (error) => {
      setImportError((error as Error).message)
    },
  })
  
  // Handler pour l'import
  const handleImportInjects = () => {
    importInjectsMutation.mutate()
  }
  
  // Fonction pour ajuster la vue pour afficher tous les injects
  const handleFit = () => {
    if (filteredInjects.length === 0) return
    
    // Calculer la fin réelle des injects
    const maxEnd = Math.max(...filteredInjects.map((i: Inject) => (i.time_offset ?? 0) + (i.duration_min ?? 15)))
    
    // Calculer le grain optimal pour que tout tienne dans la largeur disponible
    const timelineWidth = containerWidth - PHASE_LABEL_WIDTH - 20
    const pixelsPerMinute = timelineWidth / maxEnd
    
    // Déterminer le grain le plus approprié
    // On veut au moins 30px par intervalle de grain
    let bestGrain: TimeGrain = '1h'
    const grains: TimeGrain[] = ['1min', '10min', '30min', '1h']
    for (const grain of grains) {
      const grainMinutes = TIME_GRAIN_CONFIG[grain].minutes
      const pixelsPerGrain = pixelsPerMinute * grainMinutes
      if (pixelsPerGrain >= 30) {
        bestGrain = grain
        break
      }
    }
    
    // Ajuster le grain et définir la fin de la timeline au dernier inject
    // Désactiver le mode scroll si actif
    setTimeGrain(bestGrain)
    setCurrentPage(0)
    setFitEndMin(maxEnd)
    setScrollMode(false)
  }
  
  // Fonction pour basculer le mode scroll horizontal
  const toggleScrollMode = () => {
    setScrollMode(prev => !prev)
  }
  
  return (
    <div className="space-y-4">
      {/* Timeline Type Tabs */}
      {!compact && (
        <div className="flex items-center gap-1 border-b border-gray-200">
          <button
            onClick={() => handleTimelineTypeChange('business')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              timelineType === 'business'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Timeline Métier
          </button>
          <button
            onClick={() => handleTimelineTypeChange('technical')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              timelineType === 'technical'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Timeline Technique
          </button>
        </div>
      )}
      
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Grain:</span>
          <select
            value={timeGrain}
            onChange={(e) => {
              setTimeGrain(e.target.value as TimeGrain)
              setFitEndMin(null) // Reset fit mode when grain changes manually
            }}
            className="px-2 py-1 text-sm border border-gray-300 rounded"
          >
            {Object.entries(TIME_GRAIN_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setCurrentPage(p => Math.max(0, p - 1))
              setFitEndMin(null) // Reset fit mode when navigating manually
            }}
            disabled={currentPage === 0}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm text-gray-600">
            Page {currentPage + 1} / {totalPages} ({HOURS_PER_PAGE}h)
          </span>
          <button
            onClick={() => {
              setCurrentPage(p => Math.min(totalPages - 1, p + 1))
              setFitEndMin(null) // Reset fit mode when navigating manually
            }}
            disabled={currentPage >= totalPages - 1}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            T+{Math.floor(timeRange.startMin / 60)}h → T+{Math.floor(timeRange.endMin / 60)}h
          </span>
          
          {!compact && (
            <>
              <button
                onClick={handleAddInject}
                className="inline-flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                <Plus className="mr-1.5" size={15} />
                Nouvel inject
              </button>
              <button
                onClick={() => {
                  setBankSearch('')
                  setSelectedBankItem(null)
                  setShowBankModal(true)
                }}
                className="inline-flex items-center px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                <Database className="mr-1.5" size={15} />
                Depuis la banque
              </button>
              {filteredInjects.length > 0 && (
                <button
                  onClick={async () => {
                    if (await appDialog.confirm(`Supprimer tous les injects de la timeline ${timelineType} ? (${filteredInjects.length} injects)`)) {
                      clearTimelineMutation.mutate()
                    }
                  }}
                  disabled={clearTimelineMutation.isPending}
                  className="inline-flex items-center px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                  title="Vider la timeline courante"
                >
                  <Eraser className="mr-1.5" size={15} />
                  Vider
                </button>
              )}
              
              {/* Boutons Fit et Scroll */}
              <button
                onClick={handleFit}
                disabled={filteredInjects.length === 0}
                className="inline-flex items-center px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
                title="Ajuster pour afficher tous les injects"
              >
                <Maximize2 className="mr-1.5" size={15} />
                Fit
              </button>
              <button
                onClick={toggleScrollMode}
                className={`inline-flex items-center px-3 py-1.5 text-sm rounded-md ${
                  scrollMode 
                    ? 'bg-amber-600 text-white hover:bg-amber-700' 
                    : 'bg-gray-600 text-white hover:bg-gray-700'
                }`}
                title={scrollMode ? 'Mode scroll actif - cliquez pour désactiver' : 'Activer le mode scroll horizontal'}
              >
                <MoveHorizontal className="mr-1.5" size={15} />
                Scroll
              </button>
            </>
          )}
          
        </div>
      </div>
      
      {/* Stats */}
      {!isLoading && !compact && (
        <div className="flex gap-4 flex-wrap">
          {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
            const count = injects.filter((i: Inject) => i.status === status).length
            return (
              <div key={status} className="flex items-center gap-1.5 text-sm text-gray-600">
                <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                {cfg.label} : <strong>{count}</strong>
              </div>
            )
          })}
        </div>
      )}
      
      {/* Timeline Container */}
      <div className="bg-white rounded-lg shadow overflow-hidden" ref={containerRef}>
        {isLoading || phases === undefined ? (
          <div className="p-10 text-center text-gray-500">Chargement…</div>
        ) : (
          <div className="overflow-x-auto relative">
            {/* Message si aucun inject */}
            {injects.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div className="text-center text-gray-400 bg-white/80 px-6 py-4 rounded-lg shadow-sm">
                  <CalendarClock className="mx-auto mb-2" size={28} />
                  <p className="text-sm">Cliquez sur "Nouvel inject" pour commencer</p>
                </div>
              </div>
            )}
            <svg
              ref={svgRef}
              width={svgWidth}
              height={totalHeight}
              className={scrollMode ? '' : 'w-full'}
              style={scrollMode ? { minWidth: `${svgWidth}px` } : undefined}
            />
            
            {/* Ligne verticale au déplacement de la souris */}
            {mouseX !== null && mouseTimeMin !== null && (
              <div
                className="absolute top-0 pointer-events-none z-20"
                style={{
                  left: `${mouseX}px`,
                  height: `${totalHeight}px`,
                }}
              >
                <div className="h-full border-l-2 border-dashed border-blue-500 opacity-60" />
                <div
                  className="absolute bg-blue-600 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap"
                  style={{
                    left: '4px',
                    top: '40px',
                  }}
                >
                  {formatOffsetLabel(mouseTimeMin)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Tooltip détaillé pour l'inject survolé */}
      {hoveredInject && (
        <div
          ref={tooltipRef}
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-3 max-w-xs pointer-events-none"
          style={{
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="font-semibold text-gray-900 mb-1">{hoveredInject.title}</div>
          {hoveredInject.description && (
            <div className="text-sm text-gray-600 mb-2 line-clamp-2">{hoveredInject.description}</div>
          )}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <div className="text-gray-500">Type:</div>
            <div className="text-gray-900 font-medium">
              {BANK_KIND_CONFIG[resolveInjectBankKind(hoveredInject)]?.label || resolveInjectBankKind(hoveredInject)}
            </div>
            <div className="text-gray-500">Statut:</div>
            <div className="text-gray-900 font-medium">
              <span className={`inline-flex items-center gap-1`}>
                <span className={`w-2 h-2 rounded-full ${STATUS_CONFIG[hoveredInject.status]?.dot || 'bg-gray-400'}`} />
                {STATUS_CONFIG[hoveredInject.status]?.label || hoveredInject.status}
              </span>
            </div>
            <div className="text-gray-500">Temps:</div>
            <div className="text-gray-900 font-medium">{formatOffsetLabel(hoveredInject.time_offset)}</div>
            <div className="text-gray-500">Durée:</div>
            <div className="text-gray-900 font-medium">{hoveredInject.duration_min ?? 15} min</div>
            {hoveredInject.audiences?.[0] && (
              <>
                <div className="text-gray-500">Dest.:</div>
                <div className="text-gray-900 font-medium">
                  {(AUDIENCE_KIND_LABELS[hoveredInject.audiences[0].kind] ?? hoveredInject.audiences[0].kind)} {String(hoveredInject.audiences[0].value)}
                </div>
              </>
            )}
            {hoveredInject.phase_id && phases && (
              <>
                <div className="text-gray-500">Phase:</div>
                <div className="text-gray-900 font-medium">
                  {phases.find((p: ExercisePhase) => p.id === hoveredInject.phase_id)?.name || 'N/A'}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      
      {/* Légende */}
      {!compact && (
        <div className="flex flex-wrap gap-4">
          {legendKinds.map((kind) => {
            const cfg = BANK_KIND_CONFIG[kind] || { label: kind, bg: '#6b7280', color: '#374151' }
            return (
              <div key={kind} className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: cfg.bg }} />
                <span className="text-xs text-gray-600">{cfg.label}</span>
              </div>
            )
          })}
        </div>
      )}
      
      {/* Modal Edition */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={selectedInject ? 'Modifier l\'inject' : 'Nouvel inject'}
        maxWidthClassName="max-w-4xl"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label>
            <input
              type="text"
              value={editForm.title}
              onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Titre de l'inject"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            {/* Colonne 1 — métadonnées */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type (banque)</label>
                <select
                  value={editForm.bank_kind}
                  onChange={(e) => {
                    const kind = e.target.value as InjectBankKind
                    const injectType = BANK_KIND_TO_INJECT_TYPE[kind] || 'system'
                    setEditForm(f => ({ ...f, bank_kind: kind, type: injectType }))
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  {bankTypeOptions.map((opt) => (
                    <option key={opt.kind} value={opt.kind}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phase</label>
                <select
                  value={editForm.phase_id}
                  onChange={(e) => setEditForm(f => ({ ...f, phase_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Sans phase</option>
                  {phases?.map((p: ExercisePhase) => (
                    <option key={p.id} value={p.id.toString()}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">T+ (min)</label>
                  <input
                    type="number"
                    value={editForm.time_offset}
                    onChange={(e) => setEditForm(f => ({ ...f, time_offset: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="0, 30..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Durée (min)</label>
                  <input
                    type="number"
                    value={editForm.duration_min}
                    onChange={(e) => setEditForm(f => ({ ...f, duration_min: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    min="1"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Destinataire (type)</label>
                <select
                  value={editForm.recipient_kind}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      recipient_kind: e.target.value as RecipientKind,
                      recipient_value: '',
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                >
                  <option value="">Tout le monde</option>
                  <option value="user">Personne</option>
                  <option value="team">Equipe</option>
                  <option value="role">Role</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Destinataire (valeur)</label>
                {editForm.recipient_kind === 'user' ? (
                  <select
                    value={editForm.recipient_value}
                    onChange={(e) => setEditForm((f) => ({ ...f, recipient_value: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                  >
                    <option value="">-</option>
                    {exerciseUsers.map((u: any) => (
                      <option key={u.user_id} value={String(u.user_id)}>
                        {u.user_username} ({u.user_email})
                      </option>
                    ))}
                  </select>
                ) : editForm.recipient_kind === 'team' ? (
                  <select
                    value={editForm.recipient_value}
                    onChange={(e) => setEditForm((f) => ({ ...f, recipient_value: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                  >
                    <option value="">-</option>
                    {exerciseTeams.map((t: any) => (
                      <option key={t.id} value={String(t.id)}>{t.name}</option>
                    ))}
                  </select>
                ) : editForm.recipient_kind === 'role' ? (
                  <select
                    value={editForm.recipient_value}
                    onChange={(e) => setEditForm((f) => ({ ...f, recipient_value: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                  >
                    <option value="">-</option>
                    <option value="joueur">Joueur</option>
                    <option value="animateur">Animateur</option>
                    <option value="observateur">Observateur</option>
                  </select>
                ) : (
                  <input
                    value=""
                    disabled
                    placeholder="-"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-400"
                  />
                )}
              </div>
            </div>

            {/* Colonne 2 — format + description + contenu texte */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Format de donnee</label>
                <select
                  value={editForm.data_format}
                  onChange={(e) => {
                    setEditForm(f => ({ ...f, data_format: e.target.value as InjectDataFormat }))
                    setEditFormFile(null)
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                >
                  {Object.entries(DATA_FORMAT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contenu</label>
                <textarea
                  value={editForm.content_text}
                  onChange={(e) => setEditForm(f => ({ ...f, content_text: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
                />
              </div>
            </div>

            {/* Colonne 3 — fichier joint */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Fichier joint</label>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={
                  editForm.data_format === 'audio' ? 'audio/*' :
                  editForm.data_format === 'video' ? 'video/*' :
                  'image/*,.pdf'
                }
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) setEditFormFile(f)
                  e.target.value = ''
                }}
              />
              {editForm.data_format === 'text' ? (
                <div className="flex flex-col items-center justify-center gap-2 px-3 py-8 border-2 border-dashed border-gray-200 rounded-md text-gray-300 bg-gray-50 select-none">
                  <Upload size={22} />
                  <span className="text-xs text-center">Disponible pour les formats audio, vidéo et image</span>
                </div>
              ) : editFormFile ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 px-3 py-2 border border-green-300 bg-green-50 rounded-md">
                    <Upload size={14} className="text-green-600 shrink-0" />
                    <span className="text-sm text-green-800 truncate flex-1">{editFormFile.name}</span>
                    <button
                      type="button"
                      onClick={() => setEditFormFile(null)}
                      className="text-green-600 hover:text-red-500 shrink-0"
                      title="Retirer le fichier"
                    >
                      <XCircle size={16} />
                    </button>
                  </div>
                  <span className="text-xs text-gray-400 text-center">
                    {(editFormFile.size / 1024 / 1024).toFixed(1)} Mo
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    const f = e.dataTransfer.files?.[0]
                    if (f) setEditFormFile(f)
                  }}
                  className="w-full flex flex-col items-center gap-2 px-3 py-8 border-2 border-dashed border-gray-300 rounded-md text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors cursor-pointer"
                >
                  <Upload size={22} />
                  <span className="text-xs text-center leading-relaxed">
                    Déposer un fichier ici<br />
                    <span className="text-gray-300">ou cliquer pour sélectionner</span>
                  </span>
                  <span className="text-xs text-gray-300">
                    {editForm.data_format === 'audio' ? 'audio/*' : editForm.data_format === 'video' ? 'video/*' : 'image / PDF'}
                  </span>
                </button>
              )}
            </div>
          </div>
          
          <div className="flex justify-between gap-2 pt-2 border-t">
            <div className="flex gap-2">
              {selectedInject && (
                <>
                  <button
                    onClick={handleShowMedia}
                    className="px-3 py-2 text-sm bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                  >
                    <Film className="inline mr-1" size={14} />
                    Médias
                  </button>
                  {selectedInject.status !== 'sent' && (
                    <>
                      <button
                        onClick={() => sendMutation.mutate(selectedInject.id)}
                        className="px-3 py-2 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200"
                      >
                        <Send className="inline mr-1" size={14} />
                        Envoyer
                      </button>
                      <button
                        onClick={async () => {
                          if (await appDialog.confirm('Supprimer cet inject ?')) {
                            deleteMutation.mutate(selectedInject.id)
                          }
                        }}
                        className="px-3 py-2 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 text-sm bg-gray-100 rounded hover:bg-gray-200"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={!editForm.title.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {updateMutation.isPending || createMutation.isPending ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
            </div>
          </div>
        </div>
      </Modal>
      
      {/* Modal Banque d'injects */}
      <Modal
        isOpen={showBankModal}
        onClose={() => setShowBankModal(false)}
        title="Ajouter un inject depuis la banque"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rechercher</label>
              <input
                type="text"
                value={bankSearch}
                onChange={(e) => setBankSearch(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Titre, résumé, tags..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={bankKindFilter}
                onChange={(e) => setBankKindFilter(e.target.value as InjectBankKind | '')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Tous les types</option>
                {(bankKinds || BANK_KIND_ORDER_FALLBACK).map((kind) => (
                  <option key={kind} value={kind}>
                    {BANK_KIND_CONFIG[kind]?.label || kind}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="border rounded-md max-h-80 overflow-y-auto">
            {isFetchingBank ? (
              <div className="p-4 text-center text-gray-500">Chargement...</div>
            ) : (bankCatalog?.items?.length ?? 0) === 0 ? (
              <div className="p-4 text-center text-gray-500">Aucun élément trouvé</div>
            ) : (
              <div className="divide-y">
                {bankCatalog?.items?.map((item: InjectBankItem) => (
                  <div
                    key={item.id}
                    className={`p-3 cursor-pointer hover:bg-gray-50 ${
                      selectedBankItem?.id === item.id ? 'bg-indigo-50 border-l-4 border-indigo-500' : ''
                    }`}
                    onClick={() => setSelectedBankItem(item)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-gray-900">{item.title}</div>
                        {item.summary && (
                          <div className="text-sm text-gray-600 mt-0.5 line-clamp-2">{item.summary}</div>
                        )}
                        <div className="flex flex-wrap gap-1 mt-1">
                          <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                            {item.kind}
                          </span>
                          {item.category && (
                            <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                              {item.category}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {selectedBankItem && (
            <div className="p-3 bg-gray-50 rounded-md">
              <div className="text-sm font-medium text-gray-700 mb-1">Inject sélectionné :</div>
              <div className="text-gray-900">{selectedBankItem.title}</div>
              <div className="text-xs text-gray-500 mt-1">
                Sera positionné à T+{Math.floor(timeRange.startMin / 60)}h (sans phase) - déplaçable ensuite
              </div>
            </div>
          )}
          
          <div className="flex justify-end gap-2 pt-2 border-t">
            <button
              onClick={() => setShowBankModal(false)}
              className="px-4 py-2 text-sm bg-gray-100 rounded hover:bg-gray-200"
            >
              Annuler
            </button>
            <button
              onClick={() => selectedBankItem && createFromBankMutation.mutate(selectedBankItem)}
              disabled={!selectedBankItem || createFromBankMutation.isPending}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {createFromBankMutation.isPending ? 'Création...' : 'Ajouter à la timeline'}
            </button>
          </div>
        </div>
      </Modal>
      
      {/* Modal Edition Phase (double-clic) */}
      <Modal
        isOpen={showPhaseEditModal}
        onClose={() => setShowPhaseEditModal(false)}
        title="Importer des injects"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Coller le JSON généré par l'IA
            </label>
            <textarea
              value={phaseEditText}
              onChange={(e) => setPhaseEditText(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm bg-white text-gray-900"
              placeholder={`[
  {
    "title": "Titre de l'inject",
    "type": "mail",
    "time_offset": 5,
    "duration_min": 10,
    "phase_id": 1,
    "description": "Description",
    "content": { "text": "Contenu" }
  }
]`}
            />
          </div>
          <div className="text-xs text-gray-700 bg-blue-50 p-2 rounded">
            💡 Collez le JSON de vos injects ci-dessus puis cliquez sur "Importer".
          </div>
          {importError && (
            <div className="text-xs text-red-700 bg-red-50 p-2 rounded">
              {importError}
            </div>
          )}
          <div className="flex justify-between gap-2 pt-2 border-t">
            <div className="flex gap-2">
              {selectedPhaseId && selectedPhaseId > 0 && (
                <button
                  onClick={async () => {
                    const phaseInjects = injects.filter((i: Inject) => i.phase_id === selectedPhaseId)
                    if (phaseInjects.length === 0) {
                      await appDialog.alert('Cette phase ne contient aucun inject', { title: 'Information' })
                      return
                    }
                    if (await appDialog.confirm(`Supprimer tous les injects de cette phase ? (${phaseInjects.length} injects)`)) {
                      clearPhaseMutation.mutate(selectedPhaseId)
                    }
                  }}
                  disabled={clearPhaseMutation.isPending}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                >
                  <Eraser className="inline mr-1" size={14} />
                  Vider la phase
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowPhaseEditModal(false)
                  setImportError(null)
                  setPhaseEditText('')
                }}
                className="px-4 py-2 text-sm bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              >
                Fermer
              </button>
              <button
                onClick={handleImportInjects}
                disabled={!phaseEditText.trim() || importInjectsMutation.isPending}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                {importInjectsMutation.isPending ? 'Import...' : (
                  <>
                    <Download className="inline mr-1" size={14} />
                    Importer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </Modal>
      
      {/* Modal Médias */}
      <Modal
        isOpen={showMediaModal}
        onClose={() => setShowMediaModal(false)}
        title="Médias associés"
      >
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Médias attachés</h4>
            {injectMedia.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun média attaché</p>
            ) : (
              <div className="space-y-2">
                {injectMedia.map((m: Media) => (
                  <div key={m.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <span className="text-sm">{m.title || m.original_filename}</span>
                    <button
                      onClick={() => handleRemoveMedia(m.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <XCircle size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Ajouter un média</h4>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {allMedia?.media
                .filter((m: Media) => !injectMedia.find((im: Media) => im.id === m.id))
                .map((m: Media) => (
                  <button
                    key={m.id}
                    onClick={() => handleAddMediaToInject(m.id)}
                    className="w-full text-left p-2 hover:bg-gray-50 rounded text-sm"
                  >
                    {m.title || m.original_filename}
                  </button>
                ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
