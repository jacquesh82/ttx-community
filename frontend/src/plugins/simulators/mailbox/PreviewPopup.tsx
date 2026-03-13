import { Mail, Paperclip, Star } from 'lucide-react'

export default function MailboxPreview() {
  return (
    <div className="space-y-3">
      {/* Simulated inbox */}
      <div className="bg-gray-900 rounded-lg border border-gray-700 divide-y divide-gray-700">
        {[
          { from: 'Direction Générale', subject: 'URGENT - Point de situation', time: '14:32', unread: true, starred: true },
          { from: 'CERT-FR', subject: 'Alerte de sécurité - IOC détectés', time: '14:15', unread: true, starred: false },
          { from: 'DRH', subject: 'RE: Plan de continuité RH', time: '13:45', unread: false, starred: false },
        ].map((mail, i) => (
          <div key={i} className={`flex items-center gap-3 px-4 py-3 ${mail.unread ? 'bg-gray-800/50' : ''}`}>
            <Mail className={`w-4 h-4 flex-shrink-0 ${mail.unread ? 'text-blue-400' : 'text-gray-500'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm truncate ${mail.unread ? 'font-semibold text-white' : 'text-gray-300'}`}>
                  {mail.from}
                </span>
                {mail.starred && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />}
              </div>
              <p className="text-xs text-gray-400 truncate">{mail.subject}</p>
            </div>
            <span className="text-xs text-gray-500 flex-shrink-0">{mail.time}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 text-center">
        Boîte mail simulée avec envoi/réception, pièces jointes et dossiers
      </p>
    </div>
  )
}
