import { ReactNode } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { authApi, adminApi } from '../services/api'
import {
  LayoutDashboard,
  Dumbbell,
  Users,
  Shield,
  LogOut,
  Menu,
  X,
  FileText,
  Eye,
  LibraryBig,
  FileDown,
  Settings,
  UserCircle,
  Building2,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import clsx from 'clsx'
import { OFFICIAL_TTX_LOGO_URL } from '../config/branding'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [organizationName, setOrganizationName] = useState<string>('TTX Platform')
  const [organizationLogoUrl, setOrganizationLogoUrl] = useState<string | null>(OFFICIAL_TTX_LOGO_URL)
  // Fetch public configuration for logo
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const config = await adminApi.getPublicConfiguration()
        if (config.organization_name) {
          setOrganizationName(config.organization_name)
        }
        setOrganizationLogoUrl(config.organization_logo_url || OFFICIAL_TTX_LOGO_URL)
      } catch (error) {
        // Silently fail - keep defaults
        console.warn('Could not load app configuration for logo')
      }
    }
    fetchConfig()
  }, [])

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

  // Badge de rôle dans la sidebar
  const roleBadge: Record<string, { label: string; color: string }> = {
    admin: { label: 'Admin', color: 'bg-red-700 text-red-100' },
    animateur: { label: 'Animateur', color: 'bg-blue-700 text-blue-100' },
    observateur: { label: 'Observateur', color: 'bg-purple-700 text-purple-100' },
    participant: { label: 'Participant', color: 'bg-green-700 text-green-100' },
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
          'sidebar-shell fixed inset-y-0 left-0 z-40 w-64 transform transition-transform lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="sidebar-border flex items-center justify-center h-16 border-b px-4">
          {organizationLogoUrl ? (
            <img 
              src={organizationLogoUrl} 
              alt={organizationName}
              className="max-h-10 max-w-full object-contain"
              onError={(e) => {
                // Fallback to text if image fails to load
                e.currentTarget.style.display = 'none'
                setOrganizationLogoUrl(null)
              }}
            />
          ) : (
            <h1 className="text-xl font-bold truncate">{organizationName}</h1>
          )}
        </div>

        {/* Navigation */}
        <nav className="mt-6 px-3">
          <div className="space-y-1">
            {/* Dashboard – visible pour admin et animateur */}
            {isAnimateur && (
              <Link
                to="/"
                className={clsx(
                  'sidebar-link flex items-center px-4 py-2 rounded-md transition-colors',
                  isActive('/')
                    ? 'sidebar-link-active'
                    : ''
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <LayoutDashboard className="mr-3" size={20} />
                Dashboard
              </Link>
            )}

            {/* Exercices – visible pour admin, animateur et observateur */}
            {(isAnimateur || isObservateur) && (
              <Link
                to="/exercises"
                className={clsx(
                  'sidebar-link flex items-center px-4 py-2 rounded-md transition-colors',
                  location.pathname.startsWith('/exercises')
                    ? 'sidebar-link-active'
                    : ''
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <Dumbbell className="mr-3" size={20} />
                Exercices
              </Link>
            )}
          </div>

          {/* Section Administration – admin uniquement */}
          {isAdmin && (
            <div className="mt-8">
              <h3 className="sidebar-section-title px-4 text-xs font-semibold uppercase tracking-wider">
                Administration
              </h3>
              <div className="mt-3 space-y-1">
                <Link
                  to="/admin/users"
                  className={clsx(
                    'sidebar-link flex items-center px-4 py-2 rounded-md transition-colors',
                    location.pathname.startsWith('/admin/users')
                      ? 'sidebar-link-active'
                      : ''
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Users className="mr-3" size={20} />
                  Utilisateurs
                </Link>

                <Link
                  to="/admin/teams"
                  className={clsx(
                    'sidebar-link flex items-center px-4 py-2 rounded-md transition-colors',
                    location.pathname.startsWith('/admin/teams')
                      ? 'sidebar-link-active'
                      : ''
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Shield className="mr-3" size={20} />
                  Équipes
                </Link>

                <Link
                  to="/admin/inject-bank"
                  className={clsx(
                    'sidebar-link flex items-center px-4 py-2 rounded-md transition-colors',
                    location.pathname.startsWith('/admin/inject-bank')
                      ? 'sidebar-link-active'
                      : ''
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <LibraryBig className="mr-3" size={20} />
                  Banque d'inject
                </Link>

                <Link
                  to="/admin/audit"
                  className={clsx(
                    'sidebar-link flex items-center px-4 py-2 rounded-md transition-colors',
                    location.pathname.startsWith('/admin/audit')
                      ? 'sidebar-link-active'
                      : ''
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <FileText className="mr-3" size={20} />
                  Audit
                </Link>

                <Link
                  to="/admin/welcome-kits"
                  className={clsx(
                    'sidebar-link flex items-center px-4 py-2 rounded-md transition-colors',
                    location.pathname.startsWith('/admin/welcome-kits')
                      ? 'sidebar-link-active'
                      : ''
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <FileDown className="mr-3" size={20} />
                  Kits de bienvenue
                </Link>

                <Link
                  to="/admin/options"
                  className={clsx(
                    'sidebar-link flex items-center px-4 py-2 rounded-md transition-colors',
                    location.pathname.startsWith('/admin/options')
                      ? 'sidebar-link-active'
                      : ''
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Settings className="mr-3" size={20} />
                  Options
                </Link>
              </div>
            </div>
          )}

          {/* Section Observateur – info sur le rôle */}
          {isObservateur && (
            <div className="mt-8">
              <h3 className="sidebar-section-title px-4 text-xs font-semibold uppercase tracking-wider">
                Mon rôle
              </h3>
              <div className="sidebar-info-card mt-3 px-4 py-3 rounded-md">
                <div className="sidebar-info-text flex items-center gap-2 text-sm">
                  <Eye size={15} />
                  <span>Mode observateur</span>
                </div>
                <p className="sidebar-footer-muted text-xs mt-1">
                  Accès lecture seule aux exercices. Sélectionnez un exercice pour l'observer.
                </p>
              </div>
            </div>
          )}
        </nav>

        {/* Footer utilisateur */}
        <div className="sidebar-border absolute bottom-0 left-0 right-0 p-4 border-t space-y-3">
          {/* Tenant actif */}
          {user?.tenant && (
            <div className="flex items-center gap-2 px-1">
              <Building2 size={13} className="sidebar-footer-muted flex-shrink-0" style={{ color: 'var(--sidebar-footer-muted)' }} />
              <div className="min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: 'var(--sidebar-text)' }}>{user.tenant.name}</p>
                <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: 'var(--sidebar-footer-muted)' }}>{user.tenant.slug}</p>
              </div>
            </div>
          )}

          {/* Profil utilisateur */}
          <div className="flex items-center justify-between">
            <Link
              to="/profile"
              className="flex items-center gap-2 min-w-0 flex-1 rounded-md px-1 py-1 hover:bg-opacity-10 transition-colors group"
              style={{ color: 'inherit' }}
              onClick={() => setSidebarOpen(false)}
              title="Mon profil"
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
              title="Déconnexion"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay mobile */}
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
    </div>
  )
}
