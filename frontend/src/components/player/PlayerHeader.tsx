import { Bell, Mail, MessageCircle, User, LogOut, Bot } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { PlayerStats, PlayerTeamInfo, PlayerExerciseInfo } from '../../services/playerApi'
import { useChatGptConnection } from '../../utils/chatgptConnection'

interface PlayerHeaderProps {
  exercise: PlayerExerciseInfo
  team: PlayerTeamInfo | null
  exerciseTime: string | null
  stats: PlayerStats
  unreadCount: number
}

export default function PlayerHeader({
  exercise,
  team,
  exerciseTime,
  stats,
  unreadCount,
}: PlayerHeaderProps) {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { isConnected, openChatGpt } = useChatGptConnection()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'running':
        return 'EN COURS'
      case 'paused':
        return 'EN PAUSE'
      case 'completed':
        return 'TERMINÉ'
      default:
        return 'EN ATTENTE'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-green-500'
      case 'paused':
        return 'bg-yellow-500'
      case 'completed':
        return 'bg-gray-500'
      default:
        return 'bg-gray-400'
    }
  }

  return (
    <header className="bg-gray-900 border-b border-gray-700 px-4 py-2">
      {/* Row 1: Exercise | Status | Time */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm">Exercice :</span>
          <span className="text-white font-bold">{exercise.name}</span>
          <span className="text-gray-500">|</span>
          <span
            className={`px-2 py-0.5 text-xs font-bold rounded ${getStatusColor(exercise.status)}`}
          >
            {getStatusLabel(exercise.status)}
          </span>
          <span className="text-gray-500">|</span>
          <span className="text-primary-400 font-mono font-bold">
            {exerciseTime || 'T+00:00'}
          </span>
        </div>
        
        {/* User profile on right */}
        <div className="flex items-center gap-2">
          {isConnected && (
            <button
              onClick={openChatGpt}
              className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 rounded text-xs font-medium"
              title="Ouvrir ChatGPT"
            >
              <Bot size={13} />
              ChatGPT
            </button>
          )}
          <div className="text-right">
            <p className="text-sm font-medium text-white">{user?.username}</p>
          </div>
          <div className="w-7 h-7 bg-gray-600 rounded-full flex items-center justify-center">
            <User size={14} className="text-gray-300" />
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
            title="Déconnexion"
          >
            <LogOut size={16} className="text-gray-400" />
          </button>
        </div>
      </div>
      
      {/* Row 2: Team | Notification icons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm">Équipe :</span>
          {team ? (
            <span className="px-2 py-0.5 bg-primary-600 text-xs font-bold rounded">
              {team.code}
            </span>
          ) : (
            <span className="text-gray-500 text-sm">Sans équipe</span>
          )}
          <span className="text-gray-500">|</span>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <Bell size={14} className="text-gray-400" />
              <span className="text-sm text-white">{unreadCount}</span>
            </span>
            <span className="flex items-center gap-1">
              <Mail size={14} className="text-gray-400" />
              <span className="text-sm text-white">{stats.messages_unread}</span>
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle size={14} className="text-gray-400" />
              <span className="text-sm text-white">0</span>
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
