import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/authStore'
import { authApi, adminApi } from '../services/api'
import ThemeModeSelector from '../components/ThemeModeSelector'
import LangSelector from '../components/LangSelector'
import DevDrawer from '../components/login/DevDrawer'
import { OFFICIAL_TTX_LOGO_URL } from '../config/branding'

const isDevelopment = import.meta.env.DEV

function inferTenantSlugFromHost(hostname: string): string | null {
  const host = hostname.toLowerCase()

  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return 'default'
  }

  if (host.endsWith('.localhost')) {
    const tenantSlug = host.slice(0, -'.localhost'.length)
    return tenantSlug || null
  }

  const parts = host.split('.').filter(Boolean)
  if (parts.length >= 3 && parts[0] !== 'www') {
    return parts[0]
  }

  return null
}

function formatTenantName(slug: string | null): string | null {
  if (!slug) return null
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.toUpperCase())
    .join(' ')
}

export default function LoginPage() {
  const { t } = useTranslation()
  const [usernameOrEmail, setUsernameOrEmail] = useState('')
  const [password, setPassword] = useState('')
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

    const hostTenantSlug =
      typeof window !== 'undefined' ? inferTenantSlugFromHost(window.location.hostname) : null
    if (hostTenantSlug) {
      setTenantSlug(hostTenantSlug)
    }

    const loadPublicConfig = async () => {
      try {
        const config = await adminApi.getPublicConfiguration()
        if (canceled) return

        if (config.organization_name?.trim()) {
          setOrganizationName(config.organization_name.trim())
        }
        setOrganizationLogoUrl(config.organization_logo_url || OFFICIAL_TTX_LOGO_URL)
        if (config.tenant_slug?.trim()) {
          setTenantSlug(config.tenant_slug.trim())
        }
      } catch {
        // Public branding is optional on login.
      }
    }

    loadPublicConfig()
    return () => {
      canceled = true
    }
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
  const loginTitle = organizationName || tenantName || 'TTX Platform'

  return (
    <div className="login-scene relative isolate min-h-screen overflow-hidden py-12 px-4 sm:px-6 lg:px-8">
      <div className="login-grid" aria-hidden="true" />
      <div className="login-orb login-orb-a" aria-hidden="true" />
      <div className="login-orb login-orb-b" aria-hidden="true" />
      <div className="login-orb login-orb-c" aria-hidden="true" />
      <div className="login-vignette" aria-hidden="true" />

      <div className="relative mx-auto mb-6 flex max-w-5xl items-center justify-end gap-2">
        <LangSelector />
        <ThemeModeSelector />
      </div>

      <div className="relative mx-auto flex min-h-[70vh] max-w-5xl items-center justify-center">
        <div className="grid w-full items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="hidden lg:block px-4">
            <div className="flex flex-wrap items-center gap-2 mt-3">
            </div>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight md:text-5xl" style={{ color: 'var(--login-text)' }}>
              {loginTitle}
            </h1>
            <p className="mt-4 max-w-lg text-base leading-relaxed login-muted">
              {t('login.platformTagline')}
            </p>
            {tenantName && (
              <div className="mt-6 inline-flex items-center gap-3 rounded-2xl border px-4 py-3 backdrop-blur-md" style={{ borderColor: 'var(--login-panel-subtle-border)', backgroundColor: 'var(--login-panel-subtle-bg)' }}>
                <div className="h-10 w-10 rounded-xl bg-primary-500/20 ring-1 ring-primary-400/30 flex items-center justify-center text-primary-300 font-bold">
                  {tenantName.slice(0, 2)}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] login-muted">{t('common.tenant')}</p>
                  <p className="text-sm font-semibold" style={{ color: 'var(--login-text)' }}>
                    {tenantName}
                  </p>
                </div>
              </div>
            )}
          </section>

          <section
            className="w-full rounded-2xl border p-6 shadow-2xl backdrop-blur-xl sm:p-8"
            style={{
              backgroundColor: 'var(--login-card-bg)',
              borderColor: 'var(--login-card-border)',
              boxShadow: '0 24px 80px rgba(2, 6, 23, 0.35)',
            }}
          >
            <div>
              {organizationLogoUrl ? (
                <div className="mb-4 flex justify-center">
                  <img
                    src={organizationLogoUrl}
                    alt={organizationName}
                    className="max-h-14 max-w-[220px] object-contain"
                    onError={() => setOrganizationLogoUrl(null)}
                  />
                </div>
              ) : null}

              <h2 className="text-center text-3xl font-extrabold" style={{ color: 'var(--login-text)' }}>
                {t('login.title')}
              </h2>
              <p className="mt-2 text-center text-sm login-muted">
                {tenantName ? t('login.tenantSpace', { name: tenantName }) : t('login.subtitle')}
              </p>
              {tenantSlug && tenantSlug !== 'default' && (
                <p className="mt-1 text-center text-xs uppercase tracking-[0.18em] login-muted">
                  {tenantSlug}
                </p>
              )}
            </div>

            <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
              {error && (
                <div className="rounded-lg border border-red-500/50 bg-red-950/60 px-4 py-3 text-sm font-medium text-red-200">
                  {error}
                </div>
              )}

              <div className="rounded-md shadow-sm -space-y-px">
                <div>
                  <label htmlFor="username" className="sr-only">
                    {t('login.username')}
                  </label>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    className="login-input appearance-none rounded-none relative block w-full px-3 py-2 rounded-t-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                    placeholder={t('login.username')}
                    value={usernameOrEmail}
                    onChange={(e) => setUsernameOrEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="password" className="sr-only">
                    {t('login.password')}
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    className="login-input appearance-none rounded-none relative block w-full px-3 py-2 rounded-b-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                    placeholder={t('login.password')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:opacity-50"
                >
                  {loading ? t('login.connecting') : t('login.submit')}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>

      {isDevelopment && (
        <DevDrawer onDevLogin={handleDevLogin} devLoading={devLoading} />
      )}
    </div>
  )
}
