import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type {
  AudienceTarget,
  TimelineType,
} from '../../services/api'

type DispatchMode = 'immediate' | 'planned'

interface TeamOption {
  id: number
  name: string
}

export interface SurpriseInjectSubmitPayload {
  title: string
  description?: string
  type: string
  timeline_type: TimelineType
  content: string
  audiences: AudienceTarget[]
  dispatch_mode: DispatchMode
  planned_time_offset?: number
  duration_min?: number
}

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (payload: SurpriseInjectSubmitPayload) => void
  isSubmitting?: boolean
  defaultVirtualNowMin?: number
  teams: TeamOption[]
  typeOptions: string[]
  errorMessage?: string | null
}

export default function SurpriseInjectDrawer({
  open,
  onClose,
  onSubmit,
  isSubmitting = false,
  defaultVirtualNowMin = 0,
  teams,
  typeOptions,
  errorMessage,
}: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<string>(typeOptions[0] || 'system')
  const [timelineType, setTimelineType] = useState<TimelineType>('business')
  const [content, setContent] = useState('')
  const [dispatchMode, setDispatchMode] = useState<DispatchMode>('immediate')
  const [plannedTimeOffset, setPlannedTimeOffset] = useState<number>(defaultVirtualNowMin + 5)
  const [durationMin, setDurationMin] = useState<number>(15)
  const [includeRolePlayers, setIncludeRolePlayers] = useState(false)
  const [selectedTeamIds, setSelectedTeamIds] = useState<number[]>([])
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setLocalError(null)
      setPlannedTimeOffset(defaultVirtualNowMin + 5)
    }
  }, [open, defaultVirtualNowMin])

  useEffect(() => {
    if (typeOptions.length > 0 && !typeOptions.includes(type)) {
      setType(typeOptions[0])
    }
  }, [typeOptions, type])

  const audiences = useMemo<AudienceTarget[]>(() => {
    const next: AudienceTarget[] = []
    if (includeRolePlayers) next.push({ kind: 'role', value: 'joueur' })
    selectedTeamIds.forEach((id) => next.push({ kind: 'team', value: id }))
    return next
  }, [includeRolePlayers, selectedTeamIds])

  const toggleTeam = (teamId: number) => {
    setSelectedTeamIds((prev) => (prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]))
  }

  const handleSubmit = () => {
    setLocalError(null)
    if (!title.trim()) {
      setLocalError('Le titre est requis.')
      return
    }
    if (audiences.length === 0) {
      setLocalError('Le ciblage est obligatoire.')
      return
    }
    if (dispatchMode === 'planned' && plannedTimeOffset < defaultVirtualNowMin) {
      setLocalError(`Le T+ doit être >= T+ courant (${defaultVirtualNowMin}).`)
      return
    }
    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      type,
      timeline_type: timelineType,
      content,
      audiences,
      dispatch_mode: dispatchMode,
      planned_time_offset: dispatchMode === 'planned' ? plannedTimeOffset : undefined,
      duration_min: durationMin || undefined,
    })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/35" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl border-l border-gray-200 h-full overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Inject surprise</h3>
            <p className="text-xs text-gray-500">Ajout organisateur sur timeline temps réel</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-gray-500 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {(localError || errorMessage) && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {localError || errorMessage}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2">
                {typeOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Timeline impactée *</label>
              <select value={timelineType} onChange={(e) => setTimelineType(e.target.value as TimelineType)} className="w-full rounded-md border border-gray-300 px-3 py-2">
                <option value="business">Métier</option>
                <option value="technical">Technique</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded-md border border-gray-300 px-3 py-2" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contenu (texte ou JSON)</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
              placeholder='{"text":"..."} ou texte libre'
            />
          </div>

          <fieldset className="rounded-lg border border-gray-200 p-3">
            <legend className="px-1 text-sm font-medium text-gray-700">Ciblage *</legend>
            <label className="flex items-center gap-2 text-sm text-gray-700 mb-2">
              <input type="checkbox" checked={includeRolePlayers} onChange={(e) => setIncludeRolePlayers(e.target.checked)} />
              Tous les joueurs (rôle)
            </label>
            <div className="grid grid-cols-1 gap-1 max-h-40 overflow-auto pr-1">
              {teams.map((team) => (
                <label key={team.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={selectedTeamIds.includes(team.id)} onChange={() => toggleTeam(team.id)} />
                  {team.name}
                </label>
              ))}
              {teams.length === 0 && <p className="text-xs text-gray-500">Aucune équipe disponible, utilisez le rôle joueur.</p>}
            </div>
          </fieldset>

          <div className="rounded-lg border border-gray-200 p-3 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mode d'envoi</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setDispatchMode('immediate')} className={`rounded-md px-3 py-2 text-sm ${dispatchMode === 'immediate' ? 'bg-emerald-600 text-white' : 'border border-gray-300 text-gray-700'}`}>Live</button>
                <button type="button" onClick={() => setDispatchMode('planned')} className={`rounded-md px-3 py-2 text-sm ${dispatchMode === 'planned' ? 'bg-primary-600 text-white' : 'border border-gray-300 text-gray-700'}`}>Différé (T+)</button>
              </div>
            </div>
            {dispatchMode === 'planned' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">T+ minute (min {defaultVirtualNowMin})</label>
                <input type="number" min={defaultVirtualNowMin} value={plannedTimeOffset} onChange={(e) => setPlannedTimeOffset(parseInt(e.target.value || '0', 10))} className="w-full rounded-md border border-gray-300 px-3 py-2" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Durée (min)</label>
              <input type="number" min={1} value={durationMin} onChange={(e) => setDurationMin(parseInt(e.target.value || '15', 10))} className="w-full rounded-md border border-gray-300 px-3 py-2" />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">Fermer</button>
            <button type="button" disabled={isSubmitting} onClick={handleSubmit} className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60">
              {isSubmitting ? 'Envoi...' : 'Créer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
