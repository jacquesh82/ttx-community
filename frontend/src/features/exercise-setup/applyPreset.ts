import {
  Exercise,
  ExerciseEscalationAxis,
  ExercisePhase,
  ExerciseScenario,
  PluginType,
} from '../../services/api'
import { ExercisePresetTemplate } from './presets'

interface PresetCurrentState {
  exercise: Exercise
  scenario: ExerciseScenario | null
  axes: ExerciseEscalationAxis[]
  phases: ExercisePhase[]
}

interface PresetApplyApi {
  updateExercise: (
    exerciseId: number,
    data: {
      exercise_type?: Exercise['exercise_type']
      target_duration_hours?: number
      maturity_level?: Exercise['maturity_level']
      mode?: Exercise['mode']
      time_multiplier?: number
    }
  ) => Promise<unknown>
  upsertScenario: (
    exerciseId: number,
    data: Omit<ExerciseScenario, 'exercise_id'>
  ) => Promise<unknown>
  createEscalationAxis: (
    exerciseId: number,
    data: { axis_type: ExerciseEscalationAxis['axis_type']; intensity: number; notes?: string }
  ) => Promise<unknown>
  createPhase: (
    exerciseId: number,
    data: {
      name: string
      description?: string
      phase_order: number
      start_offset_min?: number
      end_offset_min?: number
    }
  ) => Promise<unknown>
  togglePlugin: (exerciseId: number, pluginType: PluginType, enabled: boolean) => Promise<unknown>
}

export interface PresetApplySummary {
  filledExerciseFields: number
  filledScenarioFields: number
  addedAxes: number
  addedPhases: number
  enabledPlugins: number
}

function isMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim().length === 0
  return false
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function normalizeAvailablePlugins(
  availablePluginTypes?: PluginType[] | Set<PluginType>
): Set<PluginType> | null {
  if (!availablePluginTypes) return null
  const set = availablePluginTypes instanceof Set ? availablePluginTypes : new Set(availablePluginTypes)
  return set.size > 0 ? set : null
}

export function buildPresetPreview(
  current: PresetCurrentState,
  preset: ExercisePresetTemplate,
  availablePluginTypes?: PluginType[] | Set<PluginType>
): string[] {
  const items: string[] = []
  const availablePlugins = normalizeAvailablePlugins(availablePluginTypes)

  const exerciseFieldsToFill = [
    preset.exerciseDefaults.exercise_type !== undefined && isMissing(current.exercise.exercise_type),
    preset.exerciseDefaults.target_duration_hours !== undefined &&
      isMissing(current.exercise.target_duration_hours),
    preset.exerciseDefaults.maturity_level !== undefined && isMissing(current.exercise.maturity_level),
    preset.exerciseDefaults.mode !== undefined && isMissing(current.exercise.mode),
    preset.exerciseDefaults.time_multiplier !== undefined && isMissing(current.exercise.time_multiplier),
  ].filter(Boolean).length
  if (exerciseFieldsToFill > 0) items.push(`Socle: ${exerciseFieldsToFill} champ(s) a completer`)

  const scenario = current.scenario
  const scenarioFieldKeys: Array<keyof typeof preset.scenarioDefaults> = [
    'strategic_intent',
    'initial_context',
    'initial_situation',
  ]
  const scenarioFieldsToFill = scenarioFieldKeys.filter((key) => {
    const presetValue = preset.scenarioDefaults[key]
    if (!presetValue) return false
    return isMissing(scenario?.[key] || null)
  }).length
  const countListAdds = (key: 'pedagogical_objectives' | 'evaluation_criteria' | 'stress_factors') => {
    const incoming = preset.scenarioDefaults[key] || []
    const existing = new Set((scenario?.[key] || []) as string[])
    return incoming.filter((value: string) => !existing.has(value)).length
  }
  const listAdds =
    countListAdds('pedagogical_objectives') +
    countListAdds('evaluation_criteria') +
    countListAdds('stress_factors')
  if (scenarioFieldsToFill + listAdds > 0) {
    items.push(`Scenario: ${scenarioFieldsToFill} champ(s) texte + ${listAdds} element(s) liste a ajouter`)
  }

  const existingAxisTypes = new Set(current.axes.map((axis) => axis.axis_type))
  const axesToAdd = preset.axes.filter((axis) => !existingAxisTypes.has(axis.axis_type)).length
  if (axesToAdd > 0) items.push(`Axes d escalation: ${axesToAdd} axe(s) a ajouter`)

  const existingPhases = new Set(current.phases.map((phase) => normalizeKey(phase.name)))
  const phasesToAdd = preset.phases.filter((phase) => !existingPhases.has(normalizeKey(phase.name))).length
  if (phasesToAdd > 0) items.push(`Timeline: ${phasesToAdd} phase(s) a ajouter`)

  const existingPluginMap = new Map(current.exercise.plugins.map((plugin) => [plugin.plugin_type, plugin.enabled]))
  const presetPlugins = availablePlugins
    ? preset.plugins.filter((pluginType) => availablePlugins.has(pluginType))
    : preset.plugins
  const pluginsToEnable = presetPlugins.filter((pluginType) => !existingPluginMap.get(pluginType)).length
  if (pluginsToEnable > 0) items.push(`Plugins: ${pluginsToEnable} plugin(s) a activer`)

  return items
}

export async function applyPresetNonDestructive(
  exerciseId: number,
  preset: ExercisePresetTemplate,
  current: PresetCurrentState,
  api: PresetApplyApi,
  availablePluginTypes?: PluginType[] | Set<PluginType>
): Promise<PresetApplySummary> {
  const summary: PresetApplySummary = {
    filledExerciseFields: 0,
    filledScenarioFields: 0,
    addedAxes: 0,
    addedPhases: 0,
    enabledPlugins: 0,
  }
  const availablePlugins = normalizeAvailablePlugins(availablePluginTypes)

  const exercisePayload: {
    exercise_type?: Exercise['exercise_type']
    target_duration_hours?: number
    maturity_level?: Exercise['maturity_level']
    mode?: Exercise['mode']
    time_multiplier?: number
  } = {}

  if (isMissing(current.exercise.exercise_type) && preset.exerciseDefaults.exercise_type) {
    exercisePayload.exercise_type = preset.exerciseDefaults.exercise_type
    summary.filledExerciseFields += 1
  }
  if (isMissing(current.exercise.target_duration_hours) && preset.exerciseDefaults.target_duration_hours !== undefined) {
    exercisePayload.target_duration_hours = preset.exerciseDefaults.target_duration_hours
    summary.filledExerciseFields += 1
  }
  if (isMissing(current.exercise.maturity_level) && preset.exerciseDefaults.maturity_level) {
    exercisePayload.maturity_level = preset.exerciseDefaults.maturity_level
    summary.filledExerciseFields += 1
  }
  if (isMissing(current.exercise.mode) && preset.exerciseDefaults.mode) {
    exercisePayload.mode = preset.exerciseDefaults.mode
    summary.filledExerciseFields += 1
  }
  if (isMissing(current.exercise.time_multiplier) && preset.exerciseDefaults.time_multiplier !== undefined) {
    exercisePayload.time_multiplier = preset.exerciseDefaults.time_multiplier
    summary.filledExerciseFields += 1
  }

  if (Object.keys(exercisePayload).length > 0) {
    await api.updateExercise(exerciseId, exercisePayload)
  }

  const scenario = current.scenario || {
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

  const scenarioPayload: Omit<ExerciseScenario, 'exercise_id'> = {
    strategic_intent: scenario.strategic_intent,
    initial_context: scenario.initial_context,
    initial_situation: scenario.initial_situation,
    implicit_hypotheses: scenario.implicit_hypotheses,
    hidden_brief: scenario.hidden_brief,
    pedagogical_objectives: scenario.pedagogical_objectives || [],
    evaluation_criteria: scenario.evaluation_criteria || [],
    stress_factors: scenario.stress_factors || [],
  }

  let scenarioChanged = false

  if (isMissing(scenarioPayload.strategic_intent) && preset.scenarioDefaults.strategic_intent) {
    scenarioPayload.strategic_intent = preset.scenarioDefaults.strategic_intent
    summary.filledScenarioFields += 1
    scenarioChanged = true
  }
  if (isMissing(scenarioPayload.initial_context) && preset.scenarioDefaults.initial_context) {
    scenarioPayload.initial_context = preset.scenarioDefaults.initial_context
    summary.filledScenarioFields += 1
    scenarioChanged = true
  }
  if (isMissing(scenarioPayload.initial_situation) && preset.scenarioDefaults.initial_situation) {
    scenarioPayload.initial_situation = preset.scenarioDefaults.initial_situation
    summary.filledScenarioFields += 1
    scenarioChanged = true
  }

  const mergedObjectives = uniq([
    ...scenarioPayload.pedagogical_objectives,
    ...(preset.scenarioDefaults.pedagogical_objectives || []),
  ])
  const mergedCriteria = uniq([
    ...scenarioPayload.evaluation_criteria,
    ...(preset.scenarioDefaults.evaluation_criteria || []),
  ])
  const mergedStress = uniq([
    ...scenarioPayload.stress_factors,
    ...(preset.scenarioDefaults.stress_factors || []),
  ])

  if (mergedObjectives.length !== scenarioPayload.pedagogical_objectives.length) {
    scenarioChanged = true
    summary.filledScenarioFields += mergedObjectives.length - scenarioPayload.pedagogical_objectives.length
    scenarioPayload.pedagogical_objectives = mergedObjectives
  }
  if (mergedCriteria.length !== scenarioPayload.evaluation_criteria.length) {
    scenarioChanged = true
    summary.filledScenarioFields += mergedCriteria.length - scenarioPayload.evaluation_criteria.length
    scenarioPayload.evaluation_criteria = mergedCriteria
  }
  if (mergedStress.length !== scenarioPayload.stress_factors.length) {
    scenarioChanged = true
    summary.filledScenarioFields += mergedStress.length - scenarioPayload.stress_factors.length
    scenarioPayload.stress_factors = mergedStress
  }

  if (scenarioChanged) {
    await api.upsertScenario(exerciseId, scenarioPayload)
  }

  const existingAxisTypes = new Set(current.axes.map((axis) => axis.axis_type))
  for (const axis of preset.axes) {
    if (!existingAxisTypes.has(axis.axis_type)) {
      await api.createEscalationAxis(exerciseId, {
        axis_type: axis.axis_type,
        intensity: axis.intensity,
        notes: axis.notes,
      })
      summary.addedAxes += 1
    }
  }

  const existingPhaseNames = new Set(current.phases.map((phase) => normalizeKey(phase.name)))
  let nextOrder = current.phases.reduce((acc, phase) => Math.max(acc, phase.phase_order), 0) + 1
  for (const phase of preset.phases) {
    if (!existingPhaseNames.has(normalizeKey(phase.name))) {
      await api.createPhase(exerciseId, {
        name: phase.name,
        description: phase.description,
        phase_order: nextOrder,
        start_offset_min: phase.start_offset_min,
        end_offset_min: phase.end_offset_min,
      })
      summary.addedPhases += 1
      nextOrder += 1
    }
  }

  const existingPluginMap = new Map(current.exercise.plugins.map((plugin) => [plugin.plugin_type, plugin.enabled]))
  const presetPlugins = availablePlugins
    ? preset.plugins.filter((pluginType) => availablePlugins.has(pluginType))
    : preset.plugins
  for (const pluginType of presetPlugins) {
    if (!existingPluginMap.get(pluginType)) {
      await api.togglePlugin(exerciseId, pluginType, true)
      summary.enabledPlugins += 1
    }
  }

  return summary
}
