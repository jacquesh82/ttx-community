import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Download,
  FileJson,
  FileText,
  BookOpen,
  Zap,
  CheckCircle2,
  Brain,
  Clock4,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  ChevronRight,
  CalendarClock,
  Activity,
  Mail,
  MessageSquare,
  Tv,
  Gavel,
  Star,
  BarChart2,
  Users,
} from 'lucide-react'
import { crisisManagementApi } from '../services/api'
import ExerciseSubpageShell from '../components/exercise/ExerciseSubpageShell'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTPlus(minutes: number | null | undefined): string {
  if (minutes == null) return 'T+?'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `T+${h}h${String(m).padStart(2, '0')}`
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

// ─── Pedagogie ────────────────────────────────────────────────────────────────

const DIMENSIONS = [
  {
    icon: Zap,
    label: 'Réactivité',
    color: 'bg-primary-100 text-primary-700 border-primary-200',
    desc: 'Délai entre la livraison d\'un inject et la première ouverture. Objectif : < 5 min.',
  },
  {
    icon: CheckCircle2,
    label: 'Complétion',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    desc: 'Proportion d\'injects effectivement traités sur le total livré. Objectif : > 80 %.',
  },
  {
    icon: Brain,
    label: 'Qualité décision',
    color: 'bg-purple-100 text-purple-700 border-purple-200',
    desc: 'Score attribué par les animateurs sur la pertinence des décisions. Objectif : > 7/10.',
  },
  {
    icon: Clock4,
    label: 'Respect timeline',
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    desc: 'Couverture des timelines métier et technique dans les temps impartis.',
  },
]

const TIPS = [
  { icon: TrendingUp, text: 'Comparez vos scores d\'un exercice à l\'autre pour mesurer la progression réelle de l\'équipe.', color: 'text-indigo-600 bg-indigo-50' },
  { icon: AlertTriangle, text: 'Un score faible en réactivité est souvent le signe d\'un flux d\'information mal organisé, pas d\'un manque de compétence.', color: 'text-amber-600 bg-amber-50' },
  { icon: Lightbulb, text: 'Le RETEX est plus riche quand les joueurs contribuent à la rédaction des points d\'amélioration juste après l\'exercice.', color: 'text-emerald-600 bg-emerald-50' },
]

// ─── KPI cards ────────────────────────────────────────────────────────────────

const KPI_GROUPS = [
  {
    label: 'Réactivité',
    icon: Zap,
    color: 'blue',
    keys: ['reaction_time_avg_min', 'mail_read_rate_pct'],
    labels: { reaction_time_avg_min: 'Temps réaction moy. (min)', mail_read_rate_pct: 'Taux lecture mails (%)' },
  },
  {
    label: 'Complétion',
    icon: CheckCircle2,
    color: 'emerald',
    keys: ['treatment_rate_pct', 'business_completion_pct', 'technical_completion_pct'],
    labels: {
      treatment_rate_pct: 'Taux traitement (%)',
      business_completion_pct: 'Complétion métier (%)',
      technical_completion_pct: 'Complétion technique (%)',
    },
  },
  {
    label: 'Engagement',
    icon: Activity,
    color: 'violet',
    keys: ['decisions_taken', 'chat_activity_count', 'surprise_injects_count'],
    labels: {
      decisions_taken: 'Décisions prises',
      chat_activity_count: 'Messages chat',
      surprise_injects_count: 'Injects surprise envoyés',
    },
  },
]

function KpiValue({ val, isPercent }: { val: number; isPercent: boolean }) {
  let accent = 'from-slate-50 to-slate-100 border-slate-200 text-slate-700'
  let dot = 'bg-slate-400'
  if (isPercent) {
    if (val >= 80) { accent = 'from-emerald-50 to-emerald-100 border-emerald-200 text-emerald-800'; dot = 'bg-emerald-500' }
    else if (val >= 50) { accent = 'from-amber-50 to-amber-100 border-amber-200 text-amber-800'; dot = 'bg-amber-500' }
    else { accent = 'from-red-50 to-red-100 border-red-200 text-red-800'; dot = 'bg-red-500' }
  }
  return { accent, dot }
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  const numVal = parseFloat(String(value))
  const isPercent = String(value).includes('%') || label.includes('%') || label.includes('_pct')
  const { accent, dot } = KpiValue({ val: numVal, isPercent })
  const displayVal = typeof value === 'number' ? (isPercent ? `${value}%` : String(value)) : String(value)
  return (
    <div className={`relative bg-gradient-to-br ${accent} border rounded-xl p-4 flex flex-col gap-1`}>
      <span className={`absolute top-3 right-3 w-2 h-2 rounded-full ${dot}`} />
      <span className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</span>
      <span className="text-2xl font-bold">{displayVal}</span>
    </div>
  )
}

// ─── Inject timeline card ─────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  sent: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  treated: 'bg-primary-100 text-primary-700 border-primary-200',
  scheduled: 'bg-amber-100 text-amber-700 border-amber-200',
  draft: 'bg-gray-100 text-gray-500 border-gray-200',
  cancelled: 'bg-red-100 text-red-600 border-red-200',
}

const STATUS_LABEL: Record<string, string> = {
  sent: 'Envoyé',
  treated: 'Traité',
  scheduled: 'Planifié',
  draft: 'Brouillon',
  cancelled: 'Annulé',
}

function InjectCard({ inject }: { inject: any }) {
  const statusClass = STATUS_BADGE[inject.status] ?? 'bg-gray-100 text-gray-500 border-gray-200'
  const statusLabel = STATUS_LABEL[inject.status] ?? inject.status
  const treatPct = inject.delivery_count > 0 ? Math.round(inject.treated_count / inject.delivery_count * 100) : null

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-2.5 space-y-1.5 text-xs">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-800 truncate">{inject.title}</p>
          {inject.phase_name && (
            <p className="text-gray-400 text-[10px] truncate">{inject.phase_name}</p>
          )}
        </div>
        <div className="shrink-0 text-right space-y-0.5">
          {inject.time_offset != null && (
            <div className="text-[10px] text-gray-400 tabular-nums">{formatTPlus(inject.time_offset)}</div>
          )}
          <span className={`inline-flex items-center border rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${statusClass}`}>
            {statusLabel}
          </span>
        </div>
      </div>
      {inject.delivery_count > 0 && (
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <span>{inject.opened_count}/{inject.delivery_count} lus</span>
          {treatPct !== null && (
            <span className={treatPct >= 80 ? 'text-emerald-600 font-medium' : treatPct >= 50 ? 'text-amber-600' : 'text-red-500'}>
              {treatPct}% traités
            </span>
          )}
          {inject.avg_reaction_min != null && (
            <span className="ml-auto text-gray-400">{inject.avg_reaction_min} min réaction</span>
          )}
        </div>
      )}
    </article>
  )
}

// ─── Phase + event timeline ────────────────────────────────────────────────────

const PHASE_PALETTE = [
  { border: 'border-indigo-200', bg: 'bg-indigo-50', text: 'text-indigo-800', bar: 'bg-indigo-400', badge: 'bg-indigo-500' },
  { border: 'border-primary-200',   bg: 'bg-primary-50',   text: 'text-primary-800',   bar: 'bg-primary-400',   badge: 'bg-primary-500' },
  { border: 'border-cyan-200',   bg: 'bg-cyan-50',   text: 'text-cyan-800',   bar: 'bg-cyan-400',   badge: 'bg-cyan-500' },
  { border: 'border-violet-200', bg: 'bg-violet-50', text: 'text-violet-800', bar: 'bg-violet-400', badge: 'bg-violet-500' },
  { border: 'border-purple-200', bg: 'bg-purple-50', text: 'text-purple-800', bar: 'bg-purple-400', badge: 'bg-purple-500' },
  { border: 'border-teal-200',   bg: 'bg-teal-50',   text: 'text-teal-800',   bar: 'bg-teal-400',   badge: 'bg-teal-500' },
]

function eventTypeLabel(type: string): string {
  const map: Record<string, string> = {
    inject_sent: 'Inject envoyé',
    inject_cancelled: 'Inject annulé',
    phase_change: 'Changement de phase',
    exercise_started: 'Exercice démarré',
    exercise_paused: 'Exercice en pause',
    exercise_resumed: 'Exercice repris',
    exercise_ended: 'Exercice terminé',
    mail_opened: 'Mail ouvert',
    mail_replied: 'Mail répondu',
    tv_segment_started: 'Segment TV démarré',
    tv_segment_ended: 'Segment TV terminé',
    score_added: 'Score ajouté',
  }
  return map[type] ?? type.replace(/_/g, ' ')
}

function eventTypeClass(type: string): string {
  switch (type) {
    case 'inject_sent':          return 'bg-emerald-100 text-emerald-800 border-emerald-300'
    case 'inject_cancelled':     return 'bg-slate-100 text-slate-600 border-slate-200'
    case 'phase_change':         return 'bg-primary-100 text-primary-800 border-primary-200'
    case 'exercise_started':     return 'bg-green-100 text-green-800 border-green-200'
    case 'exercise_paused':      return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'exercise_resumed':     return 'bg-sky-100 text-sky-800 border-sky-200'
    case 'exercise_ended':       return 'bg-red-100 text-red-800 border-red-200'
    case 'mail_opened':          return 'bg-primary-50 text-primary-700 border-primary-200'
    case 'mail_replied':         return 'bg-cyan-50 text-cyan-700 border-cyan-200'
    case 'tv_segment_started':   return 'bg-violet-50 text-violet-700 border-violet-200'
    case 'tv_segment_ended':     return 'bg-purple-50 text-purple-700 border-purple-200'
    default:                     return 'bg-gray-100 text-gray-700 border-gray-200'
  }
}

function PhaseCard({ phase, idx, maxEnd }: { phase: any; idx: number; maxEnd: number }) {
  const palette = PHASE_PALETTE[idx % PHASE_PALETTE.length]
  const start = phase.start_offset_min ?? 0
  const end = phase.end_offset_min ?? start
  const duration = end - start
  const widthPct = maxEnd > 0 ? Math.round((duration / maxEnd) * 100) : 0

  return (
    <article className={`rounded-xl border p-3 space-y-2 ${palette.border} ${palette.bg}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-5 h-5 rounded-full ${palette.badge} text-white text-[10px] font-bold flex items-center justify-center shrink-0`}>
            {idx + 1}
          </span>
          <h4 className={`font-semibold text-sm truncate ${palette.text}`}>{phase.phase}</h4>
        </div>
        <div className={`text-right shrink-0 text-xs font-medium tabular-nums ${palette.text}`}>
          {formatTPlus(start)} → {formatTPlus(end)}
        </div>
      </div>
      <div className="space-y-1">
        <div className="h-1.5 w-full rounded-full bg-white/60">
          <div className={`h-full rounded-full ${palette.bar}`} style={{ width: `${Math.max(widthPct, 4)}%` }} />
        </div>
        <div className={`flex items-center gap-1 text-[10px] ${palette.text} opacity-70`}>
          <CalendarClock size={10} />
          <span>{duration} min</span>
        </div>
      </div>
    </article>
  )
}

function resolvePhase(offsetMin: number | null, phases: any[]): any | null {
  if (offsetMin == null || phases.length === 0) return null
  return phases.find(
    (p) => p.start_offset_min != null && p.end_offset_min != null && offsetMin >= p.start_offset_min && offsetMin < p.end_offset_min
  ) ?? null
}

function PhaseSeparator({ phase, idx }: { phase: any; idx: number }) {
  const palette = PHASE_PALETTE[idx % PHASE_PALETTE.length]
  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${palette.bg} border ${palette.border} my-1`}>
      <span className={`w-4 h-4 rounded-full ${palette.badge} text-white text-[9px] font-bold flex items-center justify-center shrink-0`}>{idx + 1}</span>
      <span className={`text-[11px] font-semibold ${palette.text}`}>{phase.phase}</span>
      <span className={`ml-auto text-[10px] tabular-nums ${palette.text} opacity-70`}>
        {formatTPlus(phase.start_offset_min)} → {formatTPlus(phase.end_offset_min)}
      </span>
    </div>
  )
}

function EventCard({ event, prev }: { event: any; prev?: any }) {
  const cls = eventTypeClass(event.type)
  const ts = new Date(event.ts)
  const prevTs = prev ? new Date(prev.ts) : null
  const diffMin = prevTs ? Math.round((ts.getTime() - prevTs.getTime()) / 60000) : null
  const offsetMin = event.offset_min

  return (
    <div className="relative">
      {diffMin !== null && diffMin > 0 && (
        <div className="flex items-center gap-1 text-[10px] text-gray-400 my-0.5 ml-3">
          <div className="w-px h-3 bg-gray-200 mx-1" />
          <span>+{diffMin} min</span>
        </div>
      )}
      <article className={`rounded-xl border p-3 space-y-1.5 bg-white ${cls.split(' ').find(c => c.startsWith('border-')) ?? 'border-gray-200'}`}>
        <div className="flex items-start justify-between gap-2">
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
            {eventTypeLabel(event.type)}
          </span>
          <div className="text-right shrink-0">
            {offsetMin != null && (
              <div className="text-xs font-medium text-gray-700 tabular-nums">{formatTPlus(offsetMin)}</div>
            )}
            <div className="text-[10px] text-gray-400 tabular-nums">
              {ts.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      </article>
    </div>
  )
}

// ─── Simulator badge ──────────────────────────────────────────────────────────

function SimBadge({ icon: Icon, label, value, color, note }: { icon: any; label: string; value: number | string; color: string; note?: string }) {
  const goodBadge = typeof value === 'number' && value > 0
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-4 bg-white`}>
      <div className={`p-2 rounded-lg ${color} shrink-0`}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className={`text-xl font-bold tabular-nums ${goodBadge ? 'text-gray-800' : 'text-gray-400'}`}>{value}</p>
        {note && <p className="text-[10px] text-gray-400">{note}</p>}
      </div>
      {goodBadge ? (
        <span className="text-emerald-500 text-xs font-semibold shrink-0">✓</span>
      ) : (
        <span className="text-amber-400 text-xs shrink-0">⚠</span>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExerciseEvaluationPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const navigate = useNavigate()
  const id = parseInt(exerciseId || '0', 10)

  const { data: evaluation } = useQuery({
    queryKey: ['exercise-evaluation', id],
    queryFn: () => crisisManagementApi.getEvaluation(id),
    refetchInterval: 10000,
    enabled: !!id,
  })

  const generate = useMutation({
    mutationFn: () => crisisManagementApi.generateRetex(id),
  })

  const download = async (type: 'json' | 'pdf' | 'anssi') => {
    let blob: Blob
    let filename: string
    if (type === 'json') {
      blob = await crisisManagementApi.exportRetexJson(id)
      filename = `retex_${id}.json`
    } else if (type === 'pdf') {
      blob = await crisisManagementApi.exportRetexPdf(id)
      filename = `retex_${id}.pdf`
    } else {
      blob = await crisisManagementApi.exportRetexAnssi(id)
      filename = `retex_${id}_anssi.json`
    }
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    window.URL.revokeObjectURL(url)
  }

  const kpis: Record<string, number> = evaluation?.kpis || {}
  const idealTimeline: any[] = evaluation?.ideal_timeline || []
  const realTimeline: any[] = evaluation?.real_timeline || []
  const injectsDetail: any[] = evaluation?.injects_detail || []
  const simInteractions = evaluation?.simulator_interactions || {}
  const decisions: any[] = evaluation?.decisions || []
  const scores: any[] = evaluation?.scores || []
  const byTimeline = evaluation?.injects_by_timeline || {}

  const maxEnd = idealTimeline.reduce((acc: number, p: any) => Math.max(acc, p.end_offset_min ?? 0), 0)

  // 3-column inject timeline
  const businessInjects = injectsDetail.filter(i => i.timeline_type === 'business' && !i.is_surprise)
  const technicalInjects = injectsDetail.filter(i => i.timeline_type === 'technical' && !i.is_surprise)
  const surpriseInjects = injectsDetail.filter(i => i.is_surprise)

  // Real events with phase separators
  type RealItem = { kind: 'event'; event: any; prev?: any } | { kind: 'phase'; phase: any; phaseIdx: number }
  const realItems: RealItem[] = []
  let lastPhaseIdx = -1
  realTimeline.forEach((event, i) => {
    const phase = resolvePhase(event.offset_min, idealTimeline)
    if (phase) {
      const phaseIdx = idealTimeline.indexOf(phase)
      if (phaseIdx !== lastPhaseIdx) {
        realItems.push({ kind: 'phase', phase, phaseIdx })
        lastPhaseIdx = phaseIdx
      }
    }
    realItems.push({ kind: 'event', event, prev: i > 0 ? realTimeline[i - 1] : undefined })
  })

  return (
    <ExerciseSubpageShell
      exerciseId={id}
      sectionLabel="Evaluation"
      title="Evaluation & RETEX"
      actions={
        <button
          onClick={() => navigate(`/exercises/${id}`)}
          className="px-3 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50"
        >
          Ouvrir cockpit
        </button>
      }
    >
      {/* ── Bloc pédagogique ── */}
      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-primary-700 text-white p-6 mb-6 shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-white/20 rounded-lg">
            <BookOpen size={20} />
          </div>
          <div>
            <h2 className="font-semibold text-lg">Comment est calculée cette évaluation ?</h2>
            <p className="text-sm text-white/80">
              4 dimensions sont mesurées automatiquement à partir des données collectées pendant l'exercice.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          {DIMENSIONS.map(({ icon: Icon, label, color, desc }) => (
            <div key={label} className={`bg-white rounded-xl p-4 border ${color} flex flex-col gap-2`}>
              <div className="flex items-center gap-2">
                <Icon size={16} />
                <span className="font-semibold text-sm">{label}</span>
              </div>
              <p className="text-xs leading-relaxed opacity-80">{desc}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-white/20 pt-4">
          <p className="text-xs text-white/70 mb-3 font-medium uppercase tracking-wide">Règles de calcul</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-white/90">
            <div className="flex items-start gap-2">
              <ChevronRight size={12} className="mt-0.5 shrink-0 text-white/60" />
              <span>Les scores sont calculés en temps réel à partir des événements enregistrés (injects envoyés, réponses, scores live).</span>
            </div>
            <div className="flex items-start gap-2">
              <ChevronRight size={12} className="mt-0.5 shrink-0 text-white/60" />
              <span>La timeline idéale est celle définie lors de la préparation du scénario. L'écart mesuré indique le niveau de dérive.</span>
            </div>
            <div className="flex items-start gap-2">
              <ChevronRight size={12} className="mt-0.5 shrink-0 text-white/60" />
              <span>Le RETEX synthétise automatiquement les points forts, les lacunes et les recommandations d'amélioration.</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Conseils pédagogiques ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {TIPS.map(({ icon: Icon, text, color }, i) => (
          <div key={i} className={`rounded-xl p-4 border flex items-start gap-3 ${color} border-current/10`}>
            <Icon size={16} className="shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed">{text}</p>
          </div>
        ))}
      </div>

      {/* ── KPIs groupés ── */}
      {Object.keys(kpis).length > 0 && (
        <div className="bg-white rounded-2xl shadow border border-gray-100 p-6 mb-6">
          <div className="flex items-center gap-2 mb-5">
            <BarChart2 size={18} className="text-indigo-500" />
            <h2 className="text-base font-semibold text-gray-800">Indicateurs automatiques</h2>
          </div>
          <div className="space-y-5">
            {KPI_GROUPS.map(({ label, icon: Icon, color, keys, labels }) => {
              const entries = keys.filter(k => k in kpis)
              if (entries.length === 0) return null
              const borderColor = color === 'blue' ? 'border-primary-100' : color === 'emerald' ? 'border-emerald-100' : 'border-violet-100'
              const bgColor = color === 'blue' ? 'bg-primary-50' : color === 'emerald' ? 'bg-emerald-50' : 'bg-violet-50'
              const textColor = color === 'blue' ? 'text-primary-700' : color === 'emerald' ? 'text-emerald-700' : 'text-violet-700'
              const iconBg = color === 'blue' ? 'bg-primary-100 text-primary-600' : color === 'emerald' ? 'bg-emerald-100 text-emerald-600' : 'bg-violet-100 text-violet-600'
              return (
                <div key={label}>
                  <div className={`flex items-center gap-2 mb-2 px-2 py-1 rounded-lg ${bgColor} border ${borderColor}`}>
                    <div className={`p-1 rounded ${iconBg}`}><Icon size={13} /></div>
                    <span className={`text-xs font-semibold ${textColor}`}>{label}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {entries.map(k => (
                      <KpiCard key={k} label={labels[k as keyof typeof labels] || k} value={kpis[k]} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Timeline injects — 3 colonnes ── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={18} className="text-primary-500" />
          <h2 className="text-base font-semibold text-gray-800">Timelines injects</h2>
          <span className="text-xs text-gray-400">({injectsDetail.length} inject{injectsDetail.length !== 1 ? 's' : ''})</span>
        </div>

        {/* Stats de synthèse par timeline */}
        {(byTimeline.business || byTimeline.technical || byTimeline.surprise) && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { key: 'business', label: 'Métier', color: 'bg-indigo-50 border-indigo-200 text-indigo-800' },
              { key: 'technical', label: 'Technique', color: 'bg-cyan-50 border-cyan-200 text-cyan-800' },
              { key: 'surprise', label: 'Temps réel', color: 'bg-amber-50 border-amber-200 text-amber-800' },
            ].map(({ key, label, color }) => {
              const tl = byTimeline[key] || {}
              return (
                <div key={key} className={`rounded-lg border p-2.5 text-center ${color}`}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
                  <p className="text-lg font-bold tabular-nums">{tl.sent ?? 0} / {tl.total ?? 0}</p>
                  {tl.treated_pct !== undefined && (
                    <p className="text-[10px] opacity-70">{tl.treated_pct}% traités</p>
                  )}
                  {tl.avg_reaction_min !== undefined && tl.avg_reaction_min > 0 && (
                    <p className="text-[10px] opacity-60">{tl.avg_reaction_min} min réaction</p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Métier */}
          <section className="rounded-2xl border border-indigo-200 bg-indigo-50/30 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-indigo-900">Métier</h3>
              <span className="text-xs font-medium text-indigo-600 bg-indigo-100 rounded-full px-2 py-0.5">
                {businessInjects.length} inject{businessInjects.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-1.5 max-h-[50vh] overflow-auto pr-1">
              {businessInjects.length === 0 ? (
                <div className="rounded-lg border border-dashed border-indigo-200 bg-white/60 p-4 text-sm text-gray-400 text-center">Aucun</div>
              ) : businessInjects.map(i => <InjectCard key={i.id} inject={i} />)}
            </div>
          </section>

          {/* Technique */}
          <section className="rounded-2xl border border-cyan-200 bg-cyan-50/30 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-cyan-900">Technique</h3>
              <span className="text-xs font-medium text-cyan-600 bg-cyan-100 rounded-full px-2 py-0.5">
                {technicalInjects.length} inject{technicalInjects.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-1.5 max-h-[50vh] overflow-auto pr-1">
              {technicalInjects.length === 0 ? (
                <div className="rounded-lg border border-dashed border-cyan-200 bg-white/60 p-4 text-sm text-gray-400 text-center">Aucun</div>
              ) : technicalInjects.map(i => <InjectCard key={i.id} inject={i} />)}
            </div>
          </section>

          {/* Temps réel / surprise */}
          <section className="rounded-2xl border border-amber-200 bg-amber-50/30 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-amber-900">Temps réel</h3>
              <span className="text-xs font-medium text-amber-600 bg-amber-100 rounded-full px-2 py-0.5">
                {surpriseInjects.length} inject{surpriseInjects.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-1.5 max-h-[50vh] overflow-auto pr-1">
              {surpriseInjects.length === 0 ? (
                <div className="rounded-lg border border-dashed border-amber-200 bg-white/60 p-4 text-sm text-gray-400 text-center">Aucun</div>
              ) : surpriseInjects.map(i => <InjectCard key={i.id} inject={i} />)}
            </div>
          </section>
        </div>
      </div>

      {/* ── Interactions simulateurs ── */}
      <div className="bg-white rounded-2xl shadow border border-gray-100 p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={18} className="text-purple-500" />
          <h2 className="text-base font-semibold text-gray-800">Interactions simulateurs</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SimBadge
            icon={Mail}
            label="Mails lus"
            value={simInteractions.mail_opened_count ?? 0}
            color="bg-primary-100 text-primary-700"
          />
          <SimBadge
            icon={Mail}
            label="Mails répondus"
            value={simInteractions.mail_replied_count ?? 0}
            color="bg-cyan-100 text-cyan-700"
          />
          <SimBadge
            icon={MessageSquare}
            label="Messages chat"
            value={simInteractions.chat_messages_count ?? 0}
            color="bg-emerald-100 text-emerald-700"
          />
          <SimBadge
            icon={Tv}
            label="Segments TV"
            value={simInteractions.tv_segments_count ?? 0}
            color="bg-violet-100 text-violet-700"
            note={simInteractions.tv_total_duration_min ? `${simInteractions.tv_total_duration_min} min au total` : undefined}
          />
        </div>
      </div>

      {/* ── Décisions ── */}
      {decisions.length > 0 && (
        <div className="bg-white rounded-2xl shadow border border-gray-100 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Gavel size={18} className="text-amber-500" />
            <h2 className="text-base font-semibold text-gray-800">Décisions</h2>
            <span className="text-xs text-gray-400">({decisions.length})</span>
          </div>
          <div className="space-y-2">
            {decisions.map((d: any) => (
              <div key={d.id} className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/40 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{d.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 flex-wrap">
                    {d.phase_name && (
                      <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px] font-medium">{d.phase_name}</span>
                    )}
                    {d.team_id && (
                      <span className="flex items-center gap-1"><Users size={10} /> Équipe {d.team_id}</span>
                    )}
                    {d.offset_min != null && (
                      <span className="tabular-nums">{formatTPlus(d.offset_min)}</span>
                    )}
                    {d.decided_at && (
                      <span className="text-gray-400">{formatTime(d.decided_at)}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Scores animateurs ── */}
      {scores.length > 0 && (
        <div className="bg-white rounded-2xl shadow border border-gray-100 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Star size={18} className="text-yellow-500" />
            <h2 className="text-base font-semibold text-gray-800">Scores animateurs</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {scores.map((s: any, idx: number) => {
              const pct = s.max_score > 0 ? Math.round(s.score / s.max_score * 100) : 0
              const accent = pct >= 80 ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : pct >= 50 ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-red-200 bg-red-50 text-red-800'
              return (
                <div key={idx} className={`rounded-xl border p-4 ${accent}`}>
                  <p className="text-xs font-medium uppercase tracking-wide opacity-70 mb-1">{s.category}</p>
                  <p className="text-2xl font-bold tabular-nums">{s.score}<span className="text-sm font-normal opacity-60">/{s.max_score}</span></p>
                  {s.team_id && <p className="text-[10px] mt-1 opacity-60">Équipe {s.team_id}</p>}
                  {s.comment && <p className="text-[10px] mt-1 opacity-70 italic">{s.comment}</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Timeline phases + événements ── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={18} className="text-primary-500" />
          <h2 className="text-base font-semibold text-gray-800">Timeline idéale vs réelle</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Colonne idéale */}
          <section className="rounded-2xl border border-indigo-200 bg-indigo-50/20 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Timeline idéale</h3>
                <p className="text-xs text-gray-500">Phases planifiées au scénario</p>
              </div>
              <span className="text-xs font-medium text-indigo-600 bg-indigo-100 rounded-full px-2 py-0.5">
                {idealTimeline.length} phase{idealTimeline.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-2 max-h-[52vh] overflow-auto pr-1">
              {idealTimeline.length === 0 ? (
                <div className="rounded-lg border border-dashed border-indigo-200 bg-white/60 p-4 text-sm text-gray-400 text-center">
                  Aucune phase planifiée
                </div>
              ) : (
                idealTimeline.map((phase: any, idx: number) => (
                  <PhaseCard key={idx} phase={phase} idx={idx} maxEnd={maxEnd} />
                ))
              )}
            </div>
          </section>

          {/* Colonne réelle */}
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Événements enregistrés</h3>
                <p className="text-xs text-gray-500">Pendant l'exercice</p>
              </div>
              <span className="text-xs font-medium text-emerald-600 bg-emerald-100 rounded-full px-2 py-0.5">
                {realTimeline.length} événement{realTimeline.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-0.5 max-h-[52vh] overflow-auto pr-1">
              {realItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-emerald-200 bg-white/60 p-4 text-sm text-gray-400 text-center">
                  Aucun événement enregistré
                </div>
              ) : (
                realItems.map((item, idx) =>
                  item.kind === 'phase'
                    ? <PhaseSeparator key={`phase-${item.phaseIdx}`} phase={item.phase} idx={item.phaseIdx} />
                    : <EventCard key={item.event.event_id ?? idx} event={item.event} prev={item.prev} />
                )
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ── Exports ── */}
      <div className="bg-white rounded-2xl shadow border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={18} className="text-gray-500" />
          <h2 className="text-base font-semibold text-gray-800">Exports RETEX</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Générez d'abord le RETEX pour consolider les données, puis exportez-le dans le format souhaité.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            <Download size={14} />
            {generate.isPending ? 'Génération...' : 'Générer RETEX'}
          </button>
          <button
            onClick={() => download('pdf')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900"
          >
            <FileText size={14} /> Export PDF
          </button>
          <button
            onClick={() => download('json')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
          >
            <FileJson size={14} /> Export JSON
          </button>
          <button
            onClick={() => download('anssi')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
          >
            <FileJson size={14} /> Export ANSSI
          </button>
        </div>
      </div>
    </ExerciseSubpageShell>
  )
}
