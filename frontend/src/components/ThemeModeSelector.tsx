import clsx from 'clsx'
import { Laptop, Moon, Sun } from 'lucide-react'
import { ThemeMode, useThemeStore } from '../stores/themeStore'

const OPTIONS: Array<{
  mode: ThemeMode
  label: string
  icon: typeof Sun
}> = [
  { mode: 'light', label: 'LIGHT', icon: Sun },
  { mode: 'dark', label: 'DARK', icon: Moon },
  { mode: 'system', label: 'SYSTEM', icon: Laptop },
]

interface ThemeModeSelectorProps {
  className?: string
}

export default function ThemeModeSelector({ className }: ThemeModeSelectorProps) {
  const mode = useThemeStore((state) => state.mode)
  const setMode = useThemeStore((state) => state.setMode)

  return (
    <div
      className={clsx('inline-flex items-center gap-1 rounded-xl border p-1 backdrop-blur-md', className)}
      style={{
        backgroundColor: 'var(--login-panel-subtle-bg)',
        borderColor: 'var(--login-panel-subtle-border)',
      }}
      role="group"
      aria-label="Choix du thème"
    >
      {OPTIONS.map(({ mode: optionMode, label, icon: Icon }) => {
        const active = optionMode === mode
        return (
          <button
            key={optionMode}
            type="button"
            onClick={() => setMode(optionMode)}
            aria-pressed={active}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold tracking-wide transition-colors',
              active ? 'shadow-sm' : 'hover:opacity-90'
            )}
            style={{
              backgroundColor: active ? 'var(--login-chip-active-bg)' : 'transparent',
              color: active ? 'var(--login-chip-active-text)' : 'var(--login-muted-text)',
            }}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        )
      })}
    </div>
  )
}

