import { Check, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Criterion {
  i18nKey: string
  done: boolean
}

interface CriteriaBarProps {
  criteria: Criterion[]
  score: number
  max: number
}

export default function CriteriaBar({ criteria, score, max }: CriteriaBarProps) {
  const { t } = useTranslation()
  const pct = Math.round((score / max) * 100)

  const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444'

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-card-border)' }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
        </div>
        <span className="text-xs font-bold tabular-nums" style={{ color }}>{score}/{max}</span>
      </div>

      {/* Criteria list */}
      <ul className="space-y-1.5">
        {criteria.map(c => (
          <li key={c.i18nKey} className="flex items-center gap-2 text-xs">
            <span
              className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
              style={{ background: c.done ? '#22c55e22' : '#ef444422' }}
            >
              {c.done
                ? <Check className="w-2.5 h-2.5" style={{ color: '#22c55e' }} />
                : <X className="w-2.5 h-2.5" style={{ color: '#ef4444' }} />
              }
            </span>
            <span style={{ color: c.done ? 'var(--app-fg)' : 'var(--sidebar-muted)' }}>{t(c.i18nKey)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
