import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  injectsApi,
  exercisesApi,
  crisisManagementApi,
  Inject,
  InjectType,
  InjectStatus,
  TriggerMode,
} from '../services/api'
import { useInjectTypes } from '../hooks/useInjectBank'
import {
  Plus,
  Send,
  Clock,
  Trash2,
  XCircle,
  Mail,
  Tv,
  Twitter,
  AlertCircle,
  Star,
  Settings,
  ZoomIn,
  ZoomOut,
  CalendarClock,
  List,
  Upload,
} from 'lucide-react'
import Modal from '../components/Modal'
import ExerciseSubpageShell from '../components/exercise/ExerciseSubpageShell'
import { InjectBankKind } from '../services/api'
import { useAppDialog } from '../contexts/AppDialogContext'

const STATUS_CONFIG: Record<InjectStatus, { label: string; color: string; dot: string }> = {
  draft:     { label: 'Brouillon',  color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' },
  scheduled: { label: 'Planifié',   color: 'bg-primary-100 text-primary-700', dot: 'bg-primary-500' },
  sent:      { label: 'Envoyé',     color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  cancelled: { label: 'Annulé',     color: 'bg-red-100 text-red-700', dot: 'bg-red-400' },
}

export default function ExerciseChronogrammePage() {
  const appDialog = useAppDialog()
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const queryClient = useQueryClient()
  const exId = parseInt(exerciseId!)

  const { data: injectTypes } = useInjectTypes()

  // Dynamic TYPE_CONFIG based on API
  const TYPE_CONFIG = useMemo(() => {
    const icons: Record<string, React.ElementType> = {
      mail: Mail,
      twitter: Twitter,
      tv: Tv,
      decision: AlertCircle,
      score: Star,
      system: Settings,
    }
    const colors: Record<string, string> = {
      mail: 'bg-primary-500',
      twitter: 'bg-sky-500',
      tv: 'bg-teal-500',
      decision: 'bg-orange-500',
      score: 'bg-yellow-500',
      system: 'bg-gray-500',
    }
    const config: Record<InjectType, { label: string; bg: string; icon: React.ElementType }> = {} as any
    const types = injectTypes || ['mail', 'twitter', 'tv', 'decision', 'score', 'system']
    for (const t of types) {
      config[t as InjectType] = {
        label: t.charAt(0).toUpperCase() + t.slice(1),
        bg: colors[t] || 'bg-gray-500',
        icon: icons[t] || Settings,
      }
    }
    return config
  }, [injectTypes])

  const [zoom, setZoom] = useState(1)
  const [selectedInject, setSelectedInject] = useState<Inject | null>(null)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [typeFilter, setTypeFilter] = useState<InjectType | ''>('')
  const [statusFilter, setStatusFilter] = useState<InjectStatus | ''>('')
  const [selectedTriggerMode, setSelectedTriggerMode] = useState<TriggerMode>('auto')
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>('')
  const [bankKind, setBankKind] = useState<InjectBankKind>('story')
  const [bankCategory, setBankCategory] = useState('')

  const { data: exercise } = useQuery({
    queryKey: ['exercise', exerciseId],
    queryFn: () => exercisesApi.get(exId),
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['injects', exerciseId, 'all'],
    queryFn: () => injectsApi.list({ exercise_id: exId, page: 1, page_size: 1000 }),
  })

  const injects = data?.injects ?? []
  const { data: phases } = useQuery({
    queryKey: ['exercise-phases', exerciseId],
    queryFn: () => crisisManagementApi.listPhases(exId),
  })
  const { data: triggerRules } = useQuery({
    queryKey: ['inject-triggers', exerciseId],
    queryFn: () => crisisManagementApi.listInjectTriggers(exId),
  })

  const filteredInjects = useMemo(() => {
    return injects.filter((i) => {
      if (typeFilter && i.type !== typeFilter) return false
      if (statusFilter && i.status !== statusFilter) return false
      return true
    })
  }, [injects, typeFilter, statusFilter])

  const exerciseStart = exercise?.started_at ? new Date(exercise.started_at) : new Date()
  const timelineHours = 24

  const getInjectPosition = (inject: Inject) => {
    const injectTime = inject.scheduled_at ? new Date(inject.scheduled_at) : new Date(inject.created_at)
    const diffHours = (injectTime.getTime() - exerciseStart.getTime()) / (1000 * 60 * 60)
    return Math.max(0, Math.min(100, (diffHours / timelineHours) * 100))
  }

  const sendMutation = useMutation({
    mutationFn: (id: number) => injectsApi.send(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['injects', exerciseId] }),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: number) => injectsApi.cancel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['injects', exerciseId] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => injectsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['injects', exerciseId] }),
  })

  const scheduleMutation = useMutation({
    mutationFn: ({ id, date }: { id: number; date: string }) => injectsApi.schedule(id, new Date(date).toISOString()),
    onSuccess: () => { setShowScheduleModal(false); setSelectedInject(null) },
  })
  const upsertTriggerMutation = useMutation({
    mutationFn: (payload: { inject_id: number; trigger_mode: TriggerMode; expression?: Record<string, any> | null }) =>
      crisisManagementApi.upsertInjectTrigger(exId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inject-triggers', exerciseId] }),
  })

  const importTimelineJson = useMutation({
    mutationFn: (file: File) => crisisManagementApi.importComponent(exId, 'timeline', file, false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise-phases', exerciseId] })
    },
  })
  const importInjectsJson = useMutation({
    mutationFn: (file: File) => crisisManagementApi.importComponent(exId, 'injects', file, false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['injects', exerciseId, 'all'] })
    },
  })
  const importFromBank = useMutation({
    mutationFn: (component: 'timeline' | 'injects') =>
      crisisManagementApi.importComponentFromBank(
        exId,
        component,
        bankKind,
        bankCategory || undefined
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['injects', exerciseId, 'all'] })
      queryClient.invalidateQueries({ queryKey: ['exercise-phases', exerciseId] })
    },
  })

  const handleDelete = async (inject: Inject) => {
    if (await appDialog.confirm(`Supprimer "${inject.title}" ?`)) deleteMutation.mutate(inject.id)
  }

  const timeMarkers = useMemo(() => {
    return Array.from({ length: 13 }, (_, i) => ({
      hour: i * 2,
      label: `T+${i * 2}h`,
      position: (i * 2 / timelineHours) * 100,
    }))
  }, [])

  return (
    <ExerciseSubpageShell
      exerciseId={exId}
      sectionLabel="Timeline"
      title="Chronogramme des injects"
      actions={
        <div className="flex items-center gap-2">
          <label className="px-3 py-2 bg-slate-100 border border-slate-300 text-slate-800 rounded text-sm hover:bg-slate-200 cursor-pointer inline-flex items-center">
            <Upload size={14} className="mr-1" />
            Import timeline
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) importTimelineJson.mutate(file)
                e.currentTarget.value = ''
              }}
            />
          </label>
          <label className="px-3 py-2 bg-slate-100 border border-slate-300 text-slate-800 rounded text-sm hover:bg-slate-200 cursor-pointer inline-flex items-center">
            <Upload size={14} className="mr-1" />
            Import injects
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) importInjectsJson.mutate(file)
                e.currentTarget.value = ''
              }}
            />
          </label>
          <select
            value={bankKind}
            onChange={(e) => setBankKind(e.target.value as InjectBankKind)}
            className="px-2 py-2 border border-gray-300 rounded text-sm"
          >
            <option value="chronogram">Banque: chronogram</option>
            <option value="scenario">Banque: scenario</option>
            <option value="mail">Banque: mail</option>
            <option value="message">Banque: message</option>
            <option value="social_post">Banque: social_post</option>
            <option value="video">Banque: video</option>
          </select>
          <input
            value={bankCategory}
            onChange={(e) => setBankCategory(e.target.value)}
            placeholder="Categorie"
            className="px-2 py-2 border border-gray-300 rounded text-sm w-36"
          />
          <button
            onClick={() => importFromBank.mutate('timeline')}
            disabled={importFromBank.isPending}
            className="px-3 py-2 bg-slate-800 text-white rounded text-sm hover:bg-slate-900 disabled:opacity-50"
          >
            Banque vers timeline
          </button>
          <button
            onClick={() => importFromBank.mutate('injects')}
            disabled={importFromBank.isPending}
            className="px-3 py-2 bg-primary-700 text-white rounded text-sm hover:bg-primary-800 disabled:opacity-50"
          >
            Banque vers injects
          </button>
        </div>
      }
    >

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-2">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as InjectType | '')}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md">
            <option value="">Tous types</option>
            {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as InjectStatus | '')}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md">
            <option value="">Tous statuts</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setZoom((z) => Math.max(0.5, z / 2))} className="p-1.5 hover:bg-gray-100 rounded"><ZoomOut size={18} /></button>
          <span className="text-sm text-gray-500 w-12 text-center">{zoom}x</span>
          <button onClick={() => setZoom((z) => Math.min(4, z * 2))} className="p-1.5 hover:bg-gray-100 rounded"><ZoomIn size={18} /></button>
          <div className="w-px h-6 bg-gray-300 mx-2" />
          <Link to={`/exercises/${exerciseId}/injects`} className="inline-flex items-center px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200">
            <List className="mr-1.5" size={15} /> Liste
          </Link>
          <Link to={`/exercises/${exerciseId}/injects`} className="inline-flex items-center px-3 py-1.5 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700">
            <Plus className="mr-1.5" size={15} /> Nouveau
          </Link>
        </div>
      </div>

      {!isLoading && (
        <div className="flex gap-4 mb-4 flex-wrap">
          {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
            const count = filteredInjects.filter((i) => i.status === status).length
            return <div key={status} className="flex items-center gap-1.5 text-sm text-gray-600">
              <span className={`w-2 h-2 rounded-full ${cfg.dot}`} /> {cfg.label} : <strong>{count}</strong>
            </div>
          })}
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-gray-500">Chargement…</div>
        ) : isError ? (
          <div className="p-10 text-center text-red-500">Erreur</div>
        ) : filteredInjects.length === 0 ? (
          <div className="p-10 text-center text-gray-500">
            <CalendarClock className="mx-auto mb-3 text-gray-300" size={36} />
            <p>Aucun inject</p>
          </div>
        ) : (
          <div className="p-4 overflow-x-auto">
            <div className="relative" style={{ width: `${100 * zoom}%`, minWidth: '100%' }}>
              {/* Time markers */}
              <div className="h-8 border-b border-gray-200 relative">
                {timeMarkers.map((m) => (
                  <div key={m.hour} className="absolute text-xs text-gray-400 -translate-x-1/2" style={{ left: `${m.position}%` }}>
                    {m.label}
                  </div>
                ))}
              </div>
              {/* Grid */}
              <div className="absolute inset-0 top-8 pointer-events-none">
                {timeMarkers.map((m) => (
                  <div key={m.hour} className="absolute top-0 bottom-0 w-px bg-gray-100" style={{ left: `${m.position}%` }} />
                ))}
              </div>
              {/* Inject cards */}
              <div className="relative pt-4 pb-2" style={{ minHeight: '300px' }}>
                {filteredInjects.map((inject, idx) => {
                  const typeCfg = TYPE_CONFIG[inject.type]
                  const statusCfg = STATUS_CONFIG[inject.status]
                  const Icon = typeCfg.icon
                  const position = getInjectPosition(inject)
                  const top = (idx % 5) * 70 + 20

                  return (
                    <div
                      key={inject.id}
                      className={`absolute w-48 p-3 rounded-lg shadow border-l-4 cursor-pointer transition-transform hover:scale-105 ${
                        inject.status === 'cancelled' ? 'opacity-50' : ''
                      }`}
                      style={{ left: `${position}%`, top: `${top}px`, transform: 'translateX(-50%)' }}
                      onClick={() => setSelectedInject(inject)}
                    >
                    <div className="flex items-center gap-2 mb-1">
                        <span className={`w-5 h-5 rounded flex items-center justify-center ${typeCfg.bg} text-white`}>
                          <Icon size={12} />
                        </span>
                        <span className="text-xs font-medium text-gray-900 truncate flex-1">{inject.title}</span>
                      </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${statusCfg.color}`}>{statusCfg.label}</span>
                    {triggerRules?.find((r) => r.inject_id === inject.id) && (
                      <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                        {triggerRules.find((r) => r.inject_id === inject.id)?.trigger_mode}
                      </span>
                    )}
                    {inject.scheduled_at && (
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(inject.scheduled_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <Modal isOpen={!!selectedInject} onClose={() => setSelectedInject(null)} title="Détails de l'inject">
        {selectedInject && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">Titre</p>
              <p className="font-medium">{selectedInject.title}</p>
            </div>
            <div className="flex gap-4">
              <div>
                <p className="text-sm text-gray-500">Type</p>
                <p>{TYPE_CONFIG[selectedInject.type].label}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Statut</p>
                <span className={`text-xs px-2 py-0.5 rounded ${STATUS_CONFIG[selectedInject.status].color}`}>
                  {STATUS_CONFIG[selectedInject.status].label}
                </span>
              </div>
            </div>
            {selectedInject.description && (
              <div>
                <p className="text-sm text-gray-500">Description</p>
                <p className="text-sm">{selectedInject.description}</p>
              </div>
            )}
            {selectedInject.scheduled_at && (
              <div>
                <p className="text-sm text-gray-500">Planifié</p>
                <p>{new Date(selectedInject.scheduled_at).toLocaleString('fr-FR')}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-500 mb-1">Déclenchement</p>
              <div className="flex items-center gap-2">
                <select value={selectedTriggerMode} onChange={(e) => setSelectedTriggerMode(e.target.value as TriggerMode)} className="px-3 py-2 border border-gray-300 rounded-md text-sm">
                  <option value="auto">Automatique</option>
                  <option value="manual">Manuel</option>
                  <option value="conditional">Conditionnel</option>
                </select>
                <button
                  onClick={() => upsertTriggerMutation.mutate({
                    inject_id: selectedInject.id,
                    trigger_mode: selectedTriggerMode,
                    expression: selectedTriggerMode === 'conditional' ? { metric: 'decisions_count', op: '>=', value: 1 } : null,
                  })}
                  className="px-3 py-2 text-sm bg-violet-600 text-white rounded hover:bg-violet-700"
                >
                  Appliquer
                </button>
              </div>
            </div>
            {phases && phases.length > 0 && (
              <div>
                <p className="text-sm text-gray-500 mb-1">Phase associée</p>
                <select value={selectedPhaseId} onChange={(e) => setSelectedPhaseId(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm w-full">
                  <option value="">Aucune</option>
                  {phases.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.phase_order}. {p.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Le lien inject-phase est géré côté API, l'association détaillée sera finalisée dans l'édition inject avancée.
                </p>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              {(selectedInject.status === 'draft' || selectedInject.status === 'scheduled') && (
                <>
                  <button onClick={() => { sendMutation.mutate(selectedInject.id); setSelectedInject(null) }}
                    className="flex-1 px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700">
                    <Send className="inline mr-1" size={14} /> Envoyer
                  </button>
                  <button onClick={() => { setScheduleDate(selectedInject.scheduled_at?.slice(0, 16) || ''); setShowScheduleModal(true) }}
                    className="flex-1 px-3 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700">
                    <Clock className="inline mr-1" size={14} /> Planifier
                  </button>
                  <button onClick={() => { cancelMutation.mutate(selectedInject.id); setSelectedInject(null) }}
                    className="px-3 py-2 text-sm bg-orange-100 text-orange-700 rounded hover:bg-orange-200">
                    <XCircle className="inline mr-1" size={14} /> Annuler
                  </button>
                </>
              )}
              {selectedInject.status !== 'sent' && (
                <button onClick={() => { handleDelete(selectedInject); setSelectedInject(null) }}
                  className="px-3 py-2 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200">
                  <Trash2 className="inline mr-1" size={14} />
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Schedule Modal */}
      <Modal isOpen={showScheduleModal} onClose={() => setShowScheduleModal(false)} title="Planifier l'inject">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date / heure</label>
            <input type="datetime-local" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md" />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowScheduleModal(false)} className="px-4 py-2 text-sm bg-gray-100 rounded-md">Annuler</button>
            <button onClick={() => { if (selectedInject && scheduleDate) scheduleMutation.mutate({ id: selectedInject.id, date: scheduleDate }) }}
              disabled={!scheduleDate} className="px-4 py-2 text-sm bg-primary-600 text-white rounded-md disabled:opacity-50">
              Planifier
            </button>
          </div>
        </div>
      </Modal>
    </ExerciseSubpageShell>
  )
}
