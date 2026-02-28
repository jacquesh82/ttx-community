import timelineExportSchema from './timelineExportSchema.json'
import phaseExportSchema from './phaseExportSchema.json'

export interface PhaseExport {
  id: number
  name: string
  order: number
  injects: Array<{
    id: number
    title: string
    type: string
    status: string
    time_offset: number
    duration_min: number
    description: string
  }>
}

export interface TimelineExport {
  exercise_id: number
  exported_at: string
  timeline_type: string
  total_injects: number
  phases: Array<{
    id: number
    name: string
    order: number
  }>
  injects: Array<{
    id: number
    title: string
    type: string
    status: string
    timeline_type: string
    time_offset: number
    time_label: string
    duration_min: number
    phase_id: number | null
    phase_name: string | null
    description: string
    content: Record<string, unknown>
  }>
}

const formatOffsetLabel = (offsetMin: number | null | undefined): string => {
  const total = offsetMin ?? 0
  const h = Math.floor(total / 60)
  const m = total % 60
  return `T+${h}h${m > 0 ? m.toString().padStart(2, '0') : ''}`
}

export function buildTimelineExport(
  exerciseId: number,
  timelineType: 'business' | 'technical' | 'all',
  injects: Array<any>,
  phases: Array<any>
): TimelineExport {
  const sortedInjects = [...injects].sort((a, b) => (a.time_offset ?? 0) - (b.time_offset ?? 0))
  
  const phaseNameById = new Map<number, string>()
  phases.forEach((p: any) => phaseNameById.set(p.id, p.name))

  return {
    exercise_id: exerciseId,
    exported_at: new Date().toISOString(),
    timeline_type: timelineType,
    total_injects: sortedInjects.length,
    phases: phases.map((p: any) => ({
      id: p.id,
      name: p.name,
      order: p.phase_order,
    })),
    injects: sortedInjects.map((inject: any) => ({
      id: inject.id,
      title: inject.title,
      type: inject.type,
      status: inject.status,
      timeline_type: inject.timeline_type ?? 'business',
      time_offset: inject.time_offset ?? 0,
      time_label: formatOffsetLabel(inject.time_offset),
      duration_min: inject.duration_min ?? 15,
      phase_id: inject.phase_id ?? null,
      phase_name: inject.phase_id ? (phaseNameById.get(inject.phase_id) ?? null) : null,
      description: inject.description ?? '',
      content: inject.content ?? { text: '' },
    })),
  }
}

export function buildPhaseExport(
  phase: any,
  injects: Array<any>
): PhaseExport {
  return {
    id: phase.id,
    name: phase.name,
    order: phase.phase_order,
    injects: injects.map((inject: any) => ({
      id: inject.id,
      title: inject.title,
      type: inject.type,
      status: inject.status,
      time_offset: inject.time_offset ?? 0,
      duration_min: inject.duration_min ?? 15,
      description: inject.description ?? '',
    })),
  }
}

export function getTimelineSchema(): object {
  return timelineExportSchema
}

export function getPhaseSchema(): object {
  return phaseExportSchema
}

export function downloadJson(data: object, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Prompt generation functions

export function generateCompletePhasePrompt(
  exerciseId: number,
  targetDurationHours: number,
  phase: any,
  existingInjects: Array<any>,
  timelineType: 'business' | 'technical'
): string {
  const schemaJson = JSON.stringify(phaseExportSchema, null, 2)
  const existingData = existingInjects.length > 0 
    ? `\n\nInjects existants dans cette phase:\n${JSON.stringify(buildPhaseExport(phase, existingInjects), null, 2)}`
    : '\n\nCette phase ne contient aucun inject pour le moment.'
  
  return [
    'Tu es un expert en conception d exercices de gestion de crise.',
    `Génère des injects pour compléter automatiquement la phase sélectionnée.`,
    '',
    `Contexte: exercice #${exerciseId}`,
    `Durée cible totale: ${targetDurationHours}h`,
    `Timeline: ${timelineType === 'business' ? 'Métier' : 'Technique'}`,
    `Phase: ${phase.name} (ordre ${phase.phase_order})`,
    existingData,
    '',
    'Format de sortie attendu (JSON Schema):',
    '```json',
    schemaJson,
    '```',
    '',
    'Instructions:',
    '- Génère entre 3 et 8 injects pertinents pour cette phase',
    '- Les time_offset doivent être cohérents avec la position de la phase',
    '- Les types d inject doivent varier (mail, decision, tv, twitter, etc.)',
    '- Les descriptions doivent être réalistes et détaillées',
    '- Réponds UNIQUEMENT avec le JSON valide, sans texte additionnel',
  ].join('\n')
}

export function generateSummaryPrompt(
  exerciseId: number,
  targetDurationHours: number,
  injects: Array<any>,
  phases: Array<any>
): string {
  const timelineData = buildTimelineExport(exerciseId, 'all', injects, phases)
  
  return [
    'Tu es un expert en analyse d exercices de gestion de crise.',
    'Rédige un résumé complet de cet exercice.',
    '',
    `Contexte: exercice #${exerciseId}`,
    `Durée cible: ${targetDurationHours}h`,
    `Nombre total d injects: ${injects.length}`,
    '',
    'Données de l exercice:',
    '```json',
    JSON.stringify(timelineData, null, 2),
    '```',
    '',
    'Livrable attendu:',
    '- Résumé narratif de la progression de crise (200-300 mots)',
    '- Points forts de la conception',
    '- Points d attention pour les animateurs',
    '- Suggestions d amélioration',
  ].join('\n')
}

export function generateCriticalReviewPrompt(
  exerciseId: number,
  targetDurationHours: number,
  injects: Array<any>,
  phases: Array<any>,
  phaseId?: number | null
): string {
  const timelineData = buildTimelineExport(exerciseId, 'all', injects, phases)
  const focusText = phaseId 
    ? `Concentre ton analyse sur la phase ID ${phaseId}.`
    : 'Analyse l ensemble de la timeline.'
  
  return [
    'Tu es un consultant expert en gestion de crise avec un regard critique.',
    'Fournis une analyse critique de cet exercice.',
    '',
    `Contexte: exercice #${exerciseId}`,
    `Durée cible: ${targetDurationHours}h`,
    focusText,
    '',
    'Données:',
    '```json',
    JSON.stringify(timelineData, null, 2),
    '```',
    '',
    'Analyse attendue:',
    '- Cohérence globale du scénario',
    '- Rythme et progression temporelle',
    '- Diversité et pertinence des canaux',
    '- Réalisme des injects',
    '- Lacunes ou incohérences identifiées',
    '- Recommandations concrètes d amélioration',
  ].join('\n')
}

export function generateCrossTimelinePrompt(
  exerciseId: number,
  targetDurationHours: number,
  injects: Array<any>,
  phases: Array<any>,
  currentTimelineType: 'business' | 'technical'
): string {
  const otherType = currentTimelineType === 'business' ? 'technical' : 'business'
  const currentInjects = injects.filter((i: any) => (i.timeline_type ?? 'business') === currentTimelineType)
  const currentData = buildTimelineExport(exerciseId, currentTimelineType, currentInjects, phases)
  
  return [
    'Tu es un expert en conception d exercices de crise.',
    `Génère des idées d injects pour la timeline ${otherType === 'business' ? 'Métier' : 'Technique'} en t inspirant de la timeline ${currentTimelineType === 'business' ? 'Métier' : 'Technique'} existante.`,
    '',
    `Contexte: exercice #${exerciseId}`,
    `Durée cible: ${targetDurationHours}h`,
    `Timeline actuelle (${currentTimelineType}):`,
    '```json',
    JSON.stringify(currentData, null, 2),
    '```',
    '',
    `Génère des injects pour la timeline ${otherType === 'business' ? 'Métier' : 'Technique'} qui:`,
    '- Sont complémentaires aux injects existants',
    '- Couvrent les aspects ' + (otherType === 'business' ? 'métier/fonctionnel' : 'technique/infrastructure'),
    '- Sont cohérents temporellement',
    '',
    'Format de sortie: JSON conforme au schema de timeline',
  ].join('\n')
}