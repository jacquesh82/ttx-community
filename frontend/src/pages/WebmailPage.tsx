import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { webmailApi } from '../services/api'
import { Mail, Plus, ArrowLeft, Inbox, Send, FileText } from 'lucide-react'
import LoadingScreen from '../components/LoadingScreen'

export default function WebmailPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['webmail', exerciseId],
    queryFn: () => webmailApi.listConversations(parseInt(exerciseId!)),
    enabled: !!exerciseId,
  })

  const conversations = data?.conversations || []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <button
            onClick={() => navigate(`/exercises/${exerciseId}`)}
            className="mr-4 p-2 hover:bg-gray-200 rounded"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Messagerie</h1>
            <p className="text-gray-600">Conversations de l'exercice</p>
          </div>
        </div>
        <Link
          to={`/exercises/${exerciseId}/webmail/new`}
          className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
        >
          <Plus className="mr-2" size={20} />
          Nouveau message
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="flex border-b">
          <button className="flex items-center px-4 py-3 text-primary-600 border-b-2 border-primary-600">
            <Inbox className="mr-2" size={18} />
            Boîte de réception
          </button>
          <button className="flex items-center px-4 py-3 text-gray-500 hover:text-gray-700">
            <Send className="mr-2" size={18} />
            Envoyés
          </button>
          <button className="flex items-center px-4 py-3 text-gray-500 hover:text-gray-700">
            <FileText className="mr-2" size={18} />
            Brouillons
          </button>
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : conversations.length === 0 ? (
          <div className="p-8 text-center">
            <Mail className="mx-auto text-gray-400 mb-4" size={48} />
            <p className="text-gray-500">Aucun message</p>
          </div>
        ) : (
          <ul className="divide-y">
            {conversations.map((conv: any) => (
              <li key={conv.id}>
                <Link
                  to={`/exercises/${exerciseId}/webmail/${conv.id}`}
                  className="flex items-center p-4 hover:bg-gray-50"
                >
                  <div className="flex-shrink-0 mr-4">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                      <Mail size={20} className="text-gray-500" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {conv.subject}
                      </p>
                      <p className="text-xs text-gray-500">
                        {conv.last_message_at
                          ? new Date(conv.last_message_at).toLocaleDateString('fr-FR')
                          : new Date(conv.created_at).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-sm text-gray-500 truncate">
                        {conv.message_count} message{conv.message_count > 1 ? 's' : ''}
                      </p>
                      {conv.unread_count > 0 && (
                        <span className="bg-primary-600 text-white text-xs px-2 py-0.5 rounded-full">
                          {conv.unread_count} non lu{conv.unread_count > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}