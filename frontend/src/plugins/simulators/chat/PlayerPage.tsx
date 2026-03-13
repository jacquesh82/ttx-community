import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { playerApi, ChatRoom, ChatMessage } from '../../../services/playerApi'
import { Send, Hash, Users, Plus, ChevronRight } from 'lucide-react'

export default function PlayerChatPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const queryClient = useQueryClient()
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null)
  const [messageInput, setMessageInput] = useState('')

  // Fetch rooms
  const { data: rooms = [] } = useQuery({
    queryKey: ['player-chat-rooms', exerciseId],
    queryFn: () => playerApi.getChatRooms(parseInt(exerciseId!)),
    enabled: !!exerciseId,
  })

  // Fetch messages for selected room
  const { data: messages = [] } = useQuery({
    queryKey: ['player-chat-messages', exerciseId, selectedRoom?.id],
    queryFn: () => playerApi.getChatMessages(parseInt(exerciseId!), selectedRoom!.id),
    enabled: !!exerciseId && !!selectedRoom,
  })

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: () =>
      playerApi.sendChatMessage(parseInt(exerciseId!), selectedRoom!.id, messageInput),
    onSuccess: () => {
      setMessageInput('')
      queryClient.invalidateQueries({
        queryKey: ['player-chat-messages', exerciseId, selectedRoom?.id],
      })
    },
  })

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (messageInput.trim() && selectedRoom) {
      sendMessageMutation.mutate()
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="h-[calc(100vh-200px)] flex flex-col">
      <h1 className="text-2xl font-bold text-white mb-4">Chat</h1>

      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Rooms list */}
        <div className="w-64 bg-gray-800 rounded-lg border border-gray-700 flex flex-col">
          <div className="p-3 border-b border-gray-700">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Salons
            </h2>
          </div>
          <div className="flex-1 overflow-auto">
            {rooms.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                <p className="text-sm">Aucun salon disponible</p>
              </div>
            ) : (
              <ul className="p-2 space-y-1">
                {rooms.map((room) => (
                  <li key={room.id}>
                    <button
                      onClick={() => setSelectedRoom(room)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                        selectedRoom?.id === room.id
                          ? 'bg-primary-600 text-white'
                          : 'hover:bg-gray-700 text-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Hash size={16} />
                        <span className="text-sm">{room.name}</span>
                      </div>
                      {room.unread_count > 0 && (
                        <span className="ml-6 text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full">
                          {room.unread_count}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 bg-gray-800 rounded-lg border border-gray-700 flex flex-col">
          {selectedRoom ? (
            <>
              {/* Room header */}
              <div className="p-3 border-b border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash size={18} className="text-gray-400" />
                  <span className="font-medium text-white">{selectedRoom.name}</span>
                  <span className="text-xs text-gray-500 capitalize">
                    ({selectedRoom.room_type})
                  </span>
                </div>
                <div className="flex items-center gap-2 text-gray-400">
                  <Users size={16} />
                  <span className="text-sm">Participants</span>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-auto p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <p>Aucun message dans ce salon</p>
                    <p className="text-sm mt-1">Soyez le premier à écrire !</p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))
                )}
              </div>

              {/* Message input */}
              <form
                onSubmit={handleSendMessage}
                className="p-3 border-t border-gray-700 flex gap-2"
              >
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Écrire un message..."
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-primary-500"
                />
                <button
                  type="submit"
                  disabled={!messageInput.trim() || sendMessageMutation.isPending}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  <Send size={20} />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <Hash size={48} className="mx-auto mb-3 opacity-50" />
                <p>Sélectionnez un salon pour commencer</p>
              </div>
            </div>
          )}
        </div>

        {/* Participants panel */}
        <div className="w-48 bg-gray-800 rounded-lg border border-gray-700 hidden lg:block">
          <div className="p-3 border-b border-gray-700">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Participants
            </h2>
          </div>
          <div className="p-3">
            <div className="text-center text-gray-500 py-4">
              <Users size={24} className="mx-auto mb-2 opacity-50" />
              <p className="text-xs">Non implémenté</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isSystem = message.author_type === 'system'

  if (isSystem) {
    return (
      <div className="text-center">
        <span className="text-xs text-gray-500 bg-gray-700 px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    )
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
        <span className="text-sm font-medium text-white">
          {message.author_label.charAt(0).toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-white">{message.author_label}</span>
          <span className="text-xs text-gray-500">{formatTime(message.created_at)}</span>
        </div>
        <p className="text-gray-300 mt-1 break-words">{message.content}</p>
        {message.is_pinned && (
          <span className="text-xs text-yellow-500">📌 Épinglé</span>
        )}
      </div>
    </div>
  )
}
