import { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { exercisesApi } from '../../services/api'

interface ExerciseSubpageShellProps {
  exerciseId: number
  sectionLabel: string
  title: string
  subtitle?: string
  returnStep?: number
  actions?: ReactNode
  children: ReactNode
}

const statusLabels: Record<string, string> = {
  draft: 'Brouillon',
  running: 'En cours',
  paused: 'En pause',
  completed: 'Termine',
  archived: 'Archive',
}

export default function ExerciseSubpageShell({
  exerciseId,
  sectionLabel,
  title,
  subtitle,
  returnStep,
  actions,
  children,
}: ExerciseSubpageShellProps) {
  const navigate = useNavigate()

  const { data: exercise } = useQuery({
    queryKey: ['exercise', exerciseId],
    queryFn: () => exercisesApi.get(exerciseId),
  })

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate(`/exercises/${exerciseId}${returnStep ? `?step=${returnStep}` : ''}`)}
        className="inline-flex items-center text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft size={18} className="mr-2" />
        Retour a l'exercice
      </button>

      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <div className="text-xs text-gray-500 flex items-center gap-1 mb-3">
          <span>Exercices</span>
          <ChevronRight size={12} />
          <span>{exercise?.name || `Exercice #${exerciseId}`}</span>
          <ChevronRight size={12} />
          <span>{sectionLabel}</span>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            <div className="mt-1 text-sm text-gray-600">
              {exercise ? statusLabels[exercise.status] || exercise.status : 'Chargement...'}
            </div>
            {subtitle && <p className="mt-2 text-sm text-gray-500 leading-relaxed max-w-2xl">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      </div>

      {children}
    </div>
  )
}
