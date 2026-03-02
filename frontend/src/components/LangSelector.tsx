import clsx from 'clsx'
import { Lang, useLangStore } from '../stores/langStore'

const LANGS: Array<{ code: Lang; label: string }> = [
  { code: 'fr', label: 'FR' },
  { code: 'en', label: 'EN' },
]

interface LangSelectorProps {
  className?: string
}

export default function LangSelector({ className }: LangSelectorProps) {
  const lang = useLangStore((state) => state.lang)
  const setLang = useLangStore((state) => state.setLang)

  return (
    <div
      className={clsx('inline-flex items-center gap-1 rounded-xl border p-1 backdrop-blur-md', className)}
      style={{
        backgroundColor: 'var(--login-panel-subtle-bg)',
        borderColor: 'var(--login-panel-subtle-border)',
      }}
      role="group"
      aria-label="Language selector"
    >
      {LANGS.map(({ code, label }) => {
        const active = code === lang
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            aria-pressed={active}
            className={clsx(
              'inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-semibold tracking-wide transition-colors',
              active ? 'shadow-sm' : 'hover:opacity-90'
            )}
            style={{
              backgroundColor: active ? 'var(--login-chip-active-bg)' : 'transparent',
              color: active ? 'var(--login-chip-active-text)' : 'var(--login-muted-text)',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
