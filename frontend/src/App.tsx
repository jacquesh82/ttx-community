import { useEffect, useState, ReactNode } from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { applyThemeToDocument, useThemeStore } from './stores/themeStore'
import { authApi } from './services/api'

// Layouts
import Layout from './components/Layout'
import PlayerLayout from './components/player/PlayerLayout'
import ObservateurLayout from './components/ObservateurLayout'

// Context
import { PlayerProvider } from './contexts/PlayerContext'

// Auth
import LoginPage from './pages/LoginPage'

// Debug (development only)
import DebugEventsEmitPage from './pages/debug/DebugEventsEmitPage'
import DebugEventsReceivePage from './pages/debug/DebugEventsReceivePage'
import DebugTimelineRtPage from './pages/debug/DebugTimelineRtPage'

// Participant
import ParticipantLandingPage from './pages/ParticipantLandingPage'

// Player pages (joueur)
import PlayerHomePage from './pages/player/PlayerHomePage'
import PlayerTimelinePage from './pages/player/PlayerTimelinePage'
import PlayerTVLivePage from './pages/player/PlayerTVLivePage'
import PlayerMailPage from './pages/player/PlayerMailPage'
import PlayerChatPage from './pages/player/PlayerChatPage'
import PlayerDecisionsPage from './pages/player/PlayerDecisionsPage'
import PlayerMediaPage from './pages/player/PlayerMediaPage'
import PlayerSocialFeedPage from './pages/player/PlayerSocialFeedPage'
import PlayerPhonePage from './pages/player/PlayerPhonePage'
import PlayerPressFeedPage from './pages/player/PlayerPressFeedPage'
import PlayerSMSPage from './pages/player/PlayerSMSPage'

// Admin / Animateur pages
import DashboardPage from './pages/DashboardPage'
import ExercisesPage from './pages/ExercisesPage'
import ExerciseDetailPage from './pages/ExerciseDetailPage'
import ExerciseNewPage from './pages/ExerciseNewPage'
import ExerciseInjectsPage from './pages/ExerciseInjectsPage'
import ExerciseChronogrammePage from './pages/ExerciseChronogrammePage'
import ExerciseTimelineGanttPage from './pages/ExerciseTimelineGanttPage'
import ExerciseScenarioPage from './pages/ExerciseScenarioPage'
import ExerciseLiveControlPage from './pages/ExerciseLiveControlPage'
import ExerciseEvaluationPage from './pages/ExerciseEvaluationPage'
import AnimateurDashboardPage from './pages/AnimateurDashboardPage'
import WebmailPage from './pages/WebmailPage'
import WebmailConversationPage from './pages/WebmailConversationPage'
import WebmailNewPage from './pages/WebmailNewPage'
import CrisisContactsPage from './pages/CrisisContactsPage'
import MediaLibraryPage from './pages/MediaLibraryPage'
import TVLivePage from './pages/TVLivePage'
import TVStudioPage from './pages/TVStudioPage'

// User profile
import UserProfilePage from './pages/UserProfilePage'

// Admin only pages
import AdminUsersPage from './pages/admin/UsersPage'
import AdminTeamsPage from './pages/admin/TeamsPage'
import AdminAuditPage from './pages/admin/AuditPage'
import InjectBankPage from './pages/admin/InjectBankPage'
import ChatGptConnectionPage from './pages/admin/ChatGptConnectionPage'
import WelcomeKitTemplatesPage from './pages/admin/WelcomeKitTemplatesPage'
import OptionsPage from './pages/admin/OptionsPage'
import LogsPage from './pages/admin/LogsPage'
import ExercisePreparationHubPage from './pages/ExercisePreparationHubPage'

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

type Role = 'admin' | 'animateur' | 'observateur' | 'participant'

/** Renvoie une redirection si le rôle de l'utilisateur n'est pas autorisé. */
function RoleGuard({
  allowed,
  redirectTo = '/',
  children,
}: {
  allowed: Role[]
  redirectTo?: string
  children: ReactNode
}) {
  const { user } = useAuthStore()
  if (!user) return <Navigate to="/login" replace />
  if (!allowed.includes(user.role as Role)) return <Navigate to={redirectTo} replace />
  return children
}

// ─────────────────────────────────────────────
// App
// ─────────────────────────────────────────────

function App() {
  const { user, setUser, setCsrfToken, logout } = useAuthStore()
  const themeMode = useThemeStore((state) => state.mode)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)

  useEffect(() => {
    applyThemeToDocument(themeMode)
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = () => {
      if (themeMode === 'system') {
        applyThemeToDocument(themeMode)
      }
    }
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleSystemThemeChange)
      return () => mediaQuery.removeEventListener('change', handleSystemThemeChange)
    }
    mediaQuery.addListener(handleSystemThemeChange)
    return () => mediaQuery.removeListener(handleSystemThemeChange)
  }, [themeMode])

  useEffect(() => {
    const checkAuth = async () => {
      if (user) {
        try {
          const response = await authApi.getMe()
          setUser({ ...response.user, tenant: response.tenant })
          setCsrfToken(response.csrf_token)
        } catch (error) {
          logout()
        }
      }
      setIsCheckingAuth(false)
    }
    checkAuth()
  }, [])

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white">Chargement...</div>
      </div>
    )
  }

  // Non connecté → login uniquement (mais debug pages accessibles)
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* Debug pages accessible without auth in dev mode */}
        <Route path="/debug/events_emit" element={<DebugEventsEmitPage />} />
        <Route path="/debug/events_receive" element={<DebugEventsReceivePage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <>
      <Routes>

      {/* ─── PAGE D'ACCUEIL SELON LE RÔLE ─── */}
      <Route path="/" element={
        <RoleGuard allowed={['admin', 'animateur', 'observateur']} redirectTo="/participant">
          <Layout><DashboardPage /></Layout>
        </RoleGuard>
      } />

      {/* ─── ANIMATEUR : interface de pilotage temps réel ─── */}
      <Route
        path="/animateur"
        element={
          <RoleGuard allowed={['admin', 'animateur']} redirectTo="/">
            <AnimateurDashboardPage />
          </RoleGuard>
        }
      />

      {/* ─── PARTICIPANT : page de sélection d'exercice ─── */}
      <Route
        path="/participant"
        element={
          <RoleGuard allowed={['participant', 'admin']} redirectTo="/">
            <ParticipantLandingPage />
          </RoleGuard>
        }
      />

      {/* ─── JOUEUR : interface de jeu ─── */}
      <Route
        path="/play/:exerciseId"
        element={
          <PlayerProvider>
            <PlayerLayout><PlayerHomePage /></PlayerLayout>
          </PlayerProvider>
        }
      />
      <Route
        path="/play/:exerciseId/timeline"
        element={
          <PlayerProvider>
            <PlayerLayout><PlayerTimelinePage /></PlayerLayout>
          </PlayerProvider>
        }
      />
      <Route
        path="/play/:exerciseId/tv"
        element={
          <PlayerProvider>
            <PlayerLayout><PlayerTVLivePage /></PlayerLayout>
          </PlayerProvider>
        }
      />
      <Route
        path="/play/:exerciseId/mail"
        element={
          <PlayerProvider>
            <PlayerLayout><PlayerMailPage /></PlayerLayout>
          </PlayerProvider>
        }
      />
      <Route
        path="/play/:exerciseId/chat"
        element={
          <PlayerProvider>
            <PlayerLayout><PlayerChatPage /></PlayerLayout>
          </PlayerProvider>
        }
      />
      <Route
        path="/play/:exerciseId/decisions"
        element={
          <PlayerProvider>
            <PlayerLayout><PlayerDecisionsPage /></PlayerLayout>
          </PlayerProvider>
        }
      />
      <Route
        path="/play/:exerciseId/media"
        element={
          <PlayerProvider>
            <PlayerLayout><PlayerMediaPage /></PlayerLayout>
          </PlayerProvider>
        }
      />
      <Route
        path="/play/:exerciseId/social"
        element={
          <PlayerProvider>
            <PlayerLayout><PlayerSocialFeedPage /></PlayerLayout>
          </PlayerProvider>
        }
      />
      <Route
        path="/play/:exerciseId/phone"
        element={
          <PlayerProvider>
            <PlayerLayout><PlayerPhonePage /></PlayerLayout>
          </PlayerProvider>
        }
      />
      <Route
        path="/play/:exerciseId/press"
        element={
          <PlayerProvider>
            <PlayerLayout><PlayerPressFeedPage /></PlayerLayout>
          </PlayerProvider>
        }
      />
      <Route
        path="/play/:exerciseId/sms"
        element={
          <PlayerProvider>
            <PlayerLayout><PlayerSMSPage /></PlayerLayout>
          </PlayerProvider>
        }
      />

      {/* ─── OBSERVATEUR : interface lecture seule ─── */}
      {/* L'observateur réutilise les pages joueur mais dans ObservateurLayout */}
      <Route
        path="/observe/:exerciseId"
        element={
          <RoleGuard allowed={['observateur', 'animateur', 'admin']} redirectTo="/">
            <ObservateurLayout><PlayerHomePage /></ObservateurLayout>
          </RoleGuard>
        }
      />
      <Route
        path="/observe/:exerciseId/timeline"
        element={
          <RoleGuard allowed={['observateur', 'animateur', 'admin']} redirectTo="/">
            <ObservateurLayout><PlayerTimelinePage /></ObservateurLayout>
          </RoleGuard>
        }
      />
      <Route
        path="/observe/:exerciseId/mail"
        element={
          <RoleGuard allowed={['observateur', 'animateur', 'admin']} redirectTo="/">
            <ObservateurLayout><PlayerMailPage /></ObservateurLayout>
          </RoleGuard>
        }
      />
      <Route
        path="/observe/:exerciseId/chat"
        element={
          <RoleGuard allowed={['observateur', 'animateur', 'admin']} redirectTo="/">
            <ObservateurLayout><PlayerChatPage /></ObservateurLayout>
          </RoleGuard>
        }
      />
      <Route
        path="/observe/:exerciseId/tv"
        element={
          <RoleGuard allowed={['observateur', 'animateur', 'admin']} redirectTo="/">
            <ObservateurLayout><PlayerTVLivePage /></ObservateurLayout>
          </RoleGuard>
        }
      />
      <Route
        path="/observe/:exerciseId/media"
        element={
          <RoleGuard allowed={['observateur', 'animateur', 'admin']} redirectTo="/">
            <ObservateurLayout><PlayerMediaPage /></ObservateurLayout>
          </RoleGuard>
        }
      />
      <Route
        path="/observe/:exerciseId/scores"
        element={
          <RoleGuard allowed={['observateur', 'animateur', 'admin']} redirectTo="/">
            <ObservateurLayout><PlayerDecisionsPage /></ObservateurLayout>
          </RoleGuard>
        }
      />

      {/* ─── ADMIN / ANIMATEUR : interface standard ─── */}
      <Route
        element={
          <RoleGuard allowed={['admin', 'animateur', 'observateur']} redirectTo="/participant">
            <Layout><Outlet /></Layout>
          </RoleGuard>
        }
      >
        {/* Exercices – admin, animateur, observateur */}
        <Route path="/exercises" element={<ExercisesPage />} />
        <Route
          path="/exercises/new"
          element={
            <RoleGuard allowed={['admin', 'animateur']} redirectTo="/exercises">
              <ExerciseNewPage />
            </RoleGuard>
          }
        />
        <Route path="/exercises/:id" element={<ExerciseDetailPage />} />
        <Route
          path="/exercises/:exerciseId/scenario"
          element={
            <RoleGuard allowed={['admin', 'animateur']} redirectTo="/exercises">
              <ExerciseScenarioPage />
            </RoleGuard>
          }
        />
        <Route
          path="/exercises/:exerciseId/chronogramme"
          element={
            <RoleGuard allowed={['admin', 'animateur']} redirectTo="/exercises">
              <ExerciseChronogrammePage />
            </RoleGuard>
          }
        />
        <Route
          path="/exercises/:exerciseId/timeline-gantt"
          element={
            <RoleGuard allowed={['admin', 'animateur']} redirectTo="/exercises">
              <ExerciseTimelineGanttPage />
            </RoleGuard>
          }
        />
        <Route
          path="/exercises/:exerciseId/injects"
          element={
            <RoleGuard allowed={['admin', 'animateur']} redirectTo="/exercises">
              <ExerciseInjectsPage />
            </RoleGuard>
          }
        />
        <Route
          path="/exercises/:exerciseId/webmail"
          element={
            <RoleGuard allowed={['admin', 'animateur']} redirectTo="/exercises">
              <WebmailPage />
            </RoleGuard>
          }
        />
        <Route
          path="/exercises/:exerciseId/webmail/new"
          element={
            <RoleGuard allowed={['admin', 'animateur']} redirectTo="/exercises">
              <WebmailNewPage />
            </RoleGuard>
          }
        />
        <Route
          path="/exercises/:exerciseId/webmail/:conversationId"
          element={
            <RoleGuard allowed={['admin', 'animateur']} redirectTo="/exercises">
              <WebmailConversationPage />
            </RoleGuard>
          }
        />
        <Route
          path="/exercises/:exerciseId/contacts"
          element={
            <RoleGuard allowed={['admin', 'animateur']} redirectTo="/exercises">
              <CrisisContactsPage />
            </RoleGuard>
          }
        />
        <Route
          path="/exercises/:exerciseId/media"
          element={
            <RoleGuard allowed={['admin', 'animateur']} redirectTo="/exercises">
              <MediaLibraryPage />
            </RoleGuard>
          }
        />
        <Route
          path="/exercises/:exerciseId/live"
          element={
            <RoleGuard allowed={['admin', 'animateur']} redirectTo="/exercises">
              <ExerciseLiveControlPage />
            </RoleGuard>
          }
        />
        <Route
          path="/exercises/:exerciseId/evaluation"
          element={
            <RoleGuard allowed={['admin', 'animateur', 'observateur']} redirectTo="/exercises">
              <ExerciseEvaluationPage />
            </RoleGuard>
          }
        />
        <Route
          path="/exercises/:exerciseId/tv/live"
          element={
            <RoleGuard allowed={['admin', 'animateur']} redirectTo="/exercises">
              <TVLivePage />
            </RoleGuard>
          }
        />
        <Route
          path="/exercises/:exerciseId/tv/studio"
          element={
            <RoleGuard allowed={['admin', 'animateur']} redirectTo="/exercises">
              <TVStudioPage />
            </RoleGuard>
          }
        />

        {/* Profil utilisateur – accessible à tous les rôles connectés */}
        <Route path="/profile" element={<UserProfilePage />} />

        {/* Exercices – Préparation (admin + animateur) */}
        <Route
          path="/exercises/preparation/organisation"
          element={
            <RoleGuard allowed={['admin', 'animateur']} redirectTo="/">
              <ExercisePreparationHubPage />
            </RoleGuard>
          }
        />
        <Route
          path="/exercises/preparation/participants"
          element={
            <RoleGuard allowed={['admin', 'animateur']} redirectTo="/">
              <AdminUsersPage />
            </RoleGuard>
          }
        />
        <Route
          path="/exercises/preparation/equipes"
          element={
            <RoleGuard allowed={['admin', 'animateur']} redirectTo="/">
              <AdminTeamsPage />
            </RoleGuard>
          }
        />
        <Route
          path="/exercises/preparation/injects"
          element={
            <RoleGuard allowed={['admin', 'animateur']} redirectTo="/">
              <InjectBankPage />
            </RoleGuard>
          }
        />
        <Route
          path="/exercises/preparation/kits"
          element={
            <RoleGuard allowed={['admin', 'animateur']} redirectTo="/">
              <WelcomeKitTemplatesPage />
            </RoleGuard>
          }
        />

        {/* Player selection (DEV preview) */}
        <Route
          path="/player"
          element={
            <RoleGuard allowed={['admin', 'animateur']} redirectTo="/">
              <ParticipantLandingPage />
            </RoleGuard>
          }
        />

        {/* Admin uniquement */}
        <Route
          path="/admin/users"
          element={
            <RoleGuard allowed={['admin']} redirectTo="/">
              <AdminUsersPage />
            </RoleGuard>
          }
        />
        <Route
          path="/admin/teams"
          element={
            <RoleGuard allowed={['admin']} redirectTo="/">
              <AdminTeamsPage />
            </RoleGuard>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <RoleGuard allowed={['admin']} redirectTo="/">
              <AdminAuditPage />
            </RoleGuard>
          }
        />
        <Route
          path="/admin/inject-bank"
          element={
            <RoleGuard allowed={['admin']} redirectTo="/">
              <InjectBankPage />
            </RoleGuard>
          }
        />
        <Route
          path="/admin/chatgpt"
          element={
            <RoleGuard allowed={['admin']} redirectTo="/">
              <ChatGptConnectionPage />
            </RoleGuard>
          }
        />
        <Route
          path="/admin/welcome-kits"
          element={
            <RoleGuard allowed={['admin']} redirectTo="/">
              <WelcomeKitTemplatesPage />
            </RoleGuard>
          }
        />
        <Route
          path="/admin/options"
          element={
            <RoleGuard allowed={['admin']} redirectTo="/">
              <OptionsPage />
            </RoleGuard>
          }
        />
        <Route
          path="/admin/logs"
          element={
            <RoleGuard allowed={['admin']} redirectTo="/">
              <LogsPage />
            </RoleGuard>
          }
        />
      </Route>

      {/* ─── DEBUG: Development only ─── */}
      <Route path="/debug/events_emit" element={<DebugEventsEmitPage />} />
      <Route path="/debug/events_receive" element={<DebugEventsReceivePage />} />
      <Route path="/debug/timeline_rt" element={<DebugTimelineRtPage />} />

      {/* ─── Fallback ─── */}
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default App
