import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Mail,
  Send,
  Star,
  Plus,
  X,
  Search,
  Loader2,
  User,
  ArrowLeft,
} from 'lucide-react'
import { simulatedApi, SimulatedMail, SimulatedMailList } from '../../../services/simulatedApi'
import { crisisContactsApi } from '../../../services/api'

interface Contact {
  id: number
  name: string
  email: string | null
  phone: string | null
}

interface MailSimulatorProps {
  exerciseId: number
  refreshKey?: number
}

type MailFolder = 'inbox' | 'sent'

interface DebugMailEvent {
  id: number
  type: string
  title: string
  description?: string
  content?: {
    from_name?: string
    from_email?: string
    to_name?: string
    to_email?: string
    subject?: string
    body?: string
  }
  is_read?: boolean
}

export default function MailSimulator({ exerciseId, refreshKey }: MailSimulatorProps) {
  const [activeFolder, setActiveFolder] = useState<MailFolder>('inbox')
  const [selectedMail, setSelectedMail] = useState<SimulatedMail | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debugMails, setDebugMails] = useState<DebugMailEvent[]>([])
  
  // Compose form state
  const [toContactId, setToContactId] = useState<number | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [showContactDropdown, setShowContactDropdown] = useState(false)
  const [contactSearch, setContactSearch] = useState('')

  const queryClient = useQueryClient()

  // Fetch mails
  const { data: mailData, isLoading: isLoadingMails, refetch: refetchMails } = useQuery({
    queryKey: ['simulated-mails', exerciseId, activeFolder],
    queryFn: () => simulatedApi.getMails(exerciseId, activeFolder),
  })

  // Fetch contacts for autocomplete
  const { data: contactsData } = useQuery({
    queryKey: ['crisis-contacts', exerciseId, contactSearch],
    queryFn: () => crisisContactsApi.list(exerciseId, { search: contactSearch, page_size: 50 }),
    enabled: contactSearch.length > 0,
  })

  // Send mail mutation
  const sendMailMutation = useMutation({
    mutationFn: (data: { to_contact_id: number; subject: string; body?: string }) =>
      simulatedApi.sendMail(exerciseId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulated-mails', exerciseId] })
      setShowCompose(false)
      setToContactId(null)
      setSubject('')
      setBody('')
      setContactSearch('')
    },
  })

  // Mark mail as read
  const markReadMutation = useMutation({
    mutationFn: async (mailId: number) => {
      const mail = mailData?.mails.find(m => m.id === mailId)
      if (mail && !mail.is_read) {
        await simulatedApi.getMail(exerciseId, mailId)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulated-mails', exerciseId] })
    },
  })

  // Invalidate queries on WebSocket refresh
  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      queryClient.invalidateQueries({ queryKey: ['simulated-mails', exerciseId] })
    }
  }, [refreshKey, exerciseId, queryClient])

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetchMails()
    }, 5000)
    return () => clearInterval(interval)
  }, [refetchMails])

  // Unique ID counter for debug mails to prevent duplicate keys
  const debugMailCounterRef = useRef(0)

  // Listen for debug mail events from event emitter
  useEffect(() => {
    const handleDebugMail = (event: CustomEvent<DebugMailEvent>) => {
      console.log('[MailSimulator] Debug mail event received:', event.detail)
      // Add unique ID and mark as unread
      const newMail: DebugMailEvent = {
        ...event.detail,
        id: Date.now() + debugMailCounterRef.current,
        is_read: false,
      }
      debugMailCounterRef.current += 1
      setDebugMails(prev => [newMail, ...prev])
    }
    
    window.addEventListener('debug-mail-event', handleDebugMail as EventListener)
    return () => {
      window.removeEventListener('debug-mail-event', handleDebugMail as EventListener)
    }
  }, [])

  const mails = mailData?.mails || []
  
  // Convert debug mails to SimulatedMail format for display
  const debugMailsFormatted: SimulatedMail[] = debugMails.map((dm, index) => ({
    id: dm.id || (-1000 - index),
    exercise_id: exerciseId,
    from_contact_id: null,
    to_contact_id: null,
    from_name: dm.content?.from_name || 'Unknown',
    from_email: dm.content?.from_email || null,
    to_name: dm.content?.to_name || 'Player',
    to_email: dm.content?.to_email || null,
    subject: dm.content?.subject || dm.title,
    body: dm.content?.body || dm.description || null,
    attachments: null,
    is_from_player: false,
    is_inject: true,
    is_read: dm.is_read ?? false,
    is_starred: false,
    parent_mail_id: null,
    sent_at: new Date().toISOString(),
    read_at: null,
    created_at: new Date().toISOString(),
  }))

  // Combine API mails with debug mails
  const allMails = [...debugMailsFormatted, ...mails]
  
  const filteredMails = searchQuery
    ? allMails.filter(
        m =>
          m.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.from_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.to_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allMails

  const selectedContact = contactsData?.contacts?.find((c: Contact) => c.id === toContactId)

  const handleSendMail = () => {
    if (!toContactId || !subject.trim()) return
    sendMailMutation.mutate({
      to_contact_id: toContactId,
      subject: subject.trim(),
      body: body.trim() || undefined,
    })
  }

  const handleSelectMail = (mail: SimulatedMail) => {
    setSelectedMail(mail)
    // Mark as read (only for received mails, not sent by player)
    if (!mail.is_read && !mail.is_from_player) {
      // Check if it's a debug mail (from event emitter)
      const isDebugMail = debugMails.some(dm => dm.id === mail.id)
      if (isDebugMail) {
        setDebugMails(prev => prev.map(m => 
          m.id === mail.id ? { ...m, is_read: true } : m
        ))
      } else {
        markReadMutation.mutate(mail.id)
      }
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="h-[calc(100vh-180px)] flex flex-col bg-gray-800 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mail className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Boîte Mail</h2>
        </div>
        <button
          onClick={() => setShowCompose(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white"
        >
          <Plus size={16} />
          Nouveau mail
        </button>
      </div>

      {/* Folder tabs */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => { setActiveFolder('inbox'); setSelectedMail(null); }}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeFolder === 'inbox'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Reception ({(mailData?.unread_count || 0) + debugMails.filter(m => !m.is_read).length})
        </button>
        <button
          onClick={() => { setActiveFolder('sent'); setSelectedMail(null); }}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeFolder === 'sent'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Envoyés
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Mail list */}
        <div className="w-1/3 border-r border-gray-700 flex flex-col">
          {/* Search */}
          <div className="p-3 border-b border-gray-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher..."
                className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Mail items */}
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
            {isLoadingMails ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : filteredMails.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Mail className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Aucun mail</p>
              </div>
            ) : (
              filteredMails.map((mail) => (
                <button
                  key={mail.id}
                  onClick={() => handleSelectMail(mail)}
                  className={`w-full p-3 text-left border-b border-gray-700 hover:bg-gray-700/50 ${
                    selectedMail?.id === mail.id ? 'bg-gray-700' : ''
                  } ${!mail.is_read && !mail.is_from_player ? 'bg-blue-900/20' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {mail.is_starred && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />}
                        <span className={`text-sm truncate ${
                          !mail.is_read && !mail.is_from_player ? 'text-white font-medium' : 'text-gray-300'
                        }`}>
                          {activeFolder === 'inbox' ? mail.from_name : mail.to_name}
                        </span>
                      </div>
                      <p className={`text-sm truncate ${
                        !mail.is_read && !mail.is_from_player ? 'text-white' : 'text-gray-400'
                      }`}>
                        {mail.subject}
                      </p>
                      <p className="text-xs text-gray-500 truncate mt-1">
                        {mail.body?.substring(0, 50)}...
                      </p>
                    </div>
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {formatDate(mail.sent_at)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Mail detail */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedMail ? (
            <>
              <div className="p-4 border-b border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() => setSelectedMail(null)}
                    className="lg:hidden text-gray-400 hover:text-white"
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <h3 className="text-lg font-medium text-white flex-1">{selectedMail.subject}</h3>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                    <User size={14} />
                  </div>
                  <div>
                    <p className="text-sm text-white">
                      {activeFolder === 'inbox' ? selectedMail.from_name : selectedMail.to_name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {activeFolder === 'inbox' ? selectedMail.from_email : selectedMail.to_email}
                    </p>
                  </div>
                  <span className="ml-auto text-xs text-gray-500">
                    {formatDate(selectedMail.sent_at)}
                  </span>
                </div>
              </div>
              <div className="flex-1 p-4 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
                <div className="text-sm text-gray-300 whitespace-pre-wrap">
                  {selectedMail.body || 'Aucun contenu'}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <Mail className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Sélectionnez un mail</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Compose modal */}
      {showCompose && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg w-full max-w-lg border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Nouveau mail</h3>
              <button
                onClick={() => setShowCompose(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* To */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Destinataire</label>
                <div className="relative">
                  <input
                    type="text"
                    value={contactSearch || selectedContact?.name || ''}
                    onChange={(e) => {
                      setContactSearch(e.target.value)
                      setToContactId(null)
                      setShowContactDropdown(true)
                    }}
                    onFocus={() => setShowContactDropdown(true)}
                    placeholder="Rechercher un contact..."
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  />
                  {showContactDropdown && contactsData?.contacts && contactsData.contacts.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-gray-700 border border-gray-600 rounded-lg max-h-48 overflow-y-auto z-10">
                      {contactsData.contacts.map((contact: Contact) => (
                        <button
                          key={contact.id}
                          onClick={() => {
                            setToContactId(contact.id)
                            setContactSearch(contact.name)
                            setShowContactDropdown(false)
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-gray-600 text-white"
                        >
                          <div className="font-medium">{contact.name}</div>
                          <div className="text-xs text-gray-400">{contact.email}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Sujet</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Objet du mail..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Message</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Contenu du mail..."
                  rows={6}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowCompose(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSendMail}
                  disabled={!toContactId || !subject.trim() || sendMailMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
                >
                  {sendMailMutation.isPending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  Envoyer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
