import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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

  const navigate = useNavigate()
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

  const openDeleteModal = (exercise: Exercise) => setExerciseToDelete(exercise)
  const closeDeleteModal = () => setExerciseToDelete(null)
  const confirmDelete = () => {
    if (!exerciseToDelete) return
    deleteMutation.mutate(exerciseToDelete.id, { onSuccess: closeDeleteModal })
  }

  const exercises = data?.exercises || []

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {isParticipant ? t('exercises.titleParticipant') : t('exercises.title')}
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              {isParticipant ? t('exercises.subtitleParticipant') : t('exercises.subtitle')}
            </p>
          </div>
          {!isParticipant && (
            <Link
              to="/exercises/new"
              className="flex items-center gap-2 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
            >
              <Plus size={16} />
              {t('exercises.new')}
            </Link>
          )}
        </div>
      </div>

      {isParticipant && (
        <div className="rounded-xl border border-primary-500/30 bg-primary-500/10 px-4 py-3 text-sm text-primary-300">
          <strong className="text-primary-200">{t('exercises.participantWelcome')}</strong>
          <br />
          {t('exercises.participantInfo')}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">{t('common.loading')}</div>
      ) : exercises.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-xl py-12 text-center">
          <Dumbbell className="mx-auto text-gray-600 mb-4" size={48} />
          <p className="text-gray-400 mb-4">{t('exercises.noneCreated')}</p>
          <Link to="/exercises/new" className="text-primary-400 hover:text-primary-300">
            {t('exercises.createFirst')}
          </Link>
        </div>
      ) : (
        <>
          {deleteMutation.isError && (
            <div className="text-sm text-red-400 bg-red-900/30 border border-red-700/50 rounded-lg px-4 py-3">
              {t('exercises.deleteError')}
            </div>
          )}
          <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
            <table className="min-w-full divide-y divide-gray-700">
              <thead className="bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-full">
                    {t('exercises.columns.name')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {t('exercises.columns.status')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {t('exercises.columns.createdAt')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {t('exercises.columns.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {exercises.map((exercise: any) => (
                  <tr
                    key={exercise.id}
                    className="hover:bg-gray-700/40 transition-colors cursor-pointer"
                    onClick={() => navigate(`/exercises/${exercise.id}`)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-white">{exercise.name}</div>
                      <div className="text-sm text-gray-400">
                        {exercise.description?.substring(0, 50)}
                        {exercise.description?.length > 50 ? '...' : ''}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-left">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[exercise.status]}`}>
                        {t(`exercises.status.${exercise.status}`)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-left text-sm text-gray-400">
                      {new Date(exercise.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-left text-sm" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        {isParticipant && (exercise.status === 'running' || exercise.status === 'paused') && (
                          <Link
                            to={`/play/${exercise.id}`}
                            className="inline-flex items-center px-3 py-1 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                          >
                            <Play className="mr-1" size={14} />
                            {t('exercises.join')}
                          </Link>
                        )}
                        {!isParticipant && isAdmin && (
                          <button
                            type="button"
                            onClick={() => openDeleteModal(exercise)}
                            disabled={deleteMutation.isPending}
                            className="p-2 rounded-full text-red-400 hover:bg-red-900/30 disabled:text-red-800 disabled:cursor-not-allowed"
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
        <p className="text-sm text-gray-300">
          {t('exercises.deleteConfirm', { name: exerciseToDelete?.name })}
        </p>
        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={closeDeleteModal}
            className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={deleteMutation.isPending}
            className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('common.delete')}
          </button>
        </div>
      </Modal>
    </div>
  )
}
