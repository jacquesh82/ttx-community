import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { webmailApi } from '../services/api'
import { ArrowLeft, Send, User } from 'lucide-react'
import { useState } from 'react'
import ContactAutocomplete from '../components/ContactAutocomplete'

export default function WebmailNewPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [subject, setSubject] = useState('')
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])
  const [manualTo, setManualTo] = useState('')
  const [body, setBody] = useState('')

  const createMutation = useMutation({
    mutationFn: (data: any) => webmailApi.createConversation(data),
    onSuccess: (result: { id: number }) => {
      queryClient.invalidateQueries({ queryKey: ['webmail', exerciseId] })
      navigate(`/exercises/${exerciseId}/webmail/${result.id}`)
    },
  })

  const handleSend = () => {
    if (!subject.trim() || !body.trim()) return

    // Combine selected contacts from autocomplete and manually entered ones
    const manualParticipants = manualTo
      .split(',')
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0)
      .map((p: string) => `actor:${p}`)

    const allParticipants = [...selectedContacts, ...manualParticipants]

    createMutation.mutate({
      exercise_id: parseInt(exerciseId!),
      subject: subject.trim(),
      to_participants: allParticipants,
      body_text: body.trim(),
    })
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
        <h1 className="text-xl font-bold text-gray-900">Nouveau message</h1>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="space-y-4">
          {/* To field - Contact Autocomplete */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              À (destinataires)
            </label>
            <ContactAutocomplete
              exerciseId={parseInt(exerciseId!)}
              value={selectedContacts}
              onChange={setSelectedContacts}
              placeholder="Rechercher dans l'annuaire..."
            />
          </div>

          {/* Manual To field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Autres destinataires (optionnel)
            </label>
            <div className="flex items-center border rounded-md px-3 py-2">
              <User className="text-gray-400 mr-2" size={18} />
              <input
                type="text"
                value={manualTo}
                onChange={(e) => setManualTo(e.target.value)}
                className="flex-1 outline-none"
                placeholder="Autres destinataires (séparés par des virgules)"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Entrez les noms manuellement si non présents dans l'annuaire
            </p>
          </div>

          {/* Subject field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Objet
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Objet du message"
            />
          </div>

          {/* Body field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full border rounded-md px-3 py-2 min-h-[300px] outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Contenu du message..."
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              onClick={() => navigate(`/exercises/${exerciseId}/webmail`)}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
            >
              Annuler
            </button>
            <button
              onClick={handleSend}
              disabled={createMutation.isPending || !subject.trim() || !body.trim()}
              className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              <Send className="mr-2" size={18} />
              {createMutation.isPending ? 'Envoi...' : 'Envoyer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}