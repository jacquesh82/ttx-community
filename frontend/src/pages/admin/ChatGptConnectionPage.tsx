import { Bot, ExternalLink, Link as LinkIcon, Unlink } from 'lucide-react'
import { useChatGptConnection } from '../../utils/chatgptConnection'

export default function ChatGptConnectionPage() {
  const { isConnected, setIsConnected, openChatGpt } = useChatGptConnection()

  const handleConnect = () => {
    setIsConnected(true)
    openChatGpt()
  }

  const handleDisconnect = () => {
    setIsConnected(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Connexion ChatGPT</h1>
        <p className="mt-1 text-sm text-gray-500">
          Paramètre local au navigateur uniquement. Aucune sauvegarde serveur.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 max-w-3xl">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <Bot size={22} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">Statut de connexion</h2>
            <p className="text-sm text-gray-600 mt-1">
              {isConnected
                ? 'ChatGPT est activé pour cette interface.'
                : "ChatGPT n'est pas encore activé pour cette interface."}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {!isConnected ? (
                <button
                  onClick={handleConnect}
                  className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                >
                  <LinkIcon className="h-4 w-4 mr-2" />
                  Connexion à ChatGPT
                </button>
              ) : (
                <>
                  <button
                    onClick={openChatGpt}
                    className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Ouvrir ChatGPT
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                  >
                    <Unlink className="h-4 w-4 mr-2" />
                    Déconnecter
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
