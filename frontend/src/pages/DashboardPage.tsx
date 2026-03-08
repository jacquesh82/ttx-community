import { useQuery } from '@tanstack/react-query'
import { exercisesApi } from '../services/api'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Dumbbell, Play, Pause, CheckCircle } from 'lucide-react'

export default function DashboardPage() {
  const { t } = useTranslation()
  const { data: exercisesData, isLoading } = useQuery({
    queryKey: ['exercises'],
    queryFn: () => exercisesApi.list({ page: 1, page_size: 10 }),
  })

  const exercises = exercisesData?.exercises || []

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-700 text-gray-300',
    running: 'bg-green-900/30 text-green-400',
    paused: 'bg-yellow-900/30 text-yellow-400',
    completed: 'bg-primary-900/30 text-primary-400',
    archived: 'bg-gray-700 text-gray-400',
  }

  return (
    <div className="options-theme space-y-6">
      {/* Header */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <h1 className="text-2xl font-bold text-white">{t('nav.dashboard')}</h1>
        <p className="text-sm text-gray-400 mt-1">{t('login.platformTagline')}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <div className="flex items-center">
            <div className="p-2 bg-primary-900/30 rounded-lg">
              <Dumbbell className="text-primary-400" size={24} />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-400">{t('exercises.stats.active')}</p>
              <p className="text-2xl font-bold text-white">
                {exercises.filter((e: any) => e.status === 'running').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-900/30 rounded-lg">
              <Pause className="text-yellow-400" size={24} />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-400">{t('exercises.stats.paused')}</p>
              <p className="text-2xl font-bold text-white">
                {exercises.filter((e: any) => e.status === 'paused').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <div className="flex items-center">
            <div className="p-2 bg-green-900/30 rounded-lg">
              <CheckCircle className="text-green-400" size={24} />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-400">{t('exercises.stats.completed')}</p>
              <p className="text-2xl font-bold text-white">
                {exercises.filter((e: any) => e.status === 'completed').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent exercises */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">{t('exercises.recent')}</h2>
          <Link to="/exercises" className="text-sm text-primary-400 hover:text-primary-300 font-medium">
            {t('common.viewAll')}
          </Link>
        </div>

        {isLoading ? (
          <div className="p-6 text-center text-gray-400">{t('common.loading')}</div>
        ) : exercises.length === 0 ? (
          <div className="p-6 text-center text-gray-400">{t('exercises.noneCreated')}</div>
        ) : (
          <ul className="divide-y divide-gray-700">
            {exercises.slice(0, 5).map((exercise: any) => (
              <li key={exercise.id} className="hover:bg-gray-700/40 transition-colors">
                <Link to={`/exercises/${exercise.id}`} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="font-medium text-white">{exercise.name}</p>
                    <p className="text-sm text-gray-400">
                      {exercise.description || t('common.noDescription')}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[exercise.status]}`}>
                    {t(`exercises.status.${exercise.status}`)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
