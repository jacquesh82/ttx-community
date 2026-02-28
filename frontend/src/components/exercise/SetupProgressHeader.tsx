import { ReactNode } from 'react'

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
  running: 'bg-emerald-100 text-emerald-800',
  paused: 'bg-amber-100 text-amber-800',
  completed: 'bg-blue-100 text-blue-800',
  archived: 'bg-slate-100 text-slate-700',
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
    <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          {backAction && <div>{backAction}</div>}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{name}</h1>
            {statusLabels[status] && (
              <span
                className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${statusColors[status] || 'bg-gray-100 text-gray-700'}`}
              >
                {statusLabels[status]}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Meta label="Type" value={labelize(exerciseType)} />
            <Meta label="Duree cible" value={targetDurationHours ? `${targetDurationHours}h` : 'Non renseignee'} />
            <Meta label="Maturite" value={labelize(maturityLevel)} />
            <Meta
              label="Date prevue"
              value={plannedDate ? new Date(plannedDate).toLocaleString('fr-FR') : 'Non renseignee'}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          <div className="text-sm font-medium text-gray-700">
            Configuration: {completedCount}/{totalCount} sections
          </div>
          <div className="w-full lg:w-72 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600" style={{ width: `${progress}%` }} />
          </div>
          <div className="text-xs text-gray-500">{progress}% complet</div>
          {actions}
        </div>
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-gray-900">{value}</div>
    </div>
  )
}
