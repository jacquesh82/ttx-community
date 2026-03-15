import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronUp, ChevronDown, Radio, Inbox, FlaskConical } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import DebugExerciseSeedModal from './DebugExerciseSeedModal'

const devRoles = [
  { role: 'admin' as const, label: 'Admin', color: 'bg-red-600 hover:bg-red-700' },
  { role: 'animateur' as const, label: 'Animateur', color: 'bg-primary-600 hover:bg-primary-700' },
  { role: 'observateur' as const, label: 'Observateur', color: 'bg-green-600 hover:bg-green-700' },
  { role: 'participant' as const, label: 'Joueur', color: 'bg-purple-600 hover:bg-purple-700' },
]

interface DevDrawerProps {
  onDevLogin: (role: 'admin' | 'animateur' | 'observateur' | 'participant') => void
  devLoading: string | null
}

export default function DevDrawer({ onDevLogin, devLoading }: DevDrawerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [showSeed, setShowSeed] = useState(false)

  return (
    <>
      <DebugExerciseSeedModal open={showSeed} onClose={() => setShowSeed(false)} />
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer panel */}
      <div
        className="fixed left-0 right-0 z-50 transition-all duration-300 ease-in-out"
        style={{
          bottom: '40px',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        <div
          className="mx-auto max-w-xl rounded-t-2xl border border-b-0 p-5 shadow-2xl backdrop-blur-xl"
          style={{
            backgroundColor: 'var(--login-card-bg)',
            borderColor: 'var(--login-card-border)',
          }}
        >
          {/* Quick login */}
          <p className="mb-3 text-center text-sm font-semibold login-muted">
            🔧 {t('debug.quickLogin')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {devRoles.map(({ role, label, color }) => (
              <button
                key={role}
                onClick={() => onDevLogin(role)}
                disabled={devLoading !== null}
                className={`rounded-md px-3 py-2 text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 ${color}`}
              >
                {devLoading === role
                  ? t('debug.connecting')
                  : t('debug.loginAs', { role: label })}
              </button>
            ))}
          </div>

          {/* Debug tools */}
          <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--login-card-border)' }}>
            <p className="mb-3 text-center text-sm font-semibold login-muted">
              🧪 {t('debug.devTools')}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setShowSeed(true)}
                className="flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-emerald-700"
              >
                <FlaskConical size={14} />
                {t('debug.seedExercise')}
              </button>
              <Link
                to="/debug/events_emit"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-orange-700"
              >
                <Radio size={14} />
                {t('debug.eventsEmitter')}
              </Link>
              <Link
                to="/debug/events_receive"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-2 rounded-md bg-primary-600 px-3 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-primary-700"
              >
                <Inbox size={14} />
                {t('debug.eventsReceiver')}
              </Link>
            </div>
          </div>

        </div>
      </div>

      {/* Handle */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 flex h-10 cursor-pointer select-none items-center justify-center gap-2 border-t"
        style={{
          backgroundColor: 'var(--login-card-bg)',
          borderColor: 'var(--login-card-border)',
        }}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown size={14} className="login-muted" /> : <ChevronUp size={14} className="login-muted" />}
        <span className="text-xs font-bold tracking-widest login-muted">DEV</span>
        {open ? <ChevronDown size={14} className="login-muted" /> : <ChevronUp size={14} className="login-muted" />}
      </div>
    </>
  )
}
