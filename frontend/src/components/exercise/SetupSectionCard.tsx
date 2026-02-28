import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CheckCircle2, CircleDashed } from 'lucide-react'
import { ExerciseSetupSectionStatus } from '../../services/api'

interface SetupSectionCardProps {
  step: number
  title: string
  description: string
  status: ExerciseSetupSectionStatus
  summary?: string
  action?: ReactNode
  advancedLink?: {
    to: string
    label?: string
  }
  children?: ReactNode
}

const statusMeta: Record<
  ExerciseSetupSectionStatus,
  {
    label: string
    color: string
    icon: ReactNode
  }
> = {
  todo: {
    label: 'A faire',
    color: 'bg-gray-100 text-gray-700',
    icon: <CircleDashed size={14} />,
  },
  partial: {
    label: 'Partiel',
    color: 'bg-amber-100 text-amber-800',
    icon: <AlertCircle size={14} />,
  },
  complete: {
    label: 'Complet',
    color: 'bg-emerald-100 text-emerald-800',
    icon: <CheckCircle2 size={14} />,
  },
}

export default function SetupSectionCard({
  step,
  title,
  description,
  status,
  summary,
  action,
  advancedLink,
  children,
}: SetupSectionCardProps) {
  const meta = statusMeta[status]

  return (
    <section className="bg-white rounded-lg shadow p-6 border border-gray-200">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-900 text-white text-sm font-semibold">
              {step}
            </span>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${meta.color}`}>
              {meta.icon}
              {meta.label}
            </span>
          </div>
          <p className="text-sm text-gray-500">{description}</p>
          {summary && <p className="text-sm text-gray-700">{summary}</p>}
        </div>

        <div className="flex items-center gap-2">{action}</div>
      </div>

      {children && <div className="mt-4 pt-4 border-t border-gray-100">{children}</div>}

      {advancedLink && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <Link to={advancedLink.to} className="text-sm font-medium text-blue-700 hover:text-blue-800">
            {advancedLink.label || 'Ouvrir en complet'}
          </Link>
        </div>
      )}
    </section>
  )
}
