import {
  Exercise,
  ExerciseEscalationAxis,
  ExerciseScenario,
  ExerciseSetupChecklist,
  ExerciseSetupSectionStatus,
  ExerciseUser,
  Inject,
} from '../../services/api'

interface CompletionInput {
  exercise: Exercise
  scenario: ExerciseScenario | null
  axes: ExerciseEscalationAxis[]
  users: ExerciseUser[]
  phases: Array<{ id: number }>
  injects: Inject[]
}

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

function resolveStatus(completed: boolean, hasAny: boolean): ExerciseSetupSectionStatus {
  if (completed) return 'complete'
  if (hasAny) return 'partial'
  return 'todo'
}

export function computeExerciseSetupChecklist({
  exercise,
  scenario,
  axes,
  users,
  phases,
  injects,
}: CompletionInput): ExerciseSetupChecklist {
  const missingItems: string[] = []

  const socleFields = [
    isFilled(exercise.name),
    isFilled(exercise.exercise_type),
    isFilled(exercise.target_duration_hours),
    isFilled(exercise.maturity_level),
    isFilled(exercise.mode),
  ]
  const socleComplete = socleFields.every(Boolean)
  const socleAny = socleFields.some(Boolean) || isFilled(exercise.planned_date)
  if (!socleComplete) missingItems.push('Completer le socle (type, duree, maturite, mode).')

  const scenarioIntent = isFilled(scenario?.strategic_intent)
  const scenarioContext = isFilled(scenario?.initial_context)
  const scenarioAxis = axes.length > 0
  const scenarioComplete = scenarioIntent && scenarioContext && scenarioAxis
  const scenarioAny = scenarioIntent || scenarioContext || scenarioAxis
  if (!scenarioComplete) missingItems.push('Renseigner intention + contexte et au moins 1 axe d escalation.')

  const animateurs = users.filter((u) => u.role === 'animateur').length
  const joueurs = users.filter((u) => u.role === 'joueur').length
  const actorsComplete = animateurs >= 1 && joueurs >= 1
  const actorsAny = users.length > 0
  if (!actorsComplete) missingItems.push('Affecter au moins 1 animateur et 1 joueur.')

  const injectsWithPhase = injects.filter((inject) => inject.phase_id !== null).length
  const timelineComplete = phases.length >= 3 && injectsWithPhase >= 1
  const timelineAny = phases.length > 0 || injects.length > 0
  if (!timelineComplete) missingItems.push('Definir >= 3 phases et lier au moins 1 inject a une phase.')

  // Simulators section — defaults are valid; only flag incomplete if user started configuring but left gaps
  const simulatorConfigRaw = exercise.simulator_config
  const simulatorConfig = simulatorConfigRaw ? JSON.parse(simulatorConfigRaw) : null
  const hasExplicitConfig = simulatorConfig !== null && Object.keys(simulatorConfig).length > 0
  const hasMailConfig = !hasExplicitConfig || isFilled(simulatorConfig.mail)
  const hasChatConfig = !hasExplicitConfig || isFilled(simulatorConfig.chat)
  const hasActiveSimulator = !hasExplicitConfig || simulatorConfig.press || simulatorConfig.tv || simulatorConfig.sms || simulatorConfig.phone || simulatorConfig.social
  const simulatorsComplete = hasMailConfig && hasChatConfig && hasActiveSimulator
  const simulatorsAny = hasExplicitConfig
  if (!simulatorsComplete) missingItems.push('Configurer les simulateurs (mail, chat et au moins 1 canal actif).')

  const completedCount = [socleComplete, scenarioComplete, actorsComplete, timelineComplete, simulatorsComplete].filter(Boolean).length
  const totalCount = 6
  const validationComplete = completedCount === 5
  const validationStatus = resolveStatus(validationComplete, completedCount > 0)

  return {
    completedCount: validationComplete ? totalCount : completedCount,
    totalCount,
    missingItems,
    sections: {
      socle: {
        status: resolveStatus(socleComplete, socleAny),
        completed: socleComplete,
        summary: `${exercise.exercise_type || 'n/a'} | ${exercise.target_duration_hours || 'n/a'}h | ${exercise.mode || 'n/a'}`,
      },
      scenario: {
        status: resolveStatus(scenarioComplete, scenarioAny),
        completed: scenarioComplete,
        summary: `${axes.length} axe(s) | intention ${scenarioIntent ? 'ok' : 'manquante'} | contexte ${scenarioContext ? 'ok' : 'manquant'}`,
      },
      actors: {
        status: resolveStatus(actorsComplete, actorsAny),
        completed: actorsComplete,
        summary: `${users.length} participant(s) | ${animateurs} animateur(s) | ${joueurs} joueur(s)`,
      },
      timelineInjects: {
        status: resolveStatus(timelineComplete, timelineAny),
        completed: timelineComplete,
        summary: `${phases.length} phase(s) | ${injects.length} inject(s) | ${injectsWithPhase} lie(s) a une phase`,
      },
      simulators: {
        status: resolveStatus(simulatorsComplete, simulatorsAny),
        completed: simulatorsComplete,
        summary: hasExplicitConfig
          ? `Mail: ${hasMailConfig ? 'ok' : 'manquant'} | Chat: ${hasChatConfig ? 'ok' : 'manquant'} | Canal(s) actif(s): ${hasActiveSimulator ? 'ok' : 'aucun'}`
          : 'Configuration par defaut',
      },
      validation: {
        status: validationStatus,
        completed: validationComplete,
        summary: validationComplete
          ? 'Configuration complete. Exercice pret au lancement.'
          : `${missingItems.length} point(s) bloquant(s) avant lancement.`,
      },
    },
  }
}
