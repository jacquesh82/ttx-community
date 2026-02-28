import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Phone,
  PhoneCall,
  PhoneOff,
  Clock,
  User,
  Loader2,
  PhoneIncoming,
  PhoneOutgoing,
  X,
} from 'lucide-react'
import { simulatedApi, SimulatedCall } from '../../../services/simulatedApi'

interface TelSimulatorProps {
  exerciseId: number
  refreshKey?: number
}

type CallStatus = 'RINGING' | 'ANSWERED' | 'MISSED' | 'ENDED' | 'REJECTED'

const getStatusColor = (status: CallStatus) => {
  switch (status) {
    case 'RINGING':
      return 'text-yellow-400 bg-yellow-400/20'
    case 'ANSWERED':
      return 'text-green-400 bg-green-400/20'
    case 'MISSED':
      return 'text-red-400 bg-red-400/20'
    case 'REJECTED':
      return 'text-gray-400 bg-gray-400/20'
    case 'ENDED':
      return 'text-gray-400 bg-gray-400/20'
    default:
      return 'text-gray-400 bg-gray-400/20'
  }
}

const getStatusLabel = (status: CallStatus) => {
  switch (status) {
    case 'RINGING':
      return 'Sonne'
    case 'ANSWERED':
      return 'En cours'
    case 'MISSED':
      return 'Manqué'
    case 'REJECTED':
      return 'Refusé'
    case 'ENDED':
      return 'Terminé'
    default:
      return status
  }
}

export default function TelSimulator({ exerciseId, refreshKey }: TelSimulatorProps) {
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active')
  const queryClient = useQueryClient()

  // Fetch active call
  const { data: activeCall, isLoading: isLoadingActive, refetch: refetchActive } = useQuery({
    queryKey: ['simulated-active-call', exerciseId],
    queryFn: () => simulatedApi.getActiveCall(exerciseId),
  })

  // Fetch call history
  const { data: callHistory = [], isLoading: isLoadingHistory, refetch: refetchHistory } = useQuery({
    queryKey: ['simulated-calls', exerciseId],
    queryFn: () => simulatedApi.getCalls(exerciseId, true),
  })

  // Handle call action mutation
  const handleActionMutation = useMutation({
    mutationFn: (data: { callId: number; action: 'answer' | 'reject' | 'end' }) =>
      simulatedApi.handleCallAction(exerciseId, data.callId, data.action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulated-active-call', exerciseId] })
      queryClient.invalidateQueries({ queryKey: ['simulated-calls', exerciseId] })
    },
  })

  // Invalidate queries on WebSocket refresh
  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      queryClient.invalidateQueries({ queryKey: ['simulated-active-call', exerciseId] })
      queryClient.invalidateQueries({ queryKey: ['simulated-calls', exerciseId] })
    }
  }, [refreshKey, exerciseId, queryClient])

  // Auto-refresh every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetchActive()
      refetchHistory()
    }, 3000)
    return () => clearInterval(interval)
  }, [refetchActive, refetchHistory])

  const handleAnswer = () => {
    if (activeCall) {
      handleActionMutation.mutate({ callId: activeCall.id, action: 'answer' })
    }
  }

  const handleReject = () => {
    if (activeCall) {
      handleActionMutation.mutate({ callId: activeCall.id, action: 'reject' })
    }
  }

  const handleEnd = () => {
    if (activeCall) {
      handleActionMutation.mutate({ callId: activeCall.id, action: 'end' })
    }
  }

  const formatTime = (dateString: string | null) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const incomingCalls = callHistory.filter(c => !c.is_from_player)
  const outgoingCalls = callHistory.filter(c => c.is_from_player)

  return (
    <div className="h-full flex flex-col bg-gray-800 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <Phone className="w-5 h-5 text-yellow-400" />
          <h2 className="text-lg font-semibold text-white">Téléphone</h2>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setActiveTab('active')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'active'
              ? 'text-yellow-400 border-b-2 border-yellow-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <PhoneCall size={16} />
            Appel en cours
            {activeCall && (
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            )}
          </div>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'history'
              ? 'text-yellow-400 border-b-2 border-yellow-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Clock size={16} />
            Historique ({callHistory.length})
          </div>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'active' ? (
          <div className="h-full flex flex-col">
            {isLoadingActive ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-yellow-500" />
              </div>
            ) : activeCall ? (
              <div className="flex flex-col items-center justify-center h-full space-y-6">
                {/* Caller info */}
                <div className="text-center">
                  <div className="w-20 h-20 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <User className="w-10 h-10 text-yellow-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-white">
                    {activeCall.is_from_player ? activeCall.callee_name : activeCall.caller_name}
                  </h3>
                  <p className="text-gray-400">
                    {activeCall.is_from_player ? activeCall.callee_phone : activeCall.caller_phone}
                  </p>
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full mt-3 ${getStatusColor(activeCall.status)}`}>
                    <span>{getStatusLabel(activeCall.status)}</span>
                  </div>
                </div>

                {/* Call duration */}
                {activeCall.status === 'ANSWERED' && activeCall.duration_seconds && (
                  <div className="text-2xl font-mono text-white">
                    {formatDuration(activeCall.duration_seconds)}
                  </div>
                )}

                {/* Call actions */}
                {activeCall.status === 'RINGING' && !activeCall.is_from_player && (
                  <div className="flex items-center gap-6">
                    <button
                      onClick={handleReject}
                      disabled={handleActionMutation.isPending}
                      className="w-16 h-16 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center disabled:opacity-50"
                    >
                      <PhoneOff className="w-8 h-8" />
                    </button>
                    <button
                      onClick={handleAnswer}
                      disabled={handleActionMutation.isPending}
                      className="w-16 h-16 bg-green-600 hover:bg-green-700 rounded-full flex items-center justify-center disabled:opacity-50"
                    >
                      <PhoneCall className="w-8 h-8" />
                    </button>
                  </div>
                )}

                {(activeCall.status === 'ANSWERED' || activeCall.status === 'RINGING') && (
                  <button
                    onClick={handleEnd}
                    disabled={handleActionMutation.isPending}
                    className="flex items-center gap-2 px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg disabled:opacity-50"
                  >
                    <X className="w-5 h-5" />
                    Raccrocher
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <Phone className="w-16 h-16 opacity-50 mb-4" />
                <p className="text-lg font-medium">Aucun appel en cours</p>
                <p className="text-sm mt-2">
                  Les appels reçus ou passés apparaîtront ici
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Incoming calls */}
            {incomingCalls.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                  <PhoneIncoming size={14} />
                  Reçus ({incomingCalls.length})
                </h3>
                <div className="space-y-2">
                  {incomingCalls.map((call) => (
                    <div
                      key={call.id}
                      className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-yellow-500/20 rounded-full flex items-center justify-center">
                          <User size={16} className="text-yellow-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{call.caller_name}</p>
                          <p className="text-xs text-gray-400">{call.caller_phone}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xs px-2 py-0.5 rounded-full inline-block ${getStatusColor(call.status)}`}>
                          {getStatusLabel(call.status)}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatTime(call.started_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Outgoing calls */}
            {outgoingCalls.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                  <PhoneOutgoing size={14} />
                  Émis ({outgoingCalls.length})
                </h3>
                <div className="space-y-2">
                  {outgoingCalls.map((call) => (
                    <div
                      key={call.id}
                      className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                          <User size={16} className="text-blue-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{call.callee_name}</p>
                          <p className="text-xs text-gray-400">{call.callee_phone}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xs px-2 py-0.5 rounded-full inline-block ${getStatusColor(call.status)}`}>
                          {getStatusLabel(call.status)}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatTime(call.started_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {callHistory.length === 0 && !isLoadingHistory && (
              <div className="text-center text-gray-500 py-8">
                <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Aucun historique d'appel</p>
              </div>
            )}

            {isLoadingHistory && (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-yellow-500" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
