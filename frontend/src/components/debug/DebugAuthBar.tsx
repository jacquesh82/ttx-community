/**
 * DebugAuthBar
 * Small header strip showing who is currently logged in on debug pages.
 * Allows switching role or logging out without leaving the page.
 */
import { useState } from 'react'
import { User, LogOut, RefreshCw, ChevronDown, Loader2 } from 'lucide-react'
import { authApi } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

type DevRole = 'admin' | 'animateur' | 'observateur' | 'participant'

const ROLE_COLOR: Record<string, string> = {
  admin:       'text-red-400 bg-red-900/30 border-red-800/50',
  animateur:   'text-orange-400 bg-orange-900/30 border-orange-800/50',
  observateur: 'text-yellow-400 bg-yellow-900/30 border-yellow-800/50',
  participant: 'text-green-400 bg-green-900/30 border-green-800/50',
}

interface Props {
  /** Called after role switch so parent can reconnect WS */
  onReconnect: () => void
}

export default function DebugAuthBar({ onReconnect }: Props) {
  const { user, setUser, setCsrfToken, logout } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState<DevRole | null>(null)

  if (!user) return null

  const roleClass = ROLE_COLOR[user.role] ?? 'text-gray-400 bg-gray-800 border-gray-700'

  const switchRole = async (role: DevRole) => {
    setLoading(role)
    setOpen(false)
    try {
      const response = await authApi.devLogin(role)
      setUser({ ...response.user, tenant: response.tenant })
      setCsrfToken(response.csrf_token)
      onReconnect()
    } finally {
      setLoading(null)
    }
  }

  const handleLogout = () => {
    logout()
    setOpen(false)
  }

  return (
    <div className="relative flex items-center gap-2 text-sm">
      {/* Current identity badge */}
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${roleClass}`}>
        <User size={11} />
        <span>{user.username}</span>
        <span className="opacity-60">·</span>
        <span className="capitalize">{user.role}</span>
      </div>

      {/* Switch role button */}
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          disabled={loading !== null}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded transition-colors disabled:opacity-50"
          title="Changer de rôle"
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 w-36 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide px-2.5 pt-2 pb-1">Switch role</p>
            {(['admin', 'animateur', 'observateur', 'participant'] as DevRole[]).map(role => (
              <button
                key={role}
                onClick={() => switchRole(role)}
                className={`w-full text-left px-2.5 py-1.5 text-xs hover:bg-gray-700 transition-colors capitalize ${
                  user.role === role ? 'text-white font-semibold' : 'text-gray-300'
                }`}
              >
                {role}
              </button>
            ))}
            <div className="border-t border-gray-700 mt-1">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-900/20 transition-colors"
              >
                <LogOut size={10} />
                Déconnecter
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
