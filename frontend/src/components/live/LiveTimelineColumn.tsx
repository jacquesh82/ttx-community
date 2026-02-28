import type { LiveTimelineItem as LiveTimelineItemType } from '../../services/api'
import LiveTimelineItem from './LiveTimelineItem'

interface LiveTimelineColumnProps {
  title: string
  subtitle?: string
  tone?: 'business' | 'technical' | 'realtime'
  items: LiveTimelineItemType[]
  nowMin?: number
  onAddSurprise?: () => void
  showRealtimeActions?: boolean
  onSendNow?: (id: number) => void
  onCancel?: (id: number) => void
}

function toneClasses(tone: LiveTimelineColumnProps['tone']) {
  switch (tone) {
    case 'technical':
      return 'border-cyan-200 bg-cyan-50/30'
    case 'realtime':
      return 'border-amber-200 bg-amber-50/30'
    default:
      return 'border-indigo-200 bg-indigo-50/20'
  }
}

export default function LiveTimelineColumn({
  title,
  subtitle,
  tone = 'business',
  items,
  nowMin,
  onAddSurprise,
  showRealtimeActions = false,
  onSendNow,
  onCancel,
}: LiveTimelineColumnProps) {
  return (
    <section className={`rounded-2xl border p-4 shadow-sm ${toneClasses(tone)}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
        {onAddSurprise && (
          <button
            type="button"
            onClick={onAddSurprise}
            className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
          >
            + Inject surprise
          </button>
        )}
      </div>

      <div className="space-y-3 max-h-[52vh] overflow-auto pr-1">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white/80 p-4 text-sm text-gray-500">
            Aucun élément
          </div>
        ) : (
          items.map((item) => (
            <LiveTimelineItem
              key={item.id}
              item={item}
              nowMin={nowMin}
              compact={tone !== 'realtime'}
              showActions={showRealtimeActions}
              onSendNow={onSendNow}
              onCancel={onCancel}
            />
          ))
        )}
      </div>
    </section>
  )
}
