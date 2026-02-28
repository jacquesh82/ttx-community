import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useSearchParams } from 'react-router-dom'
import { playerApi, PlayerEvent } from '../../services/playerApi'
import { usePlayer, useUpdateDelivery } from '../../contexts/PlayerContext'
import {
  Filter,
  Mail,
  Tv,
  MessageCircle,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  Reply,
} from 'lucide-react'

export default function PlayerTimelinePage() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { events, isLoading, refetchTimeline } = usePlayer()

  // Filter state
  const [channel, setChannel] = useState<string>('all')
  const [scope, setScope] = useState<string>('all')
  const [criticity, setCriticity] = useState<string>('all')

  // Update filters and refetch
  const handleFilterChange = () => {
    refetchTimeline()
  }

  // Acknowledge mutation
  const acknowledgeMutation = useMutation({
    mutationFn: (deliveryId: number) =>
      playerApi.updateDelivery(deliveryId, { acknowledge: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['player-timeline'] })
      queryClient.invalidateQueries({ queryKey: ['player-context'] })
    },
  })

  // Mark as treated mutation
  const treatMutation = useMutation({
    mutationFn: (deliveryId: number) =>
      playerApi.updateDelivery(deliveryId, { treat: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['player-timeline'] })
      queryClient.invalidateQueries({ queryKey: ['player-context'] })
    },
  })

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'mail':
        return <Mail size={16} />
      case 'tv':
        return <Tv size={16} />
      case 'social':
        return <MessageCircle size={16} />
      case 'decision':
        return <FileText size={16} />
      default:
        return <AlertTriangle size={16} />
    }
  }

  const getCriticityColor = (criticity: string) => {
    switch (criticity) {
      case 'critical':
        return 'border-l-red-500 bg-red-900/20'
      case 'important':
        return 'border-l-yellow-500 bg-yellow-900/20'
      default:
        return 'border-l-blue-500 bg-blue-900/20'
    }
  }

  const getVisibilityLabel = (visibility: string) => {
    switch (visibility) {
      case 'public':
        return '🌐 Public'
      case 'team':
        return '👥 Équipe'
      case 'personal':
        return '👤 Personnel'
      default:
        return ''
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Timeline</h1>
        <div className="text-sm text-gray-400">
          {events.length} événement{events.length > 1 ? 's' : ''}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-300">Filtres</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Channel filter */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Canal</label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
            >
              <option value="all">Tous</option>
              <option value="inject">Injects</option>
              <option value="mail">Mail</option>
              <option value="tv">TV</option>
              <option value="social">Social</option>
              <option value="decision">Décisions</option>
            </select>
          </div>

          {/* Scope filter */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Portée</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
            >
              <option value="all">Tout</option>
              <option value="public">Public</option>
              <option value="team">Mon équipe</option>
              <option value="me">Moi</option>
            </select>
          </div>

          {/* Criticity filter */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Criticité</label>
            <select
              value={criticity}
              onChange={(e) => setCriticity(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
            >
              <option value="all">Toutes</option>
              <option value="info">Info</option>
              <option value="important">Important</option>
              <option value="critical">Critique</option>
            </select>
          </div>
        </div>
      </div>

      {/* Events list */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4">Chargement...</p>
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Clock size={48} className="mx-auto mb-3 opacity-50" />
          <p>Aucun événement à afficher</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onAcknowledge={() => {
                // Would need delivery_id from event
              }}
              onTreat={() => {
                // Would need delivery_id from event
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface EventCardProps {
  event: PlayerEvent
  onAcknowledge?: () => void
  onTreat?: () => void
}

function EventCard({ event, onAcknowledge, onTreat }: EventCardProps) {
  const [expanded, setExpanded] = useState(false)

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'mail':
        return '📩'
      case 'tv':
        return '📺'
      case 'social':
        return '🐦'
      case 'decision':
        return '📌'
      default:
        return '⚠️'
    }
  }

  const getCriticityColor = (criticity: string) => {
    switch (criticity) {
      case 'critical':
        return 'border-l-red-500 bg-red-900/20'
      case 'important':
        return 'border-l-yellow-500 bg-yellow-900/20'
      default:
        return 'border-l-blue-500 bg-blue-900/20'
    }
  }

  const getVisibilityLabel = (visibility: string) => {
    switch (visibility) {
      case 'public':
        return '🌐 Public'
      case 'team':
        return '👥 Équipe'
      case 'personal':
        return '👤 Personnel'
      default:
        return ''
    }
  }

  return (
    <div
      className={`bg-gray-800 rounded-lg border-l-4 ${getCriticityColor(
        event.criticity
      )} border border-gray-700 overflow-hidden`}
    >
      <div
        className="p-4 cursor-pointer hover:bg-gray-700/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3">
          <span className="text-2xl">{event.icon || getChannelIcon(event.channel)}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-white">{event.title}</p>
                {event.description && (
                  <p className="text-sm text-gray-400 mt-1">{event.description}</p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-gray-400">
                  {new Date(event.ts).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                <span className="text-xs text-gray-500">
                  {getVisibilityLabel(event.visibility)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded actions */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-700 pt-3">
          <div className="flex items-center gap-2">
            {event.actions.includes('open') && (
              <button className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm flex items-center gap-1">
                <Eye size={14} />
                Ouvrir
              </button>
            )}
            {event.actions.includes('reply') && (
              <button className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-sm flex items-center gap-1">
                <Reply size={14} />
                Répondre
              </button>
            )}
            {event.actions.includes('acknowledge') && onAcknowledge && (
              <button
                onClick={onAcknowledge}
                className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 rounded text-sm flex items-center gap-1"
              >
                <Eye size={14} />
                Accuser réception
              </button>
            )}
            {event.actions.includes('create_decision') && (
              <button className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-sm flex items-center gap-1">
                <FileText size={14} />
                Créer décision
              </button>
            )}
            {event.actions.includes('mark_treated') && onTreat && (
              <button
                onClick={onTreat}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-sm flex items-center gap-1"
              >
                <CheckCircle size={14} />
                Marquer traité
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
