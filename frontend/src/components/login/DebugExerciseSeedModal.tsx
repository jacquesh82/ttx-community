import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, Loader2, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  authApi,
  exercisesApi,
  exerciseUsersApi,
  teamsApi,
  crisisManagementApi,
  injectsApi,
  adminApi,
} from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

type StepStatus = 'pending' | 'active' | 'done' | 'error'

interface Step {
  key: string
  status: StepStatus
}

interface PhaseDef {
  name: string
  enabled: boolean
}

const FALLBACK_PHASES: PhaseDef[] = [
  { name: 'Détection & Alerte', enabled: true },
  { name: 'Gestion de crise', enabled: true },
  { name: 'Récupération & RETEX', enabled: true },
]

function parseEnabledPhases(raw: string | null | undefined): PhaseDef[] {
  if (!raw) return FALLBACK_PHASES
  try {
    const parsed: PhaseDef[] = JSON.parse(raw)
    const enabled = parsed.filter((p) => p.enabled)
    return enabled.length > 0 ? enabled : FALLBACK_PHASES
  } catch {
    return FALLBACK_PHASES
  }
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function DebugExerciseSeedModal({ open, onClose }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [steps, setSteps] = useState<Step[]>([
    { key: 'stepAuth', status: 'pending' },
    { key: 'stepBase', status: 'pending' },
    { key: 'stepScenario', status: 'pending' },
    { key: 'stepActors', status: 'pending' },
    { key: 'stepTimeline', status: 'pending' },
  ])
  const [exerciseId, setExerciseId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)

  const setStepStatus = (index: number, status: StepStatus) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, status } : s)))
  }

  const reset = () => {
    setSteps([
      { key: 'stepAuth', status: 'pending' },
      { key: 'stepBase', status: 'pending' },
      { key: 'stepScenario', status: 'pending' },
      { key: 'stepActors', status: 'pending' },
      { key: 'stepTimeline', status: 'pending' },
    ])
    setExerciseId(null)
    setError(null)
    setDone(false)
  }

  const run = async () => {
    reset()
    setRunning(true)

    // Collect user IDs across steps
    let animateurUserId: number | null = null
    let joueur1UserId: number | null = null
    let joueur2UserId: number | null = null

    try {
      // ── Step 1 : Auth ────────────────────────────────────────────────────────
      setStepStatus(0, 'active')
      // Pre-create dev users so we can assign them as participants later.
      // Each devLogin creates the user if absent; the last call (admin) wins the session.
      const animateurRes = await authApi.devLogin('animateur')
      animateurUserId = animateurRes.user?.id ?? null
      const participantRes = await authApi.devLogin('participant')
      joueur1UserId = participantRes.user?.id ?? null
      const observateurRes = await authApi.devLogin('observateur')
      joueur2UserId = observateurRes.user?.id ?? null
      // Final login as admin – establishes the session used for all subsequent calls
      const authRes = await authApi.devLogin('admin')
      useAuthStore.getState().setCsrfToken(authRes.csrf_token)
      setStepStatus(0, 'done')

      // ── Step 2 : Create exercise (socle) ────────────────────────────────────
      setStepStatus(1, 'active')
      const exercise = await exercisesApi.create({
        name: 'DEBUG – Cyber Crisis Simulation',
        exercise_type: 'cyber',
        maturity_level: 'beginner',
        mode: 'compressed',
        target_duration_hours: 2,
      })
      setExerciseId(exercise.id)
      setStepStatus(1, 'done')

      // ── Step 3 : Scenario ───────────────────────────────────────────────────
      setStepStatus(2, 'active')
      await crisisManagementApi.upsertScenario(exercise.id, {
        strategic_intent: "Tester la résilience de l'organisation face à une cyberattaque ransomware",
        initial_context: 'Un chiffrement massif est détecté sur les serveurs de production le lundi matin',
        initial_situation: 'Le SOC remonte une alerte critique. Le SI est partiellement inaccessible.',
        implicit_hypotheses: null,
        hidden_brief: null,
        pedagogical_objectives: [
          'Activer la cellule de crise',
          'Évaluer la coordination inter-équipes',
          'Tester les procédures de communication de crise',
        ],
        evaluation_criteria: [],
        stress_factors: ['Pression médiatique', 'Disponibilité des backups incertaine'],
      })
      setStepStatus(2, 'done')

      // ── Step 4 : Actors (teams + participants) ──────────────────────────────
      setStepStatus(3, 'active')
      const team1 = await teamsApi.create({ name: 'Cellule de crise (DEBUG)', color: '#ef4444' })
      const team2 = await teamsApi.create({ name: 'Équipe technique (DEBUG)', color: '#3b82f6' })
      await exercisesApi.attachTeam(exercise.id, team1.id)
      await exercisesApi.attachTeam(exercise.id, team2.id)

      // Assign participants
      if (animateurUserId) {
        await exerciseUsersApi.assignUser(exercise.id, {
          user_id: animateurUserId,
          role: 'animateur',
          team_id: team1.id,
        })
      }
      if (joueur1UserId) {
        await exerciseUsersApi.assignUser(exercise.id, {
          user_id: joueur1UserId,
          role: 'joueur',
          team_id: team2.id,
        })
      }
      if (joueur2UserId) {
        await exerciseUsersApi.assignUser(exercise.id, {
          user_id: joueur2UserId,
          role: 'joueur',
          team_id: team2.id,
        })
      }
      setStepStatus(3, 'done')

      // ── Step 5 : Timeline (phases + injects) ─────────────────────────────────
      setStepStatus(4, 'active')

      // Fetch configured phases from admin options (fall back to 3 defaults)
      let phaseDefs = FALLBACK_PHASES
      try {
        const cfg = await adminApi.getAppConfiguration()
        phaseDefs = parseEnabledPhases(cfg.default_phases_config)
      } catch {
        // non-blocking – use fallback
      }

      const totalDuration = 120 // minutes (2h compressed)
      const perPhase = Math.floor(totalDuration / phaseDefs.length)

      // Reuse pre-seeded phases when available; only create missing ones.
      const createdPhases: { id: number; name: string; start: number; end: number }[] = []
      const existingPhases = await crisisManagementApi.listPhases(exercise.id)
      if (existingPhases.length > 0) {
        existingPhases
          .sort((a, b) => a.phase_order - b.phase_order)
          .forEach((phase, index) => {
            const start = phase.start_offset_min ?? index * perPhase
            const end = phase.end_offset_min ?? (index === existingPhases.length - 1 ? totalDuration : (index + 1) * perPhase)
            createdPhases.push({ id: phase.id, name: phase.name, start, end })
          })
      } else {
        for (let i = 0; i < phaseDefs.length; i++) {
          const start = i * perPhase
          const end = i === phaseDefs.length - 1 ? totalDuration : (i + 1) * perPhase
          const phase = await crisisManagementApi.createPhase(exercise.id, {
            name: phaseDefs[i].name,
            phase_order: i + 1,
            start_offset_min: start,
            end_offset_min: end,
          })
          createdPhases.push({ id: phase.id, name: phaseDefs[i].name, start, end })
        }
      }

      // Create one sample inject per phase
      const injectTemplates = [
        { title: 'Alerte remontée par le SOC', description: 'Détection d\'une activité anormale sur le réseau.' },
        { title: 'Activation cellule de crise', description: 'Le directeur général convoque la cellule de crise.' },
        { title: 'Décision de communication externe', description: 'Valider la communication vers les autorités compétentes.' },
        { title: 'Point de situation technique', description: 'État d\'avancement de la remédiation.' },
        { title: 'Rapport RETEX', description: 'Synthèse des actions menées et leçons apprises.' },
      ]

      const recipientPatterns = [
        { label: '[Tous]', audiences: [] as Array<{ kind: 'user' | 'team' | 'role'; value: string }> },
        { label: '[Role: joueur]', audiences: [{ kind: 'role' as const, value: 'joueur' }] },
        { label: `[Equipe: ${team2.id}]`, audiences: [{ kind: 'team' as const, value: String(team2.id) }] },
        {
          label: joueur1UserId ? `[Personne: ${joueur1UserId}]` : '[Personne: fallback tous]',
          audiences: joueur1UserId ? [{ kind: 'user' as const, value: String(joueur1UserId) }] : [],
        },
      ]

      for (let i = 0; i < createdPhases.length; i++) {
        const tpl = injectTemplates[i % injectTemplates.length]
        const recipient = recipientPatterns[i % recipientPatterns.length]
        await injectsApi.create({
          exercise_id: exercise.id,
          title: `${tpl.title} ${recipient.label}`,
          description: tpl.description,
          type: 'decision',
          content: { text: tpl.description },
          time_offset: createdPhases[i].start,
          phase_id: createdPhases[i].id,
          audiences: recipient.audiences,
          timeline_type: 'business',
        })
      }

      setStepStatus(4, 'done')
      setDone(true)
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? err?.message ?? t('debug.seedModal.error')
      setError(msg)
      setSteps((prev) => prev.map((s) => (s.status === 'active' ? { ...s, status: 'error' } : s)))
    } finally {
      setRunning(false)
    }
  }

  // Auto-start when modal opens
  useEffect(() => {
    if (open && !running && !done && !error) {
      run()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div
        className="w-full max-w-sm rounded-2xl border p-6 shadow-2xl"
        style={{
          backgroundColor: 'var(--login-card-bg)',
          borderColor: 'var(--login-card-border)',
        }}
      >
        <h2 className="mb-5 text-center text-base font-semibold login-muted">
          {t('debug.seedModal.title')}
        </h2>

        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="flex-shrink-0">
                {step.status === 'done' && <CheckCircle size={18} className="text-green-400" />}
                {step.status === 'active' && <Loader2 size={18} className="animate-spin text-blue-400" />}
                {step.status === 'error' && <XCircle size={18} className="text-red-400" />}
                {step.status === 'pending' && (
                  <span className="block h-[18px] w-[18px] rounded-full border-2 border-gray-600" />
                )}
              </span>
              <span
                className="text-sm"
                style={{
                  color:
                    step.status === 'done' || step.status === 'active'
                      ? 'var(--login-text, #e5e7eb)'
                      : 'var(--login-muted, #6b7280)',
                }}
              >
                {t(`debug.seedModal.${step.key}`)}
              </span>
            </li>
          ))}
        </ol>

        {error && (
          <p className="mt-4 rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}

        <div className="mt-6 flex gap-2">
          {done && exerciseId && (
            <button
              onClick={() => {
                onClose()
                navigate(`/exercises/${exerciseId}`)
              }}
              className="flex-1 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            >
              {t('debug.seedModal.viewExercise')}
            </button>
          )}
          {error && (
            <button
              onClick={run}
              disabled={running}
              className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {t('debug.seedModal.retry')}
            </button>
          )}
          <button
            onClick={onClose}
            disabled={running}
            className="flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-white/5 disabled:opacity-50 login-muted"
            style={{ borderColor: 'var(--login-card-border)' }}
          >
            {t('debug.seedModal.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
