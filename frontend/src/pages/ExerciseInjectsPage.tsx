import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  injectsApi,
  exercisesApi,
  crisisManagementApi,
  exerciseUsersApi,
  teamsApi,
  Inject,
  InjectBankKind,
  InjectType,
  InjectStatus,
  InjectCategory,
  InjectChannel,
  InjectDataFormat,
  TargetAudience,
  TestedCompetence,
  PressureLevel,
  TriggerMode,
  AudienceTarget,
} from '../services/api'
import { useInjectBankKinds, useInjectTypes } from '../hooks/useInjectBank'
import { INJECT_BANK_KIND_LABELS } from '../config/injectBank'
import {
  ArrowLeft,
  Plus,
  Send,
  Clock,
  Trash2,
  Pencil,
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
  BarChart2,
  Upload,
  Phone,
  Newspaper,
  Monitor,
  FileText,
} from 'lucide-react'
import Modal from '../components/Modal'
import ImportCSVModal from '../components/ImportCSVModal'
import { useAppDialog } from '../contexts/AppDialogContext'

// ─── Config par type ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<InjectStatus, { label: string; color: string; dot: string }> = {
  draft:     { label: 'Brouillon',  color: 'bg-gray-100 text-gray-700',     dot: 'bg-gray-400' },
  scheduled: { label: 'Planifié',   color: 'bg-primary-100 text-primary-700',     dot: 'bg-primary-500' },
  sent:      { label: 'Envoyé',     color: 'bg-green-100 text-green-700',   dot: 'bg-green-500' },
  cancelled: { label: 'Annulé',     color: 'bg-red-100 text-red-700',       dot: 'bg-red-400' },
}

const CATEGORY_CONFIG: Record<InjectCategory, { label: string; color: string }> = {
  information: { label: 'Information', color: 'bg-primary-50 text-primary-700' },
  incident:    { label: 'Incident',    color: 'bg-red-50 text-red-700' },
  decision:    { label: 'Décision',    color: 'bg-orange-50 text-orange-700' },
  media:       { label: 'Média',       color: 'bg-purple-50 text-purple-700' },
  technical:   { label: 'Technique',   color: 'bg-gray-50 text-gray-700' },
  legal:       { label: 'Juridique',   color: 'bg-indigo-50 text-indigo-700' },
  canal_press: { label: 'Canal presse', color: 'bg-cyan-50 text-cyan-700' },
  canal_anssi: { label: 'Canal ANSSI', color: 'bg-emerald-50 text-emerald-700' },
  canal_gouvernement: { label: 'Canal gouvernement', color: 'bg-amber-50 text-amber-700' },
}

const CHANNEL_CONFIG: Record<InjectChannel, { label: string; icon: React.ElementType }> = {
  mail:           { label: 'Mail',            icon: Mail },
  phone:          { label: 'Téléphone',       icon: Phone },
  press:          { label: 'Presse',          icon: Newspaper },
  siem:           { label: 'SIEM',            icon: Monitor },
  tv:             { label: 'TV',              icon: Tv },
  social_network: { label: 'Réseau social',   icon: Twitter },
  official_mail:  { label: 'Courrier officiel', icon: FileText },
}

const AUDIENCE_CONFIG: Record<TargetAudience, string> = {
  direction: 'Direction',
  dsi: 'DSI',
  com: 'COM',
  legal: 'Juridique',
  care: 'Soins',
  all: 'Tous',
}

const AUDIENCE_KIND_LABELS: Record<string, string> = {
  role: 'Rôle',
  team: 'Équipe',
  user: 'Utilisateur',
  tag: 'Tag',
}

const COMPETENCE_CONFIG: Record<TestedCompetence, string> = {
  coordination: 'Coordination',
  arbitration: 'Arbitrage',
  communication: 'Communication',
  technical: 'Technique',
  governance: 'Gouvernance',
}

const PRESSURE_CONFIG: Record<PressureLevel, { label: string; color: string }> = {
  low:      { label: 'Faible',    color: 'bg-green-100 text-green-700' },
  medium:   { label: 'Moyen',     color: 'bg-yellow-100 text-yellow-700' },
  high:     { label: 'Élevé',     color: 'bg-orange-100 text-orange-700' },
  critical: { label: 'Critique',  color: 'bg-red-100 text-red-700' },
}

const DATA_FORMAT_LABELS: Record<InjectDataFormat, string> = {
  text: 'Texte',
  audio: 'Audio',
  video: 'Video',
  image: 'Image',
}

export type RecipientKind = '' | 'user' | 'team' | 'role'

// Mapping banque d'injects ↔︎ types
export const BANK_KIND_TO_INJECT_TYPE: Record<InjectBankKind, InjectType> = {
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
  other: 'system',
}

export const INJECT_TYPE_TO_BANK_KIND: Record<InjectType, InjectBankKind> = {
  mail: 'mail',
  twitter: 'socialnet',
  tv: 'tv',
  decision: 'story',
  score: 'story',
  system: 'doc',
}

export const BANK_KIND_ORDER_FALLBACK: InjectBankKind[] = [
  'mail',
  'sms',
  'call',
  'socialnet',
  'tv',
  'doc',
  'directory',
  'story',
]

// ─── Formulaire inject (create / edit) ───────────────────────────────────────

export interface InjectFormData {
  custom_id: string
  title: string
  description: string
  bank_kind: InjectBankKind | ''
  type: InjectType
  data_format: InjectDataFormat
  inject_category: InjectCategory | ''
  channel: InjectChannel | ''
  target_audience: TargetAudience | ''
  recipient_kind: RecipientKind
  recipient_value: string
  pedagogical_objective: string
  tested_competence: TestedCompetence | ''
  pressure_level: PressureLevel | ''
  time_offset: string
  content_text: string
  scheduled_at: string
  dependency_ids: string
  phase_id: string
  trigger_mode: TriggerMode
}

export const EMPTY_FORM: InjectFormData = {
  custom_id: '',
  title: '',
  description: '',
  bank_kind: 'mail',
  type: 'mail',
  data_format: 'text',
  inject_category: '',
  channel: '',
  target_audience: '',
  recipient_kind: '',
  recipient_value: '',
  pedagogical_objective: '',
  tested_competence: '',
  pressure_level: '',
  time_offset: '',
  content_text: '',
  scheduled_at: '',
  dependency_ids: '',
  phase_id: '',
  trigger_mode: 'auto',
}

interface InjectFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: InjectFormData) => void
  initial?: InjectFormData
  injectId?: number
  isPending: boolean
  title: string
  allInjects?: Inject[]
  phases?: Array<{ id: number; name: string; phase_order: number }>
  bankTypeOptions: { kind: InjectBankKind; injectType: InjectType; label: string }[]
  recipientUsers?: Array<{ user_id: number; user_username: string; user_email: string }>
  recipientTeams?: Array<{ id: number; name: string }>
  submitLabel?: string
  extraContent?: ReactNode
  extraFooter?: ReactNode
  maxWidthClassName?: string
  mergeCreateTabs?: boolean
}

export function InjectFormModal({
  isOpen,
  onClose,
  onSubmit,
  initial = EMPTY_FORM,
  injectId,
  isPending,
  title,
  allInjects = [],
  phases = [],
  bankTypeOptions,
  recipientUsers = [],
  recipientTeams = [],
  submitLabel = 'Sauvegarder',
  extraContent,
  extraFooter,
  maxWidthClassName = 'max-w-4xl',
  mergeCreateTabs = false,
}: InjectFormModalProps) {
  const isCompact = mergeCreateTabs
  const normalizedInitial = useMemo<InjectFormData>(() => {
    const fallbackKind = INJECT_TYPE_TO_BANK_KIND[initial.type] || 'mail'
    const bank_kind = initial.bank_kind || fallbackKind
    const type = BANK_KIND_TO_INJECT_TYPE[bank_kind] || initial.type || 'mail'
    return { ...EMPTY_FORM, ...initial, bank_kind, type }
  }, [initial])

  const [form, setForm] = useState<InjectFormData>(normalizedInitial)

  useEffect(() => {
    setForm(normalizedInitial)
  }, [normalizedInitial])

  const set = (field: keyof InjectFormData, value: string) =>
    setForm((f) => ({ ...f, [field]: value }))

  // Filter out current inject from dependencies
  const availableDependencies = allInjects.filter(i => i.id !== injectId)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidthClassName={maxWidthClassName}>
      <div className={`${isCompact ? 'space-y-3 max-h-[78vh]' : 'space-y-4 max-h-[70vh]'} overflow-y-auto`}>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
          <div className="space-y-3">
        {/* ID personnalisé + Titre */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ID Inject
            </label>
            <input
              type="text"
              value={form.custom_id}
              onChange={(e) => set('custom_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="INJ-J1-005"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Titre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Ex: Communiqué de presse urgent"
            />
          </div>
        </div>

        {/* Type + Format + Canal */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={form.bank_kind}
              onChange={(e) => {
                const kind = e.target.value as InjectBankKind
                const injectType = BANK_KIND_TO_INJECT_TYPE[kind] || 'system'
                setForm((f) => ({ ...f, bank_kind: kind, type: injectType }))
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {bankTypeOptions.map((opt) => (
                <option key={opt.kind} value={opt.kind}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Format de la donnee</label>
            <select
              value={form.data_format}
              onChange={(e) => set('data_format', e.target.value as InjectDataFormat)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-gray-900"
            >
              {Object.entries(DATA_FORMAT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
            <select
              value={form.inject_category}
              onChange={(e) => set('inject_category', e.target.value as InjectCategory | '')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">-</option>
              {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Canal</label>
            <select
              value={form.channel}
              onChange={(e) => set('channel', e.target.value as InjectChannel | '')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">-</option>
              {Object.entries(CHANNEL_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Description courte..."
          />
        </div>

        {/* Contenu */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Contenu</label>
          <textarea
            value={form.content_text}
            onChange={(e) => set('content_text', e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
            placeholder="Contenu de l'inject..."
          />
        </div>
          </div>

          <div className="space-y-3">
        {/* Timing */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              T+ (minutes)
            </label>
            <input
              type="number"
              value={form.time_offset}
              onChange={(e) => set('time_offset', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="0, 30, 60..."
              min="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date/heure planifiée
            </label>
            <input
              type="datetime-local"
              value={form.scheduled_at}
              onChange={(e) => set('scheduled_at', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        {/* Phase + Trigger mode */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phase</label>
            <select
              value={form.phase_id}
              onChange={(e) => set('phase_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Aucune</option>
              {phases.map((phase) => (
                <option key={phase.id} value={String(phase.id)}>
                  {phase.phase_order}. {phase.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Déclenchement</label>
            <select
              value={form.trigger_mode}
              onChange={(e) => set('trigger_mode', e.target.value as TriggerMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="auto">Automatique</option>
              <option value="manual">Manuel</option>
              <option value="conditional">Conditionnel</option>
            </select>
          </div>
        </div>

        {/* Destinataire + Public cible + Compétence + Pression */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Destinataire (type)</label>
            <select
              value={form.recipient_kind}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  recipient_kind: e.target.value as RecipientKind,
                  recipient_value: '',
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-gray-900"
            >
              <option value="">Aucun</option>
              <option value="user">Une personne</option>
              <option value="team">Une equipe</option>
              <option value="role">Un role</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Destinataire (valeur)</label>
            {form.recipient_kind === 'user' ? (
              <select
                value={form.recipient_value}
                onChange={(e) => set('recipient_value', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-gray-900"
              >
                <option value="">-</option>
                {recipientUsers.map((user) => (
                  <option key={user.user_id} value={String(user.user_id)}>
                    {user.user_username} ({user.user_email})
                  </option>
                ))}
              </select>
            ) : form.recipient_kind === 'team' ? (
              <select
                value={form.recipient_value}
                onChange={(e) => set('recipient_value', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-gray-900"
              >
                <option value="">-</option>
                {recipientTeams.map((team) => (
                  <option key={team.id} value={String(team.id)}>
                    {team.name}
                  </option>
                ))}
              </select>
            ) : form.recipient_kind === 'role' ? (
              <select
                value={form.recipient_value}
                onChange={(e) => set('recipient_value', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-gray-900"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-400"
                placeholder="-"
              />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Public cible</label>
            <select
              value={form.target_audience}
              onChange={(e) => set('target_audience', e.target.value as TargetAudience | '')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">-</option>
              {Object.entries(AUDIENCE_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Compétence testée</label>
            <select
              value={form.tested_competence}
              onChange={(e) => set('tested_competence', e.target.value as TestedCompetence | '')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">-</option>
              {Object.entries(COMPETENCE_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Niveau de pression</label>
            <select
              value={form.pressure_level}
              onChange={(e) => set('pressure_level', e.target.value as PressureLevel | '')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">-</option>
              {Object.entries(PRESSURE_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Objectif pédagogique */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Objectif pédagogique</label>
          <textarea
            value={form.pedagogical_objective}
            onChange={(e) => set('pedagogical_objective', e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Ce que l'inject doit provoquer..."
          />
        </div>

        {/* Dépendances */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Dépendances (IDs des injects précédents, séparés par des virgules)
          </label>
          <input
            type="text"
            value={form.dependency_ids}
            onChange={(e) => set('dependency_ids', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="1, 3, 5"
          />
          {availableDependencies.length > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              Disponibles: {availableDependencies.slice(0, 5).map(i => `#${i.id}`).join(', ')}
              {availableDependencies.length > 5 && ` ... (+${availableDependencies.length - 5})`}
            </p>
          )}
        </div>
          </div>
        </div>

        {extraContent}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          {extraFooter && <div className="mr-auto">{extraFooter}</div>}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onSubmit(form)}
            disabled={!form.title.trim() || isPending}
            className="px-4 py-2 text-sm text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
          >
            {isPending ? 'Sauvegarde...' : submitLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function ExerciseInjectsPage() {
  const appDialog = useAppDialog()
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const exId = parseInt(exerciseId!)

  const { data: injectTypes } = useInjectTypes()
  const { data: bankKinds } = useInjectBankKinds()

  const bankTypeOptions = useMemo(
    () => {
      const kinds = bankKinds && bankKinds.length > 0 ? bankKinds : BANK_KIND_ORDER_FALLBACK
      return kinds.map((kind) => ({
        kind,
        injectType: BANK_KIND_TO_INJECT_TYPE[kind] || 'system',
        label: INJECT_BANK_KIND_LABELS[kind] || kind,
      }))
    },
    [bankKinds],
  )

  // Dynamic type config based on API
  const injectTypeConfig = useMemo(() => {
    const icons: Record<string, React.ElementType> = {
      mail: Mail,
      twitter: Twitter,
      tv: Tv,
      decision: AlertCircle,
      score: Star,
      system: Settings,
    }
    const colors: Record<string, { color: string; bg: string }> = {
      mail: { color: 'text-primary-700', bg: 'bg-primary-100' },
      twitter: { color: 'text-sky-700', bg: 'bg-sky-100' },
      tv: { color: 'text-teal-700', bg: 'bg-teal-100' },
      decision: { color: 'text-orange-700', bg: 'bg-orange-100' },
      score: { color: 'text-yellow-700', bg: 'bg-yellow-100' },
      system: { color: 'text-gray-700', bg: 'bg-gray-100' },
    }
    const config: Record<InjectType, { label: string; color: string; bg: string; icon: React.ElementType }> = {} as any
    const types = injectTypes || ['mail', 'twitter', 'tv', 'decision', 'score', 'system']
    for (const t of types) {
      config[t as InjectType] = {
        label: t.charAt(0).toUpperCase() + t.slice(1),
        ...(colors[t] || { color: 'text-gray-700', bg: 'bg-gray-100' }),
        icon: icons[t] || Settings,
      }
    }
    return config
  }, [injectTypes])

  const typeFilterOptions = useMemo(() => {
    const map = new Map<InjectType, string>()
    bankTypeOptions.forEach((opt) => {
      if (!map.has(opt.injectType)) {
        map.set(opt.injectType as InjectType, opt.label)
      }
    })
    Object.entries(injectTypeConfig).forEach(([t, cfg]) => {
      if (!map.has(t as InjectType)) {
        map.set(t as InjectType, cfg.label)
      }
    })
    return Array.from(map.entries())
  }, [bankTypeOptions, injectTypeConfig])

  // Filtres
  const [typeFilter, setTypeFilter] = useState<InjectType | ''>('')
  const [statusFilter, setStatusFilter] = useState<InjectStatus | ''>('')
  const [categoryFilter, setCategoryFilter] = useState<InjectCategory | ''>('')
  const [pressureFilter, setPressureFilter] = useState<PressureLevel | ''>('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  // Modals
  const [showCreate, setShowCreate] = useState(false)
  const [showImportCSV, setShowImportCSV] = useState(false)
  const [editInject, setEditInject] = useState<Inject | null>(null)
  const [scheduleInject, setScheduleInject] = useState<Inject | null>(null)
  const [scheduleDate, setScheduleDate] = useState('')
  const [viewInject, setViewInject] = useState<Inject | null>(null)

  // Queries
  const { data: exercise } = useQuery({
    queryKey: ['exercise', exerciseId],
    queryFn: () => exercisesApi.get(exId),
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['injects', exerciseId, typeFilter, statusFilter, page],
    queryFn: () =>
      injectsApi.list({
        exercise_id: exId,
        type: typeFilter || undefined,
        status: statusFilter || undefined,
        page,
        page_size: PAGE_SIZE,
      }),
  })
  const { data: phases } = useQuery({
    queryKey: ['exercise-phases', exerciseId],
    queryFn: () => crisisManagementApi.listPhases(exId),
  })
  const { data: exerciseUsersData } = useQuery({
    queryKey: ['exercise-users', exerciseId],
    queryFn: () => exerciseUsersApi.listExerciseUsers(exId),
  })
  const { data: exerciseTeamsData } = useQuery({
    queryKey: ['exercise-teams', exId],
    queryFn: () => exercisesApi.listTeams(exId),
  })
  const { data: triggerRules } = useQuery({
    queryKey: ['inject-triggers', exerciseId],
    queryFn: () => crisisManagementApi.listInjectTriggers(exId),
  })

  const injects = data?.injects ?? []
  const exerciseUsers = exerciseUsersData?.users ?? []
  const exerciseTeams = exerciseTeamsData?.teams ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (form: InjectFormData) => {
      const bankKind = form.bank_kind || INJECT_TYPE_TO_BANK_KIND[form.type] || 'other'
      const injectType = BANK_KIND_TO_INJECT_TYPE[bankKind] || form.type
      const created = await injectsApi.create({
        exercise_id: exId,
        title: form.title,
        description: form.description || undefined,
        type: injectType,
        data_format: form.data_format,
        custom_id: form.custom_id || undefined,
        inject_category: form.inject_category || undefined,
        channel: form.channel || undefined,
        target_audience: form.target_audience || undefined,
        pedagogical_objective: form.pedagogical_objective || undefined,
        tested_competence: form.tested_competence || undefined,
        pressure_level: form.pressure_level || undefined,
        time_offset: form.time_offset ? parseInt(form.time_offset) : undefined,
        dependency_ids: form.dependency_ids ? form.dependency_ids.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : undefined,
        phase_id: form.phase_id ? parseInt(form.phase_id) : undefined,
        content: { text: form.content_text, bank_kind: bankKind },
        scheduled_at: form.scheduled_at || undefined,
        audiences: buildAudiencesFromForm(form),
      })
      await crisisManagementApi.upsertInjectTrigger(exId, {
        inject_id: created.id,
        trigger_mode: form.trigger_mode,
        expression: form.trigger_mode === 'conditional' ? { metric: 'decisions_count', op: '>=', value: 1 } : null,
      })
      return created
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['injects', exerciseId] })
      queryClient.invalidateQueries({ queryKey: ['inject-triggers', exerciseId] })
      setShowCreate(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, form }: { id: number; form: InjectFormData }) => {
      const bankKind = form.bank_kind || INJECT_TYPE_TO_BANK_KIND[form.type] || 'other'
      const updated = await injectsApi.update(id, {
        title: form.title,
        description: form.description || undefined,
        data_format: form.data_format,
        custom_id: form.custom_id || undefined,
        inject_category: form.inject_category || undefined,
        channel: form.channel || undefined,
        target_audience: form.target_audience || undefined,
        pedagogical_objective: form.pedagogical_objective || undefined,
        tested_competence: form.tested_competence || undefined,
        pressure_level: form.pressure_level || undefined,
        time_offset: form.time_offset ? parseInt(form.time_offset) : undefined,
        dependency_ids: form.dependency_ids ? form.dependency_ids.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : undefined,
        phase_id: form.phase_id ? parseInt(form.phase_id) : undefined,
        content: { text: form.content_text, bank_kind: bankKind },
        scheduled_at: form.scheduled_at || undefined,
        audiences: buildAudiencesFromForm(form),
      })
      await crisisManagementApi.upsertInjectTrigger(exId, {
        inject_id: id,
        trigger_mode: form.trigger_mode,
        expression: form.trigger_mode === 'conditional' ? { metric: 'decisions_count', op: '>=', value: 1 } : null,
      })
      return updated
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['injects', exerciseId] })
      queryClient.invalidateQueries({ queryKey: ['inject-triggers', exerciseId] })
      setEditInject(null)
    },
  })

  const sendMutation = useMutation({
    mutationFn: (id: number) => injectsApi.send(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['injects', exerciseId] }),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: number) => injectsApi.cancel(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['injects', exerciseId] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => injectsApi.delete(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['injects', exerciseId] }),
  })

  const scheduleMutation = useMutation({
    mutationFn: ({ id, date }: { id: number; date: string }) =>
      injectsApi.schedule(id, new Date(date).toISOString()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['injects', exerciseId] })
      setScheduleInject(null)
    },
  })

  const handleDelete = async (inject: Inject) => {
    if (await appDialog.confirm(`Supprimer l'inject "${inject.title}" ?`)) {
      deleteMutation.mutate(inject.id)
    }
  }

  const formatTimeOffset = (offset: number | null) => {
    if (offset === null) return '—'
    const days = Math.floor(offset / (24 * 60))
    const hours = Math.floor((offset % (24 * 60)) / 60)
    const mins = offset % 60
    if (days > 0) {
      return `J${days + 1} – ${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
    }
    return `J1 – ${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
  }

  // Tabs
  const tabs = [
    { label: 'Vue d\'ensemble', path: `/exercises/${exerciseId}` },
    { label: 'Chronogramme', path: `/exercises/${exerciseId}/chronogramme` },
    { label: 'Injects', path: `/exercises/${exerciseId}/injects` },
    { label: 'Médias', path: `/exercises/${exerciseId}/media` },
  ]

  // Filter injects locally for category and pressure
  const filteredInjects = useMemo(() => {
    return injects.filter((i) => {
      if (categoryFilter && i.inject_category !== categoryFilter) return false
      if (pressureFilter && i.pressure_level !== pressureFilter) return false
      return true
    })
  }, [injects, categoryFilter, pressureFilter])

  const buildAudiencesFromForm = (form: InjectFormData): AudienceTarget[] => {
    if (!form.recipient_kind || !form.recipient_value) return []
    return [{ kind: form.recipient_kind as AudienceTarget['kind'], value: form.recipient_value }]
  }

  const getRecipientFromInject = (inject: Inject): { recipient_kind: RecipientKind; recipient_value: string } => {
    const first = inject.audiences?.[0]
    if (!first) return { recipient_kind: '', recipient_value: '' }
    if (first.kind === 'user' || first.kind === 'team' || first.kind === 'role') {
      return { recipient_kind: first.kind, recipient_value: String(first.value) }
    }
    return { recipient_kind: '', recipient_value: '' }
  }

  return (
    <div>
      {/* Retour */}
      <button
        onClick={() => navigate('/exercises')}
        className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="mr-2" size={18} />
        Retour aux exercices
      </button>

      {/* En-tête */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">
          {exercise?.name ?? '…'}
        </h1>
        <p className="text-sm text-gray-500">Gestion des injects</p>
      </div>

      {/* Onglets */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-1 -mb-px">
          {tabs.map((tab) => {
            const active = window.location.pathname === tab.path
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  active
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        {/* Filtres */}
        <div className="flex flex-wrap gap-2">
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value as any); setPage(1) }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Tous types</option>
            {typeFilterOptions.map(([type, label]) => (
              <option key={type} value={type}>{label}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1) }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Tous statuts</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value as any); setPage(1) }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Toutes catégories</option>
            {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          <select
            value={pressureFilter}
            onChange={(e) => { setPressureFilter(e.target.value as any); setPage(1) }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Toutes pressions</option>
            {Object.entries(PRESSURE_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Link
            to={`/exercises/${exerciseId}/chronogramme`}
            className="inline-flex items-center px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            <BarChart2 className="mr-1.5" size={15} />
            Chronogramme
          </Link>
          <button
            onClick={() => setShowImportCSV(true)}
            className="inline-flex items-center px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            <Upload className="mr-1.5" size={15} />
            Importer CSV
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center px-3 py-1.5 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            <Plus className="mr-1.5" size={15} />
            Nouvel inject
          </button>
        </div>
      </div>

      {/* Résumé */}
      {!isLoading && (
        <div className="flex gap-4 mb-4 flex-wrap">
          {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
            const count = injects.filter((i) => i.status === status).length
            return (
              <div key={status} className="flex items-center gap-1.5 text-sm text-gray-600">
                <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                {cfg.label} : <strong>{count}</strong>
              </div>
            )
          })}
          <span className="text-sm text-gray-400 ml-auto">Total : {total}</span>
        </div>
      )}

      {/* Tableau */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-gray-500">Chargement…</div>
        ) : isError ? (
          <div className="p-10 text-center text-red-500">Erreur de chargement</div>
        ) : filteredInjects.length === 0 ? (
          <div className="p-10 text-center text-gray-500">
            <CalendarClock className="mx-auto mb-3 text-gray-300" size={36} />
            <p>Aucun inject trouvé</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-3 text-sm text-primary-600 hover:underline"
            >
              Créer le premier inject
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left font-medium text-gray-500 whitespace-nowrap">ID</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500 whitespace-nowrap">T+</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500 whitespace-nowrap">Type</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500 whitespace-nowrap">Catégorie</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500 whitespace-nowrap">Titre</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500 whitespace-nowrap">Canal</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500 whitespace-nowrap">Cible</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500 whitespace-nowrap">Pression</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500 whitespace-nowrap">Statut</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-500 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredInjects.map((inject) => {
                  const bankKind =
                    ((inject.content as Record<string, any> | null | undefined)?.bank_kind as InjectBankKind | undefined) ||
                    INJECT_TYPE_TO_BANK_KIND[inject.type]
                  const typeCfg = injectTypeConfig[inject.type]
                  const bankLabel = INJECT_BANK_KIND_LABELS[bankKind] || typeCfg.label
                  const statusCfg = STATUS_CONFIG[inject.status]
                  const Icon = typeCfg.icon
                  const canEdit = inject.status !== 'sent' && inject.status !== 'cancelled'
                  const canSend = inject.status === 'draft' || inject.status === 'scheduled'
                  const canCancel = inject.status === 'draft' || inject.status === 'scheduled'

                  return (
                    <tr key={inject.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setViewInject(inject)}>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs text-gray-600">
                          {inject.custom_id || `#${inject.id}`}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-gray-600">
                        {formatTimeOffset(inject.time_offset)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${typeCfg.bg} ${typeCfg.color}`}
                        >
                          <Icon size={12} />
                          {bankLabel}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {inject.inject_category && (
                          <span className={`text-xs px-2 py-0.5 rounded ${CATEGORY_CONFIG[inject.inject_category].color}`}>
                            {CATEGORY_CONFIG[inject.inject_category].label}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-gray-900 truncate max-w-xs">{inject.title}</p>
                        <p className="text-xs text-gray-500">Format: {DATA_FORMAT_LABELS[inject.data_format || 'text']}</p>
                        {inject.audiences?.[0] && (
                          <p className="text-xs text-gray-500">
                            Dest.: {(AUDIENCE_KIND_LABELS[inject.audiences[0].kind] ?? inject.audiences[0].kind)} {String(inject.audiences[0].value)}
                          </p>
                        )}
                        {inject.description && (
                          <p className="text-xs text-gray-500 truncate max-w-xs">{inject.description}</p>
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {inject.channel && (
                          <span className="text-xs text-gray-600">
                            {CHANNEL_CONFIG[inject.channel].label}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {inject.target_audience && (
                          <span className="text-xs text-gray-600">
                            {AUDIENCE_CONFIG[inject.target_audience]}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {inject.pressure_level && (
                          <span className={`text-xs px-2 py-0.5 rounded ${PRESSURE_CONFIG[inject.pressure_level].color}`}>
                            {PRESSURE_CONFIG[inject.pressure_level].label}
                          </span>
                        )}
                        {triggerRules?.find((r) => r.inject_id === inject.id) && (
                          <span className="ml-1 text-xs px-2 py-0.5 rounded bg-violet-100 text-violet-700">
                            {triggerRules.find((r) => r.inject_id === inject.id)?.trigger_mode}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.color}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {canSend && (
                            <button
                              onClick={() => sendMutation.mutate(inject.id)}
                              disabled={sendMutation.isPending}
                              className="p-1 text-green-600 hover:text-green-800 hover:bg-green-50 rounded"
                              title="Envoyer maintenant"
                            >
                              <Send size={14} />
                            </button>
                          )}
                          {canEdit && (
                            <button
                              onClick={() => {
                                setScheduleInject(inject)
                                setScheduleDate(
                                  inject.scheduled_at
                                    ? inject.scheduled_at.slice(0, 16)
                                    : ''
                                )
                              }}
                              className="p-1 text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded"
                              title="Planifier"
                            >
                              <Clock size={14} />
                            </button>
                          )}
                          {canEdit && (
                            <button
                              onClick={() => setEditInject(inject)}
                              className="p-1 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded"
                              title="Modifier"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          {canCancel && (
                            <button
                              onClick={() => cancelMutation.mutate(inject.id)}
                              className="p-1 text-orange-500 hover:text-orange-700 hover:bg-orange-50 rounded"
                              title="Annuler"
                            >
                              <XCircle size={14} />
                            </button>
                          )}
                          {inject.status !== 'sent' && (
                            <button
                              onClick={() => handleDelete(inject)}
                              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                              title="Supprimer"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-1.5 rounded disabled:opacity-40 hover:bg-gray-100"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm text-gray-600">
            Page {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-1.5 rounded disabled:opacity-40 hover:bg-gray-100"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* Modal Créer */}
      <InjectFormModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={(form) => createMutation.mutate(form)}
        isPending={createMutation.isPending}
        title="Nouvel inject"
        allInjects={injects}
        phases={phases}
        bankTypeOptions={bankTypeOptions}
        recipientUsers={exerciseUsers}
        recipientTeams={exerciseTeams}
      />

      {/* Modal Modifier */}
      {editInject && (
        <InjectFormModal
          isOpen={!!editInject}
          onClose={() => setEditInject(null)}
          onSubmit={(form) => updateMutation.mutate({ id: editInject.id, form })}
          initial={{
            ...getRecipientFromInject(editInject),
            custom_id: editInject.custom_id || '',
            title: editInject.title,
            description: editInject.description ?? '',
            bank_kind: (editInject.content as any)?.bank_kind || INJECT_TYPE_TO_BANK_KIND[editInject.type],
            type: editInject.type,
            data_format: editInject.data_format || 'text',
            inject_category: editInject.inject_category || '',
            channel: editInject.channel || '',
            target_audience: editInject.target_audience || '',
            pedagogical_objective: editInject.pedagogical_objective ?? '',
            tested_competence: editInject.tested_competence || '',
            pressure_level: editInject.pressure_level || '',
            time_offset: editInject.time_offset?.toString() ?? '',
            content_text: editInject.content?.text ?? JSON.stringify(editInject.content),
            scheduled_at: editInject.scheduled_at?.slice(0, 16) ?? '',
            dependency_ids: editInject.dependency_ids?.join(', ') ?? '',
            phase_id: editInject.phase_id ? String(editInject.phase_id) : '',
            trigger_mode: triggerRules?.find((r) => r.inject_id === editInject.id)?.trigger_mode || 'auto',
          }}
          injectId={editInject.id}
          isPending={updateMutation.isPending}
          title="Modifier l'inject"
          allInjects={injects}
          phases={phases}
          bankTypeOptions={bankTypeOptions}
          recipientUsers={exerciseUsers}
          recipientTeams={exerciseTeams}
        />
      )}

      {/* Modal Voir détails */}
      <Modal isOpen={!!viewInject} onClose={() => setViewInject(null)} title="Détails de l'inject">
        {viewInject && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">ID</p>
                <p className="font-mono">{viewInject.custom_id || `#${viewInject.id}`}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">T+</p>
                <p>{formatTimeOffset(viewInject.time_offset)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Type</p>
                <p>
                  {INJECT_BANK_KIND_LABELS[
                    ((viewInject.content as Record<string, any> | null | undefined)?.bank_kind as InjectBankKind | undefined) ||
                    INJECT_TYPE_TO_BANK_KIND[viewInject.type]
                  ] ||
                    injectTypeConfig[viewInject.type].label}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Statut</p>
                <span className={`text-xs px-2 py-0.5 rounded ${STATUS_CONFIG[viewInject.status].color}`}>
                  {STATUS_CONFIG[viewInject.status].label}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Format de la donnee</p>
                <p className="text-sm">{DATA_FORMAT_LABELS[viewInject.data_format || 'text']}</p>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-500">Titre</p>
              <p className="font-medium">{viewInject.title}</p>
            </div>

            {viewInject.description && (
              <div>
                <p className="text-sm text-gray-500">Description</p>
                <p className="text-sm">{viewInject.description}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {viewInject.inject_category && (
                <div>
                  <p className="text-sm text-gray-500">Catégorie</p>
                  <span className={`text-xs px-2 py-0.5 rounded ${CATEGORY_CONFIG[viewInject.inject_category].color}`}>
                    {CATEGORY_CONFIG[viewInject.inject_category].label}
                  </span>
                </div>
              )}
              {viewInject.channel && (
                <div>
                  <p className="text-sm text-gray-500">Canal</p>
                  <p className="text-sm">{CHANNEL_CONFIG[viewInject.channel].label}</p>
                </div>
              )}
              {viewInject.target_audience && (
                <div>
                  <p className="text-sm text-gray-500">Public cible</p>
                  <p className="text-sm">{AUDIENCE_CONFIG[viewInject.target_audience]}</p>
                </div>
              )}
              {viewInject.audiences && viewInject.audiences.length > 0 && (
                <div className="col-span-2">
                  <p className="text-sm text-gray-500">Audience WS</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {viewInject.audiences.map((aud, idx) => (
                      <span
                        key={`${aud.kind}-${aud.value}-${idx}`}
                        className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700"
                      >
                        {(AUDIENCE_KIND_LABELS[aud.kind] ?? aud.kind)} : {aud.value}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {viewInject.pressure_level && (
                <div>
                  <p className="text-sm text-gray-500">Pression</p>
                  <span className={`text-xs px-2 py-0.5 rounded ${PRESSURE_CONFIG[viewInject.pressure_level].color}`}>
                    {PRESSURE_CONFIG[viewInject.pressure_level].label}
                  </span>
                </div>
              )}
            </div>

            {viewInject.pedagogical_objective && (
              <div>
                <p className="text-sm text-gray-500">Objectif pédagogique</p>
                <p className="text-sm">{viewInject.pedagogical_objective}</p>
              </div>
            )}

            {viewInject.tested_competence && (
              <div>
                <p className="text-sm text-gray-500">Compétence testée</p>
                <p className="text-sm">{COMPETENCE_CONFIG[viewInject.tested_competence]}</p>
              </div>
            )}

            {viewInject.dependency_ids && viewInject.dependency_ids.length > 0 && (
              <div>
                <p className="text-sm text-gray-500">Dépendances</p>
                <p className="text-sm">{viewInject.dependency_ids.map(id => `#${id}`).join(', ')}</p>
              </div>
            )}

            {viewInject.scheduled_at && (
              <div>
                <p className="text-sm text-gray-500">Planifié</p>
                <p>{new Date(viewInject.scheduled_at).toLocaleString('fr-FR')}</p>
              </div>
            )}

            {viewInject.sent_at && (
              <div>
                <p className="text-sm text-gray-500">Envoyé</p>
                <p>{new Date(viewInject.sent_at).toLocaleString('fr-FR')}</p>
              </div>
            )}

            <div>
              <p className="text-sm text-gray-500">Contenu</p>
              <pre className="text-sm bg-gray-50 p-3 rounded overflow-x-auto">
                {viewInject.content?.text || JSON.stringify(viewInject.content, null, 2)}
              </pre>
            </div>

            <div className="flex gap-2 pt-2 border-t">
              {(viewInject.status === 'draft' || viewInject.status === 'scheduled') && (
                <>
                  <button
                    onClick={() => { sendMutation.mutate(viewInject.id); setViewInject(null) }}
                    className="flex-1 px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    <Send className="inline mr-1" size={14} /> Envoyer
                  </button>
                  <button
                    onClick={() => { setEditInject(viewInject); setViewInject(null) }}
                    className="flex-1 px-3 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
                  >
                    <Pencil className="inline mr-1" size={14} /> Modifier
                  </button>
                </>
              )}
              {viewInject.status !== 'sent' && (
                <button
                  onClick={() => { handleDelete(viewInject); setViewInject(null) }}
                  className="px-3 py-2 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                >
                  <Trash2 className="inline mr-1" size={14} />
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Planifier */}
      <Modal
        isOpen={!!scheduleInject}
        onClose={() => setScheduleInject(null)}
        title="Planifier l'inject"
      >
        <div className="space-y-4">
          {scheduleInject && (
            <p className="text-sm text-gray-600">
              Inject : <strong>{scheduleInject.title}</strong>
            </p>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date / heure d'envoi
            </label>
            <input
              type="datetime-local"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setScheduleInject(null)}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Annuler
            </button>
            <button
              onClick={() => {
                if (scheduleInject && scheduleDate) {
                  scheduleMutation.mutate({
                    id: scheduleInject.id,
                    date: scheduleDate,
                  })
                }
              }}
              disabled={!scheduleDate || scheduleMutation.isPending}
              className="px-4 py-2 text-sm text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              {scheduleMutation.isPending ? 'Planification...' : 'Planifier'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Import CSV */}
      <ImportCSVModal
        isOpen={showImportCSV}
        onClose={() => setShowImportCSV(false)}
        exerciseId={exId}
      />
    </div>
  )
}
