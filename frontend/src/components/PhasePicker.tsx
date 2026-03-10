import { useState } from 'react'
import { GripVertical, X, Plus } from 'lucide-react'
import {
  DEFAULT_PHASES_LIST,
  PHASE_PRESETS,
  PHASE_PRESET_LABELS,
  type PhasePresetKey,
} from '../features/phasePresets'

export interface PhasePickerProps {
  /** Standard preset mode: ordered list with enable/disable toggles */
  phases: { name: string; enabled: boolean }[]
  onToggle: (index: number) => void

  /** Custom preset mode: ordered list with DnD */
  customPhases: { name: string }[]
  onCustomPhasesChange: (phases: { name: string }[]) => void

  /** Which preset is currently active ('minimal' | 'classique' | 'precis' | 'full' | 'custom' | '') */
  activePreset: string
  onApplyPreset: (preset: PhasePresetKey) => void
  onActivateCustom: () => void

  /** Allow adding/deleting custom phases (default true — disable in exercise modal) */
  allowCustomEdit?: boolean

  /** Visual theme (default 'dark' — matches OptionsPage; use 'light' for modals) */
  theme?: 'dark' | 'light'
}

export default function PhasePicker({
  phases,
  onToggle,
  customPhases,
  onCustomPhasesChange,
  activePreset,
  onApplyPreset,
  onActivateCustom,
  allowCustomEdit = true,
  theme = 'dark',
}: PhasePickerProps) {
  const [newPhaseName, setNewPhaseName] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const isDark = theme === 'dark'

  // ---- theme tokens ----
  const presetActive = 'bg-primary-600 border-primary-500 text-white'
  const presetInactive = isDark
    ? 'bg-gray-800 border-gray-700 text-gray-200 hover:border-gray-600'
    : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'

  const rowBase = isDark
    ? 'border-gray-700 bg-gray-900/60 hover:bg-gray-900'
    : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
  const rowDrag = isDark
    ? 'border-primary-500 bg-primary-900/20'
    : 'border-primary-400 bg-primary-50'

  const indexCls = isDark ? 'text-gray-500' : 'text-gray-400'
  const nameCls = (enabled: boolean) =>
    isDark
      ? enabled ? 'text-white' : 'text-gray-500 line-through decoration-gray-600'
      : enabled ? 'text-gray-900' : 'text-gray-400 line-through decoration-gray-300'
  const switchTrack = (enabled: boolean) =>
    enabled ? 'bg-primary-600' : isDark ? 'bg-gray-600' : 'bg-gray-300'
  const gripCls = isDark ? 'text-gray-600' : 'text-gray-400'
  const counterCls = isDark ? 'text-gray-500' : 'text-gray-400'
  const emptyBorder = isDark ? 'border-gray-700 text-gray-500' : 'border-gray-300 text-gray-400'
  const inputCls = isDark
    ? 'flex-1 px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
    : 'flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-500'

  const isCustom = activePreset === 'custom'
  const enabledCount = isCustom ? customPhases.length : phases.filter((p) => p.enabled).length

  function addPhase() {
    const name = newPhaseName.trim()
    if (!name) return
    onCustomPhasesChange([...customPhases, { name }])
    setNewPhaseName('')
  }

  return (
    <div className="space-y-4">
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(PHASE_PRESETS) as [PhasePresetKey, string[]][]).map(([key]) => (
          <button
            key={key}
            type="button"
            onClick={() => onApplyPreset(key)}
            className={`px-3 py-1.5 rounded-lg border text-sm transition ${
              activePreset === key ? presetActive : presetInactive
            }`}
          >
            {PHASE_PRESET_LABELS[key]}
          </button>
        ))}
        {/* Personnalisé — always visible if customPhases exist */}
        {(customPhases.length > 0 || allowCustomEdit) && (
          <button
            type="button"
            onClick={onActivateCustom}
            className={`px-3 py-1.5 rounded-lg border text-sm transition ${
              isCustom ? presetActive : presetInactive
            }`}
          >
            Personnalisé
          </button>
        )}
      </div>

      {/* Standard preset: toggle list */}
      {!isCustom && (
        <>
          <div className="space-y-2">
            {phases.map((phase, index) => (
              <div
                key={index}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${rowBase}`}
              >
                <span className={`w-5 text-right text-xs flex-shrink-0 tabular-nums ${indexCls}`}>
                  {index + 1}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={phase.enabled}
                  onClick={() => onToggle(index)}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                    isDark ? 'focus:ring-offset-gray-900' : 'focus:ring-offset-white'
                  } ${switchTrack(phase.enabled)}`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                      phase.enabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
                <span className={`text-sm flex-1 ${nameCls(phase.enabled)}`}>
                  {phase.name}
                </span>
              </div>
            ))}
          </div>
          <p className={`text-xs ${counterCls}`}>
            {enabledCount} phase{enabledCount !== 1 ? 's' : ''} activée{enabledCount !== 1 ? 's' : ''} sur {DEFAULT_PHASES_LIST.length}
          </p>
        </>
      )}

      {/* Custom preset: DnD list */}
      {isCustom && (
        <div className="space-y-3">
          <p className={`text-xs ${counterCls}`}>
            {allowCustomEdit
              ? `Glissez pour réorganiser. ${enabledCount} phase${enabledCount !== 1 ? 's' : ''} définie${enabledCount !== 1 ? 's' : ''}.`
              : `${enabledCount} phase${enabledCount !== 1 ? 's' : ''} personnalisée${enabledCount !== 1 ? 's' : ''}.`}
          </p>

          {customPhases.length === 0 && (
            <div className={`text-sm border border-dashed rounded-lg px-4 py-6 text-center ${emptyBorder}`}>
              Aucune phase. {allowCustomEdit ? 'Ajoutez-en une ci-dessous.' : 'Configurez-les dans les options.'}
            </div>
          )}

          <div className="space-y-2">
            {customPhases.map((phase, index) => (
              <div
                key={index}
                draggable
                onDragStart={() => setDragIdx(index)}
                onDragOver={(e) => { e.preventDefault(); setDragOverIdx(index) }}
                onDrop={() => {
                  if (dragIdx === null || dragIdx === index) return
                  const next = [...customPhases]
                  const [moved] = next.splice(dragIdx, 1)
                  next.splice(index, 0, moved)
                  onCustomPhasesChange(next)
                  setDragIdx(null)
                  setDragOverIdx(null)
                }}
                onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                  dragOverIdx === index && dragIdx !== index ? rowDrag : rowBase
                }`}
              >
                <GripVertical className={`w-4 h-4 cursor-grab flex-shrink-0 ${gripCls}`} />
                <span className={`w-5 text-right text-xs flex-shrink-0 tabular-nums ${indexCls}`}>
                  {index + 1}
                </span>
                <span className={`text-sm flex-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {phase.name}
                </span>
                {allowCustomEdit && (
                  <button
                    type="button"
                    onClick={() => onCustomPhasesChange(customPhases.filter((_, i) => i !== index))}
                    className={`p-1 rounded transition-colors flex-shrink-0 ${
                      isDark
                        ? 'text-gray-600 hover:text-red-400 hover:bg-red-900/20'
                        : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                    }`}
                    aria-label="Supprimer la phase"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {allowCustomEdit && (
            <div className="flex gap-2 pt-1">
              <input
                type="text"
                value={newPhaseName}
                onChange={(e) => setNewPhaseName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addPhase() }}
                placeholder="Nom de la phase… (Entrée pour valider)"
                className={inputCls}
              />
              <button
                type="button"
                disabled={!newPhaseName.trim()}
                onClick={addPhase}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Ajouter
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
