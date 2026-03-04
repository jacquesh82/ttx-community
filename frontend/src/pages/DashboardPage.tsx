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
    draft: 'bg-gray-100 text-gray-800',
    running: 'bg-green-100 text-green-800',
    paused: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-primary-100 text-primary-800',
    archived: 'bg-gray-100 text-gray-600',
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{t('nav.dashboard')}</h1>
        <p className="text-gray-600">{t('login.platformTagline')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-primary-100 rounded-lg">
              <Dumbbell className="text-primary-600" size={24} />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">{t('exercises.stats.active')}</p>
              <p className="text-2xl font-bold text-gray-900">
                {exercises.filter((e: any) => e.status === 'running').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Pause className="text-yellow-600" size={24} />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">{t('exercises.stats.paused')}</p>
              <p className="text-2xl font-bold text-gray-900">
                {exercises.filter((e: any) => e.status === 'paused').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="text-green-600" size={24} />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">{t('exercises.stats.completed')}</p>
              <p className="text-2xl font-bold text-gray-900">
                {exercises.filter((e: any) => e.status === 'completed').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">{t('exercises.recent')}</h2>
            <Link
              to="/exercises"
              className="text-primary-600 hover:text-primary-700 text-sm font-medium"
            >
              {t('common.viewAll')}
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 text-center text-gray-500">{t('common.loading')}</div>
        ) : exercises.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            {t('exercises.noneCreated')}
          </div>
        ) : (
          <ul className="divide-y">
            {exercises.slice(0, 5).map((exercise: any) => (
              <li key={exercise.id} className="p-4 hover:bg-gray-50">
                <Link to={`/exercises/${exercise.id}`} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{exercise.name}</p>
                    <p className="text-sm text-gray-500">
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
