import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/authStore'
import { authApi, adminApi } from '../services/api'
import ThemeModeSelector from '../components/ThemeModeSelector'
import LangSelector from '../components/LangSelector'
import DevDrawer from '../components/login/DevDrawer'
import { OFFICIAL_TTX_LOGO_URL } from '../config/branding'
import { useThemeStore, resolveThemeMode } from '../stores/themeStore'
import { User, Lock, Eye, EyeOff } from 'lucide-react'

function inferTenantSlugFromHost(hostname: string): string | null {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return 'default'
  if (host.endsWith('.localhost')) return host.slice(0, -'.localhost'.length) || null
  const parts = host.split('.').filter(Boolean)
  if (parts.length >= 3 && parts[0] !== 'www') return parts[0]
  return null
}

function formatTenantName(slug: string | null): string | null {
  if (!slug) return null
  return slug.split(/[-_]+/).filter(Boolean).map((p) => p.toUpperCase()).join(' ')
}

export default function LoginPage() {
  const { t } = useTranslation()
  const themeMode = useThemeStore((s) => s.mode)
  const isDark = resolveThemeMode(themeMode) === 'dark'
  const crisisLabLogo = isDark ? '/logo_dark.png' : '/logo_light.png'

  const [usernameOrEmail, setUsernameOrEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [devLoading, setDevLoading] = useState<string | null>(null)
  const [organizationName, setOrganizationName] = useState('TTX Platform')
  const [organizationLogoUrl, setOrganizationLogoUrl] = useState<string | null>(OFFICIAL_TTX_LOGO_URL)
  const [tenantSlug, setTenantSlug] = useState<string | null>(
    typeof window !== 'undefined' ? inferTenantSlugFromHost(window.location.hostname) : null
  )
  const { setUser, setCsrfToken } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    let canceled = false
    const hostSlug = typeof window !== 'undefined' ? inferTenantSlugFromHost(window.location.hostname) : null
    if (hostSlug) setTenantSlug(hostSlug)
    adminApi.getPublicConfiguration().then((config) => {
      if (canceled) return
      if (config.organization_name?.trim()) setOrganizationName(config.organization_name.trim())
      setOrganizationLogoUrl(config.organization_logo_url || OFFICIAL_TTX_LOGO_URL)
      if (config.tenant_slug?.trim()) setTenantSlug(config.tenant_slug.trim())
    }).catch(() => {})
    return () => { canceled = true }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const response = await authApi.login(usernameOrEmail, password)
      setUser({ ...response.user, tenant: response.tenant })
      setCsrfToken(response.csrf_token)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.detail || t('login.errorDefault'))
    } finally {
      setLoading(false)
    }
  }

  const handleDevLogin = async (role: 'admin' | 'animateur' | 'observateur' | 'participant') => {
    setError('')
    setDevLoading(role)
    try {
      const response = await authApi.devLogin(role)
      setUser({ ...response.user, tenant: response.tenant })
      setCsrfToken(response.csrf_token)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.detail || t('login.errorDevDefault'))
    } finally {
      setDevLoading(null)
    }
  }

  const tenantName = (tenantSlug && tenantSlug !== 'default') ? formatTenantName(tenantSlug) : null

  /* ── Couleurs panel droit selon thème ── */
  const panel = {
    bg:          isDark ? '#0f172a' : '#ffffff',
    text:        isDark ? '#f1f5f9' : '#0f172a',
    muted:       isDark ? '#94a3b8' : '#64748b',
    inputBg:     isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc',
    inputBorder: isDark ? 'rgba(148,163,184,0.22)' : '#e2e8f0',
    inputText:   isDark ? '#f1f5f9' : '#0f172a',
    inputPlaceholder: isDark ? '#475569' : '#94a3b8',
  }

  return (
    <div className="flex min-h-screen">

      {/* ══════════════════════════════════
          LEFT — Photo avec bord 3D
      ══════════════════════════════════ */}
      {/* drop-shadow sur le wrapper, clip-path sur l'inner → shadow suit la découpe */}
      <div
        className="relative hidden lg:block lg:w-[55%] shrink-0"
        style={{
          zIndex: 10,
          filter: 'drop-shadow(20px 0 40px rgba(0,0,0,0.55)) drop-shadow(4px 0 6px rgba(0,0,0,0.30))',
        }}
      >
        <div
          className="relative h-full w-full overflow-hidden"
          style={{ clipPath: 'polygon(0 0, 100% 0, calc(100% - 56px) 100%, 0 100%)' }}
        >
          <img
            src="/login-bg.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-60"
          />
          {/* Dégradé bas */}
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/60 to-transparent" />
          <p className="absolute bottom-5 left-6 text-xs font-medium text-white/70">
            © {new Date().getFullYear()} CrisisLab
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════
          RIGHT — Formulaire
      ══════════════════════════════════ */}
      <div
        className="flex w-full flex-col lg:w-[45%]"
        style={{ backgroundColor: panel.bg, marginLeft: '-28px', zIndex: 5 }}
      >
        {/* Barre du haut */}
        <div className="flex items-center justify-end gap-2 px-8 pt-6">
          <LangSelector />
          <ThemeModeSelector />
        </div>

        {/* Contenu centré verticalement */}
        <div className="flex flex-1 flex-col items-center justify-center px-10 pb-24 pt-0 sm:px-16" style={{ marginTop: '-80px' }}>
          <div className="w-full max-w-sm">

            {/* Logo grand centré */}
            <div className="mb-10 flex justify-center">
              <img
                src={crisisLabLogo}
                alt="CrisisLab"
                className="h-24 object-contain sm:h-28"
              />
            </div>

            {/* Titre */}
            <div className="mb-8">
              {organizationLogoUrl && (
                <img
                  src={organizationLogoUrl}
                  alt={organizationName}
                  className="mb-3 max-h-10 max-w-[160px] object-contain"
                  onError={() => setOrganizationLogoUrl(null)}
                />
              )}
              <h1 className="text-3xl font-extrabold leading-tight" style={{ color: panel.text }}>
                {organizationName}
              </h1>
              <p className="mt-1 text-base" style={{ color: panel.muted }}>
                {tenantName ? t('login.tenantSpace', { name: tenantName }) : t('login.subtitle')}
              </p>
            </div>

            {/* Formulaire */}
            <form className="space-y-4" onSubmit={handleSubmit}>
              {error && (
                <div className="rounded-lg border border-red-400/50 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950/50 dark:text-red-200">
                  {error}
                </div>
              )}

              {/* Username */}
              <div className="space-y-1.5">
                <label
                  htmlFor="username"
                  className="block text-sm font-medium"
                  style={{ color: panel.muted }}
                >
                  {t('login.username')}
                </label>
                <div className="relative">
                  <span
                    className="pointer-events-none absolute inset-y-0 left-3 flex items-center"
                    style={{ color: panel.inputPlaceholder }}
                  >
                    <User size={15} />
                  </span>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    autoComplete="username"
                    className="block w-full rounded-xl py-3 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    style={{
                      backgroundColor: panel.inputBg,
                      border: `1.5px solid ${panel.inputBorder}`,
                      color: panel.inputText,
                    }}
                    placeholder={t('login.username')}
                    value={usernameOrEmail}
                    onChange={(e) => setUsernameOrEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium"
                  style={{ color: panel.muted }}
                >
                  {t('login.password')}
                </label>
                <div className="relative">
                  <span
                    className="pointer-events-none absolute inset-y-0 left-3 flex items-center"
                    style={{ color: panel.inputPlaceholder }}
                  >
                    <Lock size={15} />
                  </span>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    className="block w-full rounded-xl py-3 pl-9 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    style={{
                      backgroundColor: panel.inputBg,
                      border: `1.5px solid ${panel.inputBorder}`,
                      color: panel.inputText,
                    }}
                    placeholder={t('login.password')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-3 flex items-center opacity-60 hover:opacity-100"
                    style={{ color: panel.muted }}
                    aria-label={showPassword ? 'Masquer' : 'Afficher'}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
                style={{ backgroundColor: '#0f172a' }}
              >
                {loading ? t('login.connecting') : t('login.submit')}
              </button>
            </form>

            {/* Enterprise upgrade badge */}
            <a
              href="https://crisis-lab.eu/enterprise"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
              style={{
                borderColor: isDark ? 'rgba(250,204,21,0.35)' : 'rgba(202,138,4,0.35)',
                backgroundColor: isDark ? 'rgba(250,204,21,0.08)' : 'rgba(254,252,232,0.9)',
                color: isDark ? '#fde047' : '#854d0e',
              }}
            >
              <span className="text-base leading-none">⭐</span>
              {t('nav.upgradeToEnterprise')}
            </a>

            {/* Community edition tag */}
            <p className="mt-4 text-center text-xs" style={{ color: panel.muted }}>
              Community Edition
            </p>
          </div>
        </div>
      </div>

      {import.meta.env.DEV && (
        <DevDrawer onDevLogin={handleDevLogin} devLoading={devLoading} />
      )}
    </div>
  )
}
