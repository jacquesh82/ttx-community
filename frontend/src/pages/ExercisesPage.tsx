import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Modal from '../components/Modal'
import { Exercise, exercisesApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { Plus, Dumbbell, Play, Trash2 } from 'lucide-react'

export default function ExercisesPage() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['exercises'],
    queryFn: () => exercisesApi.list({ page: 1, page_size: 50 }),
  })

  const { user } = useAuthStore()
  const isParticipant = user?.role === 'participant'
  const isAdmin = user?.role === 'admin'
  const queryClient = useQueryClient()

  const [exerciseToDelete, setExerciseToDelete] = useState<Exercise | null>(null)

  const deleteMutation = useMutation({
    mutationFn: (exerciseId: number) => exercisesApi.delete(exerciseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] })
    },
  })

  const openDeleteModal = (exercise: Exercise) => {
    setExerciseToDelete(exercise)
  }

  const closeDeleteModal = () => {
    setExerciseToDelete(null)
  }

  const confirmDelete = () => {
    if (!exerciseToDelete) return
    deleteMutation.mutate(exerciseToDelete.id, {
      onSuccess: closeDeleteModal,
    })
  }

  const exercises = data?.exercises || []

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    running: 'bg-green-100 text-green-800',
    paused: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-blue-100 text-blue-800',
    archived: 'bg-gray-100 text-gray-600',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isParticipant ? t('exercises.titleParticipant') : t('exercises.title')}
          </h1>
          <p className="text-gray-600">
            {isParticipant ? t('exercises.subtitleParticipant') : t('exercises.subtitle')}
          </p>
        </div>
        {!isParticipant && (
          <Link
            to="/exercises/new"
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            <Plus className="mr-2" size={20} />
            {t('exercises.new')}
          </Link>
        )}
      </div>

      {isParticipant && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800 text-sm">
            <strong>{t('exercises.participantWelcome')}</strong><br />
            {t('exercises.participantInfo')}
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">{t('common.loading')}</div>
      ) : exercises.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <Dumbbell className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-500 mb-4">{t('exercises.noneCreated')}</p>
          <Link
            to="/exercises/new"
            className="text-primary-600 hover:text-primary-700"
          >
            {t('exercises.createFirst')}
          </Link>
        </div>
      ) : (
        <>
          {deleteMutation.isError && (
            <div className="mb-4 text-sm text-red-600">
              {t('exercises.deleteError')}
            </div>
          )}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('exercises.columns.name')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('exercises.columns.status')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('exercises.columns.createdAt')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('exercises.columns.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {exercises.map((exercise: any) => (
                  <tr key={exercise.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {exercise.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {exercise.description?.substring(0, 50)}
                        {exercise.description?.length > 50 ? '...' : ''}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[exercise.status]}`}>
                        {t(`exercises.status.${exercise.status}`)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(exercise.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        {isParticipant && (exercise.status === 'running' || exercise.status === 'paused') ? (
                          <Link
                            to={`/play/${exercise.id}`}
                            className="inline-flex items-center px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            <Play className="mr-1" size={14} />
                            {t('exercises.join')}
                          </Link>
                        ) : (
                          <Link
                            to={`/exercises/${exercise.id}`}
                            className="text-primary-600 hover:text-primary-700"
                          >
                            {t('common.viewDetails')}
                          </Link>
                        )}
                        {!isParticipant && isAdmin && (
                          <button
                            type="button"
                            onClick={() => openDeleteModal(exercise)}
                            disabled={deleteMutation.isPending}
                            className="p-2 rounded-full text-red-600 hover:bg-red-50 disabled:text-red-200 disabled:cursor-not-allowed"
                            aria-label={t('common.delete')}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Modal
        isOpen={Boolean(exerciseToDelete)}
        onClose={closeDeleteModal}
        title={t('exercises.deleteTitle')}
      >
        <p className="text-sm text-gray-700">
          {t('exercises.deleteConfirm', { name: exerciseToDelete?.name })}
        </p>
        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={closeDeleteModal}
            className="px-4 py-2 rounded border border-gray-200 text-gray-700 hover:bg-gray-100"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={deleteMutation.isPending}
            className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed"
          >
            {t('common.delete')}
          </button>
        </div>
      </Modal>
    </div>
  )
}
