import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { webmailApi } from '../services/api'
import { ArrowLeft, Reply, Mail, User, Clock, CheckCheck } from 'lucide-react'
import { useState } from 'react'

export default function WebmailConversationPage() {
  const { exerciseId, conversationId } = useParams<{ exerciseId: string; conversationId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [replyText, setReplyText] = useState('')
  const [showReply, setShowReply] = useState(false)

  const { data: conversation, isLoading } = useQuery({
    queryKey: ['webmail-conversation', conversationId],
    queryFn: () => webmailApi.getConversation(parseInt(conversationId!)),
    enabled: !!conversationId,
  })

  const markReadMutation = useMutation({
    mutationFn: () => webmailApi.markConversationRead(parseInt(conversationId!)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webmail', exerciseId] })
    },
  })

  const sendMessageMutation = useMutation({
    mutationFn: (bodyText: string) =>
      webmailApi.sendMessage({
        conversation_id: parseInt(conversationId!),
        body_text: bodyText,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webmail-conversation', conversationId] })
      setReplyText('')
      setShowReply(false)
    },
  })

  // Mark as read when viewing
  if (conversation && !isLoading) {
    markReadMutation.mutate()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Chargement...</p>
      </div>
    )
  }

  if (!conversation) {
    return (
      <div className="text-center py-12">
        <Mail className="mx-auto text-gray-400 mb-4" size={48} />
        <p className="text-gray-500">Conversation non trouvée</p>
      </div>
    )
  }

  const handleSendReply = () => {
    if (replyText.trim()) {
      sendMessageMutation.mutate(replyText)
    }
  }

  return (
    <div>
      <div className="flex items-center mb-6">
        <button
          onClick={() => navigate(`/exercises/${exerciseId}/webmail`)}
          className="mr-4 p-2 hover:bg-gray-200 rounded"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{conversation.subject}</h1>
          <div className="flex items-center text-sm text-gray-500 mt-1">
            <Clock className="mr-1" size={14} />
            {new Date(conversation.created_at).toLocaleString('fr-FR')}
          </div>
        </div>
      </div>

      {/* Participants */}
      <div className="bg-white rounded-lg shadow mb-6 p-4">
        <h2 className="text-sm font-medium text-gray-500 mb-2">Participants</h2>
        <div className="flex flex-wrap gap-2">
          {conversation.participants?.map((p: any, idx: number) => (
            <span
              key={idx}
              className={`inline-flex items-center px-2 py-1 rounded text-xs ${
                p.role === 'from'
                  ? 'bg-primary-100 text-primary-800'
                  : p.role === 'to'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <User className="mr-1" size={12} />
              {p.label || p.type}
              <span className="ml-1 text-xs opacity-75">({p.role})</span>
            </span>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="space-y-4 mb-6">
        {conversation.messages?.map((message: any) => (
          <div
            key={message.id}
            className={`bg-white rounded-lg shadow p-4 ${
              message.author_type === 'user' ? 'border-l-4 border-primary-500' : ''
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center mr-3">
                  <User size={16} className="text-gray-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {message.author_label || 'Inconnu'}
                    <span className="ml-2 text-xs text-gray-400">({message.author_type})</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center text-xs text-gray-500">
                <Clock className="mr-1" size={12} />
                {new Date(message.created_at).toLocaleString('fr-FR')}
                {message.is_read && (
                  <CheckCheck className="ml-2 text-green-500" size={14} />
                )}
              </div>
            </div>
            <div className="ml-11 text-gray-700 whitespace-pre-wrap">
              {message.body_text}
            </div>
          </div>
        ))}
      </div>

      {/* Reply box */}
      {showReply ? (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium mb-2">Répondre</h3>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            className="w-full border rounded p-3 min-h-[150px] focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Écrivez votre réponse..."
          />
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={() => setShowReply(false)}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
            >
              Annuler
            </button>
            <button
              onClick={handleSendReply}
              disabled={sendMessageMutation.isPending || !replyText.trim()}
              className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
            >
              {sendMessageMutation.isPending ? 'Envoi...' : 'Envoyer'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowReply(true)}
          className="w-full bg-white rounded-lg shadow p-4 text-left hover:bg-gray-50"
        >
          <Reply className="inline mr-2 text-gray-400" size={20} />
          <span className="text-gray-500">Répondre à cette conversation...</span>
        </button>
      )}
    </div>
  )
}