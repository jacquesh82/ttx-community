import { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import PlayerHeader from './PlayerHeader'
import PlayerSidebar from './PlayerSidebar'
import ToastNotifications from './ToastNotifications'
import { usePlayer } from '../../contexts/PlayerContext'

interface PlayerLayoutProps {
  children: ReactNode
}

export default function PlayerLayout({ children }: PlayerLayoutProps) {
  const { context, isLoading, error, errorCode, notifications, unreadCount } = usePlayer()
  const navigate = useNavigate()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
          <p className="text-gray-400 mt-4">Chargement de l'exercice...</p>
        </div>
      </div>
    )
  }

  if (error || !context) {
    // Check for specific error cases
    const isNotAssigned = errorCode === 403 && error === 'Not assigned to this exercise'
    
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 rounded-xl shadow-lg border border-gray-700 p-6 text-center">
          <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${isNotAssigned ? 'bg-yellow-900/50' : 'bg-red-900/50'}`}>
            <AlertTriangle size={32} className={isNotAssigned ? 'text-yellow-400' : 'text-red-400'} />
          </div>
          
          <h2 className="text-xl font-semibold text-white mb-2">
            {isNotAssigned ? 'Accès non autorisé' : 'Impossible de charger l\'exercice'}
          </h2>
          
          <p className="text-gray-400 mb-6">
            {isNotAssigned 
              ? 'Vous n\'êtes pas assigné(e) à cet exercice. Veuillez contacter l\'animateur pour rejoindre une équipe.'
              : error || 'Une erreur est survenue lors du chargement de l\'exercice.'
            }
          </p>
          
          <button
            onClick={() => navigate('/participant')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <ArrowLeft size={18} />
            Retour à la liste des exercices
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header - always visible */}
      <PlayerHeader
        exercise={context.exercise}
        team={context.team}
        exerciseTime={context.exercise_time}
        stats={context.stats}
        unreadCount={unreadCount}
      />

      {/* Main content area with sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <PlayerSidebar exerciseId={context.exercise.id.toString()} />

        {/* Main content */}
        <main className="flex-1 overflow-auto bg-gray-800">
          <div className="p-6 h-full">
            {children}
          </div>
        </main>
      </div>

      {/* Toast notifications */}
      <ToastNotifications notifications={notifications} />
    </div>
  )
}
