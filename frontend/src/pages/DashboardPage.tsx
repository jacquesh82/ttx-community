import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ExternalLink, AlertTriangle } from 'lucide-react'
import { exercisesApi, injectsApi, injectBankApi, adminApi, crisisManagementApi } from '../services/api'
import type { Exercise, Inject, ExercisePhase } from '../services/api'
import KpiCard from '../components/dashboard/KpiCard'
import GaugeChart from '../components/dashboard/GaugeChart'
import DonutChart from '../components/dashboard/DonutChart'
import RadialProgress from '../components/dashboard/RadialProgress'
import CriteriaBar from '../components/dashboard/CriteriaBar'
import {
  computeOrgScore,
  computeBiaScore,
  computeScenarioScore,
  computeGlobalScore,
  parseBiaProcesses,
} from '../utils/dashboardScores'

const STORAGE_KEY = 'ttx-dashboard-exercise'

const STATUS_COLORS: Record<string, string> = {
  draft:     'bg-gray-500/20 text-gray-400',
  running:   'bg-green-500/20 text-green-400',
  paused:    'bg-amber-500/20 text-amber-400',
  completed: 'bg-primary-500/20 text-primary-400',
  archived:  'bg-gray-700/40 text-gray-500',
}

const STATUS_ORDER = ['running', 'paused', 'draft', 'completed', 'archived']

function statusRank(s: string) { return STATUS_ORDER.indexOf(s) === -1 ? 99 : STATUS_ORDER.indexOf(s) }

// ─── Exercise selector ────────────────────────────────────────────────────────

interface ExerciseSelectorProps {
  exercises: Exercise[]
  selectedId: number | null
  onChange: (id: number) => void
}

function ExerciseSelector({ exercises, selectedId, onChange }: ExerciseSelectorProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const selected = exercises.find(e => e.id === selectedId)

  const sorted = [...exercises]
    .filter(e => e.status !== 'archived')
    .sort((a, b) => statusRank(a.status) - statusRank(b.status))

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors w-full sm:w-auto"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-card-border)', color: 'var(--app-fg)' }}
      >
        {selected ? (
          <>
            <span
              className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${selected.status === 'running' ? 'bg-green-400' : selected.status === 'paused' ? 'bg-amber-400' : 'bg-gray-400'}`}
            />
            <span className="truncate max-w-48">{selected.name}</span>
          </>
        ) : (
          <span style={{ color: 'var(--sidebar-muted)' }}>{t('dashboard.select_exercise')}</span>
        )}
        <ChevronDown className="w-4 h-4 flex-shrink-0 ml-auto" style={{ color: 'var(--sidebar-muted)' }} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-full mt-1 z-20 rounded-xl py-1 min-w-56 max-h-72 overflow-y-auto shadow-xl"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-card-border)' }}
          >
            {sorted.map(ex => (
              <button
                key={ex.id}
                onClick={() => { onChange(ex.id); setOpen(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors hover:bg-primary-600/10"
                style={{ color: ex.id === selectedId ? 'var(--app-fg)' : 'var(--sidebar-muted)' }}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ex.status === 'running' ? 'bg-green-400' : ex.status === 'paused' ? 'bg-amber-400' : 'bg-gray-400'}`} />
                <span className="flex-1 truncate">{ex.name}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[ex.status]}`}>{t(`exercises.status.${ex.status}`)}</span>
              </button>
            ))}
            {sorted.length === 0 && (
              <p className="px-3 py-2 text-sm" style={{ color: 'var(--sidebar-muted)' }}>{t('dashboard.no_active_exercise')}</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── BIA KPI ─────────────────────────────────────────────────────────────────

function BiaKpi({ raw }: { raw: string | null | undefined }) {
  const { t } = useTranslation()
  const score = useMemo(() => computeBiaScore(raw), [raw])

  const CRIT_COLORS: Record<string, string> = {
    faible:   '#22c55e',
    moyen:    '#f59e0b',
    critique: '#ef4444',
    vital:    '#991b1b',
  }

  const slices = Object.entries(score.byCriticality)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ label: k, value: v, color: CRIT_COLORS[k] }))

  return (
    <KpiCard
      title={t('dashboard.bia_title')}
      subtitle={score.total > 0 ? t('dashboard.bia_sub', { count: score.total }) : t('dashboard.bia_empty')}
      footer={
        <Link to="/exercises/preparation/organisation?tab=bia" className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
          {t('dashboard.bia_go')} <ExternalLink className="w-3 h-3" />
        </Link>
      }
    >
      {score.total === 0 ? (
        <div className="flex items-center justify-center h-20">
          <p className="text-xs text-center" style={{ color: 'var(--sidebar-muted)' }}>{t('dashboard.bia_empty')}</p>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <DonutChart
            slices={slices}
            centerLabel={String(score.total)}
            centerSub="proc."
            size={90}
            thickness={16}
          />
          <div className="flex-1 space-y-1.5">
            {score.p1Processes.slice(0, 3).map(p => (
              <div key={p.id} className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-red-400 w-5 flex-shrink-0">P1</span>
                <span className="text-xs truncate" style={{ color: 'var(--app-fg)' }}>{p.process_name}</span>
              </div>
            ))}
            {score.p1Processes.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--sidebar-muted)' }}>—</p>
            )}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {Object.entries(score.byCriticality).filter(([, v]) => v > 0).map(([k, v]) => (
                <span key={k} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: CRIT_COLORS[k] + '22', color: CRIT_COLORS[k] }}>
                  {k} ({v})
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </KpiCard>
  )
}

// ─── Timeline KPI ─────────────────────────────────────────────────────────────

interface TimelineKpiProps {
  injects: Inject[]
  phases: ExercisePhase[]
  exercise: Exercise | undefined
}

function TimelineKpi({ injects, phases, exercise }: TimelineKpiProps) {
  const { t } = useTranslation()

  const positioned = injects.filter(i => i.time_offset != null)
  const unpositioned = injects.length - positioned.length
  const business = injects.filter(i => i.timeline_type === 'business').length
  const technical = injects.filter(i => i.timeline_type === 'technical').length

  const byStatus = {
    draft:     injects.filter(i => i.status === 'draft').length,
    scheduled: injects.filter(i => i.status === 'scheduled').length,
    sent:      injects.filter(i => i.status === 'sent').length,
    cancelled: injects.filter(i => i.status === 'cancelled').length,
  }

  const coveredMinutes = positioned.length > 0
    ? Math.max(...positioned.map(i => (i.time_offset ?? 0) + (i.duration_min ?? 0)))
    : 0
  const coveredHours = Math.round(coveredMinutes / 60 * 10) / 10
  const targetHours = exercise?.target_duration_hours ?? 0

  const statusSlices = [
    { label: 'draft',     value: byStatus.draft,     color: '#6b7280' },
    { label: 'scheduled', value: byStatus.scheduled, color: '#3b82f6' },
    { label: 'sent',      value: byStatus.sent,      color: '#22c55e' },
    { label: 'cancelled', value: byStatus.cancelled, color: '#ef4444' },
  ]

  return (
    <KpiCard
      title={t('dashboard.timeline_title')}
      subtitle={t('dashboard.timeline_total', { count: injects.length })}
    >
      <div className="flex items-start gap-4">
        <DonutChart
          slices={statusSlices}
          centerLabel={String(injects.length)}
          centerSub="total"
          size={90}
          thickness={16}
        />
        <div className="flex-1 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--sidebar-muted)' }}>{t('dashboard.timeline_phases')}</span>
            <span className="font-semibold" style={{ color: 'var(--app-fg)' }}>{phases.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--sidebar-muted)' }}>{t('dashboard.timeline_business')}</span>
            <span className="font-semibold text-primary-400">{business}</span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--sidebar-muted)' }}>{t('dashboard.timeline_technical')}</span>
            <span className="font-semibold text-purple-400">{technical}</span>
          </div>
          {unpositioned > 0 && (
            <div className="flex items-center gap-1 text-amber-400">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              <span>{t('dashboard.timeline_unpositioned', { count: unpositioned })}</span>
            </div>
          )}
          {targetHours > 0 && (
            <div className="pt-1" style={{ borderTop: '1px solid var(--surface-card-border)' }}>
              <div className="flex items-center justify-between mb-1">
                <span style={{ color: 'var(--sidebar-muted)' }}>{t('dashboard.timeline_coverage', { covered: coveredHours, total: targetHours })}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-card-border)' }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(100, (coveredHours / targetHours) * 100)}%`, background: '#3b82f6' }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </KpiCard>
  )
}

// ─── Inject bank KPI ──────────────────────────────────────────────────────────

function InjectBankKpi({ stats }: { stats: { total: number; by_status: Record<string, number>; by_kind: Record<string, number> } }) {
  const { t } = useTranslation()

  const bankReadinessPct = stats.total === 0 ? 0 : Math.round(((stats.by_status.ready ?? 0) / stats.total) * 100)

  const statusSlices = [
    { label: 'ready',    value: stats.by_status.ready    ?? 0, color: '#22c55e' },
    { label: 'draft',    value: stats.by_status.draft    ?? 0, color: '#f59e0b' },
    { label: 'archived', value: stats.by_status.archived ?? 0, color: '#6b7280' },
  ]

  const kindEntries = Object.entries(stats.by_kind).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const maxKind = Math.max(...kindEntries.map(([, v]) => v), 1)

  return (
    <KpiCard
      title={t('dashboard.inject_bank_title')}
      subtitle={t('dashboard.inject_bank_sub', { total: stats.total })}
    >
      <div className="flex items-start gap-4">
        <DonutChart
          slices={statusSlices}
          centerLabel={String(stats.total)}
          centerSub={`${bankReadinessPct}% prêts`}
          size={90}
          thickness={16}
        />
        <div className="flex-1 space-y-1.5">
          {kindEntries.slice(0, 6).map(([kind, count]) => (
            <div key={kind} className="flex items-center gap-2">
              <span className="text-[10px] w-14 truncate flex-shrink-0" style={{ color: 'var(--sidebar-muted)' }}>{kind}</span>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-card-border)' }}>
                <div className="h-full rounded-full bg-primary-500" style={{ width: `${(count / maxKind) * 100}%` }} />
              </div>
              <span className="text-[10px] tabular-nums w-4 text-right" style={{ color: 'var(--app-fg)' }}>{count}</span>
            </div>
          ))}
        </div>
      </div>
    </KpiCard>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { t } = useTranslation()

  // ── Queries globales
  const { data: exercisesData, isLoading: exLoading } = useQuery({
    queryKey: ['exercises-all'],
    queryFn: () => exercisesApi.list({ page: 1, page_size: 100 }),
  })
  const { data: appConfig } = useQuery({
    queryKey: ['appConfig'],
    queryFn: adminApi.getAppConfiguration,
  })
  const { data: bankStats } = useQuery({
    queryKey: ['bankStats'],
    queryFn: injectBankApi.getStats,
  })

  const exercises: Exercise[] = exercisesData?.exercises ?? []

  // ── Exercice sélectionné (persisté)
  const defaultId = useMemo(() => {
    const persisted = localStorage.getItem(STORAGE_KEY)
    if (persisted) {
      const id = parseInt(persisted, 10)
      if (!isNaN(id)) return id
    }
    return null
  }, [])

  const [selectedId, setSelectedId] = useState<number | null>(defaultId)

  // Sélection automatique du premier exercice non archivé si rien n'est sélectionné
  useEffect(() => {
    if (selectedId != null || exercises.length === 0) return
    const first = [...exercises]
      .filter(e => e.status !== 'archived')
      .sort((a, b) => statusRank(a.status) - statusRank(b.status))[0]
    if (first) {
      setSelectedId(first.id)
      localStorage.setItem(STORAGE_KEY, String(first.id))
    }
  }, [exercises, selectedId])

  function handleSelect(id: number) {
    setSelectedId(id)
    localStorage.setItem(STORAGE_KEY, String(id))
  }

  const selectedExercise = exercises.find(e => e.id === selectedId)

  // ── Queries réactives (par exercice)
  const { data: injectsData } = useQuery({
    queryKey: ['injects-ex', selectedId],
    queryFn: () => injectsApi.list({ exercise_id: selectedId!, page_size: 1000 }),
    enabled: !!selectedId,
  })
  const { data: phases = [] } = useQuery({
    queryKey: ['phases', selectedId],
    queryFn: () => crisisManagementApi.listPhases(selectedId!),
    enabled: !!selectedId,
  })

  const injects: Inject[] = injectsData?.injects ?? []
  const positionedInjects = injects.filter(i => i.time_offset != null)

  // ── Scores
  const orgScore  = useMemo(() => appConfig ? computeOrgScore(appConfig) : null, [appConfig])
  const biaScore  = useMemo(() => computeBiaScore(appConfig?.bia_processes), [appConfig])
  const scenScore = useMemo(() => selectedExercise
    ? computeScenarioScore(selectedExercise, positionedInjects.length > 0)
    : null, [selectedExercise, positionedInjects.length])

  const bankReadinessPct = bankStats
    ? (bankStats.total === 0 ? 0 : Math.round(((bankStats.by_status.ready ?? 0) / bankStats.total) * 100))
    : 0

  const globalScore = useMemo(() =>
    computeGlobalScore(
      orgScore?.pct ?? 0,
      biaScore.pct,
      scenScore?.pct ?? 0,
      bankReadinessPct,
    ), [orgScore, biaScore, scenScore, bankReadinessPct])

  // ── Exercices récents (non archivés, les 5 premiers)
  const recentExercises = [...exercises]
    .filter(e => e.status !== 'archived')
    .sort((a, b) => statusRank(a.status) - statusRank(b.status))
    .slice(0, 5)

  return (
    <div className="options-theme space-y-5 pb-8">

      {/* ── Header ─────────────────────────────────────────── */}
      <div
        className="rounded-xl p-5 space-y-4"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-card-border)' }}
      >
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--app-fg)' }}>{t('dashboard.title')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--sidebar-muted)' }}>{t('login.platformTagline')}</p>
        </div>

        {/* Sélecteur exercice — nouvelle ligne, aligné à gauche */}
        <div className="flex items-center gap-3" style={{ borderTop: '1px solid var(--surface-card-border)', paddingTop: '1rem' }}>
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--sidebar-muted)' }}>
            {t('dashboard.exercise_scope_label')} :
          </span>
          {exLoading ? (
            <div className="h-9 w-48 rounded-xl animate-pulse" style={{ background: 'var(--surface-card-border)' }} />
          ) : (
            <ExerciseSelector exercises={exercises} selectedId={selectedId} onChange={handleSelect} />
          )}
        </div>
      </div>

      {/* ── Score global ───────────────────────────────────── */}
      <div
        className="rounded-xl p-5 flex flex-col sm:flex-row items-center gap-6"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-card-border)' }}
      >
        <div className="flex-shrink-0">
          <GaugeChart value={globalScore} size={180} />
        </div>
        <div className="flex-1 space-y-2">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--app-fg)' }}>{t('dashboard.maturity_score')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: t('dashboard.org_completeness'), pct: orgScore?.pct ?? 0, color: '#3b82f6' },
              { label: t('dashboard.bia_title'),         pct: biaScore.pct,       color: '#8b5cf6' },
              { label: t('dashboard.scenario_title'),    pct: scenScore?.pct ?? 0, color: '#f59e0b' },
              { label: t('dashboard.inject_bank_title'), pct: bankReadinessPct,   color: '#22c55e' },
            ].map(({ label, pct, color }) => (
              <div key={label} className="flex items-center gap-3">
                <RadialProgress pct={pct} size={44} thickness={6} color={color} label={`${pct}%`} />
                <div>
                  <p className="text-[10px]" style={{ color: 'var(--sidebar-muted)' }}>{label}</p>
                  <p className="text-sm font-bold" style={{ color }}>{pct}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPIs globaux (3 colonnes) ──────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Organisation */}
        {orgScore ? (
          <KpiCard
            title={t('dashboard.org_completeness')}
            subtitle={t('dashboard.org_completeness_sub', { score: orgScore.score, max: orgScore.max })}
            footer={
              <Link to="/exercises/preparation/organisation" className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
                {t('dashboard.go_to_org')} <ExternalLink className="w-3 h-3" />
              </Link>
            }
          >
            <div className="flex items-center gap-4">
              <RadialProgress
                pct={orgScore.pct}
                size={80}
                thickness={10}
                color={orgScore.pct >= 80 ? '#22c55e' : orgScore.pct >= 50 ? '#f59e0b' : '#ef4444'}
                label={`${orgScore.pct}%`}
              />
              <ul className="flex-1 space-y-1">
                {orgScore.fields.map(f => (
                  <li key={f.key} className="flex items-center gap-1.5 text-[10px]">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${f.done ? 'bg-green-400' : 'bg-red-400'}`} />
                    <span style={{ color: f.done ? 'var(--app-fg)' : 'var(--sidebar-muted)' }}>{t(f.i18nKey)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </KpiCard>
        ) : (
          <div className="rounded-xl animate-pulse h-40" style={{ background: 'var(--surface-card)' }} />
        )}

        {/* BIA */}
        <BiaKpi raw={appConfig?.bia_processes} />

        {/* Banque d'injects */}
        {bankStats ? (
          <InjectBankKpi stats={bankStats} />
        ) : (
          <div className="rounded-xl animate-pulse h-40" style={{ background: 'var(--surface-card)' }} />
        )}
      </div>

      {/* ── KPIs par exercice (2 colonnes) ────────────────── */}
      {selectedExercise ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Scénario */}
          {scenScore ? (
            <KpiCard
              title={t('dashboard.scenario_title')}
              subtitle={t('dashboard.scenario_sub')}
            >
              <CriteriaBar criteria={scenScore.criteria} score={scenScore.score} max={scenScore.max} />
            </KpiCard>
          ) : (
            <div className="rounded-xl animate-pulse h-40" style={{ background: 'var(--surface-card)' }} />
          )}

          {/* Timeline */}
          <TimelineKpi injects={injects} phases={phases as ExercisePhase[]} exercise={selectedExercise} />
        </div>
      ) : (
        <div
          className="rounded-xl p-6 text-center text-sm"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-card-border)', color: 'var(--sidebar-muted)' }}
        >
          {t('dashboard.no_exercise_selected')}
        </div>
      )}

      {/* ── Exercices récents ──────────────────────────────── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-card-border)' }}
      >
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--surface-card-border)' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'var(--app-fg)' }}>{t('dashboard.recent_exercises')}</h2>
          <Link to="/exercises" className="text-xs text-primary-400 hover:text-primary-300 font-medium">
            {t('common.viewAll')}
          </Link>
        </div>

        {exLoading ? (
          <div className="p-6 text-center text-sm" style={{ color: 'var(--sidebar-muted)' }}>{t('common.loading')}</div>
        ) : recentExercises.length === 0 ? (
          <div className="p-6 text-center text-sm" style={{ color: 'var(--sidebar-muted)' }}>{t('exercises.noneCreated')}</div>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--surface-card-border)' }}>
            {recentExercises.map(ex => {
              const isSelected = ex.id === selectedId
              return (
                <li
                  key={ex.id}
                  className={`transition-colors ${isSelected ? 'bg-primary-600/5' : ''}`}
                >
                  <button
                    onClick={() => handleSelect(ex.id)}
                    className="w-full flex items-center gap-4 px-5 py-3 text-left"
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ex.status === 'running' ? 'bg-green-400' : ex.status === 'paused' ? 'bg-amber-400' : 'bg-gray-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--app-fg)' }}>{ex.name}</p>
                      {ex.description && (
                        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--sidebar-muted)' }}>{ex.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {ex.timeline_configured && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-500/20 text-primary-400">
                          timeline ✓
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[ex.status]}`}>
                        {t(`exercises.status.${ex.status}`)}
                      </span>
                      <Link
                        to={`/exercises/${ex.id}`}
                        onClick={e => e.stopPropagation()}
                        className="p-1 rounded hover:bg-primary-600/10"
                        style={{ color: 'var(--sidebar-muted)' }}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
