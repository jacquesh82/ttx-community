import { useState, useEffect, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { UserCircle, Camera } from 'lucide-react'
import { authApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import AutoSaveIndicator from '../components/AutoSaveIndicator'

export default function UserProfilePage() {
  const { user, setUser } = useAuthStore()

  const [displayName, setDisplayName] = useState(user?.display_name || '')
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '')
  const [username, setUsername] = useState(user?.username || '')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const isLoadedRef = useRef(false)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const updateProfileMutation = useMutation({
    mutationFn: () =>
      authApi.updateProfile({
        display_name: displayName.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        username: username.trim() || user?.username,
      }),
    onSuccess: (data) => {
      setUser({ ...data.user, tenant: data.tenant })
      setSaveStatus('saved')
      setErrorMsg(null)
      setTimeout(() => setSaveStatus('idle'), 2500)
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail
      if (detail === 'username_already_taken') {
        setErrorMsg('Ce nom d\'utilisateur est déjà pris.')
      } else {
        setErrorMsg(detail || 'Une erreur est survenue.')
      }
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 4000)
    },
  })

  // Initialize form once user is loaded
  useEffect(() => {
    if (!user) return
    setDisplayName(user.display_name || '')
    setAvatarUrl(user.avatar_url || '')
    setUsername(user.username || '')
    setTimeout(() => { isLoadedRef.current = true }, 50)
  }, [])

  // Debounced auto-save on any field change
  useEffect(() => {
    if (!isLoadedRef.current) return
    setSaveStatus('saving')
    setErrorMsg(null)
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      updateProfileMutation.mutate()
    }, 1200)
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [displayName, avatarUrl, username])

  const roleBadge: Record<string, { label: string; color: string }> = {
    admin: { label: 'Admin', color: 'bg-red-100 text-red-800 border border-red-200' },
    animateur: { label: 'Animateur', color: 'bg-blue-100 text-blue-800 border border-blue-200' },
    observateur: { label: 'Observateur', color: 'bg-purple-100 text-purple-800 border border-purple-200' },
    participant: { label: 'Participant', color: 'bg-green-100 text-green-800 border border-green-200' },
  }
  const badge = roleBadge[user?.role ?? '']

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mon profil</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Les modifications sont enregistrées automatiquement.
        </p>
      </div>

      {/* Avatar + identité */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Identité</h2>

        <div className="flex items-start gap-6">
          {/* Avatar preview */}
          <div className="relative flex-shrink-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="avatar"
                className="w-20 h-20 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center border-2 border-gray-200 dark:border-gray-600">
                <UserCircle size={40} className="text-gray-400" />
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-gray-900 dark:bg-gray-600 rounded-full flex items-center justify-center">
              <Camera size={12} className="text-white" />
            </div>
          </div>

          <div className="flex-1 space-y-4">
            {/* Nom affiché */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nom affiché
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={user?.username}
                maxLength={100}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Visible dans la sidebar et les messages. Laissez vide pour utiliser le nom d'utilisateur.
              </p>
            </div>

            {/* Nom d'utilisateur */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nom d'utilisateur
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                minLength={3}
                maxLength={50}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Utilisé pour la connexion.
              </p>
            </div>
          </div>
        </div>

        {/* URL d'avatar */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            URL de l'avatar
          </label>
          <input
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://example.com/photo.jpg"
            maxLength={512}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Lien public vers une image (JPG, PNG, WebP…).
          </p>
        </div>
      </div>

      {/* Informations du compte (lecture seule) */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Informations du compte</h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 dark:text-gray-400">Email</span>
            <span className="text-gray-900 dark:text-white font-medium">{user?.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500 dark:text-gray-400">Rôle</span>
            {badge && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>
                {badge.label}
              </span>
            )}
          </div>
          {user?.tenant && (
            <div className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-gray-400">Organisation</span>
              <span className="text-gray-900 dark:text-white font-medium">{user.tenant.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Statut de sauvegarde */}
      <div className="flex items-center justify-end h-7">
        <AutoSaveIndicator status={saveStatus} errorMessage={errorMsg} savedLabel="Profil mis à jour" />
      </div>
    </div>
  )
}
