import {
  EscalationAxisType,
  ExercisePresetId,
  ExerciseType,
  ExerciseMaturityLevel,
  ExerciseMode,
  PluginType,
} from '../../services/api'

export interface PresetExerciseDefaults {
  exercise_type?: ExerciseType
  target_duration_hours?: number
  maturity_level?: ExerciseMaturityLevel
  mode?: ExerciseMode
  time_multiplier?: number
}

export interface PresetScenarioDefaults {
  strategic_intent?: string
  initial_context?: string
  initial_situation?: string
  pedagogical_objectives?: string[]
  evaluation_criteria?: string[]
  stress_factors?: string[]
}

export interface PresetAxis {
  axis_type: EscalationAxisType
  intensity: number
  notes?: string
}

export interface PresetPhase {
  name: string
  description?: string
  phase_order: number
  start_offset_min?: number
  end_offset_min?: number
}

export interface ExercisePresetTemplate {
  id: ExercisePresetId
  name: string
  description: string
  exerciseDefaults: PresetExerciseDefaults
  scenarioDefaults: PresetScenarioDefaults
  axes: PresetAxis[]
  phases: PresetPhase[]
  plugins: PluginType[]
}

export const EXERCISE_PRESETS: Record<ExercisePresetId, ExercisePresetTemplate> = {
  ransomware_4h: {
    id: 'ransomware_4h',
    name: 'Ransomware 4h',
    description: 'Scenario court avec forte pression mediatique et gouvernance.',
    exerciseDefaults: {
      exercise_type: 'ransomware',
      target_duration_hours: 4,
      maturity_level: 'intermediate',
      mode: 'compressed',
      time_multiplier: 2,
    },
    scenarioDefaults: {
      strategic_intent: 'Tester la coordination de crise face a une attaque ransomware.',
      initial_context: 'Un chiffrement massif des postes est detecte sur un site critique.',
      initial_situation: 'Les services metiers commencent a perdre leurs acces.',
      pedagogical_objectives: ['Prioriser les decisions', 'Coordonner IT + COM + Direction'],
      evaluation_criteria: ['Delai d activation cellule', 'Qualite de communication externe'],
      stress_factors: ['Pression media', 'Signalement autorites'],
    },
    axes: [
      { axis_type: 'technical', intensity: 8, notes: 'Propagation rapide' },
      { axis_type: 'communication', intensity: 7, notes: 'Narratif public instable' },
      { axis_type: 'legal', intensity: 5, notes: 'Notification obligatoire' },
      { axis_type: 'media', intensity: 8, notes: 'Fuite sur reseaux sociaux' },
    ],
    phases: [
      { name: 'Detection', phase_order: 1, start_offset_min: 0, end_offset_min: 30 },
      { name: 'Activation cellule', phase_order: 2, start_offset_min: 30, end_offset_min: 90 },
      { name: 'Escalade', phase_order: 3, start_offset_min: 90, end_offset_min: 150 },
      { name: 'Communication publique', phase_order: 4, start_offset_min: 150, end_offset_min: 210 },
      { name: 'Stabilisation', phase_order: 5, start_offset_min: 210, end_offset_min: 240 },
    ],
    plugins: ['directory', 'mailbox', 'social_internal', 'tv', 'chat', 'press_feed', 'gov_channel', 'anssi_channel'],
  },
  it_outage_8h: {
    id: 'it_outage_8h',
    name: 'Panne IT 8h',
    description: 'Exercice centré sur continuité d activité et arbitrages de priorisation.',
    exerciseDefaults: {
      exercise_type: 'it_outage',
      target_duration_hours: 8,
      maturity_level: 'beginner',
      mode: 'real_time',
      time_multiplier: 1,
    },
    scenarioDefaults: {
      strategic_intent: 'Valider la gouvernance lors d une panne IT majeure.',
      initial_context: 'Indisponibilite complete du SI de production.',
      initial_situation: 'Les utilisateurs ne peuvent plus acceder aux applications coeur.',
      pedagogical_objectives: ['Coordination multi-equipes', 'Communication interne claire'],
      evaluation_criteria: ['Temps de reprise decisionnel', 'Qualite de priorisation'],
      stress_factors: ['Surcharge support', 'Escalade direction'],
    },
    axes: [
      { axis_type: 'technical', intensity: 7, notes: 'Capacite de reprise' },
      { axis_type: 'communication', intensity: 5, notes: 'Alignement interne' },
      { axis_type: 'political', intensity: 4, notes: 'Arbitrages management' },
    ],
    phases: [
      { name: 'Detection', phase_order: 1, start_offset_min: 0, end_offset_min: 45 },
      { name: 'Activation cellule', phase_order: 2, start_offset_min: 45, end_offset_min: 140 },
      { name: 'Escalade', phase_order: 3, start_offset_min: 140, end_offset_min: 280 },
      { name: 'Stabilisation', phase_order: 4, start_offset_min: 280, end_offset_min: 480 },
    ],
    plugins: ['directory', 'mailbox', 'chat', 'press_feed', 'sms'],
  },
  mixed_24h: {
    id: 'mixed_24h',
    name: 'Mixte 24h',
    description: 'Exercice long avec escalades techniques, juridiques et mediatiques.',
    exerciseDefaults: {
      exercise_type: 'mixed',
      target_duration_hours: 24,
      maturity_level: 'expert',
      mode: 'simulated',
      time_multiplier: 4,
    },
    scenarioDefaults: {
      strategic_intent: 'Evaluer une gestion de crise multi-domaines sur la duree.',
      initial_context: 'Incident combine indisponibilite SI + exposition de donnees sensibles.',
      initial_situation: 'Plusieurs parties prenantes externes demandent des comptes.',
      pedagogical_objectives: ['Arbitrages longs', 'Maintien de la communication dans la duree'],
      evaluation_criteria: ['Coherence des decisions', 'Maitrise de l escalade'],
      stress_factors: ['Fatigue equipe', 'Pression politique et mediatique'],
    },
    axes: [
      { axis_type: 'technical', intensity: 9, notes: 'Impacts en chaine' },
      { axis_type: 'communication', intensity: 8, notes: 'Narratif contradictoire' },
      { axis_type: 'legal', intensity: 8, notes: 'Contraintes de notification' },
      { axis_type: 'political', intensity: 7, notes: 'Arbitrage institutions' },
      { axis_type: 'media', intensity: 9, notes: 'Couverture continue' },
    ],
    phases: [
      { name: 'Detection', phase_order: 1, start_offset_min: 0, end_offset_min: 120 },
      { name: 'Activation cellule', phase_order: 2, start_offset_min: 120, end_offset_min: 360 },
      { name: 'Escalade', phase_order: 3, start_offset_min: 360, end_offset_min: 900 },
      { name: 'Communication publique', phase_order: 4, start_offset_min: 900, end_offset_min: 1200 },
      { name: 'Stabilisation', phase_order: 5, start_offset_min: 1200, end_offset_min: 1440 },
    ],
    plugins: ['directory', 'mailbox', 'social_internal', 'tv', 'chat', 'press_feed', 'sms', 'gov_channel', 'anssi_channel'],
  },
}

export function getPresetById(id: ExercisePresetId): ExercisePresetTemplate {
  return EXERCISE_PRESETS[id]
}
