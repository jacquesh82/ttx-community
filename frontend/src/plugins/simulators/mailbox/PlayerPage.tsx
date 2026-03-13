import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { playerApi } from '../../../services/playerApi'
import {
  Mail,
  Inbox,
  Send,
  Star,
  Trash2,
  Search,
  ChevronRight,
  Paperclip,
  Reply,
  ReplyAll,
  Forward,
  MoreHorizontal,
  Clock,
  AlertTriangle,
  FileText,
} from 'lucide-react'
import LoadingScreen from '../../../components/LoadingScreen'

export default function PlayerMailPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const [selectedFolder, setSelectedFolder] = useState<'inbox' | 'sent' | 'starred'>('inbox')
  const [selectedMailId, setSelectedMailId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Fetch injects that are mail type
  const { data: injectsData, isLoading } = useQuery({
    queryKey: ['player-injects', exerciseId],
    queryFn: () => playerApi.getInjects(parseInt(exerciseId!)),
    enabled: !!exerciseId,
  })

  // Filter mail-type injects
  const mailInjects = (injectsData || []).filter(
    (inject) => inject.type === 'mail' || inject.type === 'email'
  )

  // Get selected mail
  const selectedMail = selectedMailId
    ? mailInjects.find((m) => m.id === selectedMailId)
    : null

  const folders = [
    { id: 'inbox', label: 'Boîte de réception', icon: Inbox, count: mailInjects.filter(m => m.delivery_status !== 'treated').length },
    { id: 'sent', label: 'Envoyés', icon: Send, count: 0 },
    { id: 'starred', label: 'Favoris', icon: Star, count: 0 },
  ]

  const formatDate = (dateString: string | null) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    if (isToday) {
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  const getStatusColor = (status?: string | null) => {
    switch (status) {
      case 'delivered':
        return 'bg-red-500'
      case 'opened':
        return 'bg-yellow-500'
      case 'acknowledged':
        return 'bg-primary-500'
      case 'in_progress':
        return 'bg-orange-500'
      case 'treated':
        return 'bg-green-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getCriticityIcon = (criticity: string) => {
    switch (criticity) {
      case 'critical':
        return <AlertTriangle size={16} className="text-red-400" />
      case 'important':
        return <AlertTriangle size={16} className="text-yellow-400" />
      default:
        return null
    }
  }

  return (
    <div className="h-[calc(100vh-200px)] flex flex-col">
      <h1 className="text-2xl font-bold text-white mb-4">Messagerie</h1>

      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Folders sidebar */}
        <div className="w-48 bg-gray-800 rounded-lg border border-gray-700 flex flex-col">
          <div className="p-3 border-b border-gray-700">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Dossiers
            </h2>
          </div>
          <div className="flex-1 p-2">
            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => setSelectedFolder(folder.id as any)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                  selectedFolder === folder.id
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <folder.icon size={16} />
                  <span className="text-sm">{folder.label}</span>
                </div>
                {folder.count > 0 && (
                  <span className="text-xs bg-gray-600 px-1.5 py-0.5 rounded-full">
                    {folder.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Mail list */}
        <div className="w-80 bg-gray-800 rounded-lg border border-gray-700 flex flex-col">
          {/* Search */}
          <div className="p-3 border-b border-gray-700">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>

          {/* Mail list */}
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <LoadingScreen />
            ) : mailInjects.length === 0 ? (
              <div className="p-4 text-center text-gray-400">
                <Inbox size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">Aucun message</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-700">
                {mailInjects.map((mail) => (
                  <li key={mail.id}>
                    <button
                      onClick={() => setSelectedMailId(mail.id)}
                      className={`w-full text-left p-3 hover:bg-gray-700 transition-colors ${
                        selectedMailId === mail.id ? 'bg-gray-700' : ''
                      } ${mail.delivery_status === 'delivered' ? 'bg-primary-900/20' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`w-2 h-2 rounded-full mt-2 ${getStatusColor(mail.delivery_status)}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1">
                              {getCriticityIcon(mail.criticity)}
                              <span className="text-sm font-medium text-white truncate">
                                {mail.title}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500 flex-shrink-0">
                              {formatDate(mail.sent_at || mail.created_at)}
                            </span>
                          </div>
                          {mail.description && (
                            <p className="text-xs text-gray-400 truncate mt-0.5">
                              {mail.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs px-1.5 py-0.5 bg-gray-700 rounded text-gray-300">
                              {mail.target_type === 'team' ? '👥 Équipe' : '👤 Personnel'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Mail content */}
        <div className="flex-1 bg-gray-800 rounded-lg border border-gray-700 flex flex-col">
          {selectedMail ? (
            <>
              {/* Mail header */}
              <div className="p-4 border-b border-gray-700">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      {getCriticityIcon(selectedMail.criticity)}
                      <h2 className="text-lg font-semibold text-white">
                        {selectedMail.title}
                      </h2>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                      <span>De: <span className="text-white">DG AP-HP</span></span>
                      <span>À: <span className="text-white">{selectedMail.target_type === 'team' ? 'Équipe Communication' : 'Moi'}</span></span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-sm text-gray-400">
                      <Clock size={14} />
                      <span>{formatDate(selectedMail.sent_at || selectedMail.created_at)}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(selectedMail.delivery_status)}`}>
                        {selectedMail.delivery_status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="p-2 hover:bg-gray-700 rounded-lg transition-colors" title="Répondre">
                      <Reply size={18} className="text-gray-400" />
                    </button>
                    <button className="p-2 hover:bg-gray-700 rounded-lg transition-colors" title="Répondre à tous">
                      <ReplyAll size={18} className="text-gray-400" />
                    </button>
                    <button className="p-2 hover:bg-gray-700 rounded-lg transition-colors" title="Transférer">
                      <Forward size={18} className="text-gray-400" />
                    </button>
                    <button className="p-2 hover:bg-gray-700 rounded-lg transition-colors" title="Plus">
                      <MoreHorizontal size={18} className="text-gray-400" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Mail body */}
              <div className="flex-1 overflow-auto p-4">
                <div className="prose prose-invert max-w-none">
                  <p className="text-gray-300 whitespace-pre-wrap">
                    {selectedMail.description || 'Aucun contenu'}
                  </p>
                </div>

                {/* Attachments */}
                <div className="mt-6 pt-4 border-t border-gray-700">
                  <h3 className="text-sm font-medium text-gray-400 mb-2">Pièces jointes</h3>
                  <div className="text-center text-gray-500 py-4">
                    <Paperclip size={24} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Aucune pièce jointe</p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="p-4 border-t border-gray-700 flex items-center gap-2">
                <Link
                  to={`/play/${exerciseId}/decisions?action=new&inject=${selectedMail.id}`}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm flex items-center gap-2 transition-colors"
                >
                  <FileText size={16} />
                  Créer une décision
                </Link>
                <button className="px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg text-sm flex items-center gap-2 transition-colors">
                  <Reply size={16} />
                  Répondre
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <Mail size={48} className="mx-auto mb-3 opacity-50" />
                <p>Sélectionnez un message</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
