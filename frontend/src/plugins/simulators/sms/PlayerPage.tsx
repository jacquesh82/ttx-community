/**
 * PlayerSMSPage - SMS messages interface (iMessage style)
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MessageSquare,
  Send,
  Phone,
  User,
  ChevronLeft,
  Check,
  CheckCheck,
} from 'lucide-react'
import { simulatedApi, SimulatedSms, SimulatedSmsConversation } from '../../../services/simulatedApi'
import LoadingScreen from '../../../components/LoadingScreen'
import { useSimulatedWs } from '../../../hooks/useSimulatedWs'

export default function PlayerSMSPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const queryClient = useQueryClient()
  const [selectedConversation, setSelectedConversation] = useState<SimulatedSmsConversation | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Fetch SMS conversations
  const { data: conversations, isLoading } = useQuery({
    queryKey: ['sms-conversations', exerciseId],
    queryFn: () => simulatedApi.getSmsConversations(parseInt(exerciseId!)),
    enabled: !!exerciseId,
  })

  // Send SMS mutation
  const sendMutation = useMutation({
    mutationFn: ({ toContactId, content }: { toContactId: number; content: string }) =>
      simulatedApi.sendSms(parseInt(exerciseId!), toContactId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-conversations', exerciseId] })
      setNewMessage('')
    },
  })

  // WebSocket for real-time updates
  const handleNewSms = useCallback((sms: SimulatedSms) => {
    queryClient.invalidateQueries({ queryKey: ['sms-conversations', exerciseId] })
  }, [exerciseId, queryClient])

  const { connectionState } = useSimulatedWs({
    exerciseId: parseInt(exerciseId!),
    onSms: handleNewSms,
  })

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selectedConversation?.messages])

  // Keep selected conversation in sync when data refreshes
  useEffect(() => {
    if (!selectedConversation || !conversations) return
    const updated = conversations.find(
      (c: SimulatedSmsConversation) =>
        c.contact_id === selectedConversation.contact_id &&
        c.contact_phone === selectedConversation.contact_phone
    )
    if (updated) {
      setSelectedConversation(updated)
    }
  }, [conversations, selectedConversation])

  const handleSend = () => {
    if (!newMessage.trim() || !selectedConversation?.contact_id) return
    sendMutation.mutate({
      toContactId: selectedConversation.contact_id,
      content: newMessage.trim(),
    })
  }

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return "Aujourd'hui"
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Hier'
    }
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  // Group messages by date
  const groupMessagesByDate = (messages: SimulatedSms[]) => {
    const groups: { date: string; messages: SimulatedSms[] }[] = []
    let currentGroup: { date: string; messages: SimulatedSms[] } | null = null

    for (const msg of messages) {
      const msgDate = formatDate(msg.sent_at)
      if (!currentGroup || currentGroup.date !== msgDate) {
        currentGroup = { date: msgDate, messages: [msg] }
        groups.push(currentGroup)
      } else {
        currentGroup.messages.push(msg)
      }
    }
    return groups
  }

  // Mobile: show conversation list or messages
  const showConversationList = !selectedConversation

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          {selectedConversation ? (
            <>
              <button
                onClick={() => setSelectedConversation(null)}
                className="flex items-center gap-2 text-primary-500"
              >
                <ChevronLeft size={20} />
                <span>Retour</span>
              </button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                  <User size={16} className="text-gray-600" />
                </div>
                <div className="text-center">
                  <h1 className="font-semibold text-gray-900">
                    {selectedConversation.contact_name}
                  </h1>
                  {selectedConversation.contact_phone && (
                    <p className="text-xs text-gray-500">
                      {selectedConversation.contact_phone}
                    </p>
                  )}
                </div>
              </div>
              <div className="w-16" /> {/* Spacer */}
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <MessageSquare className="w-6 h-6 text-green-500" />
                <h1 className="text-xl font-bold text-gray-900">SMS</h1>
              </div>
              <div className={`w-2 h-2 rounded-full ${
                connectionState === 'connected' ? 'bg-green-500' :
                connectionState === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                'bg-red-500'
              }`} />
            </>
          )}
        </div>
      </header>

      {/* Content */}
      {isLoading ? (
        <LoadingScreen />
      ) : !conversations || conversations.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
          <MessageSquare size={48} className="mb-4 opacity-50" />
          <p className="text-lg">Aucun message</p>
          <p className="text-sm mt-1">Les SMS apparaîtront ici</p>
        </div>
      ) : showConversationList ? (
        /* Conversation List */
        <div className="divide-y divide-gray-200 bg-white">
          {conversations.map((conv: SimulatedSmsConversation) => {
            const lastMessage = conv.messages[conv.messages.length - 1]
            return (
              <button
                key={conv.contact_id || conv.contact_phone}
                className="w-full p-4 hover:bg-gray-50 flex items-center gap-3 text-left"
                onClick={() => setSelectedConversation(conv)}
              >
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold text-lg">
                  {conv.contact_name?.charAt(0) || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900">
                      {conv.contact_name}
                    </span>
                    <span className="text-xs text-gray-500">
                      {lastMessage ? formatTime(lastMessage.sent_at) : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500 truncate">
                      {lastMessage?.content || 'Aucun message'}
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="ml-2 px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        /* Message View */
        <div className="flex-1 flex flex-col bg-gray-100">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4">
            {groupMessagesByDate(selectedConversation.messages).map((group) => (
              <div key={group.date}>
                {/* Date separator */}
                <div className="flex justify-center my-4">
                  <span className="px-3 py-1 bg-gray-200 rounded-full text-xs text-gray-600">
                    {group.date}
                  </span>
                </div>

                {/* Messages */}
                {group.messages.map((msg: SimulatedSms) => (
                  <div
                    key={msg.id}
                    className={`flex mb-2 ${msg.is_from_player ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] px-4 py-2 rounded-2xl ${
                        msg.is_from_player
                          ? 'bg-green-500 text-white rounded-br-md'
                          : 'bg-white text-gray-900 rounded-bl-md shadow-sm'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      <div
                        className={`flex items-center justify-end gap-1 mt-1 ${
                          msg.is_from_player ? 'text-green-100' : 'text-gray-400'
                        }`}
                      >
                        <span className="text-xs">
                          {formatTime(msg.sent_at)}
                        </span>
                        {msg.is_from_player && (
                          msg.is_read
                            ? <CheckCheck size={14} />
                            : <Check size={14} />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="bg-white border-t border-gray-200 p-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Message..."
                className="flex-1 px-4 py-2 bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={handleSend}
                disabled={!newMessage.trim() || sendMutation.isPending}
                className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
