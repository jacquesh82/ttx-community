import { MessageSquare, Check, CheckCheck } from 'lucide-react'

export default function SmsPreview() {
  return (
    <div className="space-y-3">
      <div className="bg-gray-900 rounded-lg border border-gray-700 p-4 space-y-3">
        {/* Incoming message */}
        <div className="flex justify-start">
          <div className="bg-gray-700 rounded-2xl rounded-bl-md px-4 py-2 max-w-[70%]">
            <p className="text-sm text-white">Situation confirmée sur le site B. Équipe mobilisée.</p>
            <div className="flex items-center gap-1 justify-end mt-1">
              <span className="text-[10px] text-gray-400">14:32</span>
            </div>
          </div>
        </div>
        {/* Outgoing message */}
        <div className="flex justify-end">
          <div className="bg-primary-600 rounded-2xl rounded-br-md px-4 py-2 max-w-[70%]">
            <p className="text-sm text-white">Bien reçu. Envoyez le rapport dès que possible.</p>
            <div className="flex items-center gap-1 justify-end mt-1">
              <span className="text-[10px] text-primary-200">14:33</span>
              <CheckCheck className="w-3 h-3 text-primary-200" />
            </div>
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-500 text-center">
        Interface SMS style iMessage avec conversations et accusés de réception
      </p>
    </div>
  )
}
