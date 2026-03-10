import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { crisisManagementApi, exercisesApi, type ExercisePhasePreset } from '../services/api'
import { ArrowLeft } from 'lucide-react'

const FALLBACK_CREATION_OPTIONS = {
  exercise_type_options: [
    { value: 'cyber', label: 'Cyber' },
    { value: 'it_outage', label: 'Panne IT' },
    { value: 'ransomware', label: 'Ransomware' },
    { value: 'mixed', label: 'Mixte' },
  ],
  exercise_duration_options: [4, 8, 24],
  exercise_maturity_options: [
    { value: 'beginner', label: 'Débutant' },
    { value: 'intermediate', label: 'Intermédiaire' },
    { value: 'expert', label: 'Expert' },
  ],
  exercise_mode_options: [
    { value: 'real_time', label: 'Temps réel' },
    { value: 'compressed', label: 'Compressé' },
    { value: 'simulated', label: 'Simulé' },
  ],
  default_exercise_type: 'cyber',
  default_exercise_duration_hours: 4,
  default_maturity_level: 'intermediate',
  default_exercise_mode: 'real_time',
}

export default function ExerciseNewPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const hasAppliedServerDefaultsRef = useRef(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    strategic_intent: '',
    initial_context: '',
    time_multiplier: '1.0',
    exercise_type: FALLBACK_CREATION_OPTIONS.default_exercise_type,
    target_duration_hours: String(FALLBACK_CREATION_OPTIONS.default_exercise_duration_hours),
    maturity_level: FALLBACK_CREATION_OPTIONS.default_maturity_level,
    mode: FALLBACK_CREATION_OPTIONS.default_exercise_mode,
    phase_preset: 'classique' as ExercisePhasePreset,
    planned_date: '',
  })
  const [error, setError] = useState('')

  const { data: plugins } = useQuery({
    queryKey: ['available-plugins'],
    queryFn: exercisesApi.getAvailablePlugins,
  })
  const { data: creationOptions } = useQuery({
    queryKey: ['exercise-creation-options'],
    queryFn: exercisesApi.getCreationOptions,
  })

  const resolvedCreationOptions = useMemo(
    () => creationOptions || FALLBACK_CREATION_OPTIONS,
    [creationOptions]
  )

  useEffect(() => {
    const nextTypes = resolvedCreationOptions.exercise_type_options.map((item) => item.value)
    const nextMaturity = resolvedCreationOptions.exercise_maturity_options.map((item) => item.value)
    const nextModes = resolvedCreationOptions.exercise_mode_options.map((item) => item.value)
    const nextDurations = resolvedCreationOptions.exercise_duration_options.map((item) => String(item))
    const shouldApplyServerDefaults = Boolean(creationOptions) && !hasAppliedServerDefaultsRef.current
    setFormData((prev) => ({
      ...prev,
      exercise_type: shouldApplyServerDefaults
        ? resolvedCreationOptions.default_exercise_type
        : (nextTypes.includes(prev.exercise_type) ? prev.exercise_type : resolvedCreationOptions.default_exercise_type),
      maturity_level: shouldApplyServerDefaults
        ? resolvedCreationOptions.default_maturity_level
        : (nextMaturity.includes(prev.maturity_level) ? prev.maturity_level : resolvedCreationOptions.default_maturity_level),
      mode: shouldApplyServerDefaults
        ? resolvedCreationOptions.default_exercise_mode
        : (nextModes.includes(prev.mode) ? prev.mode : resolvedCreationOptions.default_exercise_mode),
      target_duration_hours: shouldApplyServerDefaults
        ? String(resolvedCreationOptions.default_exercise_duration_hours)
        : (nextDurations.includes(prev.target_duration_hours)
          ? prev.target_duration_hours
          : String(resolvedCreationOptions.default_exercise_duration_hours)),
    }))
    if (shouldApplyServerDefaults) {
      hasAppliedServerDefaultsRef.current = true
    }
  }, [creationOptions, resolvedCreationOptions])

  const enabledPlugins = (plugins || [])
    .filter((p) => !p.coming_soon)
    .map((p) => p.type)

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const createdExercise = await exercisesApi.create(data)
      if (formData.strategic_intent || formData.initial_context) {
        await crisisManagementApi.upsertScenario(createdExercise.id, {
          strategic_intent: formData.strategic_intent || null,
          initial_context: formData.initial_context || null,
          initial_situation: null,
          implicit_hypotheses: null,
          hidden_brief: null,
          pedagogical_objectives: [],
          evaluation_criteria: [],
          stress_factors: [],
        })
      }
      return createdExercise
    },
    onSuccess: (data) => navigate(`/exercises/${data.id}`),
    onError: (err: any) => setError(err.response?.data?.detail || 'Erreur lors de la création'),
  })

  const scenarioContextLines = [
    `Nom: ${formData.name || 'non défini'}`,
    `Type: ${formData.exercise_type}`,
    `Niveau: ${formData.maturity_level}`,
    `Durée cible: ${formData.target_duration_hours}h`,
    `Mode: ${formData.mode}`,
    `Granularité timeline: ${formData.phase_preset}`,
    `Description actuelle: ${formData.description || 'vide'}`,
    `Intention stratégique actuelle: ${formData.strategic_intent || 'vide'}`,
    `Contexte initial actuel: ${formData.initial_context || 'vide'}`,
  ].join('\n')

  const inspirationPrompt = [
    'Propose une idée d\'exercice de crise cyber concise et réaliste (5 à 8 lignes).',
    `Nom (brouillon): ${formData.name || 'Non défini'}`,
    `Type: ${formData.exercise_type}`,
    `Niveau: ${formData.maturity_level}`,
    `Durée cible: ${formData.target_duration_hours}h`,
    'Retourne uniquement un texte prêt à coller dans le champ Description.',
  ].join('\n')

  const strategicIntentPrompt = [
    'Tu conçois un exercice de gestion de crise cyber.',
    'Propose une intention stratégique concise (1 à 3 phrases).',
    'Reste cohérent avec les informations déjà renseignées.',
    'Retourne uniquement le texte final pour le champ.',
    '', scenarioContextLines,
  ].join('\n')

  const initialContextPrompt = [
    'Tu conçois un exercice de gestion de crise cyber.',
    'Propose un contexte initial réaliste (6 à 10 lignes max).',
    'Reste cohérent avec les informations déjà renseignées.',
    'Retourne uniquement le texte final pour le champ.',
    '', scenarioContextLines,
  ].join('\n')

  const fullScenarioPrompt = [
    'Tu conçois un exercice de gestion de crise cyber.',
    'Génère une définition complète et cohérente du scénario à partir des infos déjà remplies.',
    'Conserve le sens des champs déjà saisis et complète intelligemment les parties manquantes.',
    'Réponds STRICTEMENT en JSON valide (sans markdown) avec ces clés:',
    '{"description":"...","strategic_intent":"...","initial_context":"..."}',
    '', scenarioContextLines,
  ].join('\n')

  const applyFullScenarioResult = (result: string) => {
    const sanitized = result.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
    try {
      const parsed = JSON.parse(sanitized)
      setFormData((prev) => ({
        ...prev,
        description: typeof parsed.description === 'string' && parsed.description.trim() ? parsed.description : prev.description,
        strategic_intent: typeof parsed.strategic_intent === 'string' && parsed.strategic_intent.trim() ? parsed.strategic_intent : prev.strategic_intent,
        initial_context: typeof parsed.initial_context === 'string' && parsed.initial_context.trim() ? parsed.initial_context : prev.initial_context,
      }))
    } catch {
      setFormData((prev) => ({ ...prev, initial_context: result }))
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    createMutation.mutate({
      ...formData,
      time_multiplier: parseFloat(formData.time_multiplier),
      target_duration_hours: parseInt(formData.target_duration_hours),
      planned_date: formData.planned_date ? new Date(formData.planned_date).toISOString() : undefined,
      enabled_plugins: enabledPlugins,
      phase_preset: formData.phase_preset,
    })
  }

  const inputCls = 'w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-0.5'

  return (
    <div>
      <button
        onClick={() => navigate('/exercises')}
        className="flex items-center text-sm text-gray-500 hover:text-gray-800 mb-3"
      >
        <ArrowLeft className="mr-1.5" size={16} />
        Retour aux exercices
      </button>

      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Nouvel exercice</h1>
        <p className="mb-4 text-sm text-gray-500 leading-relaxed">{t('exercises.intros.new')}</p>

        <div className="bg-white rounded-lg shadow p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-2.5 text-sm text-red-600 bg-red-50 rounded-md">{error}</div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* Colonne gauche — contenu */}
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Nom de l'exercice *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={inputCls}
                    required
                    maxLength={200}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <label className={labelCls}>Description</label>
                  </div>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className={inputCls}
                    rows={2}
                  />
                </div>

                <div className="border-t border-gray-100 pt-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-gray-800">Préparation du scénario</h2>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className={labelCls}>Intention stratégique</label>
                    </div>
                    <input
                      type="text"
                      value={formData.strategic_intent}
                      onChange={(e) => setFormData({ ...formData, strategic_intent: e.target.value })}
                      className={inputCls}
                      placeholder="Ex: Tester la coordination direction/IT/communication sous forte pression"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className={labelCls}>Contexte initial</label>
                    </div>
                    <textarea
                      value={formData.initial_context}
                      onChange={(e) => setFormData({ ...formData, initial_context: e.target.value })}
                      className={inputCls}
                      rows={4}
                    />
                  </div>
                </div>
              </div>

              {/* Colonne droite — paramètres */}
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Type d'exercice</label>
                  <select
                    value={formData.exercise_type}
                    onChange={(e) => setFormData({ ...formData, exercise_type: e.target.value })}
                    className={inputCls}
                  >
                    {resolvedCreationOptions.exercise_type_options.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Durée cible</label>
                    <select
                      value={formData.target_duration_hours}
                      onChange={(e) => setFormData({ ...formData, target_duration_hours: e.target.value })}
                      className={inputCls}
                    >
                      {resolvedCreationOptions.exercise_duration_options.map((duration) => (
                        <option key={duration} value={String(duration)}>{duration}h</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Niveau de maturité</label>
                    <select
                      value={formData.maturity_level}
                      onChange={(e) => setFormData({ ...formData, maturity_level: e.target.value })}
                      className={inputCls}
                    >
                      {resolvedCreationOptions.exercise_maturity_options.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Mode</label>
                    <select
                      value={formData.mode}
                      onChange={(e) => setFormData({ ...formData, mode: e.target.value })}
                      className={inputCls}
                    >
                      {resolvedCreationOptions.exercise_mode_options.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Date prévue</label>
                    <input
                      type="datetime-local"
                      value={formData.planned_date}
                      onChange={(e) => setFormData({ ...formData, planned_date: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Nombre de phases timeline</label>
                  <select
                    value={formData.phase_preset}
                    onChange={(e) => setFormData({ ...formData, phase_preset: e.target.value as ExercisePhasePreset })}
                    className={inputCls}
                  >
                    <option value="minimal">Minimal</option>
                    <option value="classique">Classique</option>
                    <option value="precis">Précis</option>
                    <option value="full">Full</option>
                  </select>
                </div>

                <div>
                  <label className={labelCls}>Multiplicateur de temps</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="10"
                    value={formData.time_multiplier}
                    onChange={(e) => setFormData({ ...formData, time_multiplier: e.target.value })}
                    className={inputCls}
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Vitesse d'écoulement du temps simulé (1.0 = temps réel)</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => navigate('/exercises')}
                className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Création…' : 'Créer l\'exercice'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
