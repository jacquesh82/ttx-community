import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import BIAChart from './BIAChart'

export interface BIAProcess {
  id: string
  process_name: string
  description?: string
  department?: string
  criticality: 'faible' | 'moyen' | 'critique' | 'vital'
  rto_hours: number
  rpo_minutes: number
  mtpd_hours: number
  priority: 'P1' | 'P2' | 'P3' | 'P4'
  operational_impact: boolean
  regulatory_impact: boolean
  financial_impact: 'faible' | 'moyen' | 'fort'
  degraded_mode?: string
  dependencies_it: string[]
  dependencies_external: string[]
}

interface BIAManagerProps {
  processes: BIAProcess[]
  onChange: (p: BIAProcess[]) => void
  sector?: string | null
}

// Label for "operational_impact" per sector
const OPERATIONAL_IMPACT_LABEL: Record<string, string> = {
  'Santé / hôpital': 'Impact patients',
  'Transport': 'Impact voyageurs',
  'Énergie': 'Impact alimentation réseau',
  'Eau / assainissement': 'Impact usagers / réseau',
  'Télécommunications': 'Impact abonnés',
  'Numérique / IT': 'Impact utilisateurs',
  'Banque / finance / assurance': 'Impact clients / transactions',
  'Industrie / manufacture': 'Impact production',
  'Commerce / distribution': 'Impact ventes / clients',
  'Logistique': 'Impact livraisons',
  'Agroalimentaire': 'Impact production / chaîne froide',
  'Agriculture': 'Impact production agricole',
  'Construction / BTP': 'Impact chantiers',
  'Immobilier': 'Impact locataires / clients',
  'Éducation / recherche': 'Impact apprenants / étudiants',
  'Administration publique': 'Impact usagers / citoyens',
  'Défense / sécurité': 'Impact opérationnel',
  'Justice': 'Impact justiciables',
  'Tourisme / hôtellerie': 'Impact clients / hôtes',
  'Culture / médias': 'Impact audience',
  'Pharmaceutique / biotechnologie': 'Impact production / patients',
  'Environnement': 'Impact environnemental',
  'Spatial / aéronautique': 'Impact missions / opérations',
  'Automobile': 'Impact production / clients',
  'Maritime / portuaire': 'Impact opérations portuaires',
  'Retail / e-commerce': 'Impact clients / ventes',
  'Services professionnels (conseil, audit, juridique)': 'Impact clients / missions',
  'ONG / organisations internationales': 'Impact bénéficiaires',
}

function getOperationalImpactLabel(sector?: string | null): string {
  if (!sector) return 'Impact opérationnel direct'
  return OPERATIONAL_IMPACT_LABEL[sector] ?? 'Impact opérationnel direct'
}

const CRITICALITY_COLORS: Record<string, string> = {
  faible: 'text-green-400 bg-green-400/10 border-green-400/30',
  moyen: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  critique: 'text-red-400 bg-red-400/10 border-red-400/30',
  vital: 'text-red-800 bg-red-900/30 border-red-800/30',
}

const PRIORITY_COLORS: Record<string, string> = {
  P1: 'text-red-400',
  P2: 'text-amber-400',
  P3: 'text-blue-400',
  P4: 'text-gray-400',
}

function nanoid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

const EMPTY_PROCESS: Omit<BIAProcess, 'id'> = {
  process_name: '',
  description: '',
  department: '',
  criticality: 'moyen',
  rto_hours: 4,
  rpo_minutes: 60,
  mtpd_hours: 72,
  priority: 'P2',
  operational_impact: false,
  regulatory_impact: false,
  financial_impact: 'moyen',
  degraded_mode: '',
  dependencies_it: [],
  dependencies_external: [],
}

export default function BIAManager({ processes, onChange, sector }: BIAManagerProps) {
  const { t } = useTranslation()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [form, setForm] = useState<Omit<BIAProcess, 'id'>>(EMPTY_PROCESS)

  const operationalLabel = getOperationalImpactLabel(sector)

  function openAdd() {
    setForm(EMPTY_PROCESS)
    setEditingId(null)
    setIsAdding(true)
  }

  function openEdit(p: BIAProcess) {
    setForm({ ...p })
    setEditingId(p.id)
    setIsAdding(true)
  }

  function cancelForm() {
    setIsAdding(false)
    setEditingId(null)
  }

  function saveForm() {
    if (!form.process_name.trim()) return
    if (editingId) {
      onChange(processes.map((p) => (p.id === editingId ? { ...form, id: editingId } : p)))
    } else {
      onChange([...processes, { ...form, id: nanoid() }])
    }
    cancelForm()
  }

  function deleteProcess(id: string) {
    onChange(processes.filter((p) => p.id !== id))
  }

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const inputCls =
    'w-full px-3 py-1.5 bg-gray-900 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary-500'
  const labelCls = 'block text-xs font-medium text-gray-400 mb-1'

  return (
    <div className="space-y-6">
      {/* Chart */}
      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t('bia.chart_title')}</h4>
        <BIAChart processes={processes} onSelectProcess={openEdit} />
      </div>

      {/* Table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-gray-300">
            {t('bia.critical_processes', { count: processes.length })}
          </h4>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('bia.add_process')}
          </button>
        </div>

        {processes.length === 0 && !isAdding ? (
          <div className="text-center text-gray-500 text-sm py-8 border border-dashed border-gray-700 rounded-lg">
            {t('bia.no_processes')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-left text-xs text-gray-400">
                  <th className="pb-2 pr-4">{t('bia.table_process')}</th>
                  <th className="pb-2 pr-4">{t('bia.table_department')}</th>
                  <th className="pb-2 pr-4">{t('bia.table_criticality')}</th>
                  <th className="pb-2 pr-4">{t('bia.table_rto')}</th>
                  <th className="pb-2 pr-4">{t('bia.table_rpo')}</th>
                  <th className="pb-2 pr-4">{t('bia.table_mtpd')}</th>
                  <th className="pb-2 pr-4">{t('bia.table_priority')}</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {processes.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-800/30">
                    <td className="py-2 pr-4 text-white font-medium">{p.process_name}</td>
                    <td className="py-2 pr-4 text-gray-400">{p.department || '—'}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded border text-xs font-medium ${CRITICALITY_COLORS[p.criticality]}`}
                      >
                        {p.criticality}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-300">{p.rto_hours}h</td>
                    <td className="py-2 pr-4 text-gray-300">{p.rpo_minutes} min</td>
                    <td className="py-2 pr-4 text-gray-300">{p.mtpd_hours}h</td>
                    <td className={`py-2 pr-4 font-bold ${PRIORITY_COLORS[p.priority]}`}>
                      {p.priority}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(p)}
                          className="p-1 text-gray-400 hover:text-white"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteProcess(p.id)}
                          className="p-1 text-gray-400 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inline form */}
      {isAdding && (
        <div className="bg-gray-900/60 border border-gray-600 rounded-lg p-5 space-y-4">
          <h4 className="text-sm font-semibold text-white">
            {editingId ? 'Modifier le processus' : 'Nouveau processus'}
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className={labelCls}>Nom du processus *</label>
              <input
                className={inputCls}
                value={form.process_name}
                onChange={(e) => setField('process_name', e.target.value)}
                placeholder="Ex : Facturation, Paie, Production, Logistique…"
              />
            </div>
            <div>
              <label className={labelCls}>Service / Département</label>
              <input
                className={inputCls}
                value={form.department ?? ''}
                onChange={(e) => setField('department', e.target.value)}
                placeholder="Ex : DSI, Finance, RH, Production…"
              />
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <input
                className={inputCls}
                value={form.description ?? ''}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Brève description du processus"
              />
            </div>

            <div>
              <label className={labelCls}>Criticité</label>
              <select
                className={inputCls}
                value={form.criticality}
                onChange={(e) => setField('criticality', e.target.value as BIAProcess['criticality'])}
              >
                <option value="faible">Faible</option>
                <option value="moyen">Moyen</option>
                <option value="critique">Critique</option>
                <option value="vital">Vital</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Priorité</label>
              <select
                className={inputCls}
                value={form.priority}
                onChange={(e) => setField('priority', e.target.value as BIAProcess['priority'])}
              >
                <option value="P1">P1 — Maximum</option>
                <option value="P2">P2 — Élevée</option>
                <option value="P3">P3 — Moyenne</option>
                <option value="P4">P4 — Faible</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>RTO — Durée max d'interruption (heures)</label>
              <input
                type="number"
                min={0}
                className={inputCls}
                value={form.rto_hours}
                onChange={(e) => setField('rto_hours', Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelCls}>RPO — Perte de données max (minutes)</label>
              <input
                type="number"
                min={0}
                className={inputCls}
                value={form.rpo_minutes}
                onChange={(e) => setField('rpo_minutes', Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelCls}>MTPD — Durée max tolérée d'interruption (heures)</label>
              <input
                type="number"
                min={0}
                className={inputCls}
                value={form.mtpd_hours}
                onChange={(e) => setField('mtpd_hours', Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelCls}>Impact financier</label>
              <select
                className={inputCls}
                value={form.financial_impact}
                onChange={(e) =>
                  setField('financial_impact', e.target.value as BIAProcess['financial_impact'])
                }
              >
                <option value="faible">Faible</option>
                <option value="moyen">Moyen</option>
                <option value="fort">Fort</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className={labelCls}>Mode dégradé</label>
              <input
                className={inputCls}
                value={form.degraded_mode ?? ''}
                onChange={(e) => setField('degraded_mode', e.target.value)}
                placeholder="Ex : Traitement manuel, bascule site secondaire, procédure papier…"
              />
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.operational_impact}
                  onChange={(e) => setField('operational_impact', e.target.checked)}
                  className="rounded border-gray-600 bg-gray-900 text-primary-500"
                />
                {operationalLabel}
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.regulatory_impact}
                  onChange={(e) => setField('regulatory_impact', e.target.checked)}
                  className="rounded border-gray-600 bg-gray-900 text-primary-500"
                />
                Impact réglementaire
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={cancelForm}
              className="flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white text-sm rounded-lg border border-gray-600 hover:border-gray-500 transition-colors"
            >
              <X className="w-4 h-4" />
              Annuler
            </button>
            <button
              onClick={saveForm}
              disabled={!form.process_name.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
            >
              <Check className="w-4 h-4" />
              {editingId ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
