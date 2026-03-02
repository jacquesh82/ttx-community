import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MessageCircle,
  Send,
  Plus,
  Users,
  Loader2,
  ArrowLeft,
  Settings,
} from 'lucide-react'
import { simulatedApi, SimulatedChatRoom, SimulatedChatMessage } from '../../../services/simulatedApi'

interface ChatSimulatorProps {
  exerciseId: number
  refreshKey?: number
}

const DEFAULT_ROOMS = [
  { name: 'Technique', description: ' discussions techniques', room_type: 'PUBLIC' },
  { name: 'Secrétariat', description: 'Secrétariat et administration', room_type: 'PUBLIC' },
  { name: 'Métier', description: 'Discussions métier', room_type: 'PUBLIC' },
]

export default function ChatSimulator({ exerciseId, refreshKey }: ChatSimulatorProps) {
  const [selectedRoom, setSelectedRoom] = useState<SimulatedChatRoom | null>(null)
  const [message, setMessage] = useState('')
  const [showCreateRoom, setShowCreateRoom] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const queryClient = useQueryClient()

  // Fetch chat rooms
  const { data: rooms = [], isLoading: isLoadingRooms, refetch: refetchRooms } = useQuery({
    queryKey: ['simulated-chat-rooms', exerciseId],
    queryFn: () => simulatedApi.getChatRooms(exerciseId),
  })

  // Fetch room messages when room is selected
  const { data: roomDetail, isLoading: isLoadingMessages } = useQuery({
    queryKey: ['simulated-chat-room', exerciseId, selectedRoom?.id],
    queryFn: () => simulatedApi.getChatRoom(exerciseId, selectedRoom!.id),
    enabled: !!selectedRoom,
  })

  // Create room mutation
  const createRoomMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; room_type?: string }) =>
      simulatedApi.createChatRoom(exerciseId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulated-chat-rooms', exerciseId] })
      setShowCreateRoom(false)
      setNewRoomName('')
    },
  })

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: (content: string) =>
      simulatedApi.sendChatMessage(exerciseId, selectedRoom!.id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulated-chat-room', exerciseId, selectedRoom?.id] })
      setMessage('')
    },
  })

  // Initialize default rooms if none exist
  useEffect(() => {
    if (!isLoadingRooms && rooms.length === 0) {
      DEFAULT_ROOMS.forEach((room) => {
        createRoomMutation.mutate(room)
      })
    }
  }, [isLoadingRooms, rooms.length])

  // Invalidate queries on WebSocket refresh
  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      queryClient.invalidateQueries({ queryKey: ['simulated-chat-rooms', exerciseId] })
      if (selectedRoom) {
        queryClient.invalidateQueries({ queryKey: ['simulated-chat-room', exerciseId, selectedRoom.id] })
      }
    }
  }, [refreshKey, exerciseId, queryClient, selectedRoom])

  // Auto-refresh rooms every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetchRooms()
    }, 5000)
    return () => clearInterval(interval)
  }, [refetchRooms])

  // Auto-refresh messages when room is selected
  useEffect(() => {
    if (!selectedRoom) return
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['simulated-chat-room', exerciseId, selectedRoom.id] })
    }, 3000)
    return () => clearInterval(interval)
  }, [selectedRoom, exerciseId, queryClient])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [roomDetail?.messages])

  const handleSendMessage = async () => {
    if (!message.trim() || !selectedRoom) return
    await sendMessageMutation.mutateAsync(message.trim())
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  const messages = roomDetail?.messages || []

  return (
    <div className="h-full flex flex-col bg-gray-800 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageCircle className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Chat</h2>
        </div>
        <button
          onClick={() => setShowCreateRoom(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white"
        >
          <Plus size={16} />
          Nouveau salon
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Rooms list */}
        <div className="w-1/3 border-r border-gray-700 flex flex-col">
          <div className="p-3 border-b border-gray-700">
            <h3 className="text-sm font-medium text-gray-400">Salons</h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoadingRooms ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : rooms.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Aucun salon</p>
                <p className="text-xs mt-1">Les salons par défaut seront créés automatiquement</p>
              </div>
            ) : (
              rooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => setSelectedRoom(room)}
                  className={`w-full p-3 text-left border-b border-gray-700 hover:bg-gray-700/50 ${
                    selectedRoom?.id === room.id ? 'bg-gray-700' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                        <Users size={14} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{room.name}</p>
                        <p className="text-xs text-gray-400">
                          {room.participant_ids?.length || 0} participants
                        </p>
                      </div>
                    </div>
                    {room.unread_count > 0 && (
                      <div className="bg-red-600 text-white text-xs px-2 py-1 rounded-full">
                        {room.unread_count}
                      </div>
                    )}
                  </div>
                  {room.last_message_preview && (
                    <p className="text-xs text-gray-500 mt-2 truncate">
                      {room.last_message_preview}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat messages */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedRoom ? (
            <>
              {/* Room header */}
              <div className="p-4 border-b border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSelectedRoom(null)}
                      className="lg:hidden text-gray-400 hover:text-white"
                    >
                      <ArrowLeft size={20} />
                    </button>
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                      <Users size={14} />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-white">{selectedRoom.name}</h3>
                      <p className="text-xs text-gray-400">
                        {selectedRoom.participant_ids?.length || 0} participants
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {isLoadingMessages ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Aucun message</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.is_from_player ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] px-3 py-2 rounded-lg ${
                          msg.is_from_player
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-white'
                        }`}
                      >
                        {!msg.is_from_player && (
                          <div className="text-xs text-gray-300 mb-1 flex items-center gap-1">
                            <span className="font-medium">{msg.sender_name}</span>
                          </div>
                        )}
                        <div className="text-sm">{msg.content}</div>
                        <div className={`text-xs mt-1 ${
                          msg.is_from_player ? 'text-blue-200' : 'text-gray-400'
                        }`}>
                          {formatTime(msg.sent_at)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message input */}
              <div className="p-4 border-t border-gray-700">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Tapez votre message..."
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!message.trim() || sendMessageMutation.isPending}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg flex items-center gap-2"
                  >
                    {sendMessageMutation.isPending ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Send size={16} />
                    )}
                  </button>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Appuyez sur Entrée pour envoyer
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Sélectionnez un salon</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create room modal */}
      {showCreateRoom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg w-full max-w-md border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Nouveau salon</h3>
              <button
                onClick={() => setShowCreateRoom(false)}
                className="text-gray-400 hover:text-white"
              >
                ×
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Nom du salon</label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Nom du salon..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowCreateRoom(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white"
                >
                  Annuler
                </button>
                <button
                  onClick={() => {
                    if (newRoomName.trim()) {
                      createRoomMutation.mutate({ name: newRoomName.trim() })
                    }
                  }}
                  disabled={!newRoomName.trim() || createRoomMutation.isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg flex items-center gap-2"
                >
                  {createRoomMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                  Créer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
