import { ScrollText } from 'lucide-react'

export default function LogsPage() {
  return (
    <div className="options-theme space-y-6">
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <h1 className="text-2xl font-bold text-white">Logs système</h1>
        <p className="text-sm text-gray-400 mt-1">Journaux techniques de la plateforme</p>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-xl p-12 text-center">
        <ScrollText className="w-10 h-10 text-gray-600 mx-auto mb-4" />
        <p className="text-gray-400 text-sm">Logs système — à venir</p>
      </div>
    </div>
  )
}
