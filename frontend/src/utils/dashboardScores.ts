import type { AppConfiguration } from '../services/api'

export interface OrgField {
  key: string
  i18nKey: string
  done: boolean
}

export interface OrgScore {
  score: number
  max: number
  pct: number
  fields: OrgField[]
}

export function computeOrgScore(config: AppConfiguration): OrgScore {
  const fields: OrgField[] = [
    { key: 'organization_name',        i18nKey: 'dashboard.field_name',        done: !!config.organization_name?.trim() },
    { key: 'organization_sector',      i18nKey: 'dashboard.field_sector',      done: !!config.organization_sector?.trim() },
    { key: 'organization_description', i18nKey: 'dashboard.field_description', done: !!config.organization_description?.trim() },
    { key: 'organization_logo_url',    i18nKey: 'dashboard.field_logo',        done: !!config.organization_logo_url?.trim() },
    { key: 'organization_reference_url', i18nKey: 'dashboard.field_reference_url', done: !!config.organization_reference_url?.trim() },
    { key: 'organization_keywords',    i18nKey: 'dashboard.field_keywords',    done: !!config.organization_keywords?.trim() },
    { key: 'organization_tech_stack',  i18nKey: 'dashboard.field_tech_stack',  done: !!config.organization_tech_stack?.trim() },
    { key: 'it_domains',               i18nKey: 'dashboard.field_it_domains',  done: !!(config.windows_domain?.trim() || config.public_domain?.trim()) },
    { key: 'bia_processes',            i18nKey: 'dashboard.field_bia',         done: parseBiaCount(config.bia_processes) > 0 },
  ]
  const score = fields.filter(f => f.done).length
  return { score, max: fields.length, pct: Math.round((score / fields.length) * 100), fields }
}

export interface BiaProcess {
  id: string
  process_name: string
  criticality: 'faible' | 'moyen' | 'critique' | 'vital'
  priority: 'P1' | 'P2' | 'P3' | 'P4'
  rto_hours: number
  department?: string
}

export function parseBiaProcesses(raw: string | null | undefined): BiaProcess[] {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

export function parseBiaCount(raw: string | null | undefined): number {
  return parseBiaProcesses(raw).length
}

export interface BiaScore {
  total: number
  byCriticality: Record<string, number>
  p1Processes: BiaProcess[]
  pct: number
}

export function computeBiaScore(raw: string | null | undefined): BiaScore {
  const processes = parseBiaProcesses(raw)
  const byCriticality: Record<string, number> = { faible: 0, moyen: 0, critique: 0, vital: 0 }
  for (const p of processes) byCriticality[p.criticality] = (byCriticality[p.criticality] || 0) + 1
  const p1Processes = processes.filter(p => p.priority === 'P1')
  // Score BIA: 100% si >= 5 processus définis avec au moins 1 P1, sinon proportionnel
  const pct = processes.length === 0 ? 0 : Math.min(100, Math.round((processes.length / 5) * 80 + (p1Processes.length > 0 ? 20 : 0)))
  return { total: processes.length, byCriticality, p1Processes, pct }
}

export interface ScenarioScore {
  score: number
  max: number
  pct: number
  criteria: { key: string; i18nKey: string; done: boolean }[]
}

export function computeScenarioScore(
  exercise: { description: string | null; business_objective: string | null; technical_objective: string | null; timeline_configured: boolean },
  hasPositionedInjects: boolean,
): ScenarioScore {
  const criteria = [
    { key: 'description',           i18nKey: 'dashboard.criteria_description',          done: !!exercise.description?.trim() },
    { key: 'business_objective',    i18nKey: 'dashboard.criteria_objective_business',   done: !!exercise.business_objective?.trim() },
    { key: 'technical_objective',   i18nKey: 'dashboard.criteria_objective_technical',  done: !!exercise.technical_objective?.trim() },
    { key: 'timeline_configured',   i18nKey: 'dashboard.criteria_timeline',             done: exercise.timeline_configured },
    { key: 'injects_positioned',    i18nKey: 'dashboard.criteria_injects',              done: hasPositionedInjects },
  ]
  const score = criteria.filter(c => c.done).length
  return { score, max: criteria.length, pct: Math.round((score / criteria.length) * 100), criteria }
}

export function computeGlobalScore(orgPct: number, biaPct: number, scenarioPct: number, bankReadinessPct: number): number {
  return Math.round(orgPct * 0.25 + biaPct * 0.25 + scenarioPct * 0.25 + bankReadinessPct * 0.25)
}
