import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { teamsApi, usersApi } from '../../services/api'
import { Edit, Plus, Trash2 } from 'lucide-react'
import Modal from '../../components/Modal'
import { useAppDialog } from '../../contexts/AppDialogContext'

type UserRole = 'admin' | 'animateur' | 'observateur' | 'participant'

type AdminUser = {
  id: number
  username: string
  email: string
  role: UserRole
  is_active: boolean
  team_id: number | null
  tags: string[]
}

type TeamSummary = {
  id: number
  name: string
  color?: string | null
}

type UserFormState = {
  username: string
  email: string
  password: string
  role: UserRole
  teamId: string
  tagsInput: string
}

const getEmptyForm = (): UserFormState => ({
  username: '',
  email: '',
  password: '',
  role: 'participant',
  teamId: '',
  tagsInput: '',
})

function parseTagsInput(input: string): string[] {
  const deduped = new Set<string>()
  for (const raw of input.split(',')) {
    const tag = raw.trim()
    if (tag) {
      deduped.add(tag)
    }
  }
  return Array.from(deduped)
}

export default function UsersPage() {
  const appDialog = useAppDialog()
  const queryClient = useQueryClient()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [formData, setFormData] = useState<UserFormState>(getEmptyForm)
  const [error, setError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list({ page: 1, page_size: 50 }),
  })

  const { data: teamsData } = useQuery({
    queryKey: ['teams', 'users-page'],
    queryFn: () => teamsApi.list({ page: 1, page_size: 100 }),
  })

  const createMutation = useMutation({
    mutationFn: (payload: any) => usersApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setIsCreateModalOpen(false)
      setFormData(getEmptyForm())
      setError('')
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Erreur lors de la création')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => usersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setIsEditModalOpen(false)
      setEditingUser(null)
      setFormData(getEmptyForm())
      setError('')
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Erreur lors de la mise à jour')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => usersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const users: AdminUser[] = data?.users || []
  const teams: TeamSummary[] = teamsData?.teams || []
  const teamsById = new Map<number, TeamSummary>(teams.map((team) => [team.id, team]))

  const roleLabels: Record<UserRole, string> = {
    admin: 'Administrateur',
    animateur: 'Animateur',
    observateur: 'Observateur',
    participant: 'Participant',
  }

  const resetForm = () => setFormData(getEmptyForm())

  const openCreateModal = () => {
    resetForm()
    setError('')
    setIsCreateModalOpen(true)
  }

  const closeCreateModal = () => {
    setIsCreateModalOpen(false)
    setError('')
  }

  const closeEditModal = () => {
    setIsEditModalOpen(false)
    setEditingUser(null)
    setError('')
  }

  const buildUserPayload = () => ({
    username: formData.username,
    email: formData.email,
    role: formData.role,
    team_id: formData.teamId ? Number(formData.teamId) : null,
    tags: parseTagsInput(formData.tagsInput),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    createMutation.mutate({
      ...buildUserPayload(),
      password: formData.password,
    })
  }

  const handleEdit = (user: AdminUser) => {
    setEditingUser(user)
    setFormData({
      username: user.username,
      email: user.email,
      password: '',
      role: user.role,
      teamId: user.team_id != null ? String(user.team_id) : '',
      tagsInput: (user.tags || []).join(', '),
    })
    setError('')
    setIsEditModalOpen(true)
  }

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return

    setError('')
    const updateData: any = buildUserPayload()
    if (formData.password) {
      updateData.password = formData.password
    }
    updateMutation.mutate({ id: editingUser.id, data: updateData })
  }

  const handleDelete = async (id: number) => {
    if (await appDialog.confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) {
      deleteMutation.mutate(id)
    }
  }

  const renderFormFields = (isEdit: boolean) => (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Nom d'utilisateur
        </label>
        <input
          type="text"
          value={formData.username}
          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          required
          minLength={3}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {isEdit ? "Nouveau mot de passe (laisser vide pour garder l'actuel)" : 'Mot de passe'}
        </label>
        <input
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          required={!isEdit}
          minLength={8}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Rôle
        </label>
        <select
          value={formData.role}
          onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="participant">Participant</option>
          <option value="observateur">Observateur</option>
          <option value="animateur">Animateur</option>
          <option value="admin">Administrateur</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Équipe de rattachement
        </label>
        <select
          value={formData.teamId}
          onChange={(e) => setFormData({ ...formData, teamId: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Aucune équipe</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Tags
        </label>
        <input
          type="text"
          value={formData.tagsInput}
          onChange={(e) => setFormData({ ...formData, tagsInput: e.target.value })}
          placeholder="ex: cellule-crise, vip, porte-parole"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          Séparez les tags par des virgules.
        </p>
      </div>
    </>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Utilisateurs</h1>
          <p className="text-gray-600">Gérez les utilisateurs de la plateforme</p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
        >
          <Plus className="mr-2" size={20} />
          Nouvel utilisateur
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rôle</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Équipe</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tags</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((user) => {
                const team = user.team_id != null ? teamsById.get(user.team_id) : null

                return (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.username}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{user.email}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{roleLabels[user.role]}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {user.team_id == null ? (
                        <span className="text-gray-400">Aucune</span>
                      ) : team ? (
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="inline-block w-2 h-2 rounded-full"
                            style={{ backgroundColor: team.color || '#3b82f6' }}
                          />
                          {team.name}
                        </span>
                      ) : (
                        <span>Équipe #{user.team_id}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {user.tags?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {user.tags.map((tag) => (
                            <span
                              key={`${user.id}-${tag}`}
                              className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">Aucun</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs ${user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {user.is_active ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm space-x-2">
                      <button
                        onClick={() => handleEdit(user)}
                        className="text-primary-600 hover:text-primary-700"
                        title="Modifier"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(user.id)}
                        className="text-red-600 hover:text-red-700"
                        title="Supprimer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                )
              })}

              {!isLoading && users.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-500">
                    Aucun utilisateur trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isCreateModalOpen}
        onClose={closeCreateModal}
        title="Nouvel utilisateur"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
              {error}
            </div>
          )}

          {renderFormFields(false)}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={closeCreateModal}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Création...' : 'Créer'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isEditModalOpen}
        onClose={closeEditModal}
        title="Modifier l'utilisateur"
      >
        <form onSubmit={handleUpdate} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
              {error}
            </div>
          )}

          {renderFormFields(true)}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={closeEditModal}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Mise à jour...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
