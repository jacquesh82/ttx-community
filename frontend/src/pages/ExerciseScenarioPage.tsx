import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Plus, Trash2, Upload } from 'lucide-react'
import { crisisManagementApi, EscalationAxisType, InjectBankKind, injectBankApi } from '../services/api'
import ExerciseSubpageShell from '../components/exercise/ExerciseSubpageShell'
import Modal from '../components/Modal'
import AutoSaveIndicator from '../components/AutoSaveIndicator'

const AXIS_OPTIONS: Array<{ value: EscalationAxisType; label: string }> = [
  { value: 'technical', label: 'Technique' },
  { value: 'communication', label: 'Communication' },
  { value: 'legal', label: 'Juridique' },
  { value: 'political', label: 'Politique' },
  { value: 'media', label: 'Mediatique' },
]

const AXIS_LABELS: Record<EscalationAxisType, string> = {
  technical: 'Technique',
  communication: 'Communication',
  legal: 'Juridique',
  political: 'Politique',
  media: 'Mediatique',
}

export default function ExerciseScenarioPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const queryClient = useQueryClient()
  const id = parseInt(exerciseId || '0', 10)

  const { data: scenario } = useQuery({
    queryKey: ['exercise-scenario', id],
    queryFn: () => crisisManagementApi.getScenario(id),
    enabled: !!id,
  })
  const { data: axes } = useQuery({
    queryKey: ['exercise-axes', id],
    queryFn: () => crisisManagementApi.listEscalationAxes(id),
    enabled: !!id,
  })

  const [form, setForm] = useState({
    strategic_intent: '',
    initial_context: '',
    initial_situation: '',
    implicit_hypotheses: '',
    hidden_brief: '',
    pedagogical_objectives: '',
    evaluation_criteria: '',
    stress_factors: '',
  })
  const [axisForm, setAxisForm] = useState<{ axis_type: EscalationAxisType; intensity: number; notes: string }>({
    axis_type: 'technical',
    intensity: 1,
    notes: '',
  })
  const [bankKind, setBankKind] = useState<InjectBankKind>('scenario')
  const [bankCategory, setBankCategory] = useState('')
  const [bankSearch, setBankSearch] = useState('')
  const [isBankModalOpen, setIsBankModalOpen] = useState(false)
  const [selectedBankItemIds, setSelectedBankItemIds] = useState<number[]>([])

  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const isLoadedRef = useRef(false)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveScenario = useMutation({
    mutationFn: () =>
      crisisManagementApi.upsertScenario(id, {
        strategic_intent: form.strategic_intent,
        initial_context: form.initial_context,
        initial_situation: form.initial_situation,
        implicit_hypotheses: form.implicit_hypotheses,
        hidden_brief: form.hidden_brief,
        pedagogical_objectives: splitCsv(form.pedagogical_objectives),
        evaluation_criteria: splitCsv(form.evaluation_criteria),
        stress_factors: splitCsv(form.stress_factors),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise-scenario', id] })
      setAutoSaveStatus('saved')
      setTimeout(() => setAutoSaveStatus('idle'), 2000)
    },
    onError: () => setAutoSaveStatus('idle'),
  })

  const addAxis = useMutation({
    mutationFn: () => crisisManagementApi.createEscalationAxis(id, axisForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise-axes', id] })
      setAxisForm({ axis_type: 'technical', intensity: 1, notes: '' })
    },
  })

  const deleteAxis = useMutation({
    mutationFn: (axisId: number) => crisisManagementApi.deleteEscalationAxis(id, axisId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exercise-axes', id] }),
  })

  const importJson = useMutation({
    mutationFn: (file: File) => crisisManagementApi.importComponent(id, 'scenario', file, false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise-scenario', id] })
      queryClient.invalidateQueries({ queryKey: ['exercise-axes', id] })
    },
  })

  const importFromBankSelection = useMutation({
    mutationFn: () => crisisManagementApi.importComponentFromBankSelection(id, 'scenario', selectedBankItemIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise-scenario', id] })
      queryClient.invalidateQueries({ queryKey: ['exercise-axes', id] })
      setIsBankModalOpen(false)
      setSelectedBankItemIds([])
    },
  })

  const { data: bankCatalog, isFetching: isFetchingBankCatalog } = useQuery({
    queryKey: ['scenario-bank-catalog', id, isBankModalOpen, bankKind, bankCategory, bankSearch],
    queryFn: () =>
      injectBankApi.list({
        page: 1,
        page_size: 100,
        kind: bankKind,
        category: bankCategory || undefined,
        search: bankSearch || undefined,
        sort_by: 'updated_at',
        order: 'desc',
      }),
    enabled: isBankModalOpen,
  })

  useEffect(() => {
    if (!scenario) return
    setForm({
      strategic_intent: scenario.strategic_intent || '',
      initial_context: scenario.initial_context || '',
      initial_situation: scenario.initial_situation || '',
      implicit_hypotheses: scenario.implicit_hypotheses || '',
      hidden_brief: scenario.hidden_brief || '',
      pedagogical_objectives: (scenario.pedagogical_objectives || []).join(', '),
      evaluation_criteria: (scenario.evaluation_criteria || []).join(', '),
      stress_factors: (scenario.stress_factors || []).join(', '),
    })
    // Mark as loaded after initial data hydration
    setTimeout(() => { isLoadedRef.current = true }, 50)
  }, [scenario])

  // Debounced auto-save: triggers 1.5s after the user stops typing
  useEffect(() => {
    if (!isLoadedRef.current) return
    setAutoSaveStatus('saving')
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      saveScenario.mutate()
    }, 1500)
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [form])

  const currentScenarioValues = {
    strategic_intent: form.strategic_intent,
    initial_context: form.initial_context,
    initial_situation: form.initial_situation,
    implicit_hypotheses: form.implicit_hypotheses,
    hidden_brief: form.hidden_brief,
    pedagogical_objectives: form.pedagogical_objectives,
    evaluation_criteria: form.evaluation_criteria,
    stress_factors: form.stress_factors,
  }

  const buildPromptForField = (targetLabel: string, targetValue: string) => {
    const contextLines = [
      `Intention strategique: ${currentScenarioValues.strategic_intent || 'non renseigne'}`,
      `Contexte initial: ${currentScenarioValues.initial_context || 'non renseigne'}`,
      `Situation de depart: ${currentScenarioValues.initial_situation || 'non renseigne'}`,
      `Hypotheses implicites: ${currentScenarioValues.implicit_hypotheses || 'non renseigne'}`,
      `Elements caches animateur: ${currentScenarioValues.hidden_brief || 'non renseigne'}`,
      `Objectifs pedagogiques: ${currentScenarioValues.pedagogical_objectives || 'non renseigne'}`,
      `Criteres d evaluation: ${currentScenarioValues.evaluation_criteria || 'non renseigne'}`,
      `Facteurs de stress: ${currentScenarioValues.stress_factors || 'non renseigne'}`,
      `Axes d escalation: ${(axes || []).map((a) => `${AXIS_LABELS[a.axis_type]}(${a.intensity}/10${a.notes ? `, ${a.notes}` : ''})`).join('; ') || 'non renseigne'}`,
    ].join('\n')

    return [
      'Tu es expert en conception d exercice de gestion de crise (TTX).',
      `Objectif: proposer un contenu pret a coller pour le champ "${targetLabel}".`,
      'Contraintes:',
      '- Rester coherent avec les informations existantes.',
      '- Ecrire en francais professionnel, clair et actionnable.',
      '- Retourner uniquement le texte du champ cible, sans introduction.',
      '',
      'Contexte exercice:',
      contextLines,
      '',
      `Champ cible: ${targetLabel}`,
      `Valeur actuelle: ${targetValue || 'vide'}`,
    ].join('\n')
  }

  const buildGlobalScenarioPrompt = () => {
    const contextLines = [
      `Intention strategique: ${currentScenarioValues.strategic_intent || 'non renseigne'}`,
      `Contexte initial: ${currentScenarioValues.initial_context || 'non renseigne'}`,
      `Situation de depart: ${currentScenarioValues.initial_situation || 'non renseigne'}`,
      `Hypotheses implicites: ${currentScenarioValues.implicit_hypotheses || 'non renseigne'}`,
      `Elements caches animateur: ${currentScenarioValues.hidden_brief || 'non renseigne'}`,
      `Objectifs pedagogiques: ${currentScenarioValues.pedagogical_objectives || 'non renseigne'}`,
      `Criteres d evaluation: ${currentScenarioValues.evaluation_criteria || 'non renseigne'}`,
      `Facteurs de stress: ${currentScenarioValues.stress_factors || 'non renseigne'}`,
      `Axes d escalation: ${(axes || []).map((a) => `${AXIS_LABELS[a.axis_type]}(${a.intensity}/10${a.notes ? `, ${a.notes}` : ''})`).join('; ') || 'non renseigne'}`,
    ].join('\n')

    return [
      'Tu es expert en conception d exercice de gestion de crise (TTX).',
      'Objectif: completer et harmoniser TOUTE la definition du scenario.',
      'Contraintes:',
      '- Conserver les informations deja presentes et les renforcer sans contradiction.',
      '- Ecrire en francais professionnel, concret et actionnable.',
      '- Retourner STRICTEMENT un JSON valide (sans markdown) avec ces cles:',
      '{',
      '  "strategic_intent": "...",',
      '  "initial_context": "...",',
      '  "initial_situation": "...",',
      '  "implicit_hypotheses": "...",',
      '  "hidden_brief": "...",',
      '  "pedagogical_objectives": ["..."],',
      '  "evaluation_criteria": ["..."],',
      '  "stress_factors": ["..."]',
      '}',
      '',
      'Contexte actuel:',
      contextLines,
    ].join('\n')
  }

  const applyGlobalScenarioResult = (result: string) => {
    const sanitized = result
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim()

    try {
      const parsed = JSON.parse(sanitized)
      setForm((prev) => ({
        strategic_intent: typeof parsed.strategic_intent === 'string' && parsed.strategic_intent.trim() ? parsed.strategic_intent : prev.strategic_intent,
        initial_context: typeof parsed.initial_context === 'string' && parsed.initial_context.trim() ? parsed.initial_context : prev.initial_context,
        initial_situation: typeof parsed.initial_situation === 'string' && parsed.initial_situation.trim() ? parsed.initial_situation : prev.initial_situation,
        implicit_hypotheses: typeof parsed.implicit_hypotheses === 'string' && parsed.implicit_hypotheses.trim() ? parsed.implicit_hypotheses : prev.implicit_hypotheses,
        hidden_brief: typeof parsed.hidden_brief === 'string' && parsed.hidden_brief.trim() ? parsed.hidden_brief : prev.hidden_brief,
        pedagogical_objectives: Array.isArray(parsed.pedagogical_objectives)
          ? parsed.pedagogical_objectives.filter((v: any) => typeof v === 'string').join(', ')
          : prev.pedagogical_objectives,
        evaluation_criteria: Array.isArray(parsed.evaluation_criteria)
          ? parsed.evaluation_criteria.filter((v: any) => typeof v === 'string').join(', ')
          : prev.evaluation_criteria,
        stress_factors: Array.isArray(parsed.stress_factors)
          ? parsed.stress_factors.filter((v: any) => typeof v === 'string').join(', ')
          : prev.stress_factors,
      }))
    } catch {
      // Fallback: if response is free text, keep it in initial context so nothing is lost.
      setForm((prev) => ({
        ...prev,
        initial_context: result,
      }))
    }
  }

  return (
    <>
      <ExerciseSubpageShell
      exerciseId={id}
      sectionLabel="Scenario"
      title="Scenario"
      actions={
        <div className="flex items-center gap-2">
          <label className="px-3 py-2 bg-slate-100 border border-slate-300 text-slate-800 rounded text-sm hover:bg-slate-200 cursor-pointer inline-flex items-center">
            <Upload size={14} className="mr-1" />
            Import JSON
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) importJson.mutate(file)
                e.currentTarget.value = ''
              }}
            />
          </label>
          <input
            value={bankCategory}
            onChange={(e) => setBankCategory(e.target.value)}
            placeholder="Categorie (option)"
            className="px-2 py-2 border border-gray-300 rounded text-sm w-44"
          />
          <button
            onClick={() => {
              setBankKind('scenario')
              setBankCategory('')
              setBankSearch('')
              setSelectedBankItemIds([])
              setIsBankModalOpen(true)
            }}
            className="px-3 py-2 bg-slate-800 text-white rounded text-sm hover:bg-slate-900 disabled:opacity-50"
          >
            Banque/type
          </button>
        </div>
      }
    >
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Definition complete du scenario</h2>
        </div>
        <Field label="Intention strategique" value={currentScenarioValues.strategic_intent} onChange={(v) => setForm((f) => ({ ...f, strategic_intent: v }))} promptText={buildPromptForField('Intention strategique', currentScenarioValues.strategic_intent)} />
        <Field label="Contexte initial" value={currentScenarioValues.initial_context} onChange={(v) => setForm((f) => ({ ...f, initial_context: v }))} multiline promptText={buildPromptForField('Contexte initial', currentScenarioValues.initial_context)} />
        <Field label="Situation de depart" value={currentScenarioValues.initial_situation} onChange={(v) => setForm((f) => ({ ...f, initial_situation: v }))} multiline promptText={buildPromptForField('Situation de depart', currentScenarioValues.initial_situation)} />
        <Field label="Hypotheses implicites" value={currentScenarioValues.implicit_hypotheses} onChange={(v) => setForm((f) => ({ ...f, implicit_hypotheses: v }))} multiline promptText={buildPromptForField('Hypotheses implicites', currentScenarioValues.implicit_hypotheses)} />
        <Field label="Elements caches (animateur)" value={currentScenarioValues.hidden_brief} onChange={(v) => setForm((f) => ({ ...f, hidden_brief: v }))} multiline promptText={buildPromptForField('Elements caches (animateur)', currentScenarioValues.hidden_brief)} />
        <Field label="Objectifs pedagogiques (separes par virgules)" value={currentScenarioValues.pedagogical_objectives} onChange={(v) => setForm((f) => ({ ...f, pedagogical_objectives: v }))} promptText={buildPromptForField('Objectifs pedagogiques (separes par virgules)', currentScenarioValues.pedagogical_objectives)} />
        <Field label="Criteres d evaluation (separes par virgules)" value={currentScenarioValues.evaluation_criteria} onChange={(v) => setForm((f) => ({ ...f, evaluation_criteria: v }))} promptText={buildPromptForField('Criteres d evaluation (separes par virgules)', currentScenarioValues.evaluation_criteria)} />
        <Field label="Facteurs de stress (separes par virgules)" value={currentScenarioValues.stress_factors} onChange={(v) => setForm((f) => ({ ...f, stress_factors: v }))} promptText={buildPromptForField('Facteurs de stress (separes par virgules)', currentScenarioValues.stress_factors)} />

        <div className="flex items-center justify-end h-6">
          <AutoSaveIndicator status={autoSaveStatus} />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Axes d'escalade</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <select value={axisForm.axis_type} onChange={(e) => setAxisForm((a) => ({ ...a, axis_type: e.target.value as EscalationAxisType }))} className="px-3 py-2 border rounded-md">
            {AXIS_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          <input type="number" min={1} max={10} value={axisForm.intensity} onChange={(e) => setAxisForm((a) => ({ ...a, intensity: parseInt(e.target.value || '1', 10) }))} className="px-3 py-2 border rounded-md" />
          <input value={axisForm.notes} onChange={(e) => setAxisForm((a) => ({ ...a, notes: e.target.value }))} placeholder="Notes" className="px-3 py-2 border rounded-md md:col-span-2" />
        </div>
        <button onClick={() => addAxis.mutate()} className="inline-flex items-center px-3 py-2 bg-gray-900 text-white rounded-md">
          <Plus size={14} className="mr-1" /> Ajouter un axe
        </button>

        <div className="mt-4 border border-gray-200 rounded-md overflow-hidden">
          <div className="grid grid-cols-12 bg-slate-50 text-xs font-semibold text-slate-700 px-3 py-2">
            <div className="col-span-4">Axe</div>
            <div className="col-span-2">Intensite</div>
            <div className="col-span-5">Notes</div>
            <div className="col-span-1 text-right">Action</div>
          </div>
          {(axes || []).length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-500">Aucun axe d'escalade configure.</div>
          )}
          {(axes || []).map((axis) => (
            <div key={axis.id} className="grid grid-cols-12 px-3 py-2 text-sm border-t border-gray-100 items-center">
              <div className="col-span-4 text-slate-800">{AXIS_LABELS[axis.axis_type]}</div>
              <div className="col-span-2 text-slate-700">{axis.intensity}/10</div>
              <div className="col-span-5 text-slate-600">{axis.notes || '-'}</div>
              <div className="col-span-1 text-right">
                <button onClick={() => deleteAxis.mutate(axis.id)} className="text-red-600 hover:text-red-700">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      </ExerciseSubpageShell>

      <Modal
        isOpen={isBankModalOpen}
        onClose={() => setIsBankModalOpen(false)}
        title="Selection catalogue - Scenario"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type source</label>
              <select
                value={bankKind}
                onChange={(e) => setBankKind(e.target.value as InjectBankKind)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="scenario">scenario</option>
                <option value="idea">idea</option>
                <option value="chronogram">chronogram</option>
                <option value="document">document</option>
                <option value="reference_url">reference_url</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categorie</label>
              <input
                value={bankCategory}
                onChange={(e) => setBankCategory(e.target.value)}
                placeholder="optionnel"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Recherche</label>
            <input
              value={bankSearch}
              onChange={(e) => setBankSearch(e.target.value)}
              placeholder="titre, resume, tags..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div className="border rounded-md max-h-64 overflow-auto">
            <div className="p-2 border-b bg-slate-50 text-xs text-slate-600">
              {isFetchingBankCatalog ? 'Chargement...' : `${bankCatalog?.items?.length || 0} element(s)`}
            </div>
            <div className="divide-y">
              {(bankCatalog?.items || []).map((item) => {
                const checked = selectedBankItemIds.includes(item.id)
                return (
                  <label key={item.id} className="flex items-start gap-2 p-2 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedBankItemIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]))
                        } else {
                          setSelectedBankItemIds((prev) => prev.filter((id) => id !== item.id))
                        }
                      }}
                      className="mt-1"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{item.title}</div>
                      <div className="text-xs text-slate-600">{item.kind}{item.category ? ` - ${item.category}` : ''}</div>
                      {item.summary && <div className="text-xs text-slate-500 line-clamp-2">{item.summary}</div>}
                    </div>
                  </label>
                )
              })}
              {!isFetchingBankCatalog && (bankCatalog?.items || []).length === 0 && (
                <div className="p-3 text-sm text-slate-500">Aucun element pour ce filtre.</div>
              )}
            </div>
          </div>
          <div className="text-xs text-slate-600">
            IDs selectionnes: {selectedBankItemIds.length > 0 ? selectedBankItemIds.join(',') : 'aucun'}
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setIsBankModalOpen(false)}
              className="px-3 py-2 border border-slate-300 bg-white text-slate-800 rounded hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              onClick={() => importFromBankSelection.mutate()}
              disabled={importFromBankSelection.isPending || selectedBankItemIds.length === 0}
              className="px-3 py-2 bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50"
            >
              Importer la selection
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}

function splitCsv(value: string): string[] {
  return value.split(',').map((v) => v.trim()).filter(Boolean)
}

function Field({
  label,
  value,
  onChange,
  multiline = false,
  promptText,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
  promptText?: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopyPrompt = async () => {
    if (!promptText) return
    try {
      await navigator.clipboard.writeText(promptText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      const el = document.createElement('textarea')
      el.value = promptText
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopyPrompt}
            className="inline-flex items-center px-2 py-1 text-xs border border-slate-300 rounded bg-white text-slate-700 hover:bg-slate-50"
          >
            <Copy size={12} className="mr-1" />
            {copied ? 'Copie' : 'Copier prompt'}
          </button>
        </div>
      </div>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
      )}
    </div>
  )
}
