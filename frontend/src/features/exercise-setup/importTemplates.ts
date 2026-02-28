import { ExerciseImportComponent, PluginInfo } from '../../services/api'

type JsonValue = Record<string, any> | Array<any>

const SOCLE_TEMPLATE = {
  name: 'CRYP-TTX-2026-01',
  description: 'Exercice de crise cyber avec escalade media',
  time_multiplier: 1,
  exercise_type: 'ransomware',
  target_duration_hours: 4,
  maturity_level: 'intermediate',
  mode: 'compressed',
  planned_date: '2026-03-15T09:00:00Z',
  lead_organizer_user_id: 1,
}

const SCENARIO_TEMPLATE = {
  scenario: {
    strategic_intent: 'Tester la gouvernance et la communication de crise',
    initial_context: 'Plusieurs postes signalent un chiffrement soudain',
    initial_situation: 'Le service client ne peut plus acceder au CRM',
    implicit_hypotheses: 'Les sauvegardes de la veille sont exploitables',
    hidden_brief: 'Un compte admin compromis est a l origine de la propagation',
    pedagogical_objectives: ['Coordination de cellule', 'Decision sous pression'],
    evaluation_criteria: ['Delai d activation', 'Qualite des messages externes'],
    stress_factors: ['Pression media', 'Rumeur reseaux sociaux'],
  },
  axes: [
    { axis_type: 'technical', intensity: 8, notes: 'Propagation laterale rapide' },
    { axis_type: 'communication', intensity: 7, notes: 'Narratif contradictoire' },
    { axis_type: 'legal', intensity: 5, notes: 'Notification reglementaire' },
    { axis_type: 'media', intensity: 8, notes: 'Relais presse continue' },
  ],
}

const ACTORS_TEMPLATE = {
  actors: [
    {
      user_id: 2,
      role: 'animateur',
      team_name: 'Cellule de crise',
      organization: 'Direction de crise',
      real_function: 'Directeur de crise',
      can_social: true,
      can_tv: true,
      can_mail: true,
      visibility_scope: 'all',
    },
    {
      user_id: 3,
      role: 'joueur',
      team_name: 'Equipe SOC',
      organization: 'DSI',
      real_function: 'Responsable SOC',
      can_social: false,
      can_tv: true,
      can_mail: true,
      visibility_scope: 'team_only',
    },
  ],
}

const TIMELINE_TEMPLATE = {
  phases: [
    {
      name: 'Detection',
      description: 'Premiers signaux et qualification',
      phase_order: 1,
      start_offset_min: 0,
      end_offset_min: 30,
    },
    {
      name: 'Activation cellule',
      description: 'Mise en place de la cellule de crise',
      phase_order: 2,
      start_offset_min: 30,
      end_offset_min: 90,
    },
    {
      name: 'Escalade',
      description: 'Impact metier et pression externe',
      phase_order: 3,
      start_offset_min: 90,
      end_offset_min: 180,
    },
  ],
  triggers: [
    {
      inject_id: 1001,
      trigger_mode: 'manual',
      expression: null,
    },
  ],
}

const INJECTS_TEMPLATE = {
  injects: [
    {
      type: 'mail',
      title: 'Alerte SIEM - Activite anormale',
      description: 'Le SIEM detecte des mouvements lateraux suspects',
      content: {
        subject: '[ALERTE] Activite suspecte',
        body: 'Plusieurs serveurs montrent des connexions admin inhabituelles.',
      },
      inject_category: 'technical',
      channel: 'siem',
      target_audience: 'dsi',
      pedagogical_objective: 'Declencher la qualification technique',
      tested_competence: 'technical',
      pressure_level: 'medium',
      dependency_ids: [],
      time_offset: 15,
      phase_name: 'Detection',
    },
    {
      type: 'twitter',
      title: 'Rumeur publique sur fuite de donnees',
      description: 'Un compte influent affirme une compromission massive',
      content: {
        text: 'Breaking: donnees clients exposees selon une source interne.',
        author: '@breaking_ops',
      },
      inject_category: 'media',
      channel: 'social_network',
      target_audience: 'com',
      pedagogical_objective: 'Tester la communication externe',
      tested_competence: 'communication',
      pressure_level: 'high',
      dependency_ids: [],
      time_offset: 65,
      phase_name: 'Activation cellule',
    },
  ],
}

const TEMPLATE_FILE_BY_COMPONENT: Record<ExerciseImportComponent, string> = {
  socle: 'example_socle.json',
  scenario: 'example_scenario.json',
  actors: 'example_acteurs.json',
  timeline: 'example_timeline.json',
  injects: 'example_injects.json',
  plugins: 'example_canaux_medias.json',
  full: 'example_exercice_complet.json',
}

function buildPluginsTemplate(availablePlugins: PluginInfo[]): JsonValue {
  const sortedPlugins = [...availablePlugins].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return a.type.localeCompare(b.type)
  })

  return {
    plugins: sortedPlugins.map((plugin) => ({
      plugin_type: plugin.type,
      enabled: plugin.default_enabled && !plugin.coming_soon,
      configuration: null,
    })),
  }
}

function buildTemplatePayload(component: ExerciseImportComponent, availablePlugins: PluginInfo[]): JsonValue {
  if (component === 'plugins') {
    return buildPluginsTemplate(availablePlugins)
  }
  if (component === 'full') {
    return {
      socle: SOCLE_TEMPLATE,
      scenario: SCENARIO_TEMPLATE,
      actors: ACTORS_TEMPLATE.actors,
      timeline: TIMELINE_TEMPLATE,
      injects: INJECTS_TEMPLATE.injects,
      plugins: buildPluginsTemplate(availablePlugins),
    }
  }
  if (component === 'socle') return SOCLE_TEMPLATE
  if (component === 'scenario') return SCENARIO_TEMPLATE
  if (component === 'actors') return ACTORS_TEMPLATE
  if (component === 'timeline') return TIMELINE_TEMPLATE
  return INJECTS_TEMPLATE
}

export function downloadImportTemplate(component: ExerciseImportComponent, availablePlugins: PluginInfo[] = []) {
  const content = JSON.stringify(buildTemplatePayload(component, availablePlugins), null, 2)
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = TEMPLATE_FILE_BY_COMPONENT[component]
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
