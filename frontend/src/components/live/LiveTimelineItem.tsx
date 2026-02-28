import { Clock, Send, X, Zap } from 'lucide-react'
import type { LiveTimelineItem as LiveTimelineItemType } from '../../services/api'

interface LiveTimelineItemProps {
  item: LiveTimelineItemType
  nowMin?: number
  compact?: boolean
  showActions?: boolean
  onSendNow?: (id: number) => void
  onCancel?: (id: number) => void
}

function formatTPlus(minutes: number | null | undefined) {
  if (minutes == null) return 'T+?'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `T+${h}h${String(m).padStart(2, '0')}`
}

function statusClass(status: string) {
  switch (status) {
    case 'sent':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 'scheduled':
      return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'cancelled':
      return 'bg-slate-100 text-slate-700 border-slate-200'
    default:
      return 'bg-amber-100 text-amber-800 border-amber-200'
  }
}

export default function LiveTimelineItem({
  item,
  nowMin,
  compact = false,
  showActions = false,
  onSendNow,
  onCancel,
}: LiveTimelineItemProps) {
  const isPast = item.time_offset != null && nowMin != null ? item.time_offset <= nowMin : false
  const canAct = item.status !== 'sent' && item.status !== 'cancelled'

  return (
    <article className={`rounded-xl border p-3 ${compact ? 'space-y-2' : 'space-y-3'} ${item.is_surprise ? 'border-amber-300 bg-amber-50/60' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {item.badge && (
              <span className="inline-flex items-center rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                <Zap size={10} className="mr-1" />
                {item.badge}
              </span>
            )}
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${statusClass(String(item.status))}`}>
              {item.status}
            </span>
          </div>
          <h4 className="font-semibold text-sm text-gray-900 truncate">{item.title}</h4>
          <p className="text-xs text-gray-500 truncate">{item.target_summary || 'Aucun ciblage'}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs font-medium text-gray-700">{formatTPlus(item.time_offset)}</div>
          {item.sent_at && <div className="text-[11px] text-gray-500">{new Date(item.sent_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>}
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-600">
        <Clock size={12} />
        <span className={isPast ? 'text-emerald-700 font-medium' : ''}>
          {item.time_offset == null ? 'Hors chronologie' : isPast ? 'Fenêtre passée / en cours' : 'À venir'}
        </span>
        <span className="ml-auto uppercase tracking-wide text-[10px] text-gray-400">{item.type}</span>
      </div>

      {item.meta?.description && !compact && (
        <p className="text-xs text-gray-700 line-clamp-2">{item.meta.description}</p>
      )}

      {showActions && canAct && (
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => onSendNow?.(item.id)}
            className="inline-flex items-center rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
          >
            <Send size={12} className="mr-1" />
            Envoyer
          </button>
          <button
            type="button"
            onClick={() => onCancel?.(item.id)}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <X size={12} className="mr-1" />
            Annuler
          </button>
        </div>
      )}
    </article>
  )
}
