import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Smartphone,
  Send,
  Plus,
  Search,
  Loader2,
  User,
  ArrowLeft,
} from 'lucide-react'
import { simulatedApi, SimulatedSmsConversation, SimulatedSms } from '../../../services/simulatedApi'
import { crisisContactsApi } from '../../../services/api'

interface Contact {
  id: number
  name: string
  email: string | null
  phone: string | null
}

interface SmsSimulatorProps {
  exerciseId: number
  refreshKey?: number
}

interface DebugSmsEvent {
  id?: number
  type?: string
  title?: string
  description?: string
  content?: Record<string, unknown>
}

export default function SmsSimulator({ exerciseId, refreshKey }: SmsSimulatorProps) {
  const [selectedConversation, setSelectedConversation] = useState<SimulatedSmsConversation | null>(null)
  const [message, setMessage] = useState('')
  const [showNewSms, setShowNewSms] = useState(false)
  const [toContactId, setToContactId] = useState<number | null>(null)
  const [contactSearch, setContactSearch] = useState('')
  const [showContactDropdown, setShowContactDropdown] = useState(false)
  const [debugConversations, setDebugConversations] = useState<SimulatedSmsConversation[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const debugSmsCounterRef = useRef(0)

  const queryClient = useQueryClient()

  // Fetch SMS conversations
  const { data: conversations = [], isLoading: isLoadingConversations, refetch: refetchConversations } = useQuery({
    queryKey: ['simulated-sms-conversations', exerciseId],
    queryFn: () => simulatedApi.getSmsConversations(exerciseId),
  })

  // Fetch contacts for autocomplete
  const { data: contactsData } = useQuery({
    queryKey: ['crisis-contacts', exerciseId, contactSearch],
    queryFn: () => crisisContactsApi.list(exerciseId, { search: contactSearch, page_size: 50 }),
    enabled: contactSearch.length > 0,
  })

  // Send SMS mutation
  const sendSmsMutation = useMutation({
    mutationFn: (data: { toContactId: number; content: string }) =>
      simulatedApi.sendSms(exerciseId, data.toContactId, data.content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulated-sms-conversations', exerciseId] })
      setShowNewSms(false)
      setMessage('')
      setToContactId(null)
      setContactSearch('')
    },
  })

  // Mark SMS as read mutation
  const markReadMutation = useMutation({
    mutationFn: async (smsId: number) => {
      await simulatedApi.markSmsRead(exerciseId, smsId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulated-sms-conversations', exerciseId] })
    },
  })

  // Invalidate queries on WebSocket refresh
  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      queryClient.invalidateQueries({ queryKey: ['simulated-sms-conversations', exerciseId] })
    }
  }, [refreshKey, exerciseId, queryClient])

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetchConversations()
    }, 5000)
    return () => clearInterval(interval)
  }, [refetchConversations])

  useEffect(() => {
    setDebugConversations([])
    setSelectedConversation(null)
  }, [exerciseId])

  // Listen for debug SMS events emitted by /debug/events_emit receiver bridge
  useEffect(() => {
    const handleDebugSms = (event: CustomEvent<DebugSmsEvent>) => {
      const detail = event.detail || {}
      const content = (detail.content || {}) as Record<string, unknown>
      const contactId = (content.from_contact_id as number | null | undefined) ?? null
      const contactPhone =
        (content.from_phone as string | undefined) ||
        (content.sender_phone as string | undefined) ||
        (content.phone as string | undefined) ||
        (content.contact_phone as string | undefined) ||
        null
      const contactName =
        (content.from_name as string | undefined) ||
        (content.sender_name as string | undefined) ||
        (content.contact_name as string | undefined) ||
        'Expediteur'
      const text =
        (content.text as string | undefined) ||
        (content.message as string | undefined) ||
        (content.body as string | undefined) ||
        detail.description ||
        detail.title ||
        'Nouveau SMS'

      const now = new Date().toISOString()
      const syntheticId = -1 * (Date.now() + debugSmsCounterRef.current)
      debugSmsCounterRef.current += 1

      const sms: SimulatedSms = {
        id: syntheticId,
        exercise_id: exerciseId,
        from_contact_id: contactId,
        to_contact_id: null,
        from_name: contactName,
        from_phone: contactPhone,
        to_name: 'Player',
        to_phone: null,
        content: text,
        is_from_player: false,
        is_inject: true,
        is_read: false,
        sent_at: now,
        read_at: null,
        created_at: now,
      }

      setDebugConversations((prev) => {
        const keyOf = (c: SimulatedSmsConversation) => `${c.contact_id ?? 'null'}::${c.contact_phone ?? ''}::${c.contact_name}`
        const targetKey = `${contactId ?? 'null'}::${contactPhone ?? ''}::${contactName}`
        const idx = prev.findIndex((c) => keyOf(c) === targetKey)
        if (idx === -1) {
          return [
            {
              contact_id: contactId,
              contact_name: contactName,
              contact_phone: contactPhone,
              messages: [sms],
              unread_count: 1,
            },
            ...prev,
          ]
        }

        const updated = [...prev]
        const conv = updated[idx]
        updated[idx] = {
          ...conv,
          messages: [...conv.messages, sms].sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()),
          unread_count: conv.unread_count + 1,
        }
        return updated
      })
    }

    window.addEventListener('debug-sms-event', handleDebugSms as EventListener)
    return () => window.removeEventListener('debug-sms-event', handleDebugSms as EventListener)
  }, [exerciseId])

  const getConversationKey = (conv: SimulatedSmsConversation) =>
    `${conv.contact_id ?? 'null'}::${conv.contact_phone ?? ''}::${conv.contact_name}`

  const allConversations = useMemo(() => {
    const merged = new Map<string, SimulatedSmsConversation>()

    for (const conv of conversations) {
      merged.set(getConversationKey(conv), {
        ...conv,
        messages: [...conv.messages],
      })
    }

    for (const conv of debugConversations) {
      const key = getConversationKey(conv)
      const existing = merged.get(key)
      if (!existing) {
        merged.set(key, {
          ...conv,
          messages: [...conv.messages],
        })
        continue
      }

      const byId = new Map<number, SimulatedSms>()
      for (const msg of existing.messages) byId.set(msg.id, msg)
      for (const msg of conv.messages) byId.set(msg.id, msg)

      const messages = Array.from(byId.values()).sort(
        (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
      )
      const unread_count = messages.filter((m) => !m.is_from_player && !m.is_read).length

      merged.set(key, {
        ...existing,
        contact_name: existing.contact_name || conv.contact_name,
        contact_phone: existing.contact_phone || conv.contact_phone,
        messages,
        unread_count,
      })
    }

    return Array.from(merged.values()).sort((a, b) => {
      const aLast = a.messages[a.messages.length - 1]?.sent_at || ''
      const bLast = b.messages[b.messages.length - 1]?.sent_at || ''
      return new Date(bLast).getTime() - new Date(aLast).getTime()
    })
  }, [conversations, debugConversations])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selectedConversation?.messages])

  // Keep selected conversation in sync when refreshed
  useEffect(() => {
    if (!selectedConversation) return
    const selectedKey = getConversationKey(selectedConversation)
    const updated = allConversations.find((c) => getConversationKey(c) === selectedKey)
    if (updated) {
      setSelectedConversation(updated)
    }
  }, [allConversations, selectedConversation])

  const handleSendSms = () => {
    if (!message.trim() || !toContactId) return
    sendSmsMutation.mutate({
      toContactId,
      content: message.trim(),
    })
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendSms()
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  const selectedContact = contactsData?.contacts?.find((c: Contact) => c.id === toContactId)

  // Get total unread count
  const totalUnread = allConversations.reduce((sum, conv) => sum + conv.unread_count, 0)

  return (
    <div className="h-full flex flex-col bg-gray-800 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Smartphone className="w-5 h-5 text-green-400" />
          <h2 className="text-lg font-semibold text-white">SMS</h2>
          {totalUnread > 0 && (
            <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded-full">
              {totalUnread}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowNewSms(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-sm"
        >
          <Plus size={16} />
          Nouveau SMS
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Conversations list */}
        <div className="w-1/3 border-r border-gray-700 flex flex-col">
          <div className="p-3 border-b border-gray-700">
            <h3 className="text-sm font-medium text-gray-400">Conversations</h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoadingConversations ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-green-500" />
              </div>
            ) : allConversations.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Smartphone className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Aucune conversation</p>
                <p className="text-xs text-gray-400 mt-1">
                  Les SMS reçus apparaîtront ici
                </p>
              </div>
            ) : (
              allConversations.map((conv, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setSelectedConversation(conv)
                    // Mark unread messages as read
                    conv.messages
                      .filter(m => !m.is_read && !m.is_from_player)
                      .forEach(m => {
                        if (m.id < 0) {
                          setDebugConversations((prev) =>
                            prev.map((c) => ({
                              ...c,
                              messages: c.messages.map((msg) => (msg.id === m.id ? { ...msg, is_read: true } : msg)),
                              unread_count: c.messages.filter((msg) => msg.id !== m.id && !msg.is_from_player && !msg.is_read).length,
                            }))
                          )
                          return
                        }
                        markReadMutation.mutate(m.id)
                      })
                  }}
                  className={`w-full p-3 text-left border-b border-gray-700 hover:bg-gray-700/50 ${
                    selectedConversation && getConversationKey(selectedConversation) === getConversationKey(conv)
                      ? 'bg-gray-700'
                      : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
                        <User size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{conv.contact_name}</p>
                        <p className="text-xs text-gray-400">
                          {conv.contact_phone || 'Pas de numéro'}
                        </p>
                      </div>
                    </div>
                    {conv.unread_count > 0 && (
                      <div className="bg-red-600 text-white text-xs px-2 py-1 rounded-full">
                        {conv.unread_count}
                      </div>
                    )}
                  </div>
                  {conv.messages.length > 0 && (
                    <p className="text-xs text-gray-500 mt-2 truncate">
                      {conv.messages[conv.messages.length - 1].content}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedConversation ? (
            <>
              {/* Conversation header */}
              <div className="p-4 border-b border-gray-700">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedConversation(null)}
                    className="lg:hidden text-gray-400 hover:text-white"
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
                    <User size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-white">
                      {selectedConversation.contact_name}
                    </h3>
                    <p className="text-xs text-gray-400">
                      {selectedConversation.contact_phone || 'Pas de numéro'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {selectedConversation.messages.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Smartphone className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Aucun message</p>
                  </div>
                ) : (
                  selectedConversation.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.is_from_player ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] px-3 py-2 rounded-lg ${
                          msg.is_from_player
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-700 text-white'
                        }`}
                      >
                        <div className="text-sm">{msg.content}</div>
                        <div className={`text-xs mt-1 ${
                          msg.is_from_player ? 'text-green-200' : 'text-gray-400'
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
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
                  />
                  <button
                    onClick={handleSendSms}
                    disabled={!message.trim() || sendSmsMutation.isPending}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg flex items-center gap-2"
                  >
                    {sendSmsMutation.isPending ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Send size={16} />
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <Smartphone className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Sélectionnez une conversation</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New SMS modal */}
      {showNewSms && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg w-full max-w-md border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Nouveau SMS</h3>
              <button
                onClick={() => setShowNewSms(false)}
                className="text-gray-400 hover:text-white"
              >
                ×
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
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
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
                          <div className="text-xs text-gray-400">{contact.phone}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tapez votre message..."
                  rows={4}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-green-500 resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowNewSms(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSendSms}
                  disabled={!toContactId || !message.trim() || sendSmsMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
                >
                  {sendSmsMutation.isPending ? (
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
