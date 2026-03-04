import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { AlertCircle, ArrowLeft, CheckCircle2, CircleDashed, Clock3, FileDown, Gauge, PlayCircle, Plus, ShieldCheck, Trash2, Upload, Users } from 'lucide-react'
import AutoSaveIndicator, { AutoSaveStatus } from '../components/AutoSaveIndicator'
import {
  adminApi,
  crisisManagementApi,
  ExerciseImportComponent,
  ExercisePresetId,
  ExerciseRole,
  InjectBankKind,
  PluginInfo,
  TeamSummary,
  exerciseUsersApi,
  exercisesApi,
  injectBankApi,
  injectsApi,
  teamsApi,
  welcomeKitApi,
} from '../services/api'
import { INJECT_BANK_KIND_LABELS } from '../config/injectBank'
import { useInjectBankKinds } from '../hooks/useInjectBank'
import { simulatedApi } from '../services/simulatedApi'
import {
  buildTimelineExport,
  downloadJson,
} from '../schemas/exportUtils'
import TimelineGantt from '../components/exercise/TimelineGantt'
import { useAuthStore } from '../stores/authStore'
import Modal from '../components/Modal'
import SetupProgressHeader from '../components/exercise/SetupProgressHeader'
import SetupSectionCard from '../components/exercise/SetupSectionCard'
import PresetApplyModal from '../components/exercise/PresetApplyModal'
import ReadinessPanel from '../components/exercise/ReadinessPanel'
import {
  EXERCISE_PRESETS,
  getPresetById,
} from '../features/exercise-setup/presets'
import { applyPresetNonDestructive, buildPresetPreview } from '../features/exercise-setup/applyPreset'
import { computeExerciseSetupChecklist } from '../features/exercise-setup/completion'
import { downloadImportTemplate } from '../features/exercise-setup/importTemplates'
import { useAppDialog } from '../contexts/AppDialogContext'

const EXERCISE_TYPE_LABELS: Record<string, string> = {
  cyber: 'Cyber',
  it_outage: 'Panne IT',
  ransomware: 'Ransomware',
  mixed: 'Mixte',
}

const MATURITY_LABELS: Record<string, string> = {
  beginner: 'Debutant',
  intermediate: 'Intermediaire',
  expert: 'Expert',
}

const AXIS_LABELS: Record<string, string> = {
  technical: 'Technique',
  communication: 'Communication',
  legal: 'Juridique',
  political: 'Politique',
  media: 'Mediatique',
}

function toDatetimeLocal(date?: string | null): string {
  if (!date) return ''
  const parsed = new Date(date)
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  const hours = String(parsed.getHours()).padStart(2, '0')
  const minutes = String(parsed.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

const STEPS = [
  { id: 1, key: 'socle', label: 'Socle' },
  { id: 2, key: 'scenario', label: 'Scenario' },
  { id: 3, key: 'actors', label: 'Acteurs' },
  { id: 4, key: 'timelineInjects', label: 'Timeline & Injects' },
  { id: 5, key: 'simulators', label: 'Simulateurs' },
  { id: 6, key: 'validation', label: 'Validation & Lancement' },
] as const

const DEFAULT_SIMULATOR_CONFIG = {
  mail: 'INBOX, SENT',
  chat: 'METIER, TECHNIQUE, GENERAL',
  press: true,
  tv: true,
  sms: true,
  phone: true,
  social: true,
}

const DEFAULT_BANK_KIND_BY_COMPONENT: Record<ExerciseImportComponent, InjectBankKind> = {
  socle: 'scenario',
  scenario: 'scenario',
  actors: 'directory',
  timeline: 'chronogram',
  injects: 'mail',
  plugins: 'video',
  full: 'scenario',
}

const CHANNELS_MEDIA_COMPATIBLE_BANK_KINDS: InjectBankKind[] = [
  'video',
  'image',
  'social_post',
  'mail',
  'directory',
  'message',
  'reference_url',
  'document',
]

const BANK_CATEGORY_SUGGESTIONS = [
  'Canal press',
  'Canal ANSSI',
  'Canal gouvernement',
]

const DEFAULT_FAKE_SOCIAL_TRENDS = [
  {
    author_name: 'CyberWatch FR',
    author_handle: '@CyberWatchFR',
    is_verified: true,
    content: 'Plusieurs utilisateurs signalent des lenteurs et deconnexions sur les services clients. Incident localise ou panne plus large ? #IT #Incident',
    likes_count: 42,
    retweets_count: 18,
    replies_count: 11,
    views_count: 1800,
    is_breaking: true,
  },
  {
    author_name: 'Ops Radar',
    author_handle: '@opsradar',
    is_verified: false,
    content: 'Des rumeurs circulent sur une possible cyberattaque. Aucune confirmation officielle pour le moment. Les equipes techniques investiguent.',
    likes_count: 27,
    retweets_count: 9,
    replies_count: 14,
    views_count: 1200,
    is_breaking: false,
  },
  {
    author_name: 'ClientConcern',
    author_handle: '@ClientConcern',
    is_verified: false,
    content: 'Impossible d acceder a mon espace client depuis 20 min. Vous avez des infos ? #support #urgence',
    likes_count: 8,
    retweets_count: 2,
    replies_count: 6,
    views_count: 240,
    is_breaking: false,
  },
] as const

type SocleOption = {
  value: string
  label: string
}

type SocleChoiceGroupConfig = {
  key: 'exercise_type' | 'target_duration_hours' | 'maturity_level' | 'mode'
  label: string
  icon: LucideIcon
  options: SocleOption[]
}

const SOCLE_GROUPS: SocleChoiceGroupConfig[] = [
  {
    key: 'exercise_type',
    label: "Type d'exercice",
    icon: ShieldCheck,
    options: [
      { value: 'cyber', label: 'Cyber' },
      { value: 'it_outage', label: 'Panne IT' },
      { value: 'ransomware', label: 'Ransomware' },
      { value: 'mixed', label: 'Mixte' },
    ],
  },
  {
    key: 'target_duration_hours',
    label: 'Duree cible',
    icon: Clock3,
    options: [
      { value: '4', label: '4h' },
      { value: '8', label: '8h' },
      { value: '24', label: '24h' },
    ],
  },
  {
    key: 'maturity_level',
    label: 'Maturite',
    icon: Gauge,
    options: [
      { value: 'beginner', label: 'Debutant' },
      { value: 'intermediate', label: 'Intermediaire' },
      { value: 'expert', label: 'Expert' },
    ],
  },
  {
    key: 'mode',
    label: 'Mode',
    icon: PlayCircle,
    options: [
      { value: 'real_time', label: 'Temps reel' },
      { value: 'compressed', label: 'Compresse' },
      { value: 'simulated', label: 'Simule' },
    ],
  },
]

type OptionsPhaseConfig = {
  name: string
  enabled: boolean
}

const FALLBACK_PHASES_FROM_OPTIONS: OptionsPhaseConfig[] = [
  { name: 'Detection & Alerte', enabled: true },
  { name: 'Gestion de crise', enabled: true },
  { name: 'Recuperation & RETEX', enabled: true },
]

function parseEnabledPhasesFromOptions(raw: string | null | undefined): OptionsPhaseConfig[] {
  if (!raw) return FALLBACK_PHASES_FROM_OPTIONS
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return FALLBACK_PHASES_FROM_OPTIONS
    const enabled = parsed
      .filter((phase: any) => phase && typeof phase.name === 'string' && phase.enabled === true)
      .map((phase: any) => ({ name: phase.name, enabled: true }))
    return enabled.length > 0 ? enabled : FALLBACK_PHASES_FROM_OPTIONS
  } catch {
    return FALLBACK_PHASES_FROM_OPTIONS
  }
}

export default function ExerciseDetailPage() {
  const appDialog = useAppDialog()
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  const exerciseId = parseInt(id || '0', 10)
  const canConfigure = user?.role === 'admin' || user?.role === 'animateur'

  const [selectedPresetId, setSelectedPresetId] = useState<ExercisePresetId>('ransomware_4h')
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState(1)
  const [timelineSubTab, setTimelineSubTab] = useState<'objective' | 'business' | 'technical'>('objective')
  const [selectedActorForTeam, setSelectedActorForTeam] = useState<any | null>(null)
  const [selectedActorTeamId, setSelectedActorTeamId] = useState<string>('0')
  const [selectedExerciseTeamToAttach, setSelectedExerciseTeamToAttach] = useState<string>('')
  const [pendingImportComponent, setPendingImportComponent] = useState<ExerciseImportComponent>('socle')
  const [pendingBankComponent, setPendingBankComponent] = useState<ExerciseImportComponent>('scenario')
  const [isBankModalOpen, setIsBankModalOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const objectivesInitializedRef = useRef(false)
  const lastSavedObjectivesRef = useRef({
    business_objective: '',
    technical_objective: '',
  })
  const socleInitializedRef = useRef(false)
  const lastSavedSocleRef = useRef({
    name: '',
    exercise_type: 'cyber',
    target_duration_hours: '4',
    maturity_level: 'beginner',
    mode: 'real_time',
    planned_date: '',
  })
  const scenarioQuickInitializedRef = useRef(false)
  const lastSavedScenarioQuickRef = useRef({
    strategic_intent: '',
    initial_context: '',
  })

  const [socleSaveStatus, setSocleSaveStatus] = useState<AutoSaveStatus>('idle')
  const [scenarioQuickSaveStatus, setScenarioQuickSaveStatus] = useState<AutoSaveStatus>('idle')

  const [socleForm, setSocleForm] = useState({
    name: '',
    exercise_type: 'cyber',
    target_duration_hours: '4',
    maturity_level: 'beginner',
    mode: 'real_time',
    planned_date: '',
  })

  const [scenarioQuickForm, setScenarioQuickForm] = useState({
    strategic_intent: '',
    initial_context: '',
  })

  const [objectivesForm, setObjectivesForm] = useState({
    business_objective: '',
    technical_objective: '',
  })

  const [quickPhaseName, setQuickPhaseName] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [selectedRole, setSelectedRole] = useState<ExerciseRole>('joueur')
  const [actorSearch, setActorSearch] = useState('')
  const [actorRoleFilter, setActorRoleFilter] = useState<'all' | ExerciseRole>('all')
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null)
  const [bankKind, setBankKind] = useState<InjectBankKind>('scenario')
  const [bankCategory, setBankCategory] = useState('')
  const [bankLimit, setBankLimit] = useState(25)
  const [bankSearch, setBankSearch] = useState('')
  const [selectedBankItemIds, setSelectedBankItemIds] = useState<number[]>([])
  const [bankSelectionMode, setBankSelectionMode] = useState<'single' | 'multiple'>('multiple')

  // Simulator configuration state
  const [simulatorConfig, setSimulatorConfig] = useState({
    ...DEFAULT_SIMULATOR_CONFIG,
  })
  const simulatorConfigInitializedRef = useRef(false)
  const lastSavedSimulatorConfigRef = useRef({
    ...DEFAULT_SIMULATOR_CONFIG,
  })

  const { data: exercise, isLoading } = useQuery({
    queryKey: ['exercise', exerciseId],
    queryFn: () => exercisesApi.get(exerciseId),
    enabled: !!exerciseId,
  })

  const { data: scenario } = useQuery({
    queryKey: ['exercise-scenario', exerciseId],
    queryFn: () => crisisManagementApi.getScenario(exerciseId),
    enabled: !!exerciseId,
  })

  const { data: axes = [] } = useQuery({
    queryKey: ['exercise-axes', exerciseId],
    queryFn: () => crisisManagementApi.listEscalationAxes(exerciseId),
    enabled: !!exerciseId,
  })

  const { data: phases = [] } = useQuery({
    queryKey: ['exercise-phases', exerciseId],
    queryFn: () => crisisManagementApi.listPhases(exerciseId),
    enabled: !!exerciseId,
  })

  const { data: triggerRules = [] } = useQuery({
    queryKey: ['exercise-trigger-rules', exerciseId],
    queryFn: () => crisisManagementApi.listInjectTriggers(exerciseId),
    enabled: !!exerciseId,
  })

  const { data: injectsData } = useQuery({
    queryKey: ['exercise-injects', exerciseId],
    queryFn: () => injectsApi.list({ exercise_id: exerciseId, page: 1, page_size: 100 }),
    enabled: !!exerciseId,
  })

  const { data: exerciseUsersData } = useQuery({
    queryKey: ['exercise-users', exerciseId],
    queryFn: () => exerciseUsersApi.listExerciseUsers(exerciseId),
    enabled: !!exerciseId,
  })

  const { data: availableUsers = [] } = useQuery({
    queryKey: ['available-users', exerciseId],
    queryFn: () => exerciseUsersApi.getAvailableUsers(exerciseId),
    enabled: !!exerciseId && canConfigure,
  })

  const { data: teamsData } = useQuery({
    queryKey: ['teams', 'exercise-detail', exerciseId],
    queryFn: () => teamsApi.list({ page: 1, page_size: 200 }),
    enabled: !!exerciseId,
  })

  const { data: exerciseTeamsData } = useQuery({
    queryKey: ['exercise-teams', exerciseId],
    queryFn: () => exercisesApi.listTeams(exerciseId),
    enabled: !!exerciseId,
  })

  const { data: availablePlugins = [] } = useQuery({
    queryKey: ['available-plugins'],
    queryFn: exercisesApi.getAvailablePlugins,
    enabled: !!exerciseId,
  })

  const users = exerciseUsersData?.users || []
  const injects = injectsData?.injects || []
  const allTeams = teamsData?.teams || []
  const exerciseTeams = exerciseTeamsData?.teams || []
  const attachableTeams = allTeams.filter(
    (team: any) => !exerciseTeams.some((exerciseTeam: TeamSummary) => exerciseTeam.id === team.id)
  )
  const filteredUsers = useMemo(() => {
    const search = actorSearch.trim().toLowerCase()
    return users.filter((eu: any) => {
      const matchesRole = actorRoleFilter === 'all' || eu.role === actorRoleFilter
      if (!matchesRole) return false
      if (!search) return true
      const haystack = [
        eu.user_username,
        eu.user_email,
        eu.team_name,
        eu.role,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(search)
    })
  }, [users, actorSearch, actorRoleFilter])

  const { data: bankCatalog, isFetching: isFetchingBankCatalog } = useQuery({
    queryKey: ['inject-bank-catalog', isBankModalOpen, bankKind, bankCategory, bankSearch],
    queryFn: () =>
      injectBankApi.list({
        page: 1,
        page_size: 100,
        kind: bankKind,
        category: bankCategory || undefined,
        search: bankSearch || undefined,
        sort_by: 'updated_at',
        order: 'desc',
      }),
    enabled: isBankModalOpen,
  })

  const checklist = useMemo(() => {
    if (!exercise) return null
    return computeExerciseSetupChecklist({
      exercise,
      scenario: scenario || null,
      axes,
      users,
      phases,
      injects,
    })
  }, [exercise, scenario, axes, users, phases, injects])

  const selectedPreset = getPresetById(selectedPresetId)
  const availablePluginTypes = useMemo(
    () => new Set(availablePlugins.map((plugin) => plugin.type)),
    [availablePlugins]
  )

  const presetPreviewItems = useMemo(() => {
    if (!exercise) return []
    return buildPresetPreview(
      {
        exercise,
        scenario: scenario || null,
        axes,
        phases,
      },
      selectedPreset,
      availablePluginTypes
    )
  }, [exercise, scenario, axes, phases, selectedPreset, availablePluginTypes])

  useEffect(() => {
    if (!exercise) return
    const next = {
      name: exercise.name || '',
      exercise_type: exercise.exercise_type || 'cyber',
      target_duration_hours: String(exercise.target_duration_hours || 4),
      maturity_level: exercise.maturity_level || 'beginner',
      mode: exercise.mode || 'real_time',
      planned_date: toDatetimeLocal(exercise.planned_date),
    }
    setSocleForm(next)
    lastSavedSocleRef.current = next
    socleInitializedRef.current = true
  }, [exercise])

  useEffect(() => {
    if (!scenario) return
    const next = {
      strategic_intent: scenario.strategic_intent || '',
      initial_context: scenario.initial_context || '',
    }
    setScenarioQuickForm(next)
    lastSavedScenarioQuickRef.current = next
    scenarioQuickInitializedRef.current = true
  }, [scenario])

  useEffect(() => {
    if (!exercise) return
    const nextObjectives = {
      business_objective: exercise.business_objective || '',
      technical_objective: exercise.technical_objective || '',
    }
    setObjectivesForm(nextObjectives)
    lastSavedObjectivesRef.current = nextObjectives
    objectivesInitializedRef.current = true
  }, [exercise])

  useEffect(() => {
    if (!exercise) return
    const raw = (exercise as any).simulator_config
    let next = { ...DEFAULT_SIMULATOR_CONFIG }
    if (typeof raw === 'string' && raw.trim()) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          next = {
            mail: typeof parsed.mail === 'string' ? parsed.mail : DEFAULT_SIMULATOR_CONFIG.mail,
            chat: typeof parsed.chat === 'string' ? parsed.chat : DEFAULT_SIMULATOR_CONFIG.chat,
            press: typeof parsed.press === 'boolean' ? parsed.press : DEFAULT_SIMULATOR_CONFIG.press,
            tv: typeof parsed.tv === 'boolean' ? parsed.tv : DEFAULT_SIMULATOR_CONFIG.tv,
            sms: typeof parsed.sms === 'boolean' ? parsed.sms : DEFAULT_SIMULATOR_CONFIG.sms,
            phone: typeof parsed.phone === 'boolean' ? parsed.phone : DEFAULT_SIMULATOR_CONFIG.phone,
            social: typeof parsed.social === 'boolean' ? parsed.social : DEFAULT_SIMULATOR_CONFIG.social,
          }
        }
      } catch {
        // ignore malformed saved config and keep defaults
      }
    }
    setSimulatorConfig(next)
    lastSavedSimulatorConfigRef.current = next
    simulatorConfigInitializedRef.current = true
  }, [exercise])

  useEffect(() => {
    if (!feedbackMessage && !errorMessage) return
    const timer = setTimeout(() => {
      setFeedbackMessage(null)
      setErrorMessage(null)
    }, 4500)
    return () => clearTimeout(timer)
  }, [feedbackMessage, errorMessage])

  const lifecycleMutation = useMutation({
    mutationFn: async (action: 'start' | 'pause' | 'end' | 'restart') => {
      if (action === 'start') return exercisesApi.start(exerciseId)
      if (action === 'pause') return exercisesApi.pause(exerciseId)
      if (action === 'end') return exercisesApi.end(exerciseId)
      return exercisesApi.restart(exerciseId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] })
      setErrorMessage(null)
    },
    onError: (err: any) => {
      setErrorMessage(err.response?.data?.detail || 'Action impossible pour cet exercice.')
    },
  })

  const updateSocleMutation = useMutation({
    mutationFn: async () => {
      setSocleSaveStatus('saving')
      const payload: any = {
        name: socleForm.name,
        exercise_type: socleForm.exercise_type,
        target_duration_hours: parseInt(socleForm.target_duration_hours, 10),
        maturity_level: socleForm.maturity_level,
        mode: socleForm.mode,
      }
      if (socleForm.planned_date) payload.planned_date = new Date(socleForm.planned_date).toISOString()
      return exercisesApi.update(exerciseId, payload)
    },
    onSuccess: () => {
      lastSavedSocleRef.current = { ...socleForm }
      queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] })
      setSocleSaveStatus('saved')
      setTimeout(() => setSocleSaveStatus('idle'), 2000)
    },
    onError: (err: any) => {
      setSocleSaveStatus('error')
      setErrorMessage(err.response?.data?.detail || 'Impossible de sauvegarder le socle.')
    },
  })

  const updateScenarioQuickMutation = useMutation({
    mutationFn: async () => {
      setScenarioQuickSaveStatus('saving')
      const fallback = scenario || {
        exercise_id: exerciseId,
        strategic_intent: null,
        initial_context: null,
        initial_situation: null,
        implicit_hypotheses: null,
        hidden_brief: null,
        pedagogical_objectives: [],
        evaluation_criteria: [],
        stress_factors: [],
      }
      return crisisManagementApi.upsertScenario(exerciseId, {
        strategic_intent: scenarioQuickForm.strategic_intent,
        initial_context: scenarioQuickForm.initial_context,
        initial_situation: fallback.initial_situation,
        implicit_hypotheses: fallback.implicit_hypotheses,
        hidden_brief: fallback.hidden_brief,
        pedagogical_objectives: fallback.pedagogical_objectives,
        evaluation_criteria: fallback.evaluation_criteria,
        stress_factors: fallback.stress_factors,
      })
    },
    onSuccess: () => {
      lastSavedScenarioQuickRef.current = { ...scenarioQuickForm }
      queryClient.invalidateQueries({ queryKey: ['exercise-scenario', exerciseId] })
      setScenarioQuickSaveStatus('saved')
      setTimeout(() => setScenarioQuickSaveStatus('idle'), 2000)
    },
    onError: (err: any) => {
      setScenarioQuickSaveStatus('error')
      setErrorMessage(err.response?.data?.detail || 'Impossible de sauvegarder le scenario.')
    },
  })

  const updateObjectivesMutation = useMutation({
    mutationFn: async (values: { business_objective: string; technical_objective: string }) => {
      return exercisesApi.update(exerciseId, {
        business_objective: values.business_objective || undefined,
        technical_objective: values.technical_objective || undefined,
      })
    },
    onSuccess: (_data, variables) => {
      lastSavedObjectivesRef.current = variables
      queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] })
      setFeedbackMessage('Objectifs enregistres.')
    },
    onError: (err: any) => setErrorMessage(err.response?.data?.detail || 'Impossible de sauvegarder les objectifs.'),
  })

  useEffect(() => {
    if (!canConfigure || !exercise || !objectivesInitializedRef.current) return
    const current = {
      business_objective: objectivesForm.business_objective,
      technical_objective: objectivesForm.technical_objective,
    }
    const lastSaved = lastSavedObjectivesRef.current
    if (
      current.business_objective === lastSaved.business_objective &&
      current.technical_objective === lastSaved.technical_objective
    ) {
      return
    }

    const timer = window.setTimeout(() => {
      updateObjectivesMutation.mutate(current)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [
    canConfigure,
    exercise,
    objectivesForm.business_objective,
    objectivesForm.technical_objective,
  ])

  useEffect(() => {
    if (!canConfigure || !exercise || !socleInitializedRef.current) return
    const last = lastSavedSocleRef.current
    if (
      socleForm.name === last.name &&
      socleForm.exercise_type === last.exercise_type &&
      socleForm.target_duration_hours === last.target_duration_hours &&
      socleForm.maturity_level === last.maturity_level &&
      socleForm.mode === last.mode &&
      socleForm.planned_date === last.planned_date
    ) return
    const timer = window.setTimeout(() => {
      updateSocleMutation.mutate()
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [
    canConfigure,
    exercise,
    socleForm.name,
    socleForm.exercise_type,
    socleForm.target_duration_hours,
    socleForm.maturity_level,
    socleForm.mode,
    socleForm.planned_date,
  ])

  useEffect(() => {
    if (!canConfigure || !scenarioQuickInitializedRef.current) return
    const last = lastSavedScenarioQuickRef.current
    if (
      scenarioQuickForm.strategic_intent === last.strategic_intent &&
      scenarioQuickForm.initial_context === last.initial_context
    ) return
    const timer = window.setTimeout(() => {
      updateScenarioQuickMutation.mutate()
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [
    canConfigure,
    scenarioQuickForm.strategic_intent,
    scenarioQuickForm.initial_context,
  ])

  const addQuickPhaseMutation = useMutation({
    mutationFn: () =>
      crisisManagementApi.createPhase(exerciseId, {
        name: quickPhaseName,
        phase_order: phases.reduce((max, phase) => Math.max(max, phase.phase_order), 0) + 1,
      }),
    onSuccess: () => {
      setQuickPhaseName('')
      queryClient.invalidateQueries({ queryKey: ['exercise-phases', exerciseId] })
      setFeedbackMessage('Phase ajoutee.')
    },
    onError: (err: any) => setErrorMessage(err.response?.data?.detail || 'Impossible d ajouter la phase.'),
  })

  const assignUserMutation = useMutation({
    mutationFn: () =>
      exerciseUsersApi.assignUser(exerciseId, {
        user_id: selectedUserId!,
        role: selectedRole,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise-users', exerciseId] })
      queryClient.invalidateQueries({ queryKey: ['available-users', exerciseId] })
      setSelectedUserId(null)
      setSelectedRole('joueur')
      setFeedbackMessage('Participant ajoute.')
    },
    onError: (err: any) => setErrorMessage(err.response?.data?.detail || 'Impossible d ajouter ce participant.'),
  })

  const removeUserMutation = useMutation({
    mutationFn: (userId: number) => exerciseUsersApi.removeUser(exerciseId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise-users', exerciseId] })
      queryClient.invalidateQueries({ queryKey: ['available-users', exerciseId] })
      setFeedbackMessage('Participant retire.')
    },
    onError: (err: any) => setErrorMessage(err.response?.data?.detail || 'Impossible de retirer ce participant.'),
  })

  const updateActorTeamMutation = useMutation({
    mutationFn: ({ userId, teamId }: { userId: number; teamId: number | null }) =>
      exerciseUsersApi.updateUserRole(exerciseId, userId, { team_id: teamId ?? 0 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise-users', exerciseId] })
      setSelectedActorForTeam(null)
      setSelectedActorTeamId('0')
      setFeedbackMessage('Equipe du participant mise a jour.')
    },
    onError: (err: any) => setErrorMessage(err.response?.data?.detail || "Impossible d'affecter cette equipe."),
  })

  const updateActorRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: ExerciseRole }) =>
      exerciseUsersApi.updateUserRole(exerciseId, userId, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise-users', exerciseId] })
      setFeedbackMessage('Role du participant mis a jour.')
    },
    onError: (err: any) => setErrorMessage(err.response?.data?.detail || "Impossible de modifier ce role."),
  })

  const attachExerciseTeamMutation = useMutation({
    mutationFn: (teamId: number) => exercisesApi.attachTeam(exerciseId, teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise-teams', exerciseId] })
      setSelectedExerciseTeamToAttach('')
      setFeedbackMessage("Equipe rattachee a l'exercice.")
    },
    onError: (err: any) => setErrorMessage(err.response?.data?.detail || "Impossible de rattacher cette equipe."),
  })

  const detachExerciseTeamMutation = useMutation({
    mutationFn: (teamId: number) => exercisesApi.detachTeam(exerciseId, teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise-teams', exerciseId] })
      queryClient.invalidateQueries({ queryKey: ['exercise-users', exerciseId] })
      setFeedbackMessage("Equipe detachee de l'exercice.")
    },
    onError: (err: any) => setErrorMessage(err.response?.data?.detail || "Impossible de detacher cette equipe."),
  })

  const applyPresetMutation = useMutation({
    mutationFn: () => {
      if (!exercise) throw new Error('Exercise not loaded')
      return applyPresetNonDestructive(
        exerciseId,
        selectedPreset,
        { exercise, scenario: scenario || null, axes, phases },
        {
          updateExercise: exercisesApi.update,
          upsertScenario: crisisManagementApi.upsertScenario,
          createEscalationAxis: crisisManagementApi.createEscalationAxis,
          createPhase: crisisManagementApi.createPhase,
          togglePlugin: exercisesApi.togglePlugin,
        },
        availablePluginTypes
      )
    },
    onSuccess: (summary) => {
      setFeedbackMessage(
        `Ajoute: ${summary.addedPhases} phase(s), ${summary.enabledPlugins} plugin(s), ${summary.filledScenarioFields} champ(s) scenario.`
      )
      setIsPresetModalOpen(false)
      ;[
        ['exercise', exerciseId],
        ['exercise-scenario', exerciseId],
        ['exercise-axes', exerciseId],
        ['exercise-phases', exerciseId],
      ].forEach((queryKey) => queryClient.invalidateQueries({ queryKey }))
    },
    onError: (err: any) => setErrorMessage(err.response?.data?.detail || 'Echec de l application du preset.'),
  })

  // Simulator configuration mutation
  const updateSimulatorConfigMutation = useMutation({
    mutationFn: async (values: typeof simulatorConfig) => {
      return exercisesApi.update(exerciseId, {
        simulator_config: JSON.stringify(values),
      })
    },
    onSuccess: (_data, variables) => {
      lastSavedSimulatorConfigRef.current = variables
      queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] })
      setFeedbackMessage('Configuration des simulateurs enregistree.')
    },
    onError: (err: any) => setErrorMessage(err.response?.data?.detail || 'Impossible de sauvegarder la configuration des simulateurs.'),
  })

  const generateFakeSocialTrendsMutation = useMutation({
    mutationFn: async () => {
      const numericExerciseId = Number(exerciseId)
      if (!Number.isFinite(numericExerciseId)) {
        throw new Error('Identifiant exercice invalide')
      }
      for (const post of DEFAULT_FAKE_SOCIAL_TRENDS) {
        await simulatedApi.createSocialPostFromInject(numericExerciseId, {
          ...post,
          media_urls: [],
        })
      }
      return DEFAULT_FAKE_SOCIAL_TRENDS.length
    },
    onSuccess: async (count) => {
      queryClient.invalidateQueries({ queryKey: ['social-feed', exerciseId] })
      queryClient.invalidateQueries({ queryKey: ['simulated-social-feed', Number(exerciseId)] })
      setErrorMessage(null)
      setFeedbackMessage(`${count} trend(s) factice(s) generes sur le reseau social.`)
    },
    onError: async (err: any) => {
      const detail = err?.response?.data?.detail || err?.message || 'Generation des trends impossible.'
      setErrorMessage(detail)
      if (String(detail).includes('404') || String(detail).includes('Not Found')) {
        await appDialog.alert('Le endpoint de generation sociale est indisponible sur cette instance.')
      }
    },
  })

  useEffect(() => {
    if (!canConfigure || !exercise || !simulatorConfigInitializedRef.current) return
    const lastSaved = lastSavedSimulatorConfigRef.current
    const same =
      simulatorConfig.mail === lastSaved.mail &&
      simulatorConfig.chat === lastSaved.chat &&
      simulatorConfig.press === lastSaved.press &&
      simulatorConfig.tv === lastSaved.tv &&
      simulatorConfig.sms === lastSaved.sms &&
      simulatorConfig.phone === lastSaved.phone &&
      simulatorConfig.social === lastSaved.social
    if (same) return

    const next = { ...simulatorConfig }
    const timer = window.setTimeout(() => {
      updateSimulatorConfigMutation.mutate(next)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [
    canConfigure,
    exercise,
    simulatorConfig.mail,
    simulatorConfig.chat,
    simulatorConfig.press,
    simulatorConfig.tv,
    simulatorConfig.sms,
    simulatorConfig.phone,
    simulatorConfig.social,
  ])

  const importComponentMutation = useMutation({
    mutationFn: (params: { component: ExerciseImportComponent; file: File; teamRenameMap?: Record<string, string> }) =>
      crisisManagementApi.importComponent(exerciseId, params.component, params.file, false, {
        teamRenameMap: params.teamRenameMap,
      }),
    onSuccess: (data: any) => {
      const summary = data?.summary
      if (summary) {
        const usersInfo = (summary.users_created || summary.users_updated)
          ? `, +${summary.users_created || 0} user(s) crees, ${summary.users_updated || 0} user(s) maj`
          : ''
        setFeedbackMessage(
          `Import ${summary.component}: +${summary.injects_created || 0} inject(s), +${summary.phases_created || 0} phase(s), +${summary.actors_created || 0} acteur(s)${usersInfo}.`
        )
      } else {
        setFeedbackMessage('Import termine.')
      }
      ;[
        ['exercise', exerciseId],
        ['exercise-scenario', exerciseId],
        ['exercise-axes', exerciseId],
        ['exercise-users', exerciseId],
        ['exercise-teams', exerciseId],
        ['exercise-phases', exerciseId],
        ['exercise-injects', exerciseId],
      ].forEach((queryKey) => queryClient.invalidateQueries({ queryKey }))
    },
    onError: async (err: any, variables) => {
      const detail = err?.response?.data?.detail
      if (
        err?.response?.status === 409 &&
        (variables?.component === 'actors' || variables?.component === 'full') &&
        detail &&
        typeof detail === 'object' &&
        detail.code === 'TEAM_NAME_CONFLICT' &&
        typeof detail.team_name === 'string'
      ) {
        const renamed = await appDialog.prompt(
          `L'équipe "${detail.team_name}" existe deja. Entrez un nouveau nom pour l'import :`,
          {
            title: 'Renommage equipe',
            defaultValue: `${detail.team_name} (import)`,
            confirmLabel: 'Renommer',
          }
        )
        if (renamed && renamed.trim()) {
          importComponentMutation.mutate({
            ...variables,
            teamRenameMap: {
              ...(variables.teamRenameMap || {}),
              [detail.team_name]: renamed.trim(),
            },
          })
        }
        return
      }
      setErrorMessage(err.response?.data?.detail || 'Echec de l import.')
    },
  })

  const importFromBankMutation = useMutation({
    mutationFn: (params: {
      component: ExerciseImportComponent
      kind: InjectBankKind
      category?: string
      limit: number
    }) =>
      crisisManagementApi.importComponentFromBank(
        exerciseId,
        params.component,
        params.kind,
        params.category,
        params.limit
      ),
    onSuccess: (data: any) => {
      const summary = data?.summary
      if (summary) {
        setFeedbackMessage(
          `Import banque ${summary.component}: ${summary.items_used || 0} source(s), +${summary.injects_created || 0} inject(s), +${summary.phases_created || 0} phase(s).`
        )
      } else {
        setFeedbackMessage('Import banque termine.')
      }
      ;[
        ['exercise', exerciseId],
        ['exercise-scenario', exerciseId],
        ['exercise-axes', exerciseId],
        ['exercise-users', exerciseId],
        ['exercise-phases', exerciseId],
        ['exercise-injects', exerciseId],
      ].forEach((queryKey) => queryClient.invalidateQueries({ queryKey }))
    },
    onError: (err: any) => {
      setErrorMessage(err.response?.data?.detail || 'Echec de l import depuis la banque.')
    },
  })

  const resetPhasesFromOptionsMutation = useMutation({
    mutationFn: async () => {
      let phaseDefs = FALLBACK_PHASES_FROM_OPTIONS
      try {
        const config = await adminApi.getAppConfiguration()
        phaseDefs = parseEnabledPhasesFromOptions(config.default_phases_config)
      } catch {
        phaseDefs = FALLBACK_PHASES_FROM_OPTIONS
      }

      const existingPhases = await crisisManagementApi.listPhases(exerciseId)
      for (const phase of existingPhases) {
        await crisisManagementApi.deletePhase(exerciseId, phase.id)
      }

      for (let index = 0; index < phaseDefs.length; index += 1) {
        await crisisManagementApi.createPhase(exerciseId, {
          name: phaseDefs[index].name,
          phase_order: index + 1,
        })
      }

      return phaseDefs.length
    },
    onSuccess: (createdCount) => {
      ;[
        ['exercise-phases', exerciseId],
        ['exercise-injects', exerciseId],
        ['injects', exerciseId],
      ].forEach((queryKey) => queryClient.invalidateQueries({ queryKey }))
      setFeedbackMessage(`${createdCount} phase(s) reinitialisee(s) depuis les options.`)
    },
    onError: (err: any) => {
      setErrorMessage(err.response?.data?.detail || 'Impossible de reinitialiser les phases depuis les options.')
    },
  })

  const enabledPluginMap = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const plugin of exercise?.plugins || []) map.set(plugin.plugin_type, plugin.enabled)
    return map
  }, [exercise])

  const availableChannels = useMemo(() => {
    const byType = new Map<string, PluginInfo>()

    for (const plugin of availablePlugins) {
      byType.set(plugin.type, plugin)
    }

    for (const plugin of exercise?.plugins || []) {
      if (!byType.has(plugin.plugin_type) && plugin.info) {
        byType.set(plugin.plugin_type, {
          type: plugin.plugin_type,
          name: plugin.info.name,
          description: plugin.info.description,
          icon: plugin.info.icon,
          color: plugin.info.color,
          default_enabled: plugin.info.default_enabled,
          coming_soon: plugin.info.coming_soon,
          sort_order: plugin.info.sort_order,
        })
      }
    }

    return Array.from(byType.values()).sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
      return a.type.localeCompare(b.type)
    })
  }, [availablePlugins, exercise])

  const checklistSafe =
    checklist ||
    ({
      completedCount: 0,
      totalCount: 6,
      missingItems: [],
      sections: {
        socle: { status: 'todo', summary: '', completed: false },
        scenario: { status: 'todo', summary: '', completed: false },
        actors: { status: 'todo', summary: '', completed: false },
        timelineInjects: { status: 'todo', summary: '', completed: false },
        simulators: { status: 'todo', summary: '', completed: false },
        validation: { status: 'todo', summary: '', completed: false },
      },
    } as any)

  const handleStartWithGuard = () => {
    if (!checklist?.sections.validation.completed) {
      setErrorMessage('Exercice non pret: complete les sections bloquees avant le lancement.')
      return
    }
    lifecycleMutation.mutate('start')
  }

  const launchImportFor = (component: ExerciseImportComponent) => {
    setPendingImportComponent(component)
    fileInputRef.current?.click()
  }

  const openBankImportModal = (component: ExerciseImportComponent) => {
    setPendingBankComponent(component)
    const defaultKind = DEFAULT_BANK_KIND_BY_COMPONENT[component]
    const normalizedKind =
      component === 'plugins'
        ? (CHANNELS_MEDIA_COMPATIBLE_BANK_KINDS.includes(defaultKind)
          ? defaultKind
          : CHANNELS_MEDIA_COMPATIBLE_BANK_KINDS[0])
        : defaultKind
    setBankKind(normalizedKind)
    setBankCategory('')
    setBankLimit(25)
    setBankSearch('')
    setSelectedBankItemIds([])
    setBankSelectionMode('multiple')
    setIsBankModalOpen(true)
  }

  const onImportFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    importComponentMutation.mutate({ component: pendingImportComponent, file })
    event.target.value = ''
  }

  const isChannelEnabled = (channel: PluginInfo) => {
    return !!enabledPluginMap.get(channel.type)
  }

  const toggleChannel = async (channel: PluginInfo, enabled: boolean) => {
    try {
      setActiveChannelId(channel.type)
      await exercisesApi.togglePlugin(exerciseId, channel.type, enabled)
      await queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] })
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Impossible de mettre a jour ce canal.')
    } finally {
      setActiveChannelId(null)
    }
  }

  const socleOptionClass = (isActive: boolean) =>
    `rounded-md border px-2.5 py-1.5 text-sm font-medium transition ${
      isActive
        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-cyan-400 dark:bg-cyan-500/10 dark:text-cyan-200'
        : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-cyan-500'
    } ${!canConfigure ? 'cursor-not-allowed opacity-70' : ''}`

  useEffect(() => {
    const search = new URLSearchParams(location.search)
    const stepParam = Number(search.get('step'))
    if (Number.isInteger(stepParam) && stepParam >= 1 && stepParam <= STEPS.length) {
      setActiveStep(stepParam)
    }
  }, [location.search])

  if (isLoading) return <div className="text-center py-12">Chargement...</div>
  if (!exercise) return <div className="text-center py-12">Exercice non trouve</div>

  const autoTriggers = triggerRules.filter((rule) => rule.trigger_mode === 'auto').length
  const manualTriggers = triggerRules.filter((rule) => rule.trigger_mode === 'manual').length
  const conditionalTriggers = triggerRules.filter((rule) => rule.trigger_mode === 'conditional').length
  const timelineSectionStatus = checklistSafe.sections.timelineInjects.status
  const timelineStatusMeta =
    timelineSectionStatus === 'complete'
      ? {
          label: 'Complet',
          color: 'bg-emerald-100 text-emerald-800',
          icon: <CheckCircle2 size={14} />,
        }
      : timelineSectionStatus === 'partial'
        ? {
            label: 'Partiel',
            color: 'bg-amber-100 text-amber-800',
            icon: <AlertCircle size={14} />,
          }
        : {
            label: 'A faire',
            color: 'bg-gray-100 text-gray-700',
            icon: <CircleDashed size={14} />,
          }

  return (
    <div className="flex flex-col gap-2 -mt-2">
      <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={onImportFileChange} />

      {feedbackMessage && <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm">{feedbackMessage}</div>}
      {errorMessage && (
        <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      <SetupProgressHeader
        name={exercise.name}
        status={exercise.status}
        plannedDate={exercise.planned_date}
        exerciseType={EXERCISE_TYPE_LABELS[exercise.exercise_type] || exercise.exercise_type}
        targetDurationHours={exercise.target_duration_hours}
        maturityLevel={MATURITY_LABELS[exercise.maturity_level] || exercise.maturity_level}
        completedCount={checklistSafe.completedCount}
        totalCount={checklistSafe.totalCount}
        backAction={
          <button onClick={() => navigate('/exercises')} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
            <ArrowLeft className="mr-1" size={14} /> Retour aux exercices
          </button>
        }
        actions={
          canConfigure ? (
            <div className="flex flex-wrap items-center gap-2 justify-end">
              <AutoSaveIndicator status={activeStep === 2 ? scenarioQuickSaveStatus : socleSaveStatus} />
              {exercise.status === 'running' && (
                <>
                  <button onClick={() => lifecycleMutation.mutate('pause')} disabled={lifecycleMutation.isPending} className="px-4 py-2 bg-amber-500 text-white rounded-lg shadow-sm hover:bg-amber-600 disabled:opacity-50">Pause</button>
                  <button onClick={() => lifecycleMutation.mutate('end')} disabled={lifecycleMutation.isPending} className="px-4 py-2 bg-red-600 text-white rounded-lg shadow-sm hover:bg-red-700 disabled:opacity-50">Terminer</button>
                </>
              )}
              {exercise.status === 'paused' && (
                <>
                  <button onClick={() => lifecycleMutation.mutate('start')} disabled={lifecycleMutation.isPending} className="px-4 py-2 bg-emerald-600 text-white rounded-lg shadow-sm hover:bg-emerald-700 disabled:opacity-50">Reprendre</button>
                  <button onClick={() => lifecycleMutation.mutate('end')} disabled={lifecycleMutation.isPending} className="px-4 py-2 bg-red-600 text-white rounded-lg shadow-sm hover:bg-red-700 disabled:opacity-50">Terminer</button>
                </>
              )}
              {(exercise.status === 'completed' || exercise.status === 'archived') && (
                <button onClick={() => lifecycleMutation.mutate('restart')} disabled={lifecycleMutation.isPending} className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 disabled:opacity-50">Relancer</button>
              )}
            </div>
          ) : undefined
        }
      />

      <div className="bg-gradient-to-r from-white via-blue-50 to-cyan-50 rounded-xl shadow-md p-4 border border-blue-100">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          {STEPS.map((step) => (
            <button
              key={step.id}
              type="button"
              onClick={() => setActiveStep(step.id)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${
                activeStep === step.id
                  ? 'bg-blue-700 text-white shadow border border-blue-700'
                  : 'bg-transparent text-slate-800 border border-slate-200 hover:border-blue-300 hover:text-blue-700'
              }`}
            >
              {step.id}. {step.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {activeStep === 1 && (
          <SetupSectionCard
            step={1}
            title="Socle"
            status={checklistSafe.sections.socle.status}
            summary={checklistSafe.sections.socle.summary}
            action={
              canConfigure ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => openBankImportModal('socle')} disabled={importFromBankMutation.isPending} className="inline-flex items-center px-3 py-2 bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50">
                    Banque/type
                  </button>
                  <AutoSaveIndicator status={socleSaveStatus} />
                </div>
              ) : undefined
            }
          >
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Nom de l'exercice</label>
                  <input
                    value={socleForm.name}
                    onChange={(e) => setSocleForm((prev) => ({ ...prev, name: e.target.value }))}
                    disabled={!canConfigure}
                    placeholder="Renseigner le nom"
                    className="mt-1.5 w-full px-3 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 disabled:bg-slate-100 dark:disabled:bg-slate-700"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Date prevue</label>
                  <input
                    type="datetime-local"
                    value={socleForm.planned_date}
                    onChange={(e) => setSocleForm((prev) => ({ ...prev, planned_date: e.target.value }))}
                    disabled={!canConfigure}
                    className="mt-1.5 w-full px-3 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 disabled:bg-slate-100 dark:disabled:bg-slate-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {SOCLE_GROUPS.map((group) => {
                  const Icon = group.icon
                  return (
                    <div key={group.key} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-3">
                      <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                        <Icon size={16} className="text-blue-600 dark:text-cyan-300" />
                        {group.label}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {group.options.map((opt) => {
                          const selected = socleForm[group.key] === opt.value
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              disabled={!canConfigure}
                              aria-pressed={selected}
                              onClick={() => canConfigure && setSocleForm((prev) => ({ ...prev, [group.key]: opt.value }))}
                              className={socleOptionClass(selected)}
                            >
                              {opt.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </SetupSectionCard>
        )}

        {activeStep === 2 && (
          <SetupSectionCard
            step={2}
            title="Scenario"
            description="Intention, contexte et axes d'escalade"
            status={checklistSafe.sections.scenario.status}
            summary={checklistSafe.sections.scenario.summary}
            action={
              canConfigure ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => openBankImportModal('scenario')} disabled={importFromBankMutation.isPending} className="inline-flex items-center px-3 py-2 bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50">Banque/type</button>
                  <AutoSaveIndicator status={scenarioQuickSaveStatus} />
                </div>
              ) : undefined
            }
            advancedLink={{ to: `/exercises/${exerciseId}/scenario`, label: 'Ouvrir le scenario complet' }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <textarea rows={3} value={scenarioQuickForm.strategic_intent} onChange={(e) => setScenarioQuickForm((prev) => ({ ...prev, strategic_intent: e.target.value }))} disabled={!canConfigure} placeholder="Intention strategique" className="px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50" />
              <textarea rows={3} value={scenarioQuickForm.initial_context} onChange={(e) => setScenarioQuickForm((prev) => ({ ...prev, initial_context: e.target.value }))} disabled={!canConfigure} placeholder="Contexte initial" className="px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50" />
            </div>
            <div className="mt-3">
              <div className="text-sm font-medium text-gray-800 mb-2">Axes d'escalade ({axes.length})</div>
              <div className="border border-gray-200 rounded-md overflow-hidden">
                <div className="grid grid-cols-12 bg-slate-50 text-xs font-semibold text-slate-700 px-3 py-2">
                  <div className="col-span-4">Axe</div>
                  <div className="col-span-2">Intensite</div>
                  <div className="col-span-6">Notes</div>
                </div>
                {axes.length === 0 && (
                  <div className="px-3 py-2 text-sm text-slate-500">Aucun axe defini.</div>
                )}
                {axes.map((axis: any) => (
                  <div key={axis.id} className="grid grid-cols-12 px-3 py-2 text-sm border-t border-gray-100">
                    <div className="col-span-4 text-slate-800">{AXIS_LABELS[axis.axis_type] || axis.axis_type}</div>
                    <div className="col-span-2 text-slate-700">{axis.intensity}/10</div>
                    <div className="col-span-6 text-slate-600">{axis.notes || '-'}</div>
                  </div>
                ))}
              </div>
            </div>
          </SetupSectionCard>
        )}

        {activeStep === 3 && (
          <SetupSectionCard
            step={3}
            title="Acteurs"
            description="Participants, roles et acces"
            status={checklistSafe.sections.actors.status}
            summary={checklistSafe.sections.actors.summary}
            action={canConfigure ? <div className="flex items-center gap-2"><button onClick={() => launchImportFor('actors')} className="inline-flex items-center px-3 py-2 bg-slate-100 border border-slate-300 text-slate-800 rounded hover:bg-slate-200"><Upload size={14} className="mr-1" /> Import</button><button onClick={() => downloadImportTemplate('actors')} className="inline-flex items-center px-3 py-2 bg-white border border-slate-300 text-slate-800 rounded hover:bg-slate-50">Exemple JSON</button><button onClick={() => openBankImportModal('actors')} disabled={importFromBankMutation.isPending} className="inline-flex items-center px-3 py-2 bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50">Banque/type</button><div className="relative group"><button className="inline-flex items-center px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"><FileDown size={14} className="mr-1" /> Kit bienvenue</button><div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10"><button onClick={async () => { try { await welcomeKitApi.ensurePasswords(exerciseId); const blob = await welcomeKitApi.downloadAllKits(exerciseId, 'player'); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `kits-joueurs-${exerciseId}.pdf`; a.click(); URL.revokeObjectURL(url); setFeedbackMessage('Kits joueurs téléchargés.'); } catch (err: any) { setErrorMessage(err.response?.data?.detail || 'Erreur génération kits joueurs.'); } }} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"><Users size={14} className="inline mr-2" /> Joueurs</button><button onClick={async () => { try { await welcomeKitApi.ensurePasswords(exerciseId); const blob = await welcomeKitApi.downloadAllKits(exerciseId, 'facilitator'); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `kits-animateurs-${exerciseId}.pdf`; a.click(); URL.revokeObjectURL(url); setFeedbackMessage('Kits animateurs téléchargés.'); } catch (err: any) { setErrorMessage(err.response?.data?.detail || 'Erreur génération kits animateurs.'); } }} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"><Users size={14} className="inline mr-2" /> Animateurs</button></div></div></div> : undefined}
          >
            {canConfigure && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
                <select value={selectedUserId || ''} onChange={(e) => setSelectedUserId(e.target.value ? parseInt(e.target.value, 10) : null)} className="px-3 py-2 border border-gray-300 rounded-md md:col-span-2">
                  <option value="">Choisir un utilisateur</option>
                  {availableUsers.filter((available: any) => !available.already_assigned).map((available: any) => (<option key={available.id} value={available.id}>{available.username} ({available.email})</option>))}
                </select>
                <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value as ExerciseRole)} className="px-3 py-2 border border-gray-300 rounded-md">
                  <option value="joueur">Joueur</option><option value="animateur">Animateur</option><option value="observateur">Observateur</option>
                </select>
                <button onClick={() => selectedUserId && assignUserMutation.mutate()} disabled={!selectedUserId || assignUserMutation.isPending} className="inline-flex items-center justify-center px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"><Plus size={14} className="mr-1" /> Ajouter</button>
              </div>
            )}
            <div className="mb-4 p-3 border border-slate-200 rounded-md bg-slate-50">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900">Equipes rattachees a l'exercice ({exerciseTeams.length})</div>
                  <p className="text-xs text-slate-600 mt-1">
                    Les equipes listees ici peuvent etre affectees aux acteurs de cet exercice.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {exerciseTeams.length === 0 && (
                      <span className="text-xs text-slate-500">Aucune equipe rattachee.</span>
                    )}
                    {exerciseTeams.map((team: TeamSummary) => (
                      <span
                        key={team.id}
                        className="inline-flex items-center gap-2 px-2 py-1 rounded border bg-white text-xs text-slate-700"
                      >
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full border border-white shadow-sm"
                          style={{ backgroundColor: team.color || '#64748b' }}
                        />
                        {team.name}
                        {canConfigure && (
                          <button
                            type="button"
                            onClick={() => detachExerciseTeamMutation.mutate(team.id)}
                            disabled={detachExerciseTeamMutation.isPending}
                            className="text-red-700 hover:text-red-800 disabled:opacity-50"
                            title="Detacher l'equipe de l'exercice"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
                {canConfigure && (
                  <div className="w-full md:w-80 shrink-0">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Rattacher une equipe existante</label>
                    <div className="flex gap-2">
                      <select
                        value={selectedExerciseTeamToAttach}
                        onChange={(e) => setSelectedExerciseTeamToAttach(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-slate-900 text-sm"
                      >
                        <option value="" className="text-slate-900 bg-white">Choisir une equipe</option>
                        {attachableTeams.map((team: any) => (
                          <option key={team.id} value={String(team.id)} className="text-slate-900 bg-white">
                            {team.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          selectedExerciseTeamToAttach &&
                          attachExerciseTeamMutation.mutate(parseInt(selectedExerciseTeamToAttach, 10))
                        }
                        disabled={!selectedExerciseTeamToAttach || attachExerciseTeamMutation.isPending}
                        className="inline-flex items-center px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Plus size={14} className="mr-1" /> Rattacher
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={actorSearch}
                  onChange={(e) => setActorSearch(e.target.value)}
                  placeholder="Rechercher (nom, email, equipe)"
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm md:col-span-2"
                />
                <select
                  value={actorRoleFilter}
                  onChange={(e) => setActorRoleFilter(e.target.value as 'all' | ExerciseRole)}
                  className="px-3 py-2 border border-gray-300 rounded-md bg-white text-slate-900 text-sm"
                >
                  <option value="all">Tous les roles</option>
                  <option value="joueur">Joueurs</option>
                  <option value="animateur">Animateurs</option>
                  <option value="observateur">Observateurs</option>
                </select>
              </div>
              <div className="text-xs text-gray-500">
                {filteredUsers.length} / {users.length} participant(s)
              </div>
              {users.length === 0 && <div className="text-sm text-gray-500">Aucun participant assigne.</div>}
              {users.length > 0 && filteredUsers.length === 0 && (
                <div className="text-sm text-gray-500">Aucun resultat pour ce filtre.</div>
              )}
              {filteredUsers.map((eu: any) => (
                <div
                  key={eu.id}
                  className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100 rounded-md cursor-pointer hover:bg-slate-50"
                  onClick={() => {
                    if (!canConfigure) return
                    setSelectedActorForTeam(eu)
                    setSelectedActorTeamId(eu.team_id ? String(eu.team_id) : '0')
                  }}
                >
                  <div className="text-sm text-gray-700">
                    <div className="font-medium text-gray-900">{eu.user_username}</div>
                    <div>{eu.role} - {eu.user_email}</div>
                    <div className="mt-1">
                      {eu.team_name ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-xs font-medium text-blue-700">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
                          {eu.team_name}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-xs text-gray-500">
                          Aucune equipe
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canConfigure && (
                      <select
                        value={eu.role}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          updateActorRoleMutation.mutate({
                            userId: eu.user_id,
                            role: e.target.value as ExerciseRole,
                          })
                        }
                        disabled={updateActorRoleMutation.isPending}
                        className="px-2 py-1 border border-gray-300 rounded bg-white text-slate-900 text-xs"
                        title="Role dans l'exercice"
                      >
                        <option value="joueur">Joueur</option>
                        <option value="animateur">Animateur</option>
                        <option value="observateur">Observateur</option>
                      </select>
                    )}
                    {canConfigure && <button onClick={(e) => { e.stopPropagation(); removeUserMutation.mutate(eu.user_id) }} className="text-red-700 hover:text-red-800" title="Retirer"><Trash2 size={15} /></button>}
                  </div>
                </div>
              ))}
            </div>
          </SetupSectionCard>
        )}

        {activeStep === 4 && (
          <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
            <div className="p-3 border-b border-gray-200">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-900 text-white text-sm font-semibold">
                      4
                    </span>
                    <h2 className="text-lg font-semibold text-gray-900">Timeline & Injects</h2>
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${timelineStatusMeta.color}`}>
                      {timelineStatusMeta.icon}
                      {timelineStatusMeta.label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    Phases: {phases.length} | Injects: {injects.length} | {autoTriggers} auto, {manualTriggers} manuels, {conditionalTriggers} conditionnels
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {canConfigure && (
                    <>
                      <span className="text-xs text-gray-500">Import:</span>
                      <button onClick={() => launchImportFor('timeline')} className="inline-flex items-center px-2 py-1 text-xs bg-slate-100 border border-slate-200 text-slate-700 rounded hover:bg-slate-200">
                        <Upload size={12} className="mr-1" /> Timeline
                      </button>
                      <button onClick={() => launchImportFor('injects')} className="inline-flex items-center px-2 py-1 text-xs bg-slate-100 border border-slate-200 text-slate-700 rounded hover:bg-slate-200">
                        <Upload size={12} className="mr-1" /> Injects
                      </button>
                      <span className="text-xs text-gray-500 ml-2">Export:</span>
                      <button 
                        onClick={() => {
                          const exportData = buildTimelineExport(exerciseId, 'all', injects, phases)
                          downloadJson(exportData, `timeline_all_exercise_${exerciseId}_${new Date().toISOString().split('T')[0]}.json`)
                          setFeedbackMessage('Timeline exportée.')
                        }}
                        className="inline-flex items-center px-2 py-1 text-xs bg-emerald-100 border border-emerald-200 text-emerald-700 rounded hover:bg-emerald-200"
                      >
                        <FileDown size={12} className="mr-1" /> Timeline
                      </button>
                      <button
                        onClick={async () => {
                          if (resetPhasesFromOptionsMutation.isPending) return
                          const confirmed = await appDialog.confirm('Reinitialiser les phases de cet exercice depuis la configuration Options ?')
                          if (!confirmed) return
                          resetPhasesFromOptionsMutation.mutate()
                        }}
                        disabled={resetPhasesFromOptionsMutation.isPending}
                        className="inline-flex items-center px-2 py-1 text-xs bg-rose-100 border border-rose-200 text-rose-700 rounded hover:bg-rose-200 disabled:opacity-50"
                      >
                        {resetPhasesFromOptionsMutation.isPending ? 'Reset...' : 'Reset phases'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="px-3 pt-3 border-b border-gray-100 bg-slate-50">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setTimelineSubTab('objective')}
                  className={`px-3 py-1.5 text-sm rounded border ${
                    timelineSubTab === 'objective'
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-transparent text-slate-700 border-slate-300 hover:border-slate-400'
                  }`}
                >
                  Objectif
                </button>
                <button
                  onClick={() => setTimelineSubTab('business')}
                  className={`px-3 py-1.5 text-sm rounded border ${
                    timelineSubTab === 'business'
                      ? 'bg-blue-700 text-white border-blue-700'
                      : 'bg-transparent text-slate-700 border-slate-300 hover:border-slate-400'
                  }`}
                >
                  Timeline métier
                </button>
                <button
                  onClick={() => setTimelineSubTab('technical')}
                  className={`px-3 py-1.5 text-sm rounded border ${
                    timelineSubTab === 'technical'
                      ? 'bg-orange-700 text-white border-orange-700'
                      : 'bg-transparent text-slate-700 border-slate-300 hover:border-slate-400'
                  }`}
                >
                  Timeline Technique
                </button>
              </div>
            </div>

            {timelineSubTab === 'objective' && (
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-800">Objectifs de l'exercice</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Objectif métier à couvrir</label>
                    <textarea
                      rows={10}
                      value={objectivesForm.business_objective}
                      onChange={(e) => setObjectivesForm((prev) => ({ ...prev, business_objective: e.target.value }))}
                      placeholder="Décrivez l'objectif métier principal de cet exercice..."
                      disabled={!canConfigure}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Objectif technique</label>
                    <textarea
                      rows={10}
                      value={objectivesForm.technical_objective}
                      onChange={(e) => setObjectivesForm((prev) => ({ ...prev, technical_objective: e.target.value }))}
                      placeholder="Décrivez l'objectif technique de cet exercice..."
                      disabled={!canConfigure}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-50"
                    />
                  </div>
                </div>
              </div>
            )}

            {(timelineSubTab === 'business' || timelineSubTab === 'technical') && (
              <div className="p-3">
                <TimelineGantt
                  key={`timeline-${timelineSubTab}`}
                  exerciseId={exerciseId}
                  targetDurationHours={exercise?.target_duration_hours ?? 4}
                  showFullscreenLink={false}
                  compact={false}
                  initialTimelineType={timelineSubTab}
                  showTimelineTypeTabs={false}
                  businessObjective={exercise?.business_objective}
                  technicalObjective={exercise?.technical_objective}
                  showTimeGrainSelector={false}
                />
              </div>
            )}
          </div>
        )}

        {activeStep === 5 && (
          <SetupSectionCard
            step={5}
            title="Simulateurs"
            description="Configuration des canaux de simulation"
            status={checklistSafe.sections.simulators?.status || 'todo'}
            summary={checklistSafe.sections.simulators?.summary || ''}
            action={undefined}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Mail Configuration */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Mail - Noms de répertoires</label>
                <input
                  value={simulatorConfig.mail}
                  onChange={(e) => setSimulatorConfig(prev => ({ ...prev, mail: e.target.value }))}
                  disabled={!canConfigure}
                  placeholder="ex: canal_press, canal_anssi, canal_gouvernement"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50"
                />
              </div>

              {/* Chat Configuration */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Chat - Noms de rooms</label>
                <input
                  value={simulatorConfig.chat}
                  onChange={(e) => setSimulatorConfig(prev => ({ ...prev, chat: e.target.value }))}
                  disabled={!canConfigure}
                  placeholder="ex: room1, room2, room3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50"
                />
              </div>

              {/* Toggle switches */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={simulatorConfig.press}
                    onChange={(e) => setSimulatorConfig(prev => ({ ...prev, press: e.target.checked }))}
                    disabled={!canConfigure}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label className="text-sm font-medium text-gray-700">Press</label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={simulatorConfig.tv}
                    onChange={(e) => setSimulatorConfig(prev => ({ ...prev, tv: e.target.checked }))}
                    disabled={!canConfigure}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label className="text-sm font-medium text-gray-700">TV</label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={simulatorConfig.sms}
                    onChange={(e) => setSimulatorConfig(prev => ({ ...prev, sms: e.target.checked }))}
                    disabled={!canConfigure}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label className="text-sm font-medium text-gray-700">SMS</label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={simulatorConfig.phone}
                    onChange={(e) => setSimulatorConfig(prev => ({ ...prev, phone: e.target.checked }))}
                    disabled={!canConfigure}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label className="text-sm font-medium text-gray-700">Phone</label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={simulatorConfig.social}
                    onChange={(e) => setSimulatorConfig(prev => ({ ...prev, social: e.target.checked }))}
                    disabled={!canConfigure}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label className="text-sm font-medium text-gray-700">Réseau social</label>
                </div>
              </div>

            </div>
          </SetupSectionCard>
        )}

        {activeStep === 6 && (
          <SetupSectionCard
            step={6}
            title="Validation & Lancement"
            description="Controle des points bloquants avant execution"
            status={checklistSafe.sections.validation.status}
            summary={checklistSafe.sections.validation.summary}
            action={undefined}
            advancedLink={{ to: `/exercises/${exerciseId}/evaluation`, label: 'Ouvrir evaluation et RETEX' }}
          >
            <ReadinessPanel
              status={exercise.status}
              isReady={checklistSafe.sections.validation.completed}
              missingItems={checklistSafe.missingItems}
              canConfigure={canConfigure}
              isActionPending={lifecycleMutation.isPending}
              liveUrl={`/exercises/${exerciseId}/live`}
              onStart={handleStartWithGuard}
              onPause={() => lifecycleMutation.mutate('pause')}
              onResume={() => lifecycleMutation.mutate('start')}
              onEnd={() => lifecycleMutation.mutate('end')}
              onRestart={() => lifecycleMutation.mutate('restart')}
            />
          </SetupSectionCard>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setActiveStep((prev) => Math.max(1, prev - 1))}
          disabled={activeStep === 1}
          className="px-4 py-2 bg-slate-100 border border-slate-300 text-slate-800 rounded hover:bg-slate-200 disabled:opacity-40"
        >
          Precedent
        </button>
        <button
          onClick={() => setActiveStep((prev) => Math.min(6, prev + 1))}
          disabled={activeStep === 6}
          className="px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-900 disabled:opacity-40"
        >
          Suivant
        </button>
      </div>

      <PresetApplyModal
        isOpen={isPresetModalOpen}
        presetName={selectedPreset.name}
        previewItems={presetPreviewItems}
        isApplying={applyPresetMutation.isPending}
        onClose={() => setIsPresetModalOpen(false)}
        onConfirm={() => applyPresetMutation.mutate()}
      />

      <Modal
        isOpen={isBankModalOpen}
        onClose={() => setIsBankModalOpen(false)}
        title={`Import banque/type - ${pendingBankComponent}`}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type de source (kind)</label>
            {pendingBankComponent === 'plugins' ? (
              <select
                value={bankKind}
                onChange={(e) => setBankKind(e.target.value as InjectBankKind)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-slate-800 text-sm"
              >
                {CHANNELS_MEDIA_COMPATIBLE_BANK_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {INJECT_BANK_KIND_LABELS[kind]} ({kind})
                  </option>
                ))}
              </select>
            ) : (
              <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-slate-50 text-slate-800 text-sm">
                {bankKind} (preset de l'etape)
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mode de selection</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setBankSelectionMode('single')
                  setSelectedBankItemIds((prev) => (prev.length > 0 ? [prev[0]] : prev))
                }}
                className={`px-3 py-2 border rounded text-sm ${bankSelectionMode === 'single' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'}`}
              >
                Unitaire
              </button>
              <button
                type="button"
                onClick={() => setBankSelectionMode('multiple')}
                className={`px-3 py-2 border rounded text-sm ${bankSelectionMode === 'multiple' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'}`}
              >
                Multiple
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categorie (optionnel)</label>
            <input
              value={bankCategory}
              onChange={(e) => setBankCategory(e.target.value)}
              list="bank-import-category-suggestions"
              placeholder="ex: communication"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
            <datalist id="bank-import-category-suggestions">
              {BANK_CATEGORY_SUGGESTIONS.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Recherche catalogue</label>
            <input
              value={bankSearch}
              onChange={(e) => setBankSearch(e.target.value)}
              placeholder="Titre, resume, tags..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Limite d'import</label>
            <input
              type="number"
              min={1}
              max={200}
              value={bankLimit}
              onChange={(e) => setBankLimit(Math.min(200, Math.max(1, parseInt(e.target.value || '25', 10))))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div className="border rounded-md max-h-64 overflow-auto">
            <div className="p-2 border-b bg-slate-50 flex items-center justify-between text-xs text-slate-600">
              <span>{isFetchingBankCatalog ? 'Chargement catalogue...' : `${bankCatalog?.items?.length || 0} element(s)`}</span>
              <button
                type="button"
                onClick={() => {
                  const ids = (bankCatalog?.items || []).slice(0, bankLimit).map((item) => item.id)
                  setSelectedBankItemIds(ids)
                }}
                className="px-2 py-1 border border-slate-300 rounded bg-white text-slate-700 hover:bg-slate-100"
              >
                Selectionner la page
              </button>
            </div>
            <div className="divide-y">
              {(bankCatalog?.items || []).slice(0, bankLimit).map((item) => {
                const checked = selectedBankItemIds.includes(item.id)
                return (
                  <label key={item.id} className="flex items-start gap-2 p-2 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          if (bankSelectionMode === 'single') {
                            setSelectedBankItemIds([item.id])
                          } else {
                            setSelectedBankItemIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]))
                          }
                        } else {
                          setSelectedBankItemIds((prev) => prev.filter((id) => id !== item.id))
                        }
                      }}
                      className="mt-1"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{item.title}</div>
                      <div className="text-xs text-slate-600">{item.kind}{item.category ? ` - ${item.category}` : ''}</div>
                      {item.summary && <div className="text-xs text-slate-500 line-clamp-2">{item.summary}</div>}
                    </div>
                  </label>
                )
              })}
              {!isFetchingBankCatalog && (bankCatalog?.items || []).length === 0 && (
                <div className="p-3 text-sm text-slate-500">Aucun element dans ce filtre.</div>
              )}
            </div>
          </div>
          <div className="text-xs text-slate-600">
            IDs selectionnes: {selectedBankItemIds.length > 0 ? selectedBankItemIds.join(',') : 'aucun'}
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setIsBankModalOpen(false)}
              className="px-3 py-2 border border-slate-300 bg-white text-slate-800 rounded hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              onClick={() =>
                crisisManagementApi.importComponentFromBankSelection(
                  exerciseId,
                  pendingBankComponent,
                  selectedBankItemIds
                ).then(() => {
                  ;[
                    ['exercise', exerciseId],
                    ['exercise-scenario', exerciseId],
                    ['exercise-axes', exerciseId],
                    ['exercise-users', exerciseId],
                    ['exercise-teams', exerciseId],
                    ['exercise-phases', exerciseId],
                    ['exercise-injects', exerciseId],
                  ].forEach((queryKey) => queryClient.invalidateQueries({ queryKey }))
                  setFeedbackMessage(`Import catalogue: ${selectedBankItemIds.length} element(s) selectionne(s).`)
                  setIsBankModalOpen(false)
                }).catch((err: any) => {
                  setErrorMessage(err.response?.data?.detail || 'Echec de l import depuis le catalogue.')
                })
              }
              disabled={importFromBankMutation.isPending || selectedBankItemIds.length === 0}
              className="px-3 py-2 bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50"
            >
              Importer la selection
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!selectedActorForTeam}
        onClose={() => {
          setSelectedActorForTeam(null)
          setSelectedActorTeamId('0')
        }}
        title="Affecter une equipe a l'acteur"
      >
        <div className="space-y-4">
          <div className="text-sm text-gray-700">
            <div className="font-medium text-gray-900">{selectedActorForTeam?.user_username}</div>
            <div>{selectedActorForTeam?.role} - {selectedActorForTeam?.user_email}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Equipe</label>
            <select
              value={selectedActorTeamId}
              onChange={(e) => setSelectedActorTeamId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-slate-900"
            >
              <option value="0" className="text-slate-900 bg-white">Aucune equipe</option>
              {exerciseTeams.map((team: TeamSummary) => (
                <option key={team.id} value={team.id} className="text-slate-900 bg-white">{team.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Utilise le bloc "Equipes rattachees a l&apos;exercice" ci-dessus si l&apos;equipe n&apos;apparait pas ici.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedActorForTeam(null)
                setSelectedActorTeamId('0')
              }}
              className="px-3 py-2 border border-gray-300 bg-white text-gray-700 rounded hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={!selectedActorForTeam || updateActorTeamMutation.isPending}
              onClick={() =>
                selectedActorForTeam &&
                updateActorTeamMutation.mutate({
                  userId: selectedActorForTeam.user_id,
                  teamId: selectedActorTeamId === '0' ? null : parseInt(selectedActorTeamId, 10),
                })
              }
              className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {updateActorTeamMutation.isPending ? 'Enregistrement...' : 'Valider'}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  )
}
