import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ExternalLink, AlertTriangle, Users } from 'lucide-react'
import { exercisesApi, injectsApi, adminApi, crisisManagementApi, exerciseUsersApi } from '../services/api'
import type { Exercise, Inject, ExercisePhase, ExerciseUser } from '../services/api'
import { useAuthStore } from '../stores/authStore'
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
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors w-full sm:w-auto bg-gray-700 border border-gray-600 text-white"
      >
        {selected ? (
          <>
            <span
              className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${selected.status === 'running' ? 'bg-green-400' : selected.status === 'paused' ? 'bg-amber-400' : 'bg-gray-400'}`}
            />
            <span className="truncate max-w-48">{selected.name}</span>
          </>
        ) : (
          <span className="text-gray-400">{t('dashboard.select_exercise')}</span>
        )}
        <ChevronDown className="w-4 h-4 flex-shrink-0 ml-auto text-gray-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-gray-800 border border-gray-700 rounded-xl py-1 min-w-56 max-h-72 overflow-y-auto shadow-xl">
            {sorted.map(ex => (
              <button
                key={ex.id}
                onClick={() => { onChange(ex.id); setOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors hover:bg-primary-600/10 ${ex.id === selectedId ? 'text-white' : 'text-gray-400'}`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ex.status === 'running' ? 'bg-green-400' : ex.status === 'paused' ? 'bg-amber-400' : 'bg-gray-400'}`} />
                <span className="flex-1 truncate">{ex.name}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[ex.status]}`}>{t(`exercises.status.${ex.status}`)}</span>
              </button>
            ))}
            {sorted.length === 0 && (
              <p className="px-3 py-2 text-sm text-gray-400">{t('dashboard.no_active_exercise')}</p>
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
          <p className="text-xs text-center text-gray-400">{t('dashboard.bia_empty')}</p>
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
                <span className="text-xs truncate text-white">{p.process_name}</span>
              </div>
            ))}
            {score.p1Processes.length === 0 && (
              <p className="text-xs text-gray-400">—</p>
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
      {injects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
          <p className="text-xs text-gray-400">{t('dashboard.timeline_empty')}</p>
          <Link to="/player" className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
            {t('dashboard.timeline_go')} <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      ) : (
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
              <span className="text-gray-400">{t('dashboard.timeline_phases')}</span>
              <span className="font-semibold text-white">{phases.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">{t('dashboard.timeline_business')}</span>
              <span className="font-semibold text-primary-400">{business}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">{t('dashboard.timeline_technical')}</span>
              <span className="font-semibold text-purple-400">{technical}</span>
            </div>
            {unpositioned > 0 && (
              <div className="flex items-center gap-1 text-amber-400">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                <span>{t('dashboard.timeline_unpositioned', { count: unpositioned })}</span>
              </div>
            )}
            {targetHours > 0 && (
              <div className="pt-1 border-t border-gray-700">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-gray-400">{t('dashboard.timeline_coverage', { covered: coveredHours, total: targetHours })}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden bg-gray-700">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, (coveredHours / targetHours) * 100)}%`, background: '#3b82f6' }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </KpiCard>
  )
}

// ─── Inject count KPI ─────────────────────────────────────────────────────────

function InjectCountKpi({ injects, exerciseId }: { injects: Inject[]; exerciseId: number | null }) {
  const { t } = useTranslation()

  const byStatus = {
    draft:     injects.filter(i => i.status === 'draft').length,
    scheduled: injects.filter(i => i.status === 'scheduled').length,
    sent:      injects.filter(i => i.status === 'sent').length,
    cancelled: injects.filter(i => i.status === 'cancelled').length,
  }

  const statusSlices = [
    { label: t('dashboard.inject_status_draft'),     value: byStatus.draft,     color: '#6b7280' },
    { label: t('dashboard.inject_status_scheduled'), value: byStatus.scheduled, color: '#3b82f6' },
    { label: t('dashboard.inject_status_sent'),      value: byStatus.sent,      color: '#22c55e' },
    { label: t('dashboard.inject_status_cancelled'), value: byStatus.cancelled, color: '#ef4444' },
  ]

  const byType: Record<string, number> = {}
  for (const inj of injects) byType[inj.type] = (byType[inj.type] || 0) + 1
  const typeEntries = Object.entries(byType).sort((a, b) => b[1] - a[1])
  const maxType = Math.max(...typeEntries.map(([, v]) => v), 1)

  return (
    <KpiCard
      title={t('dashboard.inject_count_title')}
      subtitle={t('dashboard.inject_count_sub', { count: injects.length })}
      footer={exerciseId ? (
        <Link to={`/exercises/${exerciseId}/chronogramme`} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
          {t('dashboard.inject_count_go')} <ExternalLink className="w-3 h-3" />
        </Link>
      ) : undefined}
    >
      {injects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
          <p className="text-xs text-gray-400">{t('dashboard.inject_count_empty')}</p>
        </div>
      ) : (
        <div className="flex items-start gap-4">
          <DonutChart
            slices={statusSlices}
            centerLabel={String(injects.length)}
            centerSub="injects"
            size={90}
            thickness={16}
          />
          <div className="flex-1 space-y-1.5">
            {typeEntries.map(([type, count]) => (
              <div key={type} className="flex items-center gap-2">
                <span className="text-[10px] w-14 truncate flex-shrink-0 text-gray-400">{type}</span>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-gray-700">
                  <div className="h-full rounded-full bg-primary-500" style={{ width: `${(count / maxType) * 100}%` }} />
                </div>
                <span className="text-[10px] tabular-nums w-4 text-right text-white">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </KpiCard>
  )
}

// ─── Participants KPI ─────────────────────────────────────────────────────────

function ParticipantsKpi({ users, exerciseId }: { users: ExerciseUser[]; exerciseId: number | null }) {
  const { t } = useTranslation()

  const byRole = {
    animateur:   users.filter(u => u.role === 'animateur').length,
    observateur: users.filter(u => u.role === 'observateur').length,
    joueur:      users.filter(u => u.role === 'joueur').length,
  }

  const ROLE_COLORS: Record<string, string> = {
    animateur:   '#f59e0b',
    observateur: '#8b5cf6',
    joueur:      '#3b82f6',
  }

  const slices = Object.entries(byRole)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ label: t(`dashboard.participants_role_${k}`), value: v, color: ROLE_COLORS[k] }))

  return (
    <KpiCard
      title={t('dashboard.participants_title')}
      subtitle={t('dashboard.participants_sub', { count: users.length })}
      footer={exerciseId ? (
        <Link to={`/exercises/${exerciseId}`} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
          {t('dashboard.participants_go')} <ExternalLink className="w-3 h-3" />
        </Link>
      ) : undefined}
    >
      {users.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
          <Users className="w-8 h-8 text-gray-600" />
          <p className="text-xs text-gray-400">{t('dashboard.participants_empty')}</p>
        </div>
      ) : (
        <div className="flex items-start gap-4">
          <DonutChart
            slices={slices}
            centerLabel={String(users.length)}
            centerSub="total"
            size={90}
            thickness={16}
          />
          <div className="flex-1 space-y-2">
            {Object.entries(byRole).map(([role, count]) => (
              <div key={role} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ROLE_COLORS[role] }} />
                  <span className="text-gray-400">{t(`dashboard.participants_role_${role}`)}</span>
                </div>
                <span className="font-semibold text-white">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </KpiCard>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  // ── Queries globales
  const { data: exercisesData, isLoading: exLoading } = useQuery({
    queryKey: ['exercises-all'],
    queryFn: () => exercisesApi.list({ page: 1, page_size: 100 }),
  })
  const { data: appConfig, isLoading: configLoading } = useQuery({
    queryKey: ['appConfig'],
    queryFn: adminApi.getAppConfiguration,
    enabled: isAdmin,
    retry: false,
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

  // Sélection automatique du dernier exercice créé si rien n'est sélectionné
  useEffect(() => {
    if (selectedId != null || exercises.length === 0) return
    const latest = [...exercises]
      .filter(e => e.status !== 'archived')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    if (latest) {
      setSelectedId(latest.id)
      localStorage.setItem(STORAGE_KEY, String(latest.id))
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
  const { data: scenario = null } = useQuery({
    queryKey: ['scenario', selectedId],
    queryFn: () => crisisManagementApi.getScenario(selectedId!).catch(() => null),
    enabled: !!selectedId,
  })
  const { data: escalationAxes = [] } = useQuery({
    queryKey: ['escalation-axes', selectedId],
    queryFn: () => crisisManagementApi.listEscalationAxes(selectedId!),
    enabled: !!selectedId,
  })
  const { data: exerciseUsersData } = useQuery({
    queryKey: ['exercise-users', selectedId],
    queryFn: () => exerciseUsersApi.listExerciseUsers(selectedId!, { page_size: 500 }),
    enabled: !!selectedId,
  })

  const injects: Inject[] = injectsData?.injects ?? []
  const exerciseUsers: ExerciseUser[] = exerciseUsersData?.users ?? []
  const positionedInjects = injects.filter(i => i.time_offset != null)

  // ── Scores
  const orgScore  = useMemo(() => appConfig ? computeOrgScore(appConfig) : null, [appConfig])
  const biaScore  = useMemo(() => computeBiaScore(appConfig?.bia_processes), [appConfig])
  const scenScore = useMemo(() => selectedExercise
    ? computeScenarioScore({
        exercise: selectedExercise,
        scenario,
        phasesCount: phases.length,
        escalationAxesCount: escalationAxes.length,
        hasPositionedInjects: positionedInjects.length > 0,
      })
    : null, [selectedExercise, scenario, phases.length, escalationAxes.length, positionedInjects.length])

  const globalScore = useMemo(() =>
    computeGlobalScore(
      orgScore?.pct ?? 0,
      biaScore.pct,
      scenScore?.pct ?? 0,
    ), [orgScore, biaScore, scenScore])

  return (
    <div className="options-theme space-y-5 pb-8">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-white">{t('dashboard.title')}</h1>
          <p className="text-sm mt-0.5 text-gray-400">{t('login.platformTagline')}</p>
        </div>

        {/* Sélecteur exercice — nouvelle ligne, aligné à gauche */}
        <div className="flex items-center gap-3 border-t border-gray-700 pt-4">
          <span className="text-xs flex-shrink-0 text-gray-400">
            {t('dashboard.exercise_scope_label')} :
          </span>
          {exLoading ? (
            <div className="h-9 w-48 rounded-xl animate-pulse bg-gray-700" />
          ) : (
            <ExerciseSelector exercises={exercises} selectedId={selectedId} onChange={handleSelect} />
          )}
        </div>
      </div>

      {/* ── Score global ───────────────────────────────────── */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 flex flex-col sm:flex-row items-center gap-6">
        <div className="flex-shrink-0">
          <GaugeChart value={globalScore} size={180} />
        </div>
        <div className="flex-1 space-y-2">
          <h2 className="text-sm font-semibold text-white">{t('dashboard.maturity_score')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: t('dashboard.org_completeness'), pct: orgScore?.pct ?? 0, color: '#3b82f6' },
              { label: t('dashboard.bia_title'),         pct: biaScore.pct,       color: '#8b5cf6' },
              { label: t('dashboard.scenario_title'),    pct: scenScore?.pct ?? 0, color: '#f59e0b' },
            ].map(({ label, pct, color }) => (
              <div key={label} className="flex items-center gap-3">
                <RadialProgress pct={pct} size={44} thickness={6} color={color} label={`${pct}%`} />
                <div>
                  <p className="text-[10px] text-gray-400">{label}</p>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-11 h-11 rounded-full border-[6px]" style={{ borderColor: '#22c55e' }}>
                <span className="text-sm font-bold text-white">{injects.length}</span>
              </div>
              <div>
                <p className="text-[10px] text-gray-400">{t('dashboard.inject_count_title')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPIs globaux (3 colonnes) ──────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Organisation */}
        {configLoading ? (
          <div className="rounded-xl animate-pulse h-40 bg-gray-800" />
        ) : orgScore ? (
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
                    <span className={f.done ? 'text-white' : 'text-gray-400'}>{t(f.i18nKey)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </KpiCard>
        ) : (
          <KpiCard title={t('dashboard.org_completeness')}>
            <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
              <p className="text-xs text-gray-400">{t('dashboard.config_admin_only')}</p>
            </div>
          </KpiCard>
        )}

        {/* BIA */}
        <BiaKpi raw={appConfig?.bia_processes} />

        {/* Nombre d'injects */}
        <InjectCountKpi injects={injects} exerciseId={selectedId} />
      </div>

      {/* ── KPIs par exercice (2 colonnes) ────────────────── */}
      {selectedExercise ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Scénario */}
          <KpiCard
            title={t('dashboard.scenario_title')}
            subtitle={t('dashboard.scenario_sub')}
          >
            {scenScore ? (
              <CriteriaBar criteria={scenScore.criteria} score={scenScore.score} max={scenScore.max} />
            ) : (
              <div className="flex items-center justify-center py-4">
                <p className="text-xs text-gray-400">{t('dashboard.no_exercise_selected')}</p>
              </div>
            )}
          </KpiCard>

          {/* Timeline */}
          <TimelineKpi injects={injects} phases={phases as ExercisePhase[]} exercise={selectedExercise} />

          {/* Participants */}
          <ParticipantsKpi users={exerciseUsers} exerciseId={selectedId} />
        </div>
      ) : (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 text-center text-sm text-gray-400">
          {t('dashboard.no_exercise_selected')}
        </div>
      )}

    </div>
  )
}
