/**
 * PlayerPhonePage - Simulated phone for incoming calls
 */
import { useState, useCallback, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Phone,
  PhoneOff,
  PhoneCall,
  PhoneMissed,
  Clock,
  User,
  Volume2,
  Mic,
  Voicemail,
  PhoneIncoming,
} from 'lucide-react'
import { simulatedApi, SimulatedCall, CallStatus } from '../../../services/simulatedApi'
import { useSimulatedWs } from '../../../hooks/useSimulatedWs'

export default function PlayerPhonePage() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const queryClient = useQueryClient()
  const [callDuration, setCallDuration] = useState(0)

  // Fetch active call
  const { data: activeCall } = useQuery({
    queryKey: ['active-call', exerciseId],
    queryFn: () => simulatedApi.getActiveCall(parseInt(exerciseId!)),
    enabled: !!exerciseId,
    refetchInterval: 2000, // Poll for active calls
  })

  // Fetch call history
  const { data: callHistory } = useQuery({
    queryKey: ['call-history', exerciseId],
    queryFn: () => simulatedApi.getCalls(parseInt(exerciseId!), true),
    enabled: !!exerciseId,
  })

  // Call action mutation
  const actionMutation = useMutation({
    mutationFn: ({ callId, action }: { callId: number; action: 'answer' | 'reject' | 'end' }) =>
      simulatedApi.handleCallAction(parseInt(exerciseId!), callId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-call', exerciseId] })
      queryClient.invalidateQueries({ queryKey: ['call-history', exerciseId] })
    },
  })

  // WebSocket for real-time updates
  const handleNewCall = useCallback((call: SimulatedCall) => {
    queryClient.setQueryData(['active-call', exerciseId], call)
  }, [exerciseId, queryClient])

  const { connectionState } = useSimulatedWs({
    exerciseId: parseInt(exerciseId!),
    onCall: handleNewCall,
  })

  // Track call duration
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null

    if (activeCall?.status === 'ANSWERED') {
      interval = setInterval(() => {
        if (activeCall.started_at) {
          const started = new Date(activeCall.started_at).getTime()
          const now = Date.now()
          setCallDuration(Math.floor((now - started) / 1000))
        }
      }, 1000)
    } else {
      setCallDuration(0)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [activeCall])

  const handleAnswer = () => {
    if (activeCall) {
      actionMutation.mutate({ callId: activeCall.id, action: 'answer' })
    }
  }

  const handleReject = () => {
    if (activeCall) {
      actionMutation.mutate({ callId: activeCall.id, action: 'reject' })
    }
  }

  const handleEnd = () => {
    if (activeCall) {
      actionMutation.mutate({ callId: activeCall.id, action: 'end' })
    }
  }

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusIcon = (status: CallStatus) => {
    switch (status) {
      case 'RINGING':
        return <PhoneIncoming className="text-yellow-500" size={20} />
      case 'ANSWERED':
        return <PhoneCall className="text-green-500" size={20} />
      case 'MISSED':
        return <PhoneMissed className="text-red-500" size={20} />
      case 'REJECTED':
        return <PhoneOff className="text-orange-500" size={20} />
      default:
        return <Phone className="text-gray-500" size={20} />
    }
  }

  const getStatusLabel = (status: CallStatus): string => {
    switch (status) {
      case 'RINGING':
        return 'Appel entrant'
      case 'ANSWERED':
        return 'Répondu'
      case 'MISSED':
        return 'Appel manqué'
      case 'REJECTED':
        return 'Refusé'
      case 'ENDED':
        return 'Terminé'
      default:
        return status
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Phone className="w-6 h-6 text-green-500" />
            <h1 className="text-xl font-bold">Téléphone</h1>
          </div>
          <div className={`w-2 h-2 rounded-full ${
            connectionState === 'connected' ? 'bg-green-500' :
            connectionState === 'connecting' ? 'bg-yellow-500 animate-pulse' :
            'bg-red-500'
          }`} />
        </div>
      </header>

      {/* Active Call / Incoming Call */}
      {activeCall && (
        <div className={`p-6 ${
          activeCall.status === 'RINGING' ? 'bg-yellow-900/30 animate-pulse' :
          activeCall.status === 'ANSWERED' ? 'bg-green-900/30' :
          'bg-gray-800'
        }`}>
          <div className="text-center">
            {/* Caller info */}
            <div className="mb-6">
              <div className="w-24 h-24 mx-auto rounded-full bg-gray-700 flex items-center justify-center mb-4">
                <User size={48} className="text-gray-400" />
              </div>
              <h2 className="text-2xl font-bold">{activeCall.caller_name}</h2>
              {activeCall.caller_phone && (
                <p className="text-gray-400">{activeCall.caller_phone}</p>
              )}
              <p className="text-sm text-gray-500 mt-1">
                {getStatusLabel(activeCall.status)}
              </p>
            </div>

            {/* Call duration for answered calls */}
            {activeCall.status === 'ANSWERED' && (
              <div className="text-3xl font-mono text-green-400 mb-6">
                {formatDuration(callDuration)}
              </div>
            )}

            {/* Call controls */}
            <div className="flex justify-center gap-6">
              {activeCall.status === 'RINGING' && (
                <>
                  <button
                    onClick={handleReject}
                    className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors"
                  >
                    <PhoneOff size={28} />
                  </button>
                  <button
                    onClick={handleAnswer}
                    className="w-16 h-16 rounded-full bg-green-600 hover:bg-green-700 flex items-center justify-center transition-colors"
                  >
                    <Phone size={28} />
                  </button>
                </>
              )}

              {activeCall.status === 'ANSWERED' && (
                <>
                  <button className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center">
                    <Mic size={20} />
                  </button>
                  <button
                    onClick={handleEnd}
                    className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors"
                  >
                    <PhoneOff size={28} />
                  </button>
                  <button className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center">
                    <Volume2 size={20} />
                  </button>
                </>
              )}
            </div>

            {/* Voicemail indicator */}
            {activeCall.voicemail_transcript && activeCall.status === 'MISSED' && (
              <div className="mt-6 p-4 bg-gray-800 rounded-lg text-left">
                <div className="flex items-center gap-2 text-gray-400 mb-2">
                  <Voicemail size={16} />
                  <span className="text-sm">Message vocal</span>
                </div>
                <p className="text-gray-300">{activeCall.voicemail_transcript}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Call History */}
      <div className="p-4">
        <h3 className="text-sm font-medium text-gray-400 uppercase mb-3">
          Historique des appels
        </h3>

        {!callHistory || callHistory.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Phone size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Aucun appel</p>
          </div>
        ) : (
          <div className="space-y-2">
            {callHistory.map((call) => (
              <div
                key={call.id}
                className="bg-gray-800 rounded-lg p-3 flex items-center gap-3"
              >
                {getStatusIcon(call.status)}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{call.caller_name}</span>
                    <span className="text-xs text-gray-500">
                      {formatTime(call.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <span>{getStatusLabel(call.status)}</span>
                    {call.duration_seconds && (
                      <>
                        <span>·</span>
                        <span>{formatDuration(call.duration_seconds)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
