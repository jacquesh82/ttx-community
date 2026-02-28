import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, PluginConfiguration, AppConfiguration, PluginType } from '../../services/api'
import { Save, RotateCcw, Check, X, Loader2, Settings, Puzzle, Shield, Mail, Building2, Clock, Key, Cpu, Download, Upload, MessageCircle, Smartphone, Phone, Tv, Newspaper, Users, FileText } from 'lucide-react'
import { useAppDialog } from '../../contexts/AppDialogContext'
import { useAuthStore } from '../../stores/authStore'
import ThemeModeSelector from '../../components/ThemeModeSelector'

const COLORS = [
  { value: 'green', label: 'Vert', class: 'bg-green-500' },
  { value: 'blue', label: 'Bleu', class: 'bg-blue-500' },
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

const MATURITY_LEVELS = [
  { value: 'beginner', label: 'Débutant' },
  { value: 'intermediate', label: 'Intermédiaire' },
  { value: 'expert', label: 'Expert' },
]

const EXERCISE_MODES = [
  { value: 'real_time', label: 'Temps réel' },
  { value: 'compressed', label: 'Compressé' },
  { value: 'simulated', label: 'Simulé' },
]

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

type TabType = 'general' | 'plugins' | 'security' | 'email' | 'simulators'

export default function OptionsPage() {
  const appDialog = useAppDialog()
  const queryClient = useQueryClient()
  const tenant = useAuthStore((state) => state.user?.tenant ?? null)
  const [activeTab, setActiveTab] = useState<TabType>('general')
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['app-configuration'] })
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

  // Simulator inject mapping helpers (1:N mapping)
  const getSimulatorInjectMapping = (simulatorId: string): string[] => {
    const mapping = getAppConfigValue('simulator_inject_mapping')
    if (!mapping) {
      // Default mapping using inject bank kinds
      const defaults: Record<string, string[]> = {
        mail: ['mail', 'canal_anssi', 'document'],
        chat: ['message'],
        sms: ['message'],
        tel: ['canal_anssi', 'audio'],
        tv: ['video', 'canal_gouvernement', 'canal_press'],
        social: ['social_post', 'idea'],
        press: ['canal_gouvernement', 'canal_press'],
      }
      return defaults[simulatorId] || ['message']
    }
    try {
      const parsed = JSON.parse(mapping)
      return parsed[simulatorId] || ['message']
    } catch {
      return ['message']
    }
  }

  const updateSimulatorInjectMapping = (simulatorId: string, injectType: string, checked: boolean) => {
    const currentMapping = getAppConfigValue('simulator_inject_mapping')
    let mapping: Record<string, string[]> = {}
    if (currentMapping) {
      try {
        mapping = JSON.parse(currentMapping)
      } catch {
        mapping = {}
      }
    }
    
    const currentTypes = mapping[simulatorId] || []
    if (checked) {
      // Add type if not already present
      if (!currentTypes.includes(injectType)) {
        mapping[simulatorId] = [...currentTypes, injectType]
      }
    } else {
      // Remove type
      mapping[simulatorId] = currentTypes.filter(t => t !== injectType)
    }
    
    updateAppConfigField('simulator_inject_mapping', JSON.stringify(mapping))
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (hasError) {
    return (
      <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-400">
        Erreur lors du chargement des configurations
      </div>
    )
  }

  const tabs = [
    { id: 'general' as TabType, label: 'Général', icon: Settings },
    { id: 'plugins' as TabType, label: 'Plugins', icon: Puzzle },
    { id: 'security' as TabType, label: 'Sécurité', icon: Shield },
    { id: 'email' as TabType, label: 'Email', icon: Mail },
    { id: 'simulators' as TabType, label: 'Simulateurs', icon: Cpu },
  ]

  const activeTabMeta = tabs.find((tab) => tab.id === activeTab) ?? tabs[0]
  const tenantLabel = tenant?.name?.trim() || 'Tenant non résolu'
  const tenantSlug = tenant?.slug?.trim() || null

  return (
    <div className="options-theme space-y-6">
      <input
        ref={importFileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleImportOptionsFile}
      />
      <input
        ref={organizationAutofillFileInputRef}
        type="file"
        accept=".txt,text/plain"
        className="hidden"
        onChange={handleImportOrganizationAutofillTxt}
      />

      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Options</h1>
            <p className="text-sm text-gray-400 mt-1">
              Configuration du tenant courant (branding, intégrations, sécurité et assistants).
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5">
              <Building2 className="w-4 h-4 text-blue-300" />
              <span className="text-sm text-blue-200 font-medium">{tenantLabel}</span>
              {tenantSlug && (
                <code className="text-xs text-blue-300 bg-blue-950/40 px-1.5 py-0.5 rounded">
                  {tenantSlug}
                </code>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                updateAppConfigMutation.isPending
                  ? 'border-blue-500/40 bg-blue-500/10 text-blue-400'
                  : appConfigAutosaveError
                    ? 'border-red-500/40 bg-red-500/10 text-red-400'
                    : appConfigChanged
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              }`}
              title={appConfigAutosaveError || undefined}
            >
              {updateAppConfigMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Clock className="w-4 h-4" />
              )}
              <span>
                {updateAppConfigMutation.isPending
                  ? 'Sauvegarde...'
                  : appConfigAutosaveError
                    ? 'Erreur auto-save'
                    : appConfigChanged
                      ? 'En attente auto-save'
                      : lastAppConfigSavedAt
                        ? 'Auto-save actif'
                        : 'Auto-save prêt'}
              </span>
            </div>
            <button
              onClick={handleExportOptions}
              disabled={isExportingOptions || isImportingOptions}
              className="flex items-center gap-2 px-3 py-2 bg-gray-700 text-gray-200 border border-gray-600 rounded-lg hover:bg-gray-600 disabled:opacity-50"
            >
              {isExportingOptions ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Exporter
            </button>
            <button
              onClick={() => importFileInputRef.current?.click()}
              disabled={isImportingOptions || isExportingOptions}
              className="flex items-center gap-2 px-3 py-2 bg-gray-700 text-gray-200 border border-gray-600 rounded-lg hover:bg-gray-600 disabled:opacity-50"
            >
              {isImportingOptions ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Importer
            </button>
          </div>
        </div>
      </div>

      {/* Navigation horizontale — mobile / tablette */}
      <div className="xl:hidden bg-gray-800 border border-gray-700 rounded-xl p-2 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                    : 'text-gray-400 hover:bg-gray-700/60 border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)] gap-6 items-start">
        <aside className="hidden xl:block xl:sticky xl:top-6 space-y-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-3">
            <p className="px-2 pb-2 text-xs font-semibold tracking-wider uppercase text-gray-500">
              Navigation
            </p>
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const active = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      active
                        ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                        : 'text-gray-300 hover:bg-gray-700/60 border border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{tab.label}</span>
                    </span>
                    {active && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                  </button>
                )
              })}
            </nav>
          </div>

          <div className="bg-gray-800/70 border border-gray-700 rounded-xl p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500">Onglet actif</p>
            <p className="text-sm font-medium text-white mt-1">{activeTabMeta.label}</p>
            <p className="text-xs text-gray-300 mt-2">
              Sauvegarde automatique activée (déclenchée après vos modifications).
            </p>
            {appConfigAutosaveError && (
              <p className="text-xs text-red-300 mt-2" title={appConfigAutosaveError}>
                Dernière erreur d&apos;enregistrement: {appConfigAutosaveError}
              </p>
            )}
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
        </aside>

        <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 md:p-6">
      {/* Tab Content */}
      <div className="space-y-6">
        {/* General Tab */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            {/* Organization Section */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <div className="flex items-center gap-3 mb-6">
                <Building2 className="w-5 h-5 text-gray-400" />
                <h2 className="text-lg font-medium text-white">Organisation</h2>
              </div>
              <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                Les valeurs affichées et enregistrées ici sont désormais tenant-scopées pour <strong>{tenantLabel}</strong>.
                {tenantSlug ? ` (slug: ${tenantSlug})` : ''}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Nom de l'organisation
                  </label>
                  <input
                    type="text"
                    value={getAppConfigValue('organization_name')}
                    onChange={(e) => updateAppConfigField('organization_name', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      id="import_txt"
                      onClick={() => organizationAutofillFileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 px-3 py-2 bg-gray-700 text-gray-100 rounded-lg text-sm hover:bg-gray-600"
                    >
                      <FileText className="w-4 h-4" />
                      Importer txt
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    URL du logo
                  </label>
                  <input
                    type="url"
                    value={getAppConfigValue('organization_logo_url') || ''}
                    onChange={(e) => updateAppConfigField('organization_logo_url', e.target.value || null)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://example.com/logo.png"
                  />
                  <p className="mt-1 text-xs text-gray-500">URL directe vers un fichier image (PNG, SVG, JPG). Ne pas utiliser l'URL d'une page web.</p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Description de l'organisation
                  </label>
                  <textarea
                    value={getAppConfigValue('organization_description') || ''}
                    onChange={(e) => updateAppConfigField('organization_description', e.target.value || null)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Décrivez brièvement le métier, le contexte et les enjeux de l'organisation..."
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    URL de référence de l'organisation
                  </label>
                  <input
                    type="url"
                    value={getAppConfigValue('organization_reference_url') || ''}
                    onChange={(e) => updateAppConfigField('organization_reference_url', e.target.value || null)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://organisation.exemple"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Mots-clés organisation (séparés par des virgules)
                  </label>
                  <input
                    type="text"
                    value={getAppConfigValue('organization_keywords') || ''}
                    onChange={(e) => updateAppConfigField('organization_keywords', e.target.value || null)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="secteur, technologies, domaines, filiales, SI, IOC..."
                  />
                </div>
              </div>
            </div>

            {/* Default Exercise Settings */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <div className="flex items-center gap-3 mb-6">
                <Clock className="w-5 h-5 text-gray-400" />
                <h2 className="text-lg font-medium text-white">Paramètres par défaut des exercices</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Niveau de maturité
                  </label>
                  <select
                    value={getAppConfigValue('default_maturity_level')}
                    onChange={(e) => updateAppConfigField('default_maturity_level', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {MATURITY_LEVELS.map((level) => (
                      <option key={level.value} value={level.value}>{level.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Mode d'exercice
                  </label>
                  <select
                    value={getAppConfigValue('default_exercise_mode')}
                    onChange={(e) => updateAppConfigField('default_exercise_mode', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {EXERCISE_MODES.map((mode) => (
                      <option key={mode.value} value={mode.value}>{mode.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Plugins Tab */}
        {activeTab === 'plugins' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-gray-400">
                Configurez les plugins disponibles pour les exercices
              </p>
              <button
                onClick={handleResetPlugins}
                disabled={resetPluginsMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-gray-100 border border-gray-600 rounded-lg hover:bg-gray-600 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                Réinitialiser
              </button>
            </div>

            {/* Plugins table */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Plugin</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Nom</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Icône</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Couleur</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-400">Par défaut</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-400">Ordre</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {plugins?.map((plugin) => (
                    <tr key={plugin.plugin_type} className="hover:bg-gray-750">
                      <td className="px-4 py-3">
                        <code className="text-xs bg-gray-900 px-2 py-1 rounded text-gray-300">
                          {plugin.plugin_type}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        {editingPlugin === plugin.plugin_type ? (
                          <input
                            type="text"
                            value={editedPluginData.name || ''}
                            onChange={(e) => setEditedPluginData({ ...editedPluginData, name: e.target.value })}
                            className="w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-sm"
                          />
                        ) : (
                          <span className="text-white">{plugin.name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingPlugin === plugin.plugin_type ? (
                          <select
                            value={editedPluginData.icon || ''}
                            onChange={(e) => setEditedPluginData({ ...editedPluginData, icon: e.target.value })}
                            className="px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-sm"
                          >
                            {ICONS.map((icon) => (
                              <option key={icon} value={icon}>{icon}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-300 text-sm">{plugin.icon}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingPlugin === plugin.plugin_type ? (
                          <select
                            value={editedPluginData.color || ''}
                            onChange={(e) => setEditedPluginData({ ...editedPluginData, color: e.target.value })}
                            className="px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-sm"
                          >
                            {COLORS.map((color) => (
                              <option key={color.value} value={color.value}>{color.label}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded ${COLORS.find(c => c.value === plugin.color)?.class || 'bg-gray-500'}`} />
                            <span className="text-gray-300 text-sm">{plugin.color}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {editingPlugin === plugin.plugin_type ? (
                          <input
                            type="checkbox"
                            checked={editedPluginData.default_enabled || false}
                            onChange={(e) => setEditedPluginData({ ...editedPluginData, default_enabled: e.target.checked })}
                            className="rounded border-gray-600 bg-gray-900 text-blue-600"
                          />
                        ) : (
                          plugin.default_enabled && (
                            <Check className="w-4 h-4 text-green-500 mx-auto" />
                          )
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {editingPlugin === plugin.plugin_type ? (
                          <input
                            type="number"
                            value={editedPluginData.sort_order || 0}
                            onChange={(e) => setEditedPluginData({ ...editedPluginData, sort_order: parseInt(e.target.value) || 0 })}
                            className="w-16 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-sm text-center"
                          />
                        ) : (
                          <span className="text-gray-300 text-sm">{plugin.sort_order}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          {editingPlugin === plugin.plugin_type ? (
                            <>
                              <button
                                onClick={() => savePlugin(plugin.plugin_type)}
                                disabled={savingPlugins.has(plugin.plugin_type)}
                                className="p-1 text-green-400 hover:text-green-300 disabled:opacity-50"
                              >
                                {savingPlugins.has(plugin.plugin_type) ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Save className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                onClick={cancelEditingPlugin}
                                className="p-1 text-gray-300 hover:text-white"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => startEditingPlugin(plugin)}
                              className="px-3 py-1 text-sm bg-gray-700 text-gray-100 border border-gray-600 rounded hover:bg-gray-600"
                            >
                              Modifier
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Info */}
            <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
              <h3 className="text-sm font-medium text-gray-300 mb-2">Information</h3>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>• Les modifications apportées ici affectent les nouveaux exercices créés.</li>
                <li>• Les exercices existants conservent leur configuration de plugins actuelle.</li>
                <li>• Le champ "Par défaut" indique si le plugin est activé par défaut lors de la création d'un exercice.</li>
              </ul>
            </div>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <div className="flex items-center gap-3 mb-6">
                <Shield className="w-5 h-5 text-gray-400" />
                <h2 className="text-lg font-medium text-white">Paramètres de sécurité</h2>
              </div>
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
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Email Tab */}
        {activeTab === 'email' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-gray-400" />
                  <h2 className="text-lg font-medium text-white">Configuration SMTP</h2>
                </div>
                <button
                  onClick={() => updateAppConfigField('smtp_enabled', !getAppConfigValue('smtp_enabled'))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    getAppConfigValue('smtp_enabled') ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      getAppConfigValue('smtp_enabled') ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {getAppConfigValue('smtp_enabled') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Serveur SMTP
                    </label>
                    <input
                      type="text"
                      value={getAppConfigValue('smtp_host') || ''}
                      onChange={(e) => updateAppConfigField('smtp_host', e.target.value || null)}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="smtp.example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Port
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="65535"
                      value={getAppConfigValue('smtp_port') || ''}
                      onChange={(e) => updateAppConfigField('smtp_port', parseInt(e.target.value) || null)}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="587"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Utilisateur
                    </label>
                    <input
                      type="text"
                      value={getAppConfigValue('smtp_user') || ''}
                      onChange={(e) => updateAppConfigField('smtp_user', e.target.value || null)}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="user@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Adresse d'expédition
                    </label>
                    <input
                      type="email"
                      value={getAppConfigValue('smtp_from') || ''}
                      onChange={(e) => updateAppConfigField('smtp_from', e.target.value || null)}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="noreply@example.com"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Simulators Tab */}
        {activeTab === 'simulators' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <div className="flex items-center gap-3 mb-6">
                <Cpu className="w-5 h-5 text-gray-400" />
                <h2 className="text-lg font-medium text-white">Mapping Simulateurs - Types d'inject</h2>
              </div>
              <p className="text-sm text-gray-400 mb-4">
                Configurez le mapping entre les simulateurs et les types d'inject de la banque d'injects (sélection multiple possible)
              </p>
              
              <div className="space-y-6">
                {[
                  { id: 'mail', label: 'Mail', icon: Mail },
                  { id: 'chat', label: 'Chat', icon: MessageCircle },
                  { id: 'sms', label: 'SMS', icon: Smartphone },
                  { id: 'tel', label: 'Téléphone', icon: Phone },
                  { id: 'tv', label: 'TV', icon: Tv },
                  { id: 'social', label: 'Réseau social', icon: MessageCircle },
                  { id: 'press', label: 'Presse', icon: Newspaper },
                ].map((simulator) => {
                  const selectedTypes = getSimulatorInjectMapping(simulator.id)
                  return (
                    <div key={simulator.id} className="bg-gray-900 rounded-lg border border-gray-700 p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0">
                          {simulator.id === 'mail' && <Mail className="w-5 h-5 text-gray-300" />}
                          {simulator.id === 'chat' && <MessageCircle className="w-5 h-5 text-gray-300" />}
                          {simulator.id === 'sms' && <Smartphone className="w-5 h-5 text-gray-300" />}
                          {simulator.id === 'tel' && <Phone className="w-5 h-5 text-gray-300" />}
                          {simulator.id === 'tv' && <Tv className="w-5 h-5 text-gray-300" />}
                          {simulator.id === 'social' && <MessageCircle className="w-5 h-5 text-gray-300" />}
                          {simulator.id === 'press' && <Newspaper className="w-5 h-5 text-gray-300" />}
                        </div>
                        <div>
                          <p className="text-white font-medium">{simulator.label}</p>
                          <p className="text-xs text-gray-400">Simulateur {simulator.id}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {[
                          { value: 'mail', label: 'Mail' },
                          { value: 'message', label: 'Message' },
                          { value: 'social_post', label: 'Réseau social' },
                          { value: 'canal_press', label: 'Presse' },
                          { value: 'canal_anssi', label: 'Canal ANSSI' },
                          { value: 'canal_gouvernement', label: 'Canal Gouvernement' },
                          { value: 'document', label: 'Document' },
                          { value: 'image', label: 'Image' },
                          { value: 'video', label: 'Vidéo' },
                          { value: 'audio', label: 'Audio' },
                          { value: 'scenario', label: 'Scénario' },
                          { value: 'chronogram', label: 'Chronogramme' },
                          { value: 'directory', label: 'Répertoire' },
                          { value: 'reference_url', label: 'URL de référence' },
                          { value: 'idea', label: 'Idée' },
                          { value: 'other', label: 'Autre' },
                        ].map((type) => (
                          <label key={type.value} className="flex items-center gap-2 px-2 py-1 bg-gray-800 rounded border border-gray-600 cursor-pointer hover:bg-gray-750">
                            <input
                              type="checkbox"
                              checked={selectedTypes.includes(type.value)}
                              onChange={(e) => updateSimulatorInjectMapping(simulator.id, type.value, e.target.checked)}
                              className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-300">{type.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
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
                  className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
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
                  className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
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
                  className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
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
                  className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
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
                  className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
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
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
