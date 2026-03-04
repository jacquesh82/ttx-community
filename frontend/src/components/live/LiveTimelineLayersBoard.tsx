import { Eye, EyeOff, Plus, Send, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ExercisePhase, LiveTimelineItem } from '../../services/api'

type LayerKey = 'business' | 'technical' | 'realtime'

interface LayerState {
  visible: boolean
}

interface LayeredTimelines {
  business: LiveTimelineItem[]
  technical: LiveTimelineItem[]
  realtime: LiveTimelineItem[]
}

interface Props {
  timelines: LayeredTimelines
  virtualNowMin: number
  phases?: ExercisePhase[]
  onAddSurprise: () => void
  onSendRealtime: (injectId: number) => void
  onCancelRealtime: (injectId: number) => void
  onVirtualNowChange?: (minute: number) => void
}

const LAYER_META: Record<LayerKey, { label: string; color: string; border: string; fill: string }> = {
  business: { label: 'Métier', color: '#4338ca', border: 'border-indigo-400', fill: 'bg-indigo-500' },
  technical: { label: 'Technique', color: '#0891b2', border: 'border-cyan-400', fill: 'bg-cyan-500' },
  realtime: { label: 'Temps réel', color: '#d97706', border: 'border-amber-400', fill: 'bg-amber-500' },
}

const PX_PER_MIN = 8
const ROW_HEIGHT = 72
const BLOCK_HEIGHT = 26
const LAYER_BAND_HEIGHT = 104
const LEFT_GUTTER = 110

function formatTPlus(minutes: number | null | undefined) {
  if (minutes == null) return 'T+?'
  const safe = Math.max(minutes, 0)
  const h = Math.floor(safe / 60)
  const m = safe % 60
  return `T+${h}h${String(m).padStart(2, '0')}`
}

function itemDurationMin(item: LiveTimelineItem) {
  return typeof item.duration_min === 'number' && item.duration_min > 0 ? item.duration_min : 15
}

function statusFill(status: string) {
  switch (status) {
    case 'sent':
      return 'bg-emerald-500'
    case 'scheduled':
      return 'bg-primary-500'
    case 'cancelled':
      return 'bg-slate-400'
    default:
      return 'bg-amber-500'
  }
}

function layerBlockStyle(key: LayerKey, status: string) {
  const statusCancelled = status === 'cancelled'
  const statusSent = status === 'sent'
  if (key === 'business') {
    return {
      backgroundColor: statusCancelled ? 'rgba(148, 163, 184, 0.55)' : statusSent ? 'rgba(67, 56, 202, 0.95)' : 'rgba(99, 102, 241, 0.88)',
      borderColor: statusCancelled ? 'rgba(100, 116, 139, 0.8)' : 'rgba(49, 46, 129, 0.95)',
      color: '#ffffff',
    }
  }
  if (key === 'technical') {
    return {
      backgroundColor: statusCancelled ? 'rgba(148, 163, 184, 0.55)' : statusSent ? 'rgba(8, 145, 178, 0.95)' : 'rgba(34, 211, 238, 0.85)',
      borderColor: statusCancelled ? 'rgba(100, 116, 139, 0.8)' : 'rgba(14, 116, 144, 0.95)',
      color: '#ffffff',
    }
  }
  return {
    backgroundColor: statusCancelled ? 'rgba(148, 163, 184, 0.55)' : statusSent ? 'rgba(217, 119, 6, 0.96)' : 'rgba(245, 158, 11, 0.9)',
    borderColor: statusCancelled ? 'rgba(100, 116, 139, 0.8)' : 'rgba(180, 83, 9, 0.95)',
    color: '#ffffff',
  }
}

function computeRows(items: LiveTimelineItem[]) {
  const sorted = [...items].sort((a, b) => (a.time_offset ?? 10 ** 9) - (b.time_offset ?? 10 ** 9))
  const rowEnds: number[] = []
  const placements: Array<{ item: LiveTimelineItem; row: number; start: number; end: number }> = []
  for (const item of sorted) {
    const start = Math.max(item.time_offset ?? 0, 0)
    const end = start + itemDurationMin(item)
    let row = rowEnds.findIndex((rowEnd) => rowEnd <= start)
    if (row === -1) {
      row = rowEnds.length
      rowEnds.push(end)
    } else {
      rowEnds[row] = end
    }
    placements.push({ item, row, start, end })
  }
  return placements
}

export default function LiveTimelineLayersBoard({
  timelines,
  virtualNowMin,
  phases = [],
  onAddSurprise,
  onSendRealtime,
  onCancelRealtime,
  onVirtualNowChange,
}: Props) {
  const [layers, setLayers] = useState<Record<LayerKey, LayerState>>({
    business: { visible: true },
    technical: { visible: true },
    realtime: { visible: true },
  })
  const [selectedItem, setSelectedItem] = useState<LiveTimelineItem | null>(null)
  const [isDraggingNow, setIsDraggingNow] = useState(false)
  const headerTrackRef = useRef<HTMLDivElement | null>(null)

  const allItems = useMemo(
    () => [...timelines.business, ...timelines.technical, ...timelines.realtime],
    [timelines],
  )

  const horizonMin = useMemo(() => {
    const maxFromItems = allItems.reduce((max, item) => {
      const start = item.time_offset ?? 0
      return Math.max(max, start + itemDurationMin(item))
    }, 120)
    return Math.max(maxFromItems, virtualNowMin + 60, 120)
  }, [allItems, virtualNowMin])

  const tickEvery = horizonMin > 480 ? 60 : horizonMin > 240 ? 30 : 15
  const canvasWidth = LEFT_GUTTER + horizonMin * PX_PER_MIN + 120

  const placementsByLayer = useMemo(
    () => ({
      business: computeRows(timelines.business),
      technical: computeRows(timelines.technical),
      realtime: computeRows(timelines.realtime),
    }),
    [timelines],
  )

  const visibleLayers = (Object.keys(layers) as LayerKey[]).filter((k) => layers[k].visible)
  const currentPhase = useMemo(() => {
    if (!phases.length) return null
    const sorted = [...phases].sort((a, b) => (a.start_offset_min ?? 0) - (b.start_offset_min ?? 0))
    for (let i = 0; i < sorted.length; i++) {
      const phase = sorted[i]
      const start = phase.start_offset_min ?? 0
      const nextStart = sorted[i + 1]?.start_offset_min ?? Number.POSITIVE_INFINITY
      const end = phase.end_offset_min ?? nextStart
      if (virtualNowMin >= start && virtualNowMin < end) return phase
    }
    return sorted[sorted.length - 1] ?? null
  }, [phases, virtualNowMin])

  const clampMinute = (minute: number) => Math.max(0, Math.min(horizonMin, minute))
  const clientXToMinute = (clientX: number) => {
    const el = headerTrackRef.current
    if (!el) return virtualNowMin
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left - LEFT_GUTTER
    const minute = Math.round(x / PX_PER_MIN)
    return clampMinute(minute)
  }

  useEffect(() => {
    if (!isDraggingNow) return
    const onMove = (e: PointerEvent) => onVirtualNowChange?.(clientXToMinute(e.clientX))
    const onUp = () => setIsDraggingNow(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [isDraggingNow, onVirtualNowChange, horizonMin, virtualNowMin])

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-gray-200 px-4 py-3 bg-gradient-to-r from-slate-50 via-white to-slate-50">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Timeline graphique superposée</h2>
            <p className="text-xs text-gray-500">3 layers activables superposés, curseur temps réel sur T+ courant.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onAddSurprise}
              className="inline-flex items-center rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700"
            >
              <Plus size={14} className="mr-1" />
              Inject surprise
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
          {(Object.keys(LAYER_META) as LayerKey[]).map((key) => {
            const meta = LAYER_META[key]
            const layer = layers[key]
            const count = timelines[key].length
            return (
              <div key={key} className={`rounded-xl border p-2 ${meta.border} bg-white/90`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setLayers((prev) => ({ ...prev, [key]: { ...prev[key], visible: !prev[key].visible } }))}
                      className="rounded-md border border-gray-200 p-1 text-gray-700 hover:bg-gray-50"
                      title={layer.visible ? 'Masquer layer' : 'Afficher layer'}
                    >
                      {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <span className="text-sm font-semibold text-gray-900">{meta.label}</span>
                    <span className="text-xs text-gray-500">{count}</span>
                  </div>
                  <span className="h-2.5 w-8 rounded-full" style={{ backgroundColor: meta.color }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-0">
        <div className="overflow-x-auto border-r border-gray-200">
          <div className="min-w-full" style={{ width: canvasWidth }}>
            <div className="sticky top-0 z-10 bg-white border-b border-gray-200 h-11">
              <div className="relative h-full" ref={headerTrackRef}>
                <div className="absolute inset-y-0 left-0 w-[110px] border-r border-gray-200 bg-gray-50 flex items-center justify-center text-xs font-semibold text-gray-500">
                  Layers
                </div>
                {Array.from({ length: Math.ceil(horizonMin / tickEvery) + 1 }).map((_, idx) => {
                  const minute = idx * tickEvery
                  const left = LEFT_GUTTER + minute * PX_PER_MIN
                  return (
                    <div key={minute} className="absolute inset-y-0" style={{ left }}>
                      <div className="h-full border-l border-gray-200/90" />
                      <div className="absolute top-1 left-1 text-[10px] text-gray-500">{formatTPlus(minute)}</div>
                    </div>
                  )
                })}
                <div
                  className="absolute inset-y-0 w-0.5 bg-red-500"
                  style={{ left: LEFT_GUTTER + virtualNowMin * PX_PER_MIN }}
                  onPointerDown={(e) => {
                    if (!onVirtualNowChange) return
                    e.preventDefault()
                    setIsDraggingNow(true)
                    onVirtualNowChange(clientXToMinute(e.clientX))
                  }}
                >
                  <div className={`absolute -bottom-0.5 -left-7 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white cursor-ew-resize select-none ${isDraggingNow ? 'ring-2 ring-red-200' : ''}`}>
                    NOW
                  </div>
                </div>
              </div>
            </div>

            <div className="relative" style={{ height: LAYER_BAND_HEIGHT * 3 }}>
              {(Object.keys(LAYER_META) as LayerKey[]).map((key, index) => {
                const yBase = index * LAYER_BAND_HEIGHT
                const layer = layers[key]
                const placements = placementsByLayer[key]
                return (
                  <div key={key} className="absolute left-0 right-0" style={{ top: yBase, height: LAYER_BAND_HEIGHT }}>
                    <div className="absolute inset-0 border-b border-gray-200 bg-white" />
                    <div className="absolute left-0 top-0 bottom-0 w-[110px] border-r border-gray-200 bg-gray-50/70 px-3 py-2">
                      <div className="text-xs font-semibold text-gray-900">{LAYER_META[key].label}</div>
                      <div className="text-[11px] text-gray-500">{layer.visible ? 'Visible' : 'Masqué'}</div>
                      {(key === 'business' || key === 'technical') && (
                        <div className="mt-1 text-[11px] text-gray-700 leading-tight">
                          Phase en cours: <span className="font-medium">{currentPhase ? `${currentPhase.phase_order}. ${currentPhase.name}` : 'N/A'}</span>
                        </div>
                      )}
                    </div>
                    <div className="absolute inset-y-0 left-[110px] right-0">
                      {Array.from({ length: Math.ceil(horizonMin / tickEvery) + 1 }).map((_, idx) => {
                        const minute = idx * tickEvery
                        const left = minute * PX_PER_MIN
                        return <div key={minute} className="absolute inset-y-0 border-l border-gray-100" style={{ left }} />
                      })}

                      {layer.visible &&
                        placements.map(({ item, row, start, end }) => {
                          const left = start * PX_PER_MIN
                          const width = Math.max((end - start) * PX_PER_MIN, 18)
                          const top = 10 + row * (BLOCK_HEIGHT + 6)
                          const isActive = virtualNowMin >= start && virtualNowMin <= end && item.status !== 'cancelled'
                          const isSelected = selectedItem?.id === item.id
                          return (
                            <button
                              key={`${key}-${item.id}`}
                              type="button"
                              onClick={() => setSelectedItem(item)}
                              className={`absolute rounded-md border text-left px-2 py-1 shadow-sm transition ${isActive ? 'ring-2 ring-white/90' : ''} ${isSelected ? 'ring-2 ring-black/30' : ''}`}
                              style={{
                                left,
                                top,
                                width,
                                height: BLOCK_HEIGHT,
                                opacity: key === 'realtime' ? 0.95 : 0.85,
                                ...layerBlockStyle(key, String(item.status)),
                              }}
                              title={`${item.title} (${formatTPlus(item.time_offset)})`}
                            >
                              <span className="flex items-center gap-1">
                                <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusFill(String(item.status))} ring-1 ring-white/70`} />
                                <span className="block truncate text-[11px] font-semibold">{item.title}</span>
                              </span>
                            </button>
                          )
                        })}

                      <div
                        className="absolute inset-y-0 w-0.5 bg-red-500/90"
                        style={{ left: virtualNowMin * PX_PER_MIN }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <aside className="bg-gray-50/60 p-4 space-y-3">
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <h3 className="text-sm font-semibold text-gray-900">Événements en cours</h3>
            <div className="mt-2 space-y-2">
              {visibleLayers.flatMap((key) => timelines[key])
                .filter((item) => {
                  const start = item.time_offset ?? 0
                  const end = start + itemDurationMin(item)
                  return item.status !== 'cancelled' && virtualNowMin >= start && virtualNowMin <= end
                })
                .slice(0, 10)
                .map((item) => (
                  <div key={`active-${item.id}`} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2">
                    <div className="text-xs font-semibold text-emerald-900 truncate">{item.title}</div>
                    <div className="text-[11px] text-emerald-700">{item.target_summary}</div>
                  </div>
                ))}
              {visibleLayers.flatMap((key) => timelines[key]).filter((item) => {
                const start = item.time_offset ?? 0
                const end = start + itemDurationMin(item)
                return item.status !== 'cancelled' && virtualNowMin >= start && virtualNowMin <= end
              }).length === 0 && (
                <p className="text-xs text-gray-500">Aucun événement actif à cet instant.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <h3 className="text-sm font-semibold text-gray-900">Détail sélection</h3>
            {selectedItem ? (
              <div className="mt-2 space-y-2">
                <div className="text-sm font-semibold text-gray-900">{selectedItem.title}</div>
                <div className="text-xs text-gray-600">{selectedItem.target_summary}</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-700">{selectedItem.timeline_type}</span>
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-700">{selectedItem.status}</span>
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-700">{formatTPlus(selectedItem.time_offset)}</span>
                </div>
                {selectedItem.meta?.description && (
                  <p className="text-xs text-gray-700">{selectedItem.meta.description}</p>
                )}
                {selectedItem.is_surprise && selectedItem.status !== 'sent' && selectedItem.status !== 'cancelled' && (
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => onSendRealtime(selectedItem.id)} className="inline-flex items-center rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700">
                      <Send size={12} className="mr-1" /> Envoyer
                    </button>
                    <button type="button" onClick={() => onCancelRealtime(selectedItem.id)} className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                      <X size={12} className="mr-1" /> Annuler
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs text-gray-500">Cliquez un bloc sur la timeline pour voir le détail.</p>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <h3 className="text-sm font-semibold text-gray-900">Timeline temps réel (liste)</h3>
            <div className="mt-2 max-h-56 overflow-auto space-y-2">
              {timelines.realtime.map((item) => (
                <button
                  key={`rt-list-${item.id}`}
                  type="button"
                  onClick={() => setSelectedItem(item)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-left hover:bg-gray-50"
                >
                  <div className="text-xs font-semibold text-gray-900 truncate">{item.title}</div>
                  <div className="text-[11px] text-gray-500">{formatTPlus(item.time_offset)} • {item.status}</div>
                </button>
              ))}
              {timelines.realtime.length === 0 && <p className="text-xs text-gray-500">Aucun inject surprise.</p>}
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}
