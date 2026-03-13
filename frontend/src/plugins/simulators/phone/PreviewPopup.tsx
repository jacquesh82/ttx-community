import { Phone, PhoneCall, PhoneMissed, PhoneIncoming, Clock } from 'lucide-react'

export default function PhonePreview() {
  return (
    <div className="space-y-3">
      <div className="bg-gray-900 rounded-lg border border-gray-700 divide-y divide-gray-700">
        {[
          { caller: 'Préfecture', status: 'missed', time: '14:35', icon: PhoneMissed, color: 'text-red-400' },
          { caller: 'SDIS 33', status: 'incoming', time: '14:32', icon: PhoneIncoming, color: 'text-green-400' },
          { caller: 'Direction Générale', status: 'completed', time: '14:20', icon: PhoneCall, color: 'text-gray-400' },
        ].map((call, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <call.icon className={`w-4 h-4 flex-shrink-0 ${call.color}`} />
            <div className="flex-1 min-w-0">
              <span className="text-sm text-white">{call.caller}</span>
            </div>
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {call.time}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 text-center">
        Simulation d'appels téléphoniques entrants avec historique et messagerie vocale
      </p>
    </div>
  )
}
