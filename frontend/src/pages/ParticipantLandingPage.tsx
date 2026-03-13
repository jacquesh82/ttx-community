import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { exercisesApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { Play, Clock, Users, Pause, CheckCircle, LogOut } from 'lucide-react'
import LoadingScreen from '../components/LoadingScreen'
import { authApi } from '../services/api'

/**
 * Page d'accueil pour les participants (rôle "participant").
 * Affiche les exercices en cours auxquels l'utilisateur peut accéder
 * et permet de rejoindre directement un exercice actif.
 */
export default function ParticipantLandingPage({ embedded = false }: { embedded?: boolean }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['exercises-participant'],
    queryFn: () => exercisesApi.list({ page: 1, page_size: 50 }),
    refetchInterval: 30000, // Rafraîchir toutes les 30s pour détecter les nouveaux exercices
  })

  const exercises = data?.exercises ?? []

  // Trier : en cours en premier, en pause, puis brouillon, terminé en dernier
  const statusOrder: Record<string, number> = {
    running: 0,
    paused: 1,
    draft: 2,
    completed: 3,
    archived: 4,
  }
  const sortedExercises = [...exercises].sort(
    (a: any, b: any) =>
      (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
  )

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch (_) {}
    logout()
    navigate('/login')
  }

  const handleJoin = (exerciseId: number) => {
    navigate(`/play/${exerciseId}`)
  }

  const statusConfig: Record<string, { label: string; color: string; dot: string; canJoin: boolean }> = {
    running: {
      label: 'En cours',
      color: 'bg-green-100 text-green-800',
      dot: 'bg-green-500',
      canJoin: true,
    },
    paused: {
      label: 'En pause',
      color: 'bg-yellow-100 text-yellow-800',
      dot: 'bg-yellow-500',
      canJoin: true,
    },
    draft: {
      label: 'À venir',
      color: 'bg-gray-100 text-gray-600',
      dot: 'bg-gray-400',
      canJoin: false,
    },
    completed: {
      label: 'Terminé',
      color: 'bg-primary-100 text-primary-700',
      dot: 'bg-primary-400',
      canJoin: false,
    },
    archived: {
      label: 'Archivé',
      color: 'bg-gray-100 text-gray-500',
      dot: 'bg-gray-300',
      canJoin: false,
    },
  }

  const activeCount = exercises.filter((e: any) => e.status === 'running').length

  const content = (
    <>
      {/* Welcome banner */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">
          Bonjour, {user?.username} 👋
        </h2>
        <p className="text-gray-600 mt-1">
          {activeCount > 0
            ? `${activeCount} exercice${activeCount > 1 ? 's' : ''} en cours – rejoignez votre équipe !`
            : 'Aucun exercice actif pour le moment. En attente du démarrage...'}
        </p>
      </div>

        {/* Active exercise highlight */}
        {activeCount > 0 && (
          <div className="mb-6">
            {sortedExercises
              .filter((e: any) => e.status === 'running')
              .map((exercise: any) => (
                <div
                  key={exercise.id}
                  className="bg-green-50 border-2 border-green-300 rounded-xl p-5 flex items-center justify-between shadow-sm mb-3"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <Play size={20} className="text-white ml-0.5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-xs font-medium text-green-700 uppercase tracking-wide">
                          En cours maintenant
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">{exercise.name}</h3>
                      {exercise.description && (
                        <p className="text-sm text-gray-600 mt-0.5 line-clamp-1">
                          {exercise.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleJoin(exercise.id)}
                    className="flex-shrink-0 ml-4 flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-2.5 rounded-lg transition-colors shadow-sm"
                  >
                    <Play size={16} />
                    Rejoindre
                  </button>
                </div>
              ))}
          </div>
        )}

        {/* All exercises list */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Tous les exercices</h3>
          </div>

          {isLoading ? (
            <LoadingScreen />
          ) : sortedExercises.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Clock size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="font-medium">Aucun exercice disponible</p>
              <p className="text-sm mt-1">L'animateur n'a pas encore créé d'exercice.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {sortedExercises.map((exercise: any) => {
                const cfg = statusConfig[exercise.status] ?? {
                  label: exercise.status,
                  color: 'bg-gray-100 text-gray-600',
                  dot: 'bg-gray-400',
                  canJoin: false,
                }
                return (
                  <li key={exercise.id} className="px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{exercise.name}</p>
                        {exercise.description && (
                          <p className="text-sm text-gray-500 truncate">{exercise.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      {cfg.canJoin ? (
                        <button
                          onClick={() => handleJoin(exercise.id)}
                          className="text-sm font-medium text-primary-600 hover:text-primary-800 hover:underline"
                        >
                          Rejoindre →
                        </button>
                      ) : exercise.status === 'completed' ? (
                        <span className="text-sm text-gray-400 flex items-center gap-1">
                          <CheckCircle size={14} />
                          Terminé
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400 flex items-center gap-1">
                          <Clock size={14} />
                          En attente
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

      {/* Info footer */}
      <p className="text-center text-xs text-gray-400 mt-6">
        Cette page se rafraîchit automatiquement toutes les 30 secondes.
      </p>
    </>
  )

  if (embedded) {
    return <div className="space-y-6 max-w-3xl mx-auto">{content}</div>
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">TTX Platform</h1>
            <p className="text-sm text-gray-500">Espace participant</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-800">{user?.username}</p>
              <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
              title="Déconnexion"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
        {content}
      </main>
    </div>
  )
}
