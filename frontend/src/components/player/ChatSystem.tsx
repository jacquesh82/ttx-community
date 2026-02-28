import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { usePlayer, useSendChatMessage } from '../../contexts/PlayerContext'
import { 
  Send, 
  MessageCircle, 
  Users, 
  X, 
  Clock, 
  User as UserIcon,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

interface ChatSystemProps {
  onBack?: () => void
}

export default function ChatSystem({ onBack }: ChatSystemProps) {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const { chatRooms, isLoadingChatRooms } = usePlayer()
  
  const [selectedRoom, setSelectedRoom] = useState<any | null>(null)
  const [message, setMessage] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const sendChatMessageMutation = useSendChatMessage()

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selectedRoom?.messages])

  const handleSendMessage = async () => {
    if (!message.trim() || !selectedRoom) return

    await sendChatMessageMutation.mutateAsync({
      roomId: selectedRoom.id,
      content: message
    })

    setMessage('')
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

  return (
    <div className="h-full flex flex-col bg-gray-800 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageCircle size={24} className="text-blue-400" />
            <div>
              <h2 className="text-lg font-semibold text-white">Chat</h2>
              <p className="text-sm text-gray-400">Communication en temps réel</p>
            </div>
          </div>
          <div className="flex gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 hover:bg-gray-700 rounded transition-colors"
              >
                <X size={20} />
              </button>
            )}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 hover:bg-gray-700 rounded transition-colors"
            >
              {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Chat rooms list */}
      <div className={`border-b border-gray-700 ${isExpanded ? 'block' : 'hidden'}`}>
        <div className="p-3">
          <div className="text-sm text-gray-400 mb-2">Salons disponibles</div>
          <div className="space-y-2">
            {isLoadingChatRooms ? (
              <div className="text-center py-4 text-gray-400">Chargement...</div>
            ) : chatRooms.length === 0 ? (
              <div className="text-center py-4 text-gray-400">Aucun salon de discussion</div>
            ) : (
              chatRooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => setSelectedRoom(room)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedRoom?.id === room.id 
                      ? 'bg-blue-600/20 border border-blue-500' 
                      : 'hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                        <Users size={16} />
                      </div>
                      <div>
                        <div className="font-medium text-white">{room.name}</div>
                        <div className="text-xs text-gray-400">
                          {room.participants ? room.participants.length : 0} participant{(room.participants && room.participants.length > 1) ? 's' : ''}
                        </div>
                      </div>
                    </div>
                    {room.unread_count > 0 && (
                      <div className="bg-red-600 text-white text-xs px-2 py-1 rounded-full">
                        {room.unread_count}
                      </div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Chat content */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Selected room header */}
        {selectedRoom && (
          <div className="p-3 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <Users size={16} />
                </div>
                <div>
                  <div className="font-medium text-white">{selectedRoom.name}</div>
                  <div className="text-xs text-gray-400">
                    {selectedRoom.participants ? selectedRoom.participants.length : 0} participant{(selectedRoom.participants && selectedRoom.participants.length > 1) ? 's' : ''}
                  </div>
                </div>
              </div>
              <div className="text-xs text-gray-400">
                Dernier message: {selectedRoom.last_message_at 
                  ? formatTime(selectedRoom.last_message_at) 
                  : 'Jamais'}
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {selectedRoom ? (
            (selectedRoom.messages?.length ?? 0) > 0 ? (
              selectedRoom.messages.map((message: any) => (
                <div
                  key={message.id}
                  className={`flex ${message.is_current_user ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                    message.is_current_user
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-white'
                  }`}>
                    {!message.is_current_user && (
                      <div className="text-xs text-gray-300 mb-1 flex items-center gap-2">
                        <UserIcon size={12} />
                        {message.sender_name}
                      </div>
                    )}
                    <div className="text-sm">{message.content}</div>
                    <div className={`text-xs mt-1 ${
                      message.is_current_user ? 'text-blue-200' : 'text-gray-400'
                    }`}>
                      {formatTime(message.created_at)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-400">
                <MessageCircle size={48} className="mx-auto mb-3 opacity-50" />
                <p>Aucun message dans ce salon</p>
              </div>
            )
          ) : (
            <div className="text-center py-8 text-gray-400">
              <MessageCircle size={48} className="mx-auto mb-3 opacity-50" />
              <p>Sélectionnez un salon de discussion</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message input */}
        {selectedRoom && (
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
                disabled={!message.trim() || sendChatMessageMutation.isPending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
              >
                <Send size={16} />
                Envoyer
              </button>
            </div>
            <div className="text-xs text-gray-400 mt-1">
              Appuyez sur Entrée pour envoyer, Shift+Entrée pour un saut de ligne
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
