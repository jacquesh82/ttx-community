import { Hash, Users } from 'lucide-react'

export default function ChatPreview() {
  return (
    <div className="space-y-3">
      <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
        {/* Channel header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-700 bg-gray-800">
          <Hash className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-white">cellule-crise</span>
          <Users className="w-3 h-3 text-gray-500 ml-auto" />
          <span className="text-xs text-gray-500">8</span>
        </div>
        {/* Messages */}
        <div className="p-4 space-y-3">
          {[
            { user: 'J. Martin', msg: 'Point de situation : le périmètre est sécurisé.', time: '14:30' },
            { user: 'A. Dupont', msg: 'La communication de crise est prête pour diffusion.', time: '14:32' },
          ].map((m, i) => (
            <div key={i} className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
                <span className="text-xs text-white font-medium">{m.user[0]}</span>
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-white">{m.user}</span>
                  <span className="text-[10px] text-gray-500">{m.time}</span>
                </div>
                <p className="text-sm text-gray-300">{m.msg}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-500 text-center">
        Chat en temps réel par salons avec historique des échanges
      </p>
    </div>
  )
}
