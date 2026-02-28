/**
 * DebugAuthOverlay
 * Shown over debug pages when the user is not authenticated.
 * Provides explanation + quick dev-login so the page is self-contained.
 */
import { useState } from 'react'
import { Shield, ChevronRight, Loader2, AlertTriangle } from 'lucide-react'
import { authApi } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

type DevRole = 'admin' | 'animateur' | 'observateur' | 'participant'

const ROLES: { role: DevRole; label: string; color: string }[] = [
  { role: 'admin',       label: 'Admin',       color: 'text-red-400' },
  { role: 'animateur',   label: 'Animateur',   color: 'text-orange-400' },
  { role: 'observateur', label: 'Observateur', color: 'text-yellow-400' },
  { role: 'participant', label: 'Participant',  color: 'text-green-400' },
]

interface Props {
  /** 401 = not authenticated, 403 = wrong role */
  status: number
  /** Called after a successful dev-login so the parent can retry the WS connection */
  onLogin: () => void
}

export default function DebugAuthOverlay({ status, onLogin }: Props) {
  const { setUser, setCsrfToken } = useAuthStore()
  const [loading, setLoading] = useState<DevRole | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleDevLogin = async (role: DevRole) => {
    setLoading(role)
    setError(null)
    try {
      const response = await authApi.devLogin(role)
      setUser({ ...response.user, tenant: response.tenant })
      setCsrfToken(response.csrf_token)
      onLogin()
    } catch {
      setError('Échec de connexion — vérifiez que le backend est accessible.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-950/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-orange-500/30 rounded-xl p-8 max-w-sm w-full shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 bg-orange-500/20 rounded-lg shrink-0">
            <Shield className="w-6 h-6 text-orange-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Outils de Debug</h2>
            <p className="text-[11px] text-orange-400 font-mono tracking-wide">DÉVELOPPEMENT UNIQUEMENT</p>
          </div>
        </div>

        {/* Explanation */}
        <p className="text-sm text-gray-400 leading-relaxed mb-1">
          Ces pages permettent de simuler et tester les événements WebSocket en dehors du contexte normal de l'application.
        </p>
        <div className={`flex items-start gap-2 rounded-lg px-3 py-2 mb-6 mt-3 ${
          status === 403
            ? 'bg-red-900/20 border border-red-700/40'
            : 'bg-yellow-900/20 border border-yellow-700/40'
        }`}>
          <AlertTriangle size={14} className={`shrink-0 mt-0.5 ${status === 403 ? 'text-red-400' : 'text-yellow-400'}`} />
          <p className={`text-xs ${status === 403 ? 'text-red-300' : 'text-yellow-300'}`}>
            {status === 403
              ? 'Permissions insuffisantes — le ticket WebSocket debug requiert le rôle admin. Connectez-vous en tant qu\'admin pour continuer.'
              : 'Un ticket WebSocket est nécessaire — connectez-vous avec un rôle de développement pour continuer.'
            }
          </p>
        </div>

        {/* Dev-login buttons */}
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Connexion rapide (dev)
        </p>
        <div className="space-y-2">
          {ROLES.map(({ role, label, color }) => {
            const isRecommended = status === 403 && role === 'admin'
            return (
              <button
                key={role}
                onClick={() => handleDevLogin(role)}
                disabled={loading !== null}
                className={`w-full flex items-center justify-between px-4 py-2.5 disabled:opacity-50 rounded-lg border transition-colors group ${
                  isRecommended
                    ? 'bg-red-900/30 border-red-700/60 hover:bg-red-900/50 ring-1 ring-red-600/40'
                    : 'bg-gray-800 hover:bg-gray-700 border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${color}`}>{label}</span>
                  {isRecommended && (
                    <span className="text-[10px] text-red-400 bg-red-900/40 border border-red-700/40 rounded px-1.5 py-0.5">
                      requis
                    </span>
                  )}
                </div>
                {loading === role
                  ? <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                  : <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
                }
              </button>
            )
          })}
        </div>

        {error && (
          <p className="mt-3 text-xs text-red-400 flex items-center gap-1.5">
            <AlertTriangle size={12} />
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
