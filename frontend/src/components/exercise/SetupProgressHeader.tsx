import { ReactNode } from 'react'
import { CalendarDays, Clock3, Gauge, ShieldCheck } from 'lucide-react'

interface SetupProgressHeaderProps {
  name: string
  status: string
  plannedDate?: string | null
  exerciseType?: string | null
  targetDurationHours?: number | null
  maturityLevel?: string | null
  completedCount: number
  totalCount: number
  actions?: ReactNode
  backAction?: ReactNode
}

const statusLabels: Record<string, string> = {
  running: 'En cours',
  paused: 'En pause',
  completed: 'Termine',
  archived: 'Archive',
}

const statusColors: Record<string, string> = {
  running: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/40',
  paused: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/40',
  completed: 'bg-primary-50 text-primary-700 border border-primary-200 dark:bg-primary-500/15 dark:text-primary-300 dark:border-primary-500/40',
  archived: 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/40',
}

function labelize(value?: string | null): string {
  if (!value) return 'Non renseigne'
  return value.split('_').join(' ')
}

export default function SetupProgressHeader({
  name,
  status,
  plannedDate,
  exerciseType,
  targetDurationHours,
  maturityLevel,
  completedCount,
  totalCount,
  actions,
  backAction,
}: SetupProgressHeaderProps) {
  const progress = Math.round((completedCount / totalCount) * 100)

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 border border-slate-200 dark:border-slate-700">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          {backAction && <div>{backAction}</div>}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{name}</h1>
            {statusLabels[status] && (
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${statusColors[status] || 'bg-gray-100 text-gray-700'}`}
              >
                {statusLabels[status]}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Meta icon={<ShieldCheck size={14} />} label="Type" value={labelize(exerciseType)} />
            <Meta icon={<Clock3 size={14} />} label="Duree cible" value={targetDurationHours ? `${targetDurationHours}h` : 'Non renseignee'} />
            <Meta icon={<Gauge size={14} />} label="Maturite" value={labelize(maturityLevel)} />
            <Meta
              icon={<CalendarDays size={14} />}
              label="Date prevue"
              value={plannedDate ? new Date(plannedDate).toLocaleString('fr-FR') : 'Non renseignee'}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Configuration: {completedCount}/{totalCount} sections
          </div>
          <div className="w-full lg:w-72 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-primary-600 dark:bg-cyan-400" style={{ width: `${progress}%` }} />
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{progress}% complet</div>
          {actions}
        </div>
      </div>
    </div>
  )
}

function Meta({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 py-2">
      <div className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </div>
      <div className="text-slate-900 dark:text-slate-100 font-medium">{value}</div>
    </div>
  )
}
