import { ReactNode } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { authApi, adminApi } from '../services/api'
import {
  LayoutDashboard,
  Dumbbell,
  LogOut,
  Menu,
  X,
  FileText,
  Eye,
  Settings,
  UserCircle,
  Building2,
  ExternalLink,
  Gamepad2,
  ScrollText,
  LibraryBig,
  FileDown,
  Users,
  Shield,
  Zap,
  ChevronDown,
} from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'
import { OFFICIAL_TTX_LOGO_URL } from '../config/branding'
import { useAutoSaveStore } from '../stores/autoSaveStore'
import AutoSaveIndicator from './AutoSaveIndicator'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { t } = useTranslation()
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const appVersion = import.meta.env.VITE_APP_VERSION || 'dev'
  const buildDateIso = import.meta.env.VITE_BUILD_DATE || ''
  const commitId = import.meta.env.VITE_COMMIT_ID || '-'
  const parsedBuildDate = buildDateIso ? new Date(buildDateIso) : null
  const buildDateDisplay =
    parsedBuildDate && !Number.isNaN(parsedBuildDate.getTime())
      ? parsedBuildDate.toLocaleString('fr-FR', {
          dateStyle: 'short',
          timeStyle: 'short',
        })
      : buildDateIso || '-'
  const { status: autoSaveStatus, errorMessage: autoSaveError } = useAutoSaveStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(true)
  const [docsOpen, setDocsOpen] = useState(false)

  const { data: publicConfig } = useQuery({
    queryKey: ['public-configuration'],
    queryFn: adminApi.getPublicConfiguration,
    staleTime: 30_000,
  })
  const organizationName = publicConfig?.organization_name || 'Crisis-Lab'
  const organizationLogoUrl = publicConfig?.organization_logo_url || OFFICIAL_TTX_LOGO_URL

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch (e) {
      // Ignore logout errors
    }
    logout()
    navigate('/login')
  }

  const isAdmin = user?.role === 'admin'
  const isAnimateur = user?.role === 'animateur' || isAdmin
  const isObservateur = user?.role === 'observateur'

  const isActive = (path: string) => location.pathname === path

  const roleBadge: Record<string, { label: string; color: string }> = {
    admin: { label: t('roles.admin'), color: 'bg-red-700 text-red-100' },
    animateur: { label: t('roles.animateur'), color: 'bg-primary-700 text-primary-100' },
    observateur: { label: t('roles.observateur'), color: 'bg-purple-700 text-purple-100' },
    participant: { label: t('roles.participant'), color: 'bg-green-700 text-green-100' },
  }
  const badge = roleBadge[user?.role ?? '']

  return (
    <div className="app-shell min-h-screen">
      {/* Mobile menu button */}
      <button
        className="sidebar-mobile-menu-btn lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md shadow"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <aside
        className={clsx(
          'sidebar-shell fixed inset-y-0 left-0 z-40 w-64 transform transition-transform lg:translate-x-0 flex flex-col',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logos */}
        <div className="sidebar-border flex flex-col items-center border-b px-4 py-3 gap-2 flex-shrink-0">
          {/* Crisis Lab branding — dark/light variants */}
          <img
            src="/logo_dark.png"
            alt="Crisis Lab"
            className="w-full object-contain hidden dark:block"
          />
          <img
            src="/logo_light.png"
            alt="Crisis Lab"
            className="w-full object-contain block dark:hidden"
          />
          {/* Organisation logo */}
          {organizationLogoUrl && (
            <>
              <div className="sidebar-border w-full border-t" />
              <img
                key={organizationLogoUrl}
                src={organizationLogoUrl}
                alt={organizationName}
                className="max-w-full object-contain"
                style={{ maxHeight: '50%' }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto mt-6 px-3 pb-4">
          <div className="space-y-1">
            {isObservateur && (
              <Link
                to="/exercises"
                className={clsx(
                  'sidebar-link flex items-center px-4 py-2 rounded-md transition-colors',
                  location.pathname.startsWith('/exercises') && !location.pathname.startsWith('/exercises/preparation') ? 'sidebar-link-active' : ''
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <Dumbbell className="mr-3" size={20} />
                {t('nav.exercises')}
              </Link>
            )}
          </div>

          {/* Exercices section */}
          {isAnimateur && (
            <div className="mt-8">
              <h3 className="sidebar-section-title px-4 text-xs font-semibold uppercase tracking-wider">
                {t('nav.exercisesSection')}
              </h3>
              <div className="mt-3 space-y-1">

                {/* Préparation — label non cliquable */}
                <p className="px-4 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--sidebar-footer-muted)' }}>
                  {t('nav.preparation')}
                </p>

                {/* Sous-liens Préparation */}
                <div className="space-y-0.5 pl-3">
                  <Link
                    to="/exercises/preparation/organisation"
                    className={clsx(
                      'sidebar-link flex items-center px-3 py-1.5 rounded-md transition-colors text-sm',
                      location.pathname === '/exercises/preparation/organisation' ? 'sidebar-link-active' : ''
                    )}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <Building2 className="mr-2.5" size={16} />
                    {t('nav.organisation')}
                  </Link>
                  <Link
                    to="/exercises"
                    className={clsx(
                      'sidebar-link flex items-center px-3 py-1.5 rounded-md transition-colors text-sm',
                      location.pathname.startsWith('/exercises') && !location.pathname.startsWith('/exercises/preparation') ? 'sidebar-link-active' : ''
                    )}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <Dumbbell className="mr-2.5" size={16} />
                    {t('nav.exercises')}
                  </Link>
                  <Link
                    to="/exercises/preparation/participants"
                    className={clsx(
                      'sidebar-link flex items-center px-3 py-1.5 rounded-md transition-colors text-sm',
                      location.pathname === '/exercises/preparation/participants' ? 'sidebar-link-active' : ''
                    )}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <Users className="mr-2.5" size={16} />
                    {t('nav.users')}
                  </Link>
                  <Link
                    to="/exercises/preparation/equipes"
                    className={clsx(
                      'sidebar-link flex items-center px-3 py-1.5 rounded-md transition-colors text-sm',
                      location.pathname === '/exercises/preparation/equipes' ? 'sidebar-link-active' : ''
                    )}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <Shield className="mr-2.5" size={16} />
                    {t('nav.teams')}
                  </Link>
                  <Link
                    to="/exercises/preparation/injects"
                    className={clsx(
                      'sidebar-link flex items-center px-3 py-1.5 rounded-md transition-colors text-sm',
                      location.pathname === '/exercises/preparation/injects' ? 'sidebar-link-active' : ''
                    )}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <LibraryBig className="mr-2.5" size={16} />
                    {t('nav.injectBank')}
                  </Link>
                  <Link
                    to="/exercises/preparation/kits"
                    className={clsx(
                      'sidebar-link flex items-center px-3 py-1.5 rounded-md transition-colors text-sm',
                      location.pathname === '/exercises/preparation/kits' ? 'sidebar-link-active' : ''
                    )}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <FileDown className="mr-2.5" size={16} />
                    {t('nav.welcomeKits')}
                  </Link>
                </div>

                {/* Analyses */}
                <p className="px-4 pt-3 pb-0.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--sidebar-footer-muted)' }}>
                  {t('nav.analyses')}
                </p>
                <div className="space-y-0.5 pl-3">
                  <Link
                    to="/"
                    className={clsx(
                      'sidebar-link flex items-center px-3 py-1.5 rounded-md transition-colors text-sm',
                      isActive('/') ? 'sidebar-link-active' : ''
                    )}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <LayoutDashboard className="mr-2.5" size={16} />
                    {t('nav.dashboard')}
                  </Link>
                </div>

              </div>
            </div>
          )}

          {/* Simulation section */}
          {isAnimateur && (
            <div className="mt-8">
              <h3 className="sidebar-section-title px-4 text-xs font-semibold uppercase tracking-wider">
                {t('nav.simulation')}
              </h3>
              <div className="mt-3 space-y-1">
                <Link
                  to="/player"
                  className={clsx(
                    'sidebar-link flex items-center px-4 py-2 rounded-md transition-colors',
                    location.pathname.startsWith('/player') ? 'sidebar-link-active' : ''
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Gamepad2 className="mr-3" size={20} />
                  {t('nav.player')}
                </Link>
              </div>
            </div>
          )}

          {/* Administration section (collapsible) */}
          {isAdmin && (
            <div className="mt-8">
              <button
                onClick={() => setAdminOpen(o => !o)}
                className="sidebar-section-title w-full flex items-center justify-between px-4 text-xs font-semibold uppercase tracking-wider"
              >
                {t('nav.administration')}
                <ChevronDown size={14} className={clsx('transition-transform', adminOpen ? '' : '-rotate-90')} />
              </button>
              {adminOpen && (
                <div className="mt-3 space-y-1">
                  <Link
                    to="/admin/options"
                    className={clsx(
                      'sidebar-link flex items-center px-4 py-2 rounded-md transition-colors',
                      location.pathname.startsWith('/admin/options') ? 'sidebar-link-active' : ''
                    )}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <Settings className="mr-3" size={20} />
                    {t('nav.options')}
                  </Link>

                  <Link
                    to="/admin/audit"
                    className={clsx(
                      'sidebar-link flex items-center px-4 py-2 rounded-md transition-colors',
                      location.pathname.startsWith('/admin/audit') ? 'sidebar-link-active' : ''
                    )}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <FileText className="mr-3" size={20} />
                    {t('nav.audit')}
                  </Link>

                  <Link
                    to="/admin/logs"
                    className={clsx(
                      'sidebar-link flex items-center px-4 py-2 rounded-md transition-colors',
                      location.pathname.startsWith('/admin/logs') ? 'sidebar-link-active' : ''
                    )}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <ScrollText className="mr-3" size={20} />
                    {t('nav.logs')}
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Documentation section (collapsible) */}
          {isAdmin && (
            <div className="mt-8">
              <button
                onClick={() => setDocsOpen(o => !o)}
                className="sidebar-section-title w-full flex items-center justify-between px-4 text-xs font-semibold uppercase tracking-wider"
              >
                {t('nav.documentations')}
                <ChevronDown size={14} className={clsx('transition-transform', docsOpen ? '' : '-rotate-90')} />
              </button>
              {docsOpen && (
                <div className="mt-3 space-y-1">
                  <a
                    href="/api/docs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sidebar-link flex items-center px-4 py-2 rounded-md transition-colors"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <ExternalLink className="mr-3" size={20} />
                    {t('nav.apiDocs')}
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Observer section */}
          {isObservateur && (
            <div className="mt-8">
              <h3 className="sidebar-section-title px-4 text-xs font-semibold uppercase tracking-wider">
                {t('observer.role')}
              </h3>
              <div className="sidebar-info-card mt-3 px-4 py-3 rounded-md">
                <div className="sidebar-info-text flex items-center gap-2 text-sm">
                  <Eye size={15} />
                  <span>{t('observer.mode')}</span>
                </div>
                <p className="sidebar-footer-muted text-xs mt-1">
                  {t('observer.readOnly')}
                </p>
              </div>
            </div>
          )}
        </nav>

        {/* User footer */}
        <div className="sidebar-border flex-shrink-0 p-4 border-t space-y-3">
          <div className="flex flex-col gap-2 px-1">
            <a
              href={`https://${user?.tenant?.slug ?? 'app'}.crisis-lab.eu`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-opacity hover:opacity-90"
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#fff',
              }}
            >
              <Zap size={11} />
              {t('nav.upgradeToEnterprise')}
            </a>
            <span
              className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
              style={{
                borderColor: 'var(--sidebar-footer-card-border)',
                backgroundColor: 'var(--sidebar-footer-card-bg)',
                color: 'var(--sidebar-text)',
              }}
            >
              Community Edition
            </span>
          </div>

          {user?.tenant && (
            <div className="flex items-center gap-2 px-1">
              <Building2 size={13} className="sidebar-footer-muted flex-shrink-0" style={{ color: 'var(--sidebar-footer-muted)' }} />
              <div className="min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: 'var(--sidebar-text)' }}>{user.tenant.name}</p>
                <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: 'var(--sidebar-footer-muted)' }}>{user.tenant.slug}</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Link
              to="/profile"
              className="flex items-center gap-2 min-w-0 flex-1 rounded-md px-1 py-1 hover:bg-opacity-10 transition-colors group"
              style={{ color: 'inherit' }}
              onClick={() => setSidebarOpen(false)}
              title={t('nav.profile')}
            >
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt="avatar"
                  className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-gray-600"
                />
              ) : (
                <UserCircle size={20} className="flex-shrink-0" style={{ color: 'var(--sidebar-footer-muted)' }} />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate leading-tight" style={{ color: 'var(--sidebar-text)' }}>
                  {user?.display_name || user?.username}
                </p>
                {badge && (
                  <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-medium', badge.color)}>
                    {badge.label}
                  </span>
                )}
              </div>
            </Link>
            <button
              onClick={handleLogout}
              className="p-2 hover:opacity-100 opacity-75 flex-shrink-0 transition-opacity"
              style={{ color: 'var(--sidebar-footer-muted)' }}
              title={t('nav.logout')}
            >
              <LogOut size={18} />
            </button>
          </div>

          <div className="px-1 pt-2 border-t" style={{ borderColor: 'var(--sidebar-footer-card-border)' }}>
            <p className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--sidebar-footer-muted)' }}>
              Version {appVersion}
            </p>
            <p className="text-[10px]" style={{ color: 'var(--sidebar-footer-muted)' }}>
              Build: {buildDateDisplay}
            </p>
            <p className="text-[10px] font-mono" style={{ color: 'var(--sidebar-footer-muted)' }}>
              Commit: {commitId}
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="lg:ml-64">
        <div className="p-6">{children}</div>
      </main>

      {/* Global autosave indicator */}
      {autoSaveStatus !== 'idle' && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-gray-800/95 border border-gray-700 rounded-lg px-3 py-2 shadow-xl backdrop-blur-sm">
          <AutoSaveIndicator status={autoSaveStatus} errorMessage={autoSaveError} />
        </div>
      )}
    </div>
  )
}
