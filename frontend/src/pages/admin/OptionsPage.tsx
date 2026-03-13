import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useAutoSaveStore } from '../../stores/autoSaveStore'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, exercisesApi, PluginConfiguration, AppConfiguration, PluginType, ApiKeyItem, ApiKeyCreated, PlaceholderItem, Exercise } from '../../services/api'
import { Check, Loader2, Puzzle, Shield, Mail, Building2, Clock, Key, Download, Upload, Eye, EyeOff, Copy, RefreshCw, Trash2, Plus, MessageSquare, Phone, Share2, Tv, FileText, Monitor, FileType2, Volume2, Video, Image, Braces } from 'lucide-react'
import { useAppDialog } from '../../contexts/AppDialogContext'
import { useAuthStore } from '../../stores/authStore'
import ThemeModeSelector from '../../components/ThemeModeSelector'
import LangSelector from '../../components/LangSelector'
import { DEFAULT_PHASES_LIST, PHASE_PRESETS, PhasePresetKey } from '../../features/phasePresets'
import SimulatorsTab from '../../components/options/SimulatorsTab'
import PhasePicker from '../../components/PhasePicker'
import LoadingScreen from '../../components/LoadingScreen'
import { getSimulatorPluginCodes, getInjectTypeToSimulatorMap } from '../../plugins/registry'

const COLORS = [
  { value: 'green', label: 'Vert', class: 'bg-green-500' },
  { value: 'blue', label: 'Bleu', class: 'bg-primary-500' },
  { value: 'purple', label: 'Violet', class: 'bg-purple-500' },
  { value: 'teal', label: 'Turquoise', class: 'bg-teal-500' },
  { value: 'gray', label: 'Gris', class: 'bg-gray-500' },
  { value: 'red', label: 'Rouge', class: 'bg-red-500' },
  { value: 'orange', label: 'Orange', class: 'bg-orange-500' },
  { value: 'yellow', label: 'Jaune', class: 'bg-yellow-500' },
]

const ICONS = [
  'BookOpen', 'Twitter', 'Tv', 'Mail', 'MessageCircle', 
  'Newspaper', 'MessageSquare', 'Landmark', 'Shield', 'Box'
]

type ExerciseTypeOption = { value: string; label: string }

const DEFAULT_EXERCISE_TYPE_OPTIONS: ExerciseTypeOption[] = [
  { value: 'cyber', label: 'Cyber' },
  { value: 'it_outage', label: 'Panne IT' },
  { value: 'ransomware', label: 'Ransomware' },
  { value: 'mixed', label: 'Mixte' },
]

const DEFAULT_EXERCISE_DURATION_OPTIONS = [4, 8, 24, 48]

const DEFAULT_CRISIS_CELL_ROLES = [
  { role: 'crisis_director', name: 'Directeur de crise', responsibility: 'Décision stratégique et pilotage global' },
  { role: 'deputy_director', name: 'Directeur adjoint', responsibility: 'Coordination et suivi des décisions' },
  { role: 'cell_secretary', name: 'Secrétaire de cellule', responsibility: 'Main courante et traçabilité' },
  { role: 'situation_manager', name: 'Responsable situation', responsibility: 'Analyse et synthèse de la situation' },
  { role: 'operations_manager', name: 'Responsable opérations', responsibility: 'Pilotage des actions de réponse' },
  { role: 'communication_manager', name: 'Responsable communication', responsibility: 'Communication interne et externe' },
  { role: 'legal_advisor', name: 'Responsable juridique', responsibility: 'Gestion des obligations réglementaires' },
  { role: 'business_representative', name: 'Responsable métier', responsibility: 'Continuité d\'activité' },
]

type ExercisesSubTab = 'general' | 'organisation' | 'inject_types' | 'sources' | 'timelines'

type OrganizationAutofillField =
  | 'organization_description'
  | 'organization_reference_url'
  | 'organization_keywords'
  | 'organization_logo_url'

const ORGANIZATION_AUTOFILL_FIELDS: OrganizationAutofillField[] = [
  'organization_description',
  'organization_reference_url',
  'organization_keywords',
  'organization_logo_url',
]

const ORGANIZATION_AUTOFILL_FIELD_HINTS: [RegExp, OrganizationAutofillField][] = [
  [/description/i, 'organization_description'],
  [/url/i, 'organization_reference_url'],
  [/keywords|mots[- ]?clés|tags?/i, 'organization_keywords'],
  [/logo/i, 'organization_logo_url'],
]

const ORGANIZATION_FIELD_LABELS: Record<OrganizationAutofillField, string> = {
  organization_description: 'Description',
  organization_reference_url: 'URL de référence',
  organization_keywords: 'Mots-clés',
  organization_logo_url: 'Logo',
}

const sanitizeAutofillValue = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  const text = typeof value === 'string' ? value : String(value)
  const trimmed = text.trim()
  return trimmed.length > 0 ? trimmed : null
}


const normalizeApiErrorDetail = (error: any): string => {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') {
    const reasons = Array.isArray(detail.reasons) ? ` (${detail.reasons.join(', ')})` : ''
    const msg = typeof detail.message === 'string' ? detail.message : 'Erreur API'
    return `${msg}${reasons}`
  }
  return error?.message || 'Erreur inconnue'
}


const extractJsonPayloadFromText = (text: string): Record<string, unknown> | null => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || start >= end) return null
  const candidate = text.slice(start, end + 1)
  try {
    return JSON.parse(candidate)
  } catch {
    return null
  }
}

const parseOrganizationAutofillResponse = (
  rawText: string
): Partial<Record<OrganizationAutofillField, string>> | null => {
  const text = rawText?.trim()
  if (!text) return null

  const jsonPayload = extractJsonPayloadFromText(text)
  const parsedFromJson: Partial<Record<OrganizationAutofillField, string>> = {}
  if (jsonPayload) {
    ORGANIZATION_AUTOFILL_FIELDS.forEach((field) => {
      const value = sanitizeAutofillValue(jsonPayload[field])
      if (value) {
        parsedFromJson[field] = value
      }
    })
    if (Object.keys(parsedFromJson).length > 0) {
      return parsedFromJson
    }
  }

  const parsedFromLines: Partial<Record<OrganizationAutofillField, string>> = {}
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const cleaned = line.trim()
    if (!cleaned) continue
    const parts = cleaned.split(':')
    if (parts.length < 2) continue
    const keyPart = parts[0].trim().toLowerCase()
    const valuePart = parts.slice(1).join(':').trim()
    if (!valuePart) continue
    const match = ORGANIZATION_AUTOFILL_FIELD_HINTS.find(([regex]) => regex.test(keyPart))
    if (!match) continue
    const [, field] = match
    const value = sanitizeAutofillValue(valuePart)
    if (value) {
      parsedFromLines[field] = value
    }
  }

  return Object.keys(parsedFromLines).length > 0 ? parsedFromLines : null
}

const normalizeExerciseTypeValue = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

type TabType = 'exercises' | 'plugins' | 'security' | 'timelines' | 'placeholders'
type PhasePreset = PhasePresetKey
type TimelinePhaseTypeFormat = { type: string; formats: string[]; simulator: string | null }
// TimelineSettingsTab removed — phases shown directly, inject_types and sources moved to exercises tab
type TimelineSourceCategory = 'Press' | 'TV' | 'Gouvernement'
type TimelineSourceItem = {
  id: string
  country: string
  category: TimelineSourceCategory
  name: string
}
type TimelineCustomSourceItem = TimelineSourceItem

const TIMELINE_ALLOWED_FORMATS = ['TXT', 'AUDIO', 'VIDEO', 'IMAGE'] as const
type TimelineAllowedFormat = (typeof TIMELINE_ALLOWED_FORMATS)[number]
const TIMELINE_SIMULATOR_PLUGIN_TYPES = getSimulatorPluginCodes()

const TIMELINE_DEFAULT_SIMULATOR_BY_TYPE: Record<string, string> = getInjectTypeToSimulatorMap()

/** Canonical type keys — timeline-inject-item.schema.json enum values (story and directory are bank-only). */
const TIMELINE_INJECT_TYPE_LABELS: Record<string, string> = {
  mail: 'Email',
  sms: 'SMS',
  call: 'Appel téléphonique',
  socialnet: 'Réseau social',
  tv: 'TV',
  doc: 'Document',
  system: 'Système',
}

const TIMELINE_INJECT_TYPE_ICONS: Record<string, React.ElementType> = {
  mail: Mail,
  sms: MessageSquare,
  call: Phone,
  socialnet: Share2,
  tv: Tv,
  doc: FileText,
  system: Monitor,
}

const TIMELINE_INJECT_TYPE_COLORS: Record<string, { bg: string; border: string; icon: string; accent: string }> = {
  mail:      { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   icon: 'text-blue-400',   accent: 'bg-blue-500' },
  sms:       { bg: 'bg-green-500/10',  border: 'border-green-500/30',  icon: 'text-green-400',  accent: 'bg-green-500' },
  call:      { bg: 'bg-emerald-500/10',border: 'border-emerald-500/30',icon: 'text-emerald-400',accent: 'bg-emerald-500' },
  socialnet: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', icon: 'text-purple-400', accent: 'bg-purple-500' },
  tv:        { bg: 'bg-red-500/10',    border: 'border-red-500/30',    icon: 'text-red-400',    accent: 'bg-red-500' },
  doc:       { bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  icon: 'text-amber-400',  accent: 'bg-amber-500' },
  system:    { bg: 'bg-gray-500/10',   border: 'border-gray-500/30',   icon: 'text-gray-400',   accent: 'bg-gray-500' },
}

const FORMAT_ICONS: Record<string, React.ElementType> = {
  TXT:   FileType2,
  AUDIO: Volume2,
  VIDEO: Video,
  IMAGE: Image,
}

const FORMAT_COLORS: Record<string, { active: string; inactive: string }> = {
  TXT:   { active: 'bg-sky-600 text-white border-sky-600',     inactive: 'bg-gray-800 text-gray-500 border-gray-700 hover:border-sky-700 hover:text-sky-400' },
  AUDIO: { active: 'bg-emerald-600 text-white border-emerald-600', inactive: 'bg-gray-800 text-gray-500 border-gray-700 hover:border-emerald-700 hover:text-emerald-400' },
  VIDEO: { active: 'bg-violet-600 text-white border-violet-600',  inactive: 'bg-gray-800 text-gray-500 border-gray-700 hover:border-violet-700 hover:text-violet-400' },
  IMAGE: { active: 'bg-rose-600 text-white border-rose-600',    inactive: 'bg-gray-800 text-gray-500 border-gray-700 hover:border-rose-700 hover:text-rose-400' },
}

/** Formats supportés par le LLM OpenAI pour la génération de contenu (TXT, IMAGE via DALL-E, AUDIO via TTS — pas de VIDEO). */
const DEFAULT_TIMELINE_PHASE_TYPE_FORMATS: TimelinePhaseTypeFormat[] = [
  { type: 'mail', formats: ['TXT', 'IMAGE'], simulator: 'mailbox' },
  { type: 'sms', formats: ['TXT', 'IMAGE'], simulator: 'sms' },
  { type: 'call', formats: ['TXT', 'AUDIO'], simulator: null },
  { type: 'socialnet', formats: ['TXT', 'IMAGE'], simulator: 'social_internal' },
  { type: 'tv', formats: ['TXT', 'IMAGE', 'AUDIO'], simulator: 'tv' },
  { type: 'doc', formats: ['TXT', 'IMAGE'], simulator: 'mailbox' },
]

const TIMELINE_ALLOWED_INJECT_TYPE_NAMES = new Set(
  DEFAULT_TIMELINE_PHASE_TYPE_FORMATS.map((item) => item.type)
)

const normalizeTimelineTypeFormatRows = (rows: TimelinePhaseTypeFormat[]): TimelinePhaseTypeFormat[] => {
  const rowsByType = new Map<string, TimelinePhaseTypeFormat>()
  for (const row of rows) {
    const key = String(row.type || '').trim().toLowerCase()
    if (!TIMELINE_ALLOWED_INJECT_TYPE_NAMES.has(key) || rowsByType.has(key)) {
      continue
    }
    rowsByType.set(key, row)
  }

  return DEFAULT_TIMELINE_PHASE_TYPE_FORMATS.map((defaultRow) => {
    const sourceRow = rowsByType.get(defaultRow.type)
    const formats = sourceRow?.formats?.filter((format): format is TimelineAllowedFormat =>
      TIMELINE_ALLOWED_FORMATS.includes(format as TimelineAllowedFormat)
    ) || []
    const simulator =
      typeof sourceRow?.simulator === 'string' &&
      TIMELINE_SIMULATOR_PLUGIN_TYPES.has(sourceRow.simulator)
        ? sourceRow.simulator
        : defaultRow.simulator

    return {
      type: defaultRow.type,
      formats: formats.length > 0 ? Array.from(new Set(formats)) : defaultRow.formats,
      simulator,
    }
  })
}

const TIMELINE_SOURCE_CATEGORY_ORDER: TimelineSourceCategory[] = ['Press', 'TV', 'Gouvernement']

const TIMELINE_SOURCES_CATALOG: TimelineSourceItem[] = [
  { id: 'fr-press-lemonde', country: 'France', category: 'Press', name: 'Le Monde' },
  { id: 'fr-press-lefigaro', country: 'France', category: 'Press', name: 'Le Figaro' },
  { id: 'fr-tv-france24', country: 'France', category: 'TV', name: 'France 24' },
  { id: 'fr-tv-bfmtv', country: 'France', category: 'TV', name: 'BFM TV' },
  { id: 'fr-gov-gouvernement', country: 'France', category: 'Gouvernement', name: 'Gouvernement.fr' },
  { id: 'fr-gov-anssi', country: 'France', category: 'Gouvernement', name: 'ANSSI' },

  { id: 'us-press-nyt', country: 'États-Unis', category: 'Press', name: 'The New York Times' },
  { id: 'us-press-wp', country: 'États-Unis', category: 'Press', name: 'The Washington Post' },
  { id: 'us-tv-cnn', country: 'États-Unis', category: 'TV', name: 'CNN' },
  { id: 'us-tv-foxnews', country: 'États-Unis', category: 'TV', name: 'Fox News' },
  { id: 'us-gov-cisa', country: 'États-Unis', category: 'Gouvernement', name: 'CISA' },
  { id: 'us-gov-whitehouse', country: 'États-Unis', category: 'Gouvernement', name: 'The White House' },

  { id: 'de-press-spiegel', country: 'Allemagne', category: 'Press', name: 'Der Spiegel' },
  { id: 'de-press-faz', country: 'Allemagne', category: 'Press', name: 'FAZ' },
  { id: 'de-tv-dw', country: 'Allemagne', category: 'TV', name: 'DW' },
  { id: 'de-tv-zdf', country: 'Allemagne', category: 'TV', name: 'ZDF' },
  { id: 'de-gov-bsi', country: 'Allemagne', category: 'Gouvernement', name: 'BSI' },
  { id: 'de-gov-bundesregierung', country: 'Allemagne', category: 'Gouvernement', name: 'Bundesregierung' },

  { id: 'es-press-pais', country: 'Espagne', category: 'Press', name: 'El País' },
  { id: 'es-press-mundo', country: 'Espagne', category: 'Press', name: 'El Mundo' },
  { id: 'es-tv-rtve', country: 'Espagne', category: 'TV', name: 'RTVE' },
  { id: 'es-tv-antena3', country: 'Espagne', category: 'TV', name: 'Antena 3' },
  { id: 'es-gov-incibe', country: 'Espagne', category: 'Gouvernement', name: 'INCIBE' },
  { id: 'es-gov-lamoncloa', country: 'Espagne', category: 'Gouvernement', name: 'La Moncloa' },

  { id: 'uk-press-bbcnews', country: 'Royaume-Uni', category: 'Press', name: 'BBC News' },
  { id: 'uk-press-guardian', country: 'Royaume-Uni', category: 'Press', name: 'The Guardian' },
  { id: 'uk-tv-skynews', country: 'Royaume-Uni', category: 'TV', name: 'Sky News' },
  { id: 'uk-tv-bbcone', country: 'Royaume-Uni', category: 'TV', name: 'BBC One' },
  { id: 'uk-gov-ncsc', country: 'Royaume-Uni', category: 'Gouvernement', name: 'NCSC' },
  { id: 'uk-gov-govuk', country: 'Royaume-Uni', category: 'Gouvernement', name: 'GOV.UK' },
]

const COUNTRY_FLAGS: Record<string, string> = {
  'France': '🇫🇷',
  'États-Unis': '🇺🇸',
  'Allemagne': '🇩🇪',
  'Espagne': '🇪🇸',
  'Royaume-Uni': '🇬🇧',
}

export default function OptionsPage() {
  const { t } = useTranslation()
  const appDialog = useAppDialog()
  const queryClient = useQueryClient()
  const tenant = useAuthStore((state) => state.user?.tenant ?? null)
  const [activeTab, setActiveTab] = useState<TabType>('exercises')
  const [exercisesSubTab, setExercisesSubTab] = useState<ExercisesSubTab>('general')
  const [newExerciseTypeLabel, setNewExerciseTypeLabel] = useState('')
  const [newExerciseTypeValue, setNewExerciseTypeValue] = useState('')
  const [newExerciseDuration, setNewExerciseDuration] = useState('')
  const [timelineSourceDrafts, setTimelineSourceDrafts] = useState<Record<string, string>>({})
  const [selectedSourceCountry, setSelectedSourceCountry] = useState<string>('')
  const importFileInputRef = useRef<HTMLInputElement | null>(null)
  const organizationAutofillFileInputRef = useRef<HTMLInputElement | null>(null)
  
  // Plugin editing state
  const [editingPlugin, setEditingPlugin] = useState<PluginType | null>(null)
  const [editedPluginData, setEditedPluginData] = useState<Partial<PluginConfiguration>>({})
  const [savingPlugins, setSavingPlugins] = useState<Set<PluginType>>(new Set())
  
  // App config editing state
  const [editedAppConfig, setEditedAppConfig] = useState<Partial<AppConfiguration>>({})
  const [appConfigAutosaveError, setAppConfigAutosaveError] = useState<string | null>(null)
  const [lastAppConfigSavedAt, setLastAppConfigSavedAt] = useState<number | null>(null)
  const appConfigChanged = Object.keys(editedAppConfig).length > 0
  const [isExportingOptions, setIsExportingOptions] = useState(false)
  const [isImportingOptions, setIsImportingOptions] = useState(false)
  
  // API key state
  const [newKeyName, setNewKeyName] = useState('')
  const [justCreatedKey, setJustCreatedKey] = useState<ApiKeyCreated | null>(null)
  const [showJustCreated, setShowJustCreated] = useState(false)
  const [copiedKeyId, setCopiedKeyId] = useState<number | null>(null)

  // Export options state
  const [showExportOptions, setShowExportOptions] = useState(false)
  const [exportOptions, setExportOptions] = useState({
    appConfiguration: true,
    plugins: true,
    crisisContacts: true,
    injectBank: true,
    exerciseTemplates: true,
  })
  const lastFailedAppConfigAutosaveSignatureRef = useRef<string | null>(null)

  // Fetch app configuration
  const { data: appConfig, isLoading: appConfigLoading, error: appConfigError } = useQuery({
    queryKey: ['app-configuration'],
    queryFn: adminApi.getAppConfiguration,
  })

  // Fetch plugin configurations
  const { data: plugins, isLoading: pluginsLoading, error: pluginsError } = useQuery({
    queryKey: ['plugin-configurations'],
    queryFn: adminApi.getPluginConfigurations,
  })

  // Update app config mutation
  const updateAppConfigMutation = useMutation({
    mutationFn: (data: Partial<AppConfiguration>) => adminApi.updateAppConfiguration(data),
    onSuccess: (data, variables) => {
      // Immediately update the cache so getAppConfigValue falls back to
      // fresh data when we clean up editedAppConfig below (avoids flicker
      // between cleanup and background refetch completing).
      queryClient.setQueryData(['app-configuration'], data)
      queryClient.invalidateQueries({ queryKey: ['app-configuration'] })
      queryClient.invalidateQueries({ queryKey: ['public-configuration'] })
      setEditedAppConfig((prev) => {
        const next = { ...prev }
        for (const [key, value] of Object.entries(variables || {})) {
          const typedKey = key as keyof AppConfiguration
          if (Object.is(next[typedKey], value)) {
            delete next[typedKey]
          }
        }
        return next
      })
    },
  })

  // Update plugin mutation
  const updatePluginMutation = useMutation({
    mutationFn: ({ pluginType, data }: { pluginType: PluginType; data: Partial<PluginConfiguration> }) =>
      adminApi.updatePluginConfiguration(pluginType, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugin-configurations'] })
    },
  })

  // Reset plugins mutation
  const resetPluginsMutation = useMutation({
    mutationFn: adminApi.resetPluginConfigurations,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugin-configurations'] })
      setEditingPlugin(null)
      setEditedPluginData({})
    },
  })

  // API keys list
  const { data: apiKeys, refetch: refetchApiKeys } = useQuery({
    queryKey: ['api-keys'],
    queryFn: adminApi.listApiKeys,
  })

  // Placeholders
  const [placeholderExerciseId, setPlaceholderExerciseId] = useState<number | undefined>(undefined)
  const { data: placeholderExercises } = useQuery({
    queryKey: ['exercises-list-for-placeholders'],
    queryFn: () => exercisesApi.list({ page_size: 100 }),
    enabled: activeTab === 'placeholders',
  })
  const { data: placeholders, isLoading: placeholdersLoading, refetch: refetchPlaceholders, isFetching: placeholdersFetching } = useQuery({
    queryKey: ['placeholders', placeholderExerciseId],
    queryFn: () => adminApi.getPlaceholders(placeholderExerciseId),
    enabled: activeTab === 'placeholders',
  })
  const [copiedPlaceholder, setCopiedPlaceholder] = useState<string | null>(null)
  const handleCopyPlaceholder = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedPlaceholder(text)
    setTimeout(() => setCopiedPlaceholder(null), 1500)
  }

  // API key mutations
  const createApiKeyMutation = useMutation({
    mutationFn: () => adminApi.createApiKey(newKeyName.trim() || 'Clé sans nom'),
    onSuccess: (data) => {
      setJustCreatedKey(data)
      setShowJustCreated(true)
      setNewKeyName('')
      refetchApiKeys()
    },
  })

  const revokeApiKeyMutation = useMutation({
    mutationFn: (keyId: number) => adminApi.revokeApiKey(keyId),
    onSuccess: () => {
      if (justCreatedKey) setJustCreatedKey(null)
      refetchApiKeys()
    },
  })

  // Initialize edited app config when data loads
  useEffect(() => {
    if (appConfig && !appConfigChanged) {
      setEditedAppConfig({})
    }
  }, [appConfig, appConfigChanged])

  // Plugin handlers
  const startEditingPlugin = (plugin: PluginConfiguration) => {
    setEditingPlugin(plugin.plugin_type)
    setEditedPluginData({
      name: plugin.name,
      description: plugin.description || '',
      icon: plugin.icon,
      color: plugin.color,
      default_enabled: plugin.default_enabled,
      coming_soon: plugin.coming_soon,
      sort_order: plugin.sort_order,
    })
  }

  const cancelEditingPlugin = () => {
    setEditingPlugin(null)
    setEditedPluginData({})
  }

  const quickTogglePlugin = (pluginType: PluginType, enabled: boolean) => {
    updatePluginMutation.mutate({ pluginType, data: { default_enabled: enabled } })
  }

  const savePlugin = async (pluginType: PluginType) => {
    setSavingPlugins(prev => new Set(prev).add(pluginType))
    try {
      await updatePluginMutation.mutateAsync({ pluginType, data: editedPluginData })
      setEditingPlugin(null)
      setEditedPluginData({})
    } finally {
      setSavingPlugins(prev => {
        const next = new Set(prev)
        next.delete(pluginType)
        return next
      })
    }
  }

  // App config handlers
  const updateAppConfigField = <K extends keyof AppConfiguration>(key: K, value: AppConfiguration[K]) => {
    setEditedAppConfig(prev => ({ ...prev, [key]: value }))
    setAppConfigAutosaveError(null)
    lastFailedAppConfigAutosaveSignatureRef.current = null
  }

  const handleResetPlugins = async () => {
    if (await appDialog.confirm('Êtes-vous sûr de vouloir réinitialiser toutes les configurations de plugins ?')) {
      await resetPluginsMutation.mutateAsync()
    }
  }

  const handleCopyApiKey = async (key: string, keyId: number) => {
    await navigator.clipboard.writeText(key)
    setCopiedKeyId(keyId)
    setTimeout(() => setCopiedKeyId(null), 2000)
  }

  const handleRevokeApiKey = async (keyId: number, name: string) => {
    if (await appDialog.confirm(`Révoquer "${name}" ? Les intégrations utilisant cette clé cesseront de fonctionner.`)) {
      await revokeApiKeyMutation.mutateAsync(keyId)
    }
  }

  const handleExportOptions = async () => {
    setShowExportOptions(true)
  }

  const confirmExportOptions = async () => {
    setIsExportingOptions(true)
    try {
      const payload = await adminApi.exportOptionsConfiguration()
      
      // Build the full export payload with selected items
      const fullPayload: any = {
        exported_at: new Date().toISOString(),
        app_configuration: payload.app_configuration,
        plugins: payload.plugins,
      }
      
      // Add selected items based on checkboxes
      if (exportOptions.crisisContacts) {
        // TODO: Add crisis contacts export when API is available
        fullPayload.crisis_contacts = []
      }
      
      if (exportOptions.injectBank) {
        // TODO: Add inject bank export when API is available
        fullPayload.inject_bank = []
      }
      
      if (exportOptions.exerciseTemplates) {
        // TODO: Add exercise templates export when API is available
        fullPayload.exercise_templates = []
      }
      
      const blob = new Blob([JSON.stringify(fullPayload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const datePart = new Date().toISOString().slice(0, 10)
      anchor.href = url
      anchor.download = `options_configuration_${datePart}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } finally {
      setIsExportingOptions(false)
      setShowExportOptions(false)
    }
  }

  const handleImportOptionsFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsImportingOptions(true)
    try {
      const fileContent = await file.text()
      const parsed = JSON.parse(fileContent)
      
      // Import based on selected items
      const importPayload: any = {
        app_configuration: parsed?.app_configuration,
        plugins: parsed?.plugins,
      }
      
      // Import selected items
      if (exportOptions.crisisContacts && parsed?.crisis_contacts) {
        // Import crisis contacts
      }
      
      if (exportOptions.injectBank && parsed?.inject_bank) {
        // Import inject bank items
      }
      
      if (exportOptions.exerciseTemplates && parsed?.exercise_templates) {
        // Import exercise templates
      }
      
      await adminApi.importOptionsConfiguration(importPayload)
      await queryClient.invalidateQueries({ queryKey: ['app-configuration'] })
      await queryClient.invalidateQueries({ queryKey: ['plugin-configurations'] })
      await queryClient.invalidateQueries({ queryKey: ['public-configuration'] })
      setEditedAppConfig({})
      await appDialog.alert('Import de la configuration réalisé avec succès.')
    } catch (error) {
      console.error('Options import failed', error)
      await appDialog.alert('Échec de l\'import. Vérifiez le format du fichier JSON.')
    } finally {
      setIsImportingOptions(false)
      event.target.value = ''
    }
  }

  const isLoading = appConfigLoading || pluginsLoading
  const hasError = appConfigError || pluginsError

  // Get current value (edited or original)
  const getAppConfigValue = <K extends keyof AppConfiguration>(key: K): AppConfiguration[K] => {
    if (key in editedAppConfig) {
      return editedAppConfig[key] as AppConfiguration[K]
    }
    return appConfig?.[key] as AppConfiguration[K]
  }

  const getExerciseTypeOptions = (): ExerciseTypeOption[] => {
    const stored = getAppConfigValue('exercise_type_options_config')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          const normalized: ExerciseTypeOption[] = []
          const seen = new Set<string>()
          for (const item of parsed) {
            if (!item || typeof item !== 'object') continue
            const rawValue = (item as Record<string, unknown>).value
            const rawLabel = (item as Record<string, unknown>).label
            const value = typeof rawValue === 'string' ? rawValue.trim() : ''
            const label = typeof rawLabel === 'string' ? rawLabel.trim() : ''
            if (!value || !label || seen.has(value)) continue
            seen.add(value)
            normalized.push({ value, label })
          }
          if (normalized.length > 0) return normalized
        }
      } catch {
        return DEFAULT_EXERCISE_TYPE_OPTIONS
      }
    }
    return DEFAULT_EXERCISE_TYPE_OPTIONS
  }

  const saveExerciseTypeOptions = (options: ExerciseTypeOption[]) => {
    updateAppConfigField('exercise_type_options_config', JSON.stringify(options))
  }

  const getExerciseDurationOptions = (): number[] => {
    const stored = getAppConfigValue('exercise_duration_options_config')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          const normalized: number[] = []
          const seen = new Set<number>()
          for (const item of parsed) {
            const value = typeof item === 'number' ? item : parseInt(String(item), 10)
            if (!Number.isInteger(value) || value <= 0 || seen.has(value)) continue
            seen.add(value)
            normalized.push(value)
          }
          if (normalized.length > 0) return normalized
        }
      } catch {
        return DEFAULT_EXERCISE_DURATION_OPTIONS
      }
    }
    return DEFAULT_EXERCISE_DURATION_OPTIONS
  }

  const saveExerciseDurationOptions = (options: number[]) => {
    updateAppConfigField('exercise_duration_options_config', JSON.stringify(options))
  }

  const getCrisisCellRoles = (): typeof DEFAULT_CRISIS_CELL_ROLES => {
    const stored = getAppConfigValue('crisis_cell_roles_config')
    if (stored) {
      try {
        return JSON.parse(stored)
      } catch {
        return DEFAULT_CRISIS_CELL_ROLES
      }
    }
    return DEFAULT_CRISIS_CELL_ROLES
  }

  const saveCrisisCellRoles = (roles: typeof DEFAULT_CRISIS_CELL_ROLES) => {
    updateAppConfigField('crisis_cell_roles_config', JSON.stringify(roles))
  }

  const addExerciseTypeOption = () => {
    const label = newExerciseTypeLabel.trim()
    const value = (newExerciseTypeValue.trim() || normalizeExerciseTypeValue(label)).trim()
    if (!label || !value) return
    const current = getExerciseTypeOptions()
    if (current.some((item) => item.value === value)) return
    saveExerciseTypeOptions([...current, { value, label }])
    setNewExerciseTypeLabel('')
    setNewExerciseTypeValue('')
  }

  const removeExerciseTypeOption = (value: string) => {
    const current = getExerciseTypeOptions()
    const next = current.filter((item) => item.value !== value)
    if (next.length === 0) return
    saveExerciseTypeOptions(next)
    if (getAppConfigValue('default_exercise_type') === value) {
      updateAppConfigField('default_exercise_type', next[0].value)
    }
  }

  const addExerciseDurationOption = () => {
    const parsed = parseInt(newExerciseDuration.trim(), 10)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 72) return
    const current = getExerciseDurationOptions()
    if (current.includes(parsed)) return
    const next = [...current, parsed].sort((a, b) => a - b)
    saveExerciseDurationOptions(next)
    setNewExerciseDuration('')
  }

  const removeExerciseDurationOption = (duration: number) => {
    const current = getExerciseDurationOptions()
    const next = current.filter((item) => item !== duration)
    if (next.length === 0) return
    saveExerciseDurationOptions(next)
    if (getAppConfigValue('default_exercise_duration_hours') === duration) {
      updateAppConfigField('default_exercise_duration_hours', next[0])
    }
  }

  const exerciseTypeOptions = getExerciseTypeOptions()
  const exerciseDurationOptions = getExerciseDurationOptions()

  // Stable ref to the mutation fn – avoids re-triggering the debounce useEffect every render
  const mutateAppConfigRef = useRef(updateAppConfigMutation.mutate)
  mutateAppConfigRef.current = updateAppConfigMutation.mutate
  const isMutationPendingRef = useRef(updateAppConfigMutation.isPending)
  isMutationPendingRef.current = updateAppConfigMutation.isPending

  useEffect(() => {
    if (!appConfigChanged) return

    const payload = { ...editedAppConfig }
    const signature = JSON.stringify(payload)
    if (signature === '{}' || lastFailedAppConfigAutosaveSignatureRef.current === signature) return

    const timeout = window.setTimeout(() => {
      if (isMutationPendingRef.current) return
      mutateAppConfigRef.current(payload, {
        onSuccess: () => {
          lastFailedAppConfigAutosaveSignatureRef.current = null
          setAppConfigAutosaveError(null)
          setLastAppConfigSavedAt(Date.now())
        },
        onError: (error: any) => {
          lastFailedAppConfigAutosaveSignatureRef.current = signature
          setAppConfigAutosaveError(normalizeApiErrorDetail(error))
        },
      })
    }, 700)

    return () => window.clearTimeout(timeout)
  }, [appConfigChanged, editedAppConfig])

  // Broadcast autosave status to global store (shown in Layout)
  const setGlobalAutoSaveStatus = useAutoSaveStore((s) => s.setStatus)
  useEffect(() => {
    if (updateAppConfigMutation.isPending) {
      setGlobalAutoSaveStatus('saving')
      return
    }
    if (appConfigAutosaveError) {
      setGlobalAutoSaveStatus('error', appConfigAutosaveError)
      return
    }
    if (lastAppConfigSavedAt) {
      setGlobalAutoSaveStatus('saved')
      const timer = window.setTimeout(() => setGlobalAutoSaveStatus('idle'), 3000)
      return () => window.clearTimeout(timer)
    }
    setGlobalAutoSaveStatus('idle')
  }, [updateAppConfigMutation.isPending, appConfigAutosaveError, lastAppConfigSavedAt, setGlobalAutoSaveStatus])

  useEffect(() => {
    return () => setGlobalAutoSaveStatus('idle')
  }, [setGlobalAutoSaveStatus])

  const applyOrganizationAutofillValues = (values: Partial<Record<OrganizationAutofillField, string>>) => {
    Object.entries(values).forEach(([field, value]) => {
      updateAppConfigField(field as OrganizationAutofillField, value)
    })
  }

  const handleImportOrganizationAutofillTxt = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const rawText = await file.text()
      const parsed = parseOrganizationAutofillResponse(rawText)
      if (!parsed || Object.keys(parsed).length === 0) {
        await appDialog.alert('Aucun champ exploitable trouvé dans ce fichier.')
        return
      }
      applyOrganizationAutofillValues(parsed)
      const fields = Object.keys(parsed).map(
        (field) => ORGANIZATION_FIELD_LABELS[field as OrganizationAutofillField] ?? field
      )
      await appDialog.alert(`Les champs suivants ont été importés : ${fields.join(', ')}`)
    } catch (error) {
      console.error('Import organization txt failed', error)
      await appDialog.alert('Impossible de lire ce fichier texte.')
    } finally {
      event.target.value = ''
    }
  }

  // Hooks must be called unconditionally (before any early return)
  const tabsExercice = useMemo(() => [
    { id: 'exercises' as TabType, label: t('admin.options.tabs.exercises'), icon: Clock },
    { id: 'plugins' as TabType, label: t('admin.options.tabs.plugins'), icon: Puzzle },
  ], [t])

  const tabsSysteme = useMemo(() => [
    { id: 'security' as TabType, label: t('admin.options.tabs.security'), icon: Shield },
    { id: 'placeholders' as TabType, label: t('admin.options.tabs.placeholders'), icon: Braces },
  ], [t])

  if (isLoading) {
    return <LoadingScreen />
  }

  if (hasError) {
    return (
      <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-400">
        Erreur lors du chargement des configurations
      </div>
    )
  }

  // Default phases helpers
  const getPhasesConfig = (): { name: string; enabled: boolean }[] => {
    const raw = getAppConfigValue('default_phases_config')
    let stored: { name: string; enabled: boolean }[] = []
    const classiqueSet = new Set(PHASE_PRESETS.classique)
    if (raw) {
      try { stored = JSON.parse(raw) } catch { /* noop */ }
    }
    return DEFAULT_PHASES_LIST.map((name) => {
      const found = stored.find((p) => p.name === name)
      return { name, enabled: found?.enabled ?? classiqueSet.has(name) }
    })
  }

  const togglePhase = (index: number) => {
    const phases = getPhasesConfig()
    phases[index] = { ...phases[index], enabled: !phases[index].enabled }
    updateAppConfigField('default_phases_config', JSON.stringify(phases))
    updateAppConfigField('default_phases_preset', null)
  }

  const applyPhasePreset = (preset: PhasePreset) => {
    const enabledSet = new Set(PHASE_PRESETS[preset])
    const phases = DEFAULT_PHASES_LIST.map((name) => ({ name, enabled: enabledSet.has(name) }))
    updateAppConfigField('default_phases_config', JSON.stringify(phases))
    updateAppConfigField('default_phases_preset', preset)
  }

  const resolveActivePreset = (phases: { name: string; enabled: boolean }[]): PhasePreset | 'custom' => {
    for (const preset of Object.keys(PHASE_PRESETS) as PhasePreset[]) {
      const set = new Set(PHASE_PRESETS[preset])
      const matches = phases.every((p) => p.enabled === set.has(p.name))
      if (matches) return preset
    }
    return 'custom'
  }

  const getCustomPhases = (): { name: string }[] => {
    const raw = getAppConfigValue('custom_phases_config')
    if (!raw) return []
    try { return JSON.parse(raw) } catch { return [] }
  }

  const saveCustomPhases = (phases: { name: string }[]) => {
    setEditedAppConfig(prev => ({
      ...prev,
      custom_phases_config: JSON.stringify(phases),
      default_phases_preset: 'custom',
    }))
    setAppConfigAutosaveError(null)
    lastFailedAppConfigAutosaveSignatureRef.current = null
  }

  const activateCustomPreset = () => {
    const existing = getCustomPhases()
    if (existing.length === 0) {
      // Seed from currently enabled phases
      const seed = getPhasesConfig().filter((p) => p.enabled).map((p) => ({ name: p.name }))
      saveCustomPhases(seed)
    } else {
      setEditedAppConfig(prev => ({ ...prev, default_phases_preset: 'custom' }))
      setAppConfigAutosaveError(null)
      lastFailedAppConfigAutosaveSignatureRef.current = null
    }
  }

  const getTimelinePhaseTypeFormats = (): TimelinePhaseTypeFormat[] => {
    const raw = getAppConfigValue('timeline_phase_type_format_config')
    if (!raw) return DEFAULT_TIMELINE_PHASE_TYPE_FORMATS
    const normalizeFormat = (value: string): TimelineAllowedFormat | null => {
      const upper = value.toUpperCase()
      if (upper === 'TEXT') return 'TXT'
      if (upper === 'TXT') return 'TXT'
      if (upper === 'AUDIO') return 'AUDIO'
      if (upper === 'VIDEO') return 'VIDEO'
      if (upper === 'IMAGE') return 'IMAGE'
      return null
    }
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return DEFAULT_TIMELINE_PHASE_TYPE_FORMATS
      const normalized = parsed
        .filter((item) => item && typeof item.type === 'string')
        .map((item) => ({
          type: item.type,
          formats: Array.isArray(item.formats)
            ? item.formats
              .filter((format: unknown): format is string => typeof format === 'string')
              .map((format) => normalizeFormat(format))
              .filter((format): format is TimelineAllowedFormat => format !== null)
            : [],
          simulator:
            typeof item.simulator === 'string'
              ? item.simulator
              : (TIMELINE_DEFAULT_SIMULATOR_BY_TYPE[String(item.type || '').trim().toLowerCase()] || null),
        }))
      return normalizeTimelineTypeFormatRows(normalized)
    } catch {
      return DEFAULT_TIMELINE_PHASE_TYPE_FORMATS
    }
  }

  const saveTimelinePhaseTypeFormats = (rows: TimelinePhaseTypeFormat[]) => {
    const sanitized = normalizeTimelineTypeFormatRows(rows)
    updateAppConfigField('timeline_phase_type_format_config', JSON.stringify(sanitized))
  }

  const updateTimelineInjectSimulator = (index: number, simulator: string | null) => {
    const rows = getTimelinePhaseTypeFormats()
    const row = rows[index]
    if (!row) return
    row.simulator = simulator
    saveTimelinePhaseTypeFormats(rows)
  }

  const getSelectedTimelineSourceIds = (): string[] => {
    const raw = getAppConfigValue('timeline_sources_config')
    if (!raw) return [...TIMELINE_SOURCES_CATALOG, ...getCustomTimelineSources()].map((item) => item.id)
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return [...TIMELINE_SOURCES_CATALOG, ...getCustomTimelineSources()].map((item) => item.id)
      return parsed.filter((item): item is string => typeof item === 'string')
    } catch {
      return [...TIMELINE_SOURCES_CATALOG, ...getCustomTimelineSources()].map((item) => item.id)
    }
  }

  const saveSelectedTimelineSourceIds = (ids: string[], knownSourceIds?: string[]) => {
    const known = new Set(knownSourceIds ?? [...TIMELINE_SOURCES_CATALOG, ...getCustomTimelineSources()].map((item) => item.id))
    const unique = Array.from(new Set(ids)).filter((id) => known.has(id))
    updateAppConfigField('timeline_sources_config', JSON.stringify(unique))
  }

  const toggleTimelineSource = (sourceId: string, checked: boolean) => {
    const selected = getSelectedTimelineSourceIds()
    if (checked) {
      if (!selected.includes(sourceId)) {
        saveSelectedTimelineSourceIds([...selected, sourceId])
      }
      return
    }
    saveSelectedTimelineSourceIds(selected.filter((id) => id !== sourceId))
  }

  const getTimelineSourcesByCountry = (): Array<{
    country: string
    categories: Array<{ category: TimelineSourceCategory; sources: TimelineSourceItem[] }>
  }> => {
    const byCountry = new Map<string, Map<TimelineSourceCategory, TimelineSourceItem[]>>()
    for (const item of [...TIMELINE_SOURCES_CATALOG, ...getCustomTimelineSources()]) {
      if (!byCountry.has(item.country)) {
        byCountry.set(item.country, new Map<TimelineSourceCategory, TimelineSourceItem[]>())
      }
      const byCategory = byCountry.get(item.country)!
      if (!byCategory.has(item.category)) {
        byCategory.set(item.category, [])
      }
      byCategory.get(item.category)!.push(item)
    }
    return Array.from(byCountry.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'fr'))
      .map(([country, categoryMap]) => ({
        country,
        categories: TIMELINE_SOURCE_CATEGORY_ORDER.map((category) => ({
          category,
          sources: (categoryMap.get(category) || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'fr')),
        })),
      }))
  }

  const getCustomTimelineSources = (): TimelineCustomSourceItem[] => {
    const raw = getAppConfigValue('timeline_sources_custom_config')
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed
        .filter((item) =>
          item &&
          typeof item.id === 'string' &&
          typeof item.country === 'string' &&
          typeof item.category === 'string' &&
          typeof item.name === 'string'
        )
        .map((item) => ({
          id: item.id.trim(),
          country: item.country.trim(),
          category: item.category as TimelineSourceCategory,
          name: item.name.trim(),
        }))
        .filter((item) =>
          item.id.length > 0 &&
          item.country.length > 0 &&
          item.name.length > 0 &&
          TIMELINE_SOURCE_CATEGORY_ORDER.includes(item.category)
        )
    } catch {
      return []
    }
  }

  const saveCustomTimelineSources = (sources: TimelineCustomSourceItem[]) => {
    updateAppConfigField('timeline_sources_custom_config', JSON.stringify(sources))
  }

  const addCustomTimelineSource = (country: string, category: TimelineSourceCategory) => {
    const key = `${country}|${category}`
    const draft = (timelineSourceDrafts[key] || '').trim()
    if (!draft) return

    const customSources = getCustomTimelineSources()
    const sourceId = `custom-${country.toLowerCase().replace(/\s+/g, '-')}-${category.toLowerCase()}-${Date.now()}`
    const nextSource: TimelineCustomSourceItem = {
      id: sourceId,
      country,
      category,
      name: draft,
    }
    const nextCustomSources = [...customSources, nextSource]
    saveCustomTimelineSources(nextCustomSources)

    const selected = getSelectedTimelineSourceIds()
    if (!selected.includes(sourceId)) {
      saveSelectedTimelineSourceIds(
        [...selected, sourceId],
        [...TIMELINE_SOURCES_CATALOG, ...nextCustomSources].map((item) => item.id)
      )
    }
    setTimelineSourceDrafts((prev) => ({ ...prev, [key]: '' }))
  }

  const removeCustomTimelineSource = (sourceId: string) => {
    const customSources = getCustomTimelineSources()
    const nextCustomSources = customSources.filter((item) => item.id !== sourceId)
    saveCustomTimelineSources(nextCustomSources)
    const selected = getSelectedTimelineSourceIds()
    saveSelectedTimelineSourceIds(
      selected.filter((id) => id !== sourceId),
      [...TIMELINE_SOURCES_CATALOG, ...nextCustomSources].map((item) => item.id)
    )
  }

  const tenantLabel = tenant?.name?.trim() || 'Tenant non résolu'
  const tenantSlug = tenant?.slug?.trim() || null

  // Pre-computed timeline/phases values (used across exercises + timelines tabs)
  const isCustomPreset = getAppConfigValue('default_phases_preset') === 'custom'
  const customPhases = getCustomPhases()
  const phasesConfig = getPhasesConfig()
  const enabledCount = isCustomPreset ? customPhases.length : phasesConfig.filter((p) => p.enabled).length
  const activePreset = isCustomPreset ? 'custom' : resolveActivePreset(phasesConfig)
  const timelineRows = getTimelinePhaseTypeFormats()
  const selectedSourceIds = getSelectedTimelineSourceIds()
  const timelineSourcesByCountry = getTimelineSourcesByCountry()

  return (
    <div className="options-theme space-y-6">
      <input
        hidden
        ref={importFileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleImportOptionsFile}
      />
      <input
        hidden
        ref={organizationAutofillFileInputRef}
        type="file"
        accept=".txt,text/plain"
        className="hidden"
        onChange={handleImportOrganizationAutofillTxt}
      />

      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-white">Options</h1>
              <div className="inline-flex items-center gap-1.5 rounded-md border border-primary-500/30 bg-primary-500/10 px-2 py-0.5">
                <Building2 className="w-3.5 h-3.5 text-primary-300" />
                <span className="text-xs text-primary-200 font-medium">{tenantLabel}</span>
                {tenantSlug && (
                  <code className="text-xs text-primary-300 bg-primary-950/40 px-1 py-0.5 rounded">
                    {tenantSlug}
                  </code>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-400 mt-1">
              Configuration du tenant courant (branding, intégrations, sécurité et assistants).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`inline-flex items-center rounded-lg border px-2 py-1.5 text-sm ${
                updateAppConfigMutation.isPending
                  ? 'border-primary-500/40 bg-primary-500/10 text-primary-400'
                  : appConfigAutosaveError
                    ? 'border-red-500/40 bg-red-500/10 text-red-400'
                    : appConfigChanged
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              }`}
              title={
                updateAppConfigMutation.isPending
                  ? 'Sauvegarde...'
                  : appConfigAutosaveError
                    ? 'Erreur auto-save'
                    : appConfigChanged
                      ? 'En attente auto-save'
                      : lastAppConfigSavedAt
                        ? 'Auto-save actif'
                        : 'Auto-save prêt'
              }
            >
              {updateAppConfigMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Clock className="w-4 h-4" />
              )}
            </div>
            <button
              onClick={handleExportOptions}
              disabled={isExportingOptions || isImportingOptions}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-700 text-gray-200 border border-gray-600 rounded-lg hover:bg-gray-600 disabled:opacity-50 text-sm"
              title="Exporter"
            >
              {isExportingOptions ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Exporter
            </button>
            <button
              onClick={() => importFileInputRef.current?.click()}
              disabled={isImportingOptions || isExportingOptions}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-700 text-gray-200 border border-gray-600 rounded-lg hover:bg-gray-600 disabled:opacity-50 text-sm"
              title="Importer"
            >
              {isImportingOptions ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Importer
            </button>
          </div>
        </div>
      </div>

      {/* Navigation horizontale — mobile / tablette */}
      <div className="xl:hidden space-y-1.5">
        <div className="rounded-xl p-2 overflow-x-auto" style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-card-border)' }}>
          <div className="flex gap-1 min-w-max">
            {tabsExercice.map((tab) => {
              const Icon = tab.icon
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); if (tab.id === 'exercises') setExercisesSubTab('general') }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-primary-600/20 text-primary-300 border border-primary-500/30'
                      : 'border border-transparent hover:bg-primary-600/10'
                  }`}
                  style={active ? undefined : { color: 'var(--sidebar-muted)' }}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  {tab.label}
                </button>
              )
            })}
            <span className="w-px h-5 self-center mx-1" style={{ background: 'var(--surface-card-border)' }} />
            {tabsSysteme.map((tab) => {
              const Icon = tab.icon
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-primary-600/20 text-primary-300 border border-primary-500/30'
                      : 'border border-transparent hover:bg-primary-600/10'
                  }`}
                  style={active ? undefined : { color: 'var(--sidebar-muted)' }}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
        {activeTab === 'exercises' && (
          <div className="rounded-xl p-1.5 overflow-x-auto" style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-card-border)', opacity: 0.9 }}>
            <div className="flex gap-1 min-w-max">
              {([
                { id: 'general' as ExercisesSubTab, label: 'Général' },
                { id: 'organisation' as ExercisesSubTab, label: 'Organisation' },
                { id: 'inject_types' as ExercisesSubTab, label: t('admin.options.tabs.inject_types') },
                { id: 'sources' as ExercisesSubTab, label: t('admin.options.tabs.sources') },
                { id: 'timelines' as ExercisesSubTab, label: t('admin.options.tabs.timelines') },
              ]).map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setExercisesSubTab(id)}
                  className={`px-3 py-1 rounded-lg text-xs whitespace-nowrap transition-colors ${
                    exercisesSubTab === id
                      ? 'bg-primary-600/20 text-primary-300 border border-primary-500/30'
                      : 'border border-transparent hover:bg-primary-600/10'
                  }`}
                  style={exercisesSubTab === id ? undefined : { color: 'var(--sidebar-muted)' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)] gap-6 items-start">
        <aside className="hidden xl:block xl:sticky xl:top-6 space-y-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-3">
            <nav className="space-y-0.5">
              <p className="px-1 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                {t('admin.options.sections.exercice')}
              </p>

              {/* Préparation + sous-items */}
              <button
                onClick={() => { setActiveTab('exercises'); setExercisesSubTab('general') }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeTab === 'exercises'
                    ? 'bg-primary-600/20 text-primary-300 border border-primary-500/30'
                    : 'text-gray-300 hover:bg-gray-700/60 border border-transparent'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Clock className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{t('admin.options.tabs.exercises')}</span>
                </span>
                {activeTab === 'exercises' && <span className="w-1.5 h-1.5 rounded-full bg-primary-400" />}
              </button>
              <div className="ml-4 pl-2.5 border-l border-gray-700 space-y-0.5 pb-1">
                {([
                  { id: 'general' as ExercisesSubTab, label: 'Général' },
                  { id: 'organisation' as ExercisesSubTab, label: 'Organisation' },
                  { id: 'inject_types' as ExercisesSubTab, label: t('admin.options.tabs.inject_types') },
                  { id: 'sources' as ExercisesSubTab, label: t('admin.options.tabs.sources') },
                  { id: 'timelines' as ExercisesSubTab, label: t('admin.options.tabs.timelines') },
                ]).map(({ id, label }) => {
                  const activeSub = activeTab === 'exercises' && exercisesSubTab === id
                  return (
                    <button
                      key={id}
                      onClick={() => { setActiveTab('exercises'); setExercisesSubTab(id) }}
                      className={`w-full flex items-center px-2 py-1.5 rounded-md text-sm transition-colors ${
                        activeSub
                          ? 'text-primary-300 bg-primary-600/10'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/40'
                      }`}
                    >
                      <span className="truncate">{label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Simulateurs + Timelines */}
              {tabsExercice.filter(tab => tab.id !== 'exercises').map((tab) => {
                const Icon = tab.icon
                const active = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      active
                        ? 'bg-primary-600/20 text-primary-300 border border-primary-500/30'
                        : 'text-gray-300 hover:bg-gray-700/60 border border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{tab.label}</span>
                    </span>
                    {active && <span className="w-1.5 h-1.5 rounded-full bg-primary-400" />}
                  </button>
                )
              })}

              <p className="px-1 pt-4 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                {t('admin.options.sections.systeme')}
              </p>
              {tabsSysteme.map((tab) => {
                const Icon = tab.icon
                const active = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      active
                        ? 'bg-primary-600/20 text-primary-300 border border-primary-500/30'
                        : 'text-gray-300 hover:bg-gray-700/60 border border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{tab.label}</span>
                    </span>
                    {active && <span className="w-1.5 h-1.5 rounded-full bg-primary-400" />}
                  </button>
                )
              })}
            </nav>
          </div>

          <div
            className="rounded-xl border p-4 backdrop-blur-md"
            style={{
              backgroundColor: 'var(--login-card-bg)',
              borderColor: 'var(--login-card-border)',
            }}
          >
            <p className="text-xs uppercase tracking-wider login-muted">Apparence</p>
            <p className="text-sm font-medium mt-1" style={{ color: 'var(--login-text)' }}>
              Thème de l&apos;interface
            </p>
            <p className="text-xs mt-2 login-muted">
              Préférence locale (navigateur) : LIGHT / DARK / SYSTEM.
            </p>
            <div className="mt-3">
              <ThemeModeSelector className="w-full justify-center" />
            </div>
          </div>

          <div
            className="rounded-xl border p-4 backdrop-blur-md"
            style={{
              backgroundColor: 'var(--login-card-bg)',
              borderColor: 'var(--login-card-border)',
            }}
          >
            <p className="text-xs uppercase tracking-wider login-muted">Langue</p>
            <p className="text-sm font-medium mt-1" style={{ color: 'var(--login-text)' }}>
              Langue de l&apos;interface
            </p>
            <p className="text-xs mt-2 login-muted">
              Préférence locale (navigateur) : FR / EN.
            </p>
            <div className="mt-3">
              <LangSelector className="w-full justify-center" />
            </div>
          </div>
        </aside>

        <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 md:p-6">
      {/* Tab Content */}
      <div className="space-y-6">
        {/* Exercises Tab */}
        {activeTab === 'exercises' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-6">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-gray-400" />
                <h2 className="text-lg font-medium text-white">
                  {exercisesSubTab === 'general' && 'Général'}
                  {exercisesSubTab === 'organisation' && 'Organisation'}
                  {exercisesSubTab === 'inject_types' && t('admin.options.tabs.inject_types')}
                  {exercisesSubTab === 'sources' && t('admin.options.tabs.sources')}
                  {exercisesSubTab === 'timelines' && t('admin.options.tabs.timelines')}
                </h2>
              </div>

              {exercisesSubTab === 'general' && (
                <div>
                <p className="mb-6 text-sm text-gray-400 leading-relaxed">{t('admin.options.intros.general')}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Durée par défaut (heures)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="72"
                      value={getAppConfigValue('default_exercise_duration_hours')}
                      onChange={(e) => updateAppConfigField('default_exercise_duration_hours', parseInt(e.target.value) || 4)}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Multiplicateur de temps
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={getAppConfigValue('default_time_multiplier')}
                      onChange={(e) => updateAppConfigField('default_time_multiplier', parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-200">Types d'exercice</h3>
                    <div className="grid grid-cols-1 gap-3">
                      {exerciseTypeOptions.map((type) => (
                        <div key={type.value} className="flex items-center justify-between gap-3 p-2 rounded-lg border border-gray-700 bg-gray-900/30">
                          <label className="flex items-center gap-2 text-gray-300 min-w-0">
                            <input
                              type="radio"
                              name="default_exercise_type"
                              value={type.value}
                              checked={getAppConfigValue('default_exercise_type') === type.value}
                              onChange={(e) => updateAppConfigField('default_exercise_type', e.target.value)}
                              className="text-primary-500"
                            />
                            <span className="truncate">{type.label}</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => removeExerciseTypeOption(type.value)}
                            disabled={exerciseTypeOptions.length <= 1}
                            className="px-2 py-1 text-xs bg-gray-700 text-gray-200 border border-gray-600 rounded hover:bg-gray-600 disabled:opacity-50"
                          >
                            Supprimer
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto] gap-2 items-end">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Libellé</label>
                        <input
                          type="text"
                          value={newExerciseTypeLabel}
                          onChange={(e) => setNewExerciseTypeLabel(e.target.value)}
                          placeholder="Ex: Fraude interne"
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Code (optionnel)</label>
                        <input
                          type="text"
                          value={newExerciseTypeValue}
                          onChange={(e) => setNewExerciseTypeValue(e.target.value)}
                          placeholder="Ex: fraude_interne"
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={addExerciseTypeOption}
                        className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm bg-gray-700 text-gray-100 border border-gray-600 rounded-lg hover:bg-gray-600"
                      >
                        <Plus className="w-4 h-4" />
                        Ajouter
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-200">Durées disponibles (heures)</h3>
                    <div className="space-y-2">
                      {exerciseDurationOptions.map((duration) => (
                        <div key={duration} className="flex items-center justify-between gap-3 p-2 rounded-lg border border-gray-700 bg-gray-900/30">
                          <label className="flex items-center gap-2 text-gray-300">
                            <input
                              type="radio"
                              name="default_exercise_duration_hours"
                              value={duration}
                              checked={getAppConfigValue('default_exercise_duration_hours') === duration}
                              onChange={() => updateAppConfigField('default_exercise_duration_hours', duration)}
                              className="text-primary-500"
                            />
                            {duration}h
                          </label>
                          <button
                            type="button"
                            onClick={() => removeExerciseDurationOption(duration)}
                            disabled={exerciseDurationOptions.length <= 1}
                            className="px-2 py-1 text-xs bg-gray-700 text-gray-200 border border-gray-600 rounded hover:bg-gray-600 disabled:opacity-50"
                          >
                            Supprimer
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="w-40">
                        <label className="block text-xs text-gray-400 mb-1">Nouvelle durée</label>
                        <input
                          type="number"
                          min="1"
                          max="72"
                          value={newExerciseDuration}
                          onChange={(e) => setNewExerciseDuration(e.target.value)}
                          placeholder="Ex: 12"
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={addExerciseDurationOption}
                        className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm bg-gray-700 text-gray-100 border border-gray-600 rounded-lg hover:bg-gray-600"
                      >
                        <Plus className="w-4 h-4" />
                        Ajouter
                      </button>
                    </div>
                  </div>
                </div>

                </div>
              )}

              {exercisesSubTab === 'organisation' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-200">Organisation de la cellule de crise</h3>
                  <p className="text-sm text-gray-400">
                    Configurez les rôles disponibles pour l'organisation de la cellule de crise dans les exercices.
                  </p>
                  <div className="space-y-3">
                    {getCrisisCellRoles().map((role, index) => (
                      <div key={role.role} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,2fr)_auto] gap-2 items-center">
                        <input
                          type="text"
                          value={role.role}
                          onChange={(e) => {
                            const next = getCrisisCellRoles().map((item, i) =>
                              i === index ? { ...item, role: e.target.value } : item
                            )
                            saveCrisisCellRoles(next)
                          }}
                          placeholder="role"
                          className="w-full min-w-0 px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm"
                        />
                        <input
                          type="text"
                          value={role.name}
                          onChange={(e) => {
                            const next = getCrisisCellRoles().map((item, i) =>
                              i === index ? { ...item, name: e.target.value } : item
                            )
                            saveCrisisCellRoles(next)
                          }}
                          placeholder="Nom"
                          className="w-full min-w-0 px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm"
                        />
                        <input
                          type="text"
                          value={role.responsibility}
                          onChange={(e) => {
                            const next = getCrisisCellRoles().map((item, i) =>
                              i === index ? { ...item, responsibility: e.target.value } : item
                            )
                            saveCrisisCellRoles(next)
                          }}
                          placeholder="Responsabilité"
                          className="w-full min-w-0 px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const next = getCrisisCellRoles().filter((_, i) => i !== index)
                            saveCrisisCellRoles(next)
                          }}
                          className="sm:justify-self-end w-full sm:w-auto px-3 py-2 bg-gray-700 text-gray-200 border border-gray-600 rounded-lg hover:bg-gray-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const suffix = Date.now()
                        const next = [...getCrisisCellRoles(), { role: `new_role_${suffix}`, name: 'Nouveau rôle', responsibility: 'Description' }]
                        saveCrisisCellRoles(next)
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-gray-700 text-gray-100 border border-gray-600 rounded-lg hover:bg-gray-600"
                    >
                      <Plus className="w-4 h-4" />
                      Ajouter un rôle
                    </button>
                  </div>
                </div>
              )}

              {exercisesSubTab === 'inject_types' && (
                <div>
                  <p className="mb-6 text-sm text-gray-400 leading-relaxed">{t('admin.options.intros.inject_types')}</p>
                  <p className="text-xs text-gray-500 mb-5">
                    {timelineRows.length} type(s) d&apos;inject configuré(s)
                  </p>
                  {timelineRows.length === 0 && (
                    <div className="text-sm text-gray-500 bg-gray-900 border border-gray-700 rounded px-3 py-3">
                      Aucun type configuré.
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {timelineRows.map((row, index) => {
                      const colors = TIMELINE_INJECT_TYPE_COLORS[row.type] ?? TIMELINE_INJECT_TYPE_COLORS.system
                      const TypeIcon = TIMELINE_INJECT_TYPE_ICONS[row.type] ?? Monitor
                      return (
                        <div
                          key={index}
                          className={`relative rounded-xl border ${colors.border} ${colors.bg} p-4 flex flex-col gap-4`}
                        >
                          {/* Card header */}
                          <div className="flex items-center gap-3">
                            <div className={`flex-shrink-0 w-10 h-10 rounded-lg ${colors.bg} border ${colors.border} flex items-center justify-center`}>
                              <TypeIcon className={`w-5 h-5 ${colors.icon}`} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white leading-tight">
                                {TIMELINE_INJECT_TYPE_LABELS[row.type] || row.type}
                              </p>
                              <p className="text-xs font-mono text-gray-500 mt-0.5">{row.type}</p>
                            </div>
                          </div>

                          {/* Format chips (read-only — determined by LLM capabilities) */}
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Formats supportés lors de la génération</p>
                            <div className="flex flex-wrap gap-1.5">
                              {TIMELINE_ALLOWED_FORMATS.map((format) => {
                                const active = row.formats.includes(format)
                                if (!active) return null
                                const fColors = FORMAT_COLORS[format]
                                const FmtIcon = FORMAT_ICONS[format]
                                return (
                                  <span
                                    key={format}
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium ${fColors.active}`}
                                  >
                                    <FmtIcon className="w-3 h-3" />
                                    {format}
                                  </span>
                                )
                              })}
                            </div>
                          </div>

                          {/* Simulator select */}
                          <div>
                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
                              Simulateur
                            </label>
                            <select
                              value={row.simulator || ''}
                              onChange={(e) => updateTimelineInjectSimulator(index, e.target.value || null)}
                              className="w-full px-2.5 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                            >
                              <option value="">Aucun</option>
                              {(plugins ?? [])
                                .filter((p) => TIMELINE_SIMULATOR_PLUGIN_TYPES.has(p.plugin_type))
                                .map((p) => (
                                  <option key={p.plugin_type} value={p.plugin_type}>
                                    {p.name}{p.coming_soon ? ' (bientôt)' : ''}
                                  </option>
                                ))}
                            </select>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {exercisesSubTab === 'sources' && (() => {
                const activeCountry = selectedSourceCountry || timelineSourcesByCountry[0]?.country || ''
                const activeBlock = timelineSourcesByCountry.find((b) => b.country === activeCountry)
                return (
                  <div>
                    <p className="mb-4 text-sm text-gray-400 leading-relaxed">{t('admin.options.intros.sources')}</p>
                    <p className="text-xs text-gray-500 mb-4">
                      {selectedSourceIds.length} source(s) active(s) sur {TIMELINE_SOURCES_CATALOG.length + getCustomTimelineSources().length}
                    </p>

                    {/* Country tabs */}
                    <div className="flex gap-1 border-b border-gray-700 mb-5 overflow-x-auto">
                      {timelineSourcesByCountry.map((block) => (
                        <button
                          key={block.country}
                          onClick={() => setSelectedSourceCountry(block.country)}
                          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                            block.country === activeCountry
                              ? 'border-primary-500 text-white'
                              : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
                          }`}
                        >
                          <span>{COUNTRY_FLAGS[block.country] ?? '🌐'}</span>
                          {block.country}
                        </button>
                      ))}
                    </div>

                    {/* Active country content */}
                    {activeBlock && (
                      <div className="space-y-4">
                        {activeBlock.categories.map((categoryBlock) => (
                          <div key={`${activeBlock.country}-${categoryBlock.category}`}>
                            <div className="text-xs uppercase tracking-wider text-gray-500 mb-1.5">
                              {categoryBlock.category}
                            </div>
                            {categoryBlock.sources.length === 0 ? (
                              <div className="text-xs text-gray-600">Aucune source</div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                                {categoryBlock.sources.map((source) => (
                                  <div
                                    key={source.id}
                                    className="flex items-center justify-between gap-2 px-2 py-1.5 bg-gray-900 rounded border border-gray-700"
                                  >
                                    <label className="flex items-center gap-2 cursor-pointer min-w-0">
                                      <input
                                        type="checkbox"
                                        checked={selectedSourceIds.includes(source.id)}
                                        onChange={(e) => toggleTimelineSource(source.id, e.target.checked)}
                                        className="rounded border-gray-600 bg-gray-900 text-primary-600 focus:ring-primary-500"
                                      />
                                      <span className="text-sm text-gray-200 truncate">{source.name}</span>
                                    </label>
                                    {source.id.startsWith('custom-') && (
                                      <button
                                        type="button"
                                        onClick={() => removeCustomTimelineSource(source.id)}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-red-400 bg-red-600 text-white hover:bg-red-500 text-xs font-medium"
                                        title="Supprimer la source custom"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="mt-2 flex items-center gap-2">
                              <input
                                type="text"
                                value={timelineSourceDrafts[`${activeBlock.country}|${categoryBlock.category}`] || ''}
                                onChange={(e) =>
                                  setTimelineSourceDrafts((prev) => ({
                                    ...prev,
                                    [`${activeBlock.country}|${categoryBlock.category}`]: e.target.value,
                                  }))
                                }
                                placeholder={`Ajouter une source ${categoryBlock.category.toLowerCase()} custom`}
                                className="flex-1 px-2.5 py-1.5 bg-gray-950 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                              />
                              <button
                                type="button"
                                onClick={() => addCustomTimelineSource(activeBlock.country, categoryBlock.category)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-primary-500/40 bg-primary-500/10 text-primary-300 hover:bg-primary-500/20 text-sm"
                              >
                                <Plus className="w-4 h-4" />
                                Ajouter
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {exercisesSubTab === 'timelines' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-400 leading-relaxed">
                    {t('admin.options.intros.timelines')}
                  </p>
                  <PhasePicker
                    phases={phasesConfig}
                    onToggle={togglePhase}
                    customPhases={customPhases}
                    onCustomPhasesChange={saveCustomPhases}
                    activePreset={activePreset}
                    onApplyPreset={applyPhasePreset}
                    onActivateCustom={activateCustomPreset}
                    allowCustomEdit
                    theme="dark"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Simulateurs Tab */}
        {activeTab === 'plugins' && plugins && (
          <SimulatorsTab
            plugins={plugins}
            editingPlugin={editingPlugin}
            editPluginValues={editedPluginData}
            onEdit={startEditingPlugin}
            onSave={savePlugin}
            onCancel={cancelEditingPlugin}
            onFieldChange={(field, value) => setEditedPluginData({ ...editedPluginData, [field]: value })}
            onToggleEnabled={quickTogglePlugin}
            onReset={handleResetPlugins}
            isSaving={editingPlugin != null && savingPlugins.has(editingPlugin as PluginType)}
            isResetting={resetPluginsMutation.isPending}
          />
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="w-5 h-5 text-gray-400" />
                <h2 className="text-lg font-medium text-white">Paramètres de sécurité</h2>
              </div>
              <p className="mb-6 text-sm text-gray-400 leading-relaxed">{t('admin.options.intros.security')}</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Délai d'expiration de session (minutes)
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="480"
                    value={getAppConfigValue('session_timeout_minutes')}
                    onChange={(e) => updateAppConfigField('session_timeout_minutes', parseInt(e.target.value) || 60)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Tentatives de connexion max
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={getAppConfigValue('max_login_attempts')}
                    onChange={(e) => updateAppConfigField('max_login_attempts', parseInt(e.target.value) || 5)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Longueur min. mot de passe
                  </label>
                  <input
                    type="number"
                    min="6"
                    max="32"
                    value={getAppConfigValue('password_min_length')}
                    onChange={(e) => updateAppConfigField('password_min_length', parseInt(e.target.value) || 8)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
            </div>

            {/* API Key Section */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <div className="flex items-center gap-3 mb-2">
                <Key className="w-5 h-5 text-gray-400" />
                <h2 className="text-lg font-medium text-white">Clés API (X-API-Key)</h2>
              </div>
              <p className="text-sm text-gray-400 mb-5">
                Authentification M2M via l'en-tête <code className="bg-gray-900 px-1 py-0.5 rounded text-xs text-primary-300">X-API-Key</code>. Chaque clé a un nom pour l'identifier.
              </p>

              {/* Create new key */}
              <div className="flex gap-2 mb-5">
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Nom de la clé (ex: CI/CD, Monitoring...)"
                  className="flex-1 px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  onKeyDown={(e) => e.key === 'Enter' && createApiKeyMutation.mutate()}
                />
                <button
                  onClick={() => createApiKeyMutation.mutate()}
                  disabled={createApiKeyMutation.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {createApiKeyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Générer
                </button>
              </div>

              {/* One-time display after creation */}
              {justCreatedKey && (
                <div className="mb-5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-2">
                  <p className="text-sm font-semibold text-amber-200">Clé créée — copiez-la maintenant, elle ne sera plus affichée :</p>
                  <div className="flex items-center gap-2 bg-gray-950 border border-amber-700/50 rounded-lg px-3 py-2">
                    <code className="flex-1 text-xs text-green-300 font-mono break-all select-all">
                      {showJustCreated ? justCreatedKey.key : '•'.repeat(Math.min(justCreatedKey.key.length, 52))}
                    </code>
                    <button onClick={() => setShowJustCreated(!showJustCreated)} className="p-1 text-amber-400 hover:text-white flex-shrink-0">
                      {showJustCreated ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button onClick={() => handleCopyApiKey(justCreatedKey.key, justCreatedKey.id)} className="p-1 text-amber-400 hover:text-white flex-shrink-0">
                      {copiedKeyId === justCreatedKey.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Keys table */}
              {apiKeys && apiKeys.length > 0 ? (
                <div className="rounded-lg border border-gray-700 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-900 text-gray-400">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Nom</th>
                        <th className="px-4 py-2 text-left font-medium">Aperçu</th>
                        <th className="px-4 py-2 text-left font-medium">Créée le</th>
                        <th className="px-4 py-2 text-left font-medium">Dernière utilisation</th>
                        <th className="px-4 py-2 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {apiKeys.map((k) => (
                        <tr key={k.id} className="hover:bg-gray-750">
                          <td className="px-4 py-2.5 text-white font-medium">{k.name}</td>
                          <td className="px-4 py-2.5">
                            <code className="text-xs text-gray-400 font-mono">{k.key_preview}</code>
                          </td>
                          <td className="px-4 py-2.5 text-gray-400 text-xs">
                            {new Date(k.created_at).toLocaleDateString('fr-FR')}
                          </td>
                          <td className="px-4 py-2.5 text-gray-400 text-xs">
                            {k.last_used_at
                              ? new Date(k.last_used_at).toLocaleString('fr-FR')
                              : <span className="text-gray-600">Jamais</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              onClick={() => handleRevokeApiKey(k.id, k.name)}
                              disabled={revokeApiKeyMutation.isPending}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-md disabled:opacity-50 transition-colors"
                            >
                              {revokeApiKeyMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                              Révoquer
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">Aucune clé API configurée.</p>
              )}

              {/* Usage examples */}
              <div className="mt-5 rounded-lg bg-gray-900 border border-gray-700 p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Exemples d'utilisation</p>
                {(() => {
                  const base = typeof window !== 'undefined' ? window.location.origin : 'https://votre-instance'
                  return (
                    <div className="space-y-2 font-mono text-xs">
                      <div>
                        <p className="text-gray-500 mb-1">cURL — lister les exercices :</p>
                        <code className="block text-green-300 break-all">
                          {`curl -H "X-API-Key: ttx_..." ${base}/api/exercises`}
                        </code>
                      </div>
                      <div>
                        <p className="text-gray-500 mb-1">Python (requests) :</p>
                        <code className="block text-green-300 whitespace-pre">{`import requests\nr = requests.get("${base}/api/exercises",\n    headers={"X-API-Key": "ttx_..."})\nprint(r.json())`}</code>
                      </div>
                      <div>
                        <p className="text-gray-500 mb-1">JavaScript (fetch) :</p>
                        <code className="block text-green-300 whitespace-pre">{`fetch("${base}/api/exercises", {\n  headers: { "X-API-Key": "ttx_..." }\n}).then(r => r.json())`}</code>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Placeholders Tab */}
        {activeTab === 'placeholders' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Braces className="w-5 h-5 text-gray-400" />
                  <h2 className="text-lg font-medium text-white">{t('admin.options.placeholders.title')}</h2>
                </div>
                <button
                  onClick={() => refetchPlaceholders()}
                  disabled={placeholdersFetching}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${placeholdersFetching ? 'animate-spin' : ''}`} />
                  {t('common.refresh')}
                </button>
              </div>
              <p className="mb-4 text-sm text-gray-400 leading-relaxed">
                {t('admin.options.placeholders.intro')}
              </p>

              <div className="mb-6 flex items-center gap-3">
                <label className="text-sm font-medium text-gray-300 whitespace-nowrap">
                  {t('admin.options.placeholders.exercise_context')}
                </label>
                <select
                  value={placeholderExerciseId ?? ''}
                  onChange={(e) => setPlaceholderExerciseId(e.target.value ? Number(e.target.value) : undefined)}
                  className="flex-1 max-w-md px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">{t('admin.options.placeholders.no_exercise')}</option>
                  {(placeholderExercises?.exercises ?? []).map((ex: Exercise) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name} ({ex.status})
                    </option>
                  ))}
                </select>
              </div>

              {placeholdersLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : placeholders && placeholders.length > 0 ? (
                (() => {
                  const categories: Record<string, { label: string; items: PlaceholderItem[] }> = {}
                  const categoryLabels: Record<string, string> = {
                    organisation: t('admin.options.placeholders.categories.organisation'),
                    it_context: t('admin.options.placeholders.categories.it_context'),
                    bia: t('admin.options.placeholders.categories.bia'),
                    email: t('admin.options.placeholders.categories.email'),
                    exercise: t('admin.options.placeholders.categories.exercise'),
                    exercise_ctx: t('admin.options.placeholders.categories.exercise_ctx'),
                    scenario: t('admin.options.placeholders.categories.scenario'),
                    timeline: t('admin.options.placeholders.categories.timeline'),
                    inject: t('admin.options.placeholders.categories.inject'),
                  }
                  for (const p of placeholders) {
                    if (!categories[p.category]) {
                      categories[p.category] = { label: categoryLabels[p.category] || p.category, items: [] }
                    }
                    categories[p.category].items.push(p)
                  }
                  return (
                    <div className="space-y-6">
                      {Object.entries(categories).map(([catKey, cat]) => (
                        <div key={catKey}>
                          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
                            {cat.label}
                          </h3>
                          <div className="rounded-lg border border-gray-700 overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-900 text-gray-400">
                                <tr>
                                  <th className="px-4 py-2 text-left font-medium">{t('admin.options.placeholders.col_label')}</th>
                                  <th className="px-4 py-2 text-left font-medium">{t('admin.options.placeholders.col_placeholder')}</th>
                                  <th className="px-4 py-2 text-left font-medium">{t('admin.options.placeholders.col_value')}</th>
                                  <th className="px-4 py-2 w-10"></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-700">
                                {cat.items.map((p) => (
                                  <tr key={p.key} className="hover:bg-gray-750">
                                    <td className="px-4 py-2.5 text-gray-300 font-medium">{p.label}</td>
                                    <td className="px-4 py-2.5">
                                      <code className="text-xs text-primary-300 font-mono bg-gray-900 px-2 py-1 rounded">
                                        {p.placeholder}
                                      </code>
                                    </td>
                                    <td className="px-4 py-2.5 text-gray-400 text-sm max-w-xs" title={p.contextual ? t('admin.options.placeholders.contextual_hint') : (p.value ? (p.value.length > 90 ? p.value.slice(0, 90) + '…' : p.value) : '')}>
                                      {p.contextual
                                        ? <span className="text-amber-500/70 italic text-xs">{t('admin.options.placeholders.contextual')}</span>
                                        : p.value
                                          ? (p.value.length > 30 ? p.value.slice(0, 30) + '…' : p.value)
                                          : <span className="text-gray-600 italic">{t('admin.options.placeholders.empty')}</span>}
                                    </td>
                                    <td className="px-4 py-2.5 text-right">
                                      <button
                                        onClick={() => handleCopyPlaceholder(p.placeholder)}
                                        className="p-1.5 text-gray-400 hover:text-white transition-colors"
                                        title={t('admin.options.placeholders.copy')}
                                      >
                                        {copiedPlaceholder === p.placeholder ? (
                                          <Check className="w-4 h-4 text-green-400" />
                                        ) : (
                                          <Copy className="w-4 h-4" />
                                        )}
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()
              ) : (
                <p className="text-sm text-gray-500 italic">{t('admin.options.placeholders.none')}</p>
              )}
            </div>
          </div>
        )}


      </div>
        </div>
      </div>

      {/* Export Options Modal */}
      {showExportOptions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-white mb-4">Exporter la configuration</h2>
            <p className="text-gray-400 mb-6">
              Sélectionnez les éléments à inclure dans l'export :
            </p>
            
            <div className="space-y-3 mb-6">
              <label className="flex items-center gap-3 p-3 bg-gray-900 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-800">
                <input
                  type="checkbox"
                  checked={exportOptions.appConfiguration}
                  onChange={(e) => setExportOptions(prev => ({ ...prev, appConfiguration: e.target.checked }))}
                  className="rounded border-gray-600 bg-gray-700 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <p className="text-white font-medium">Configuration de l'application</p>
                  <p className="text-xs text-gray-400">Organisation, SMTP, AI, etc.</p>
                </div>
              </label>
              
              <label className="flex items-center gap-3 p-3 bg-gray-900 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-800">
                <input
                  type="checkbox"
                  checked={exportOptions.plugins}
                  onChange={(e) => setExportOptions(prev => ({ ...prev, plugins: e.target.checked }))}
                  className="rounded border-gray-600 bg-gray-700 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <p className="text-white font-medium">Plugins</p>
                  <p className="text-xs text-gray-400">Configuration des plugins</p>
                </div>
              </label>
              
              <label className="flex items-center gap-3 p-3 bg-gray-900 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-800">
                <input
                  type="checkbox"
                  checked={exportOptions.crisisContacts}
                  onChange={(e) => setExportOptions(prev => ({ ...prev, crisisContacts: e.target.checked }))}
                  className="rounded border-gray-600 bg-gray-700 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <p className="text-white font-medium">Contacts de crise</p>
                  <p className="text-xs text-gray-400">Liste des contacts de crise</p>
                </div>
              </label>
              
              <label className="flex items-center gap-3 p-3 bg-gray-900 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-800">
                <input
                  type="checkbox"
                  checked={exportOptions.injectBank}
                  onChange={(e) => setExportOptions(prev => ({ ...prev, injectBank: e.target.checked }))}
                  className="rounded border-gray-600 bg-gray-700 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <p className="text-white font-medium">Banque d'injects</p>
                  <p className="text-xs text-gray-400">Tous les items de la banque d'injects</p>
                </div>
              </label>
              
              <label className="flex items-center gap-3 p-3 bg-gray-900 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-800">
                <input
                  type="checkbox"
                  checked={exportOptions.exerciseTemplates}
                  onChange={(e) => setExportOptions(prev => ({ ...prev, exerciseTemplates: e.target.checked }))}
                  className="rounded border-gray-600 bg-gray-700 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <p className="text-white font-medium">Modèles d'exercices</p>
                  <p className="text-xs text-gray-400">Exercices archivés comme modèles</p>
                </div>
              </label>
            </div>
            
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowExportOptions(false)}
                className="px-4 py-2 bg-gray-700 text-gray-100 border border-gray-600 rounded-lg hover:bg-gray-600"
              >
                Annuler
              </button>
              <button
                onClick={confirmExportOptions}
                disabled={isExportingOptions}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {isExportingOptions ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Exporter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
