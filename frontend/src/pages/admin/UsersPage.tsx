import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
      setError(err.response?.data?.detail || t('admin.users.errorCreate'))
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
      setError(err.response?.data?.detail || t('admin.users.errorUpdate'))
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
    admin: t('roles.admin'),
    animateur: t('roles.animateur'),
    observateur: t('roles.observateur'),
    participant: t('roles.participant'),
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
    if (await appDialog.confirm(t('admin.users.deleteConfirm'))) {
      deleteMutation.mutate(id)
    }
  }

  const renderFormFields = (isEdit: boolean) => (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          {t('admin.users.username')}
        </label>
        <input
          type="text"
          value={formData.username}
          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
          className="w-full px-3 py-2 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-900 text-white"
          required
          minLength={3}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          {t('admin.users.email')}
        </label>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className="w-full px-3 py-2 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-900 text-white"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          {isEdit ? t('admin.users.passwordEdit') : t('admin.users.password')}
        </label>
        <input
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          className="w-full px-3 py-2 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-900 text-white"
          required={!isEdit}
          minLength={8}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          {t('admin.users.role')}
        </label>
        <select
          value={formData.role}
          onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
          className="w-full px-3 py-2 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-900 text-white"
        >
          <option value="participant">{t('roles.participant')}</option>
          <option value="observateur">{t('roles.observateur')}</option>
          <option value="animateur">{t('roles.animateur')}</option>
          <option value="admin">{t('roles.admin')}</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          {t('admin.users.team')}
        </label>
        <select
          value={formData.teamId}
          onChange={(e) => setFormData({ ...formData, teamId: e.target.value })}
          className="w-full px-3 py-2 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-900 text-white"
        >
          <option value="">{t('admin.users.noTeam')}</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          {t('admin.users.tags')}
        </label>
        <input
          type="text"
          value={formData.tagsInput}
          onChange={(e) => setFormData({ ...formData, tagsInput: e.target.value })}
          placeholder={t('admin.users.tagsPlaceholder')}
          className="w-full px-3 py-2 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-900 text-white"
        />
        <p className="mt-1 text-xs text-gray-400">
          {t('admin.users.tagsSeparator')}
        </p>
      </div>
    </>
  )

  return (
    <div className="options-theme space-y-6">
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">{t('admin.users.title')}</h1>
            <p className="text-sm text-gray-400 mt-1">{t('admin.users.subtitle')}</p>
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
          >
            <Plus size={16} />
            {t('admin.users.new')}
          </button>
        </div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t('admin.users.username')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t('common.email')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t('admin.users.role')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t('admin.users.team')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t('admin.users.tags')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t('common.status')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {users.map((user) => {
                const team = user.team_id != null ? teamsById.get(user.team_id) : null

                return (
                  <tr key={user.id} className="hover:bg-gray-700/50">
                    <td className="px-6 py-4 text-sm font-medium text-white">{user.username}</td>
                    <td className="px-6 py-4 text-sm text-gray-400">{user.email}</td>
                    <td className="px-6 py-4 text-sm text-gray-400">{roleLabels[user.role]}</td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {user.team_id == null ? (
                        <span className="text-gray-400">{t('common.noneF')}</span>
                      ) : team ? (
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="inline-block w-2 h-2 rounded-full"
                            style={{ backgroundColor: team.color || '#3b82f6' }}
                          />
                          {team.name}
                        </span>
                      ) : (
                        <span>{t('admin.users.teamNum', { id: user.team_id })}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {user.tags?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {user.tags.map((tag) => (
                            <span
                              key={`${user.id}-${tag}`}
                              className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 text-xs"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">{t('admin.users.noTags')}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${user.is_active ? 'bg-green-500 text-green-950' : 'bg-red-900/30 text-red-400'}`}>
                        {user.is_active ? t('common.active') : t('common.inactive')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm space-x-2">
                      <button
                        onClick={() => handleEdit(user)}
                        className="text-primary-600 hover:text-primary-700"
                        title={t('common.edit')}
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(user.id)}
                        className="text-red-600 hover:text-red-700"
                        title={t('common.delete')}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                )
              })}

              {!isLoading && users.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-400">
                    {t('admin.users.noUsers')}
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
        title={t('admin.users.new')}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-400 bg-red-900/30 border border-red-700/50 rounded-md">
              {error}
            </div>
          )}

          {renderFormFields(false)}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={closeCreateModal}
              className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {createMutation.isPending ? t('admin.users.creating') : t('admin.users.create')}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isEditModalOpen}
        onClose={closeEditModal}
        title={t('admin.users.edit')}
      >
        <form onSubmit={handleUpdate} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-400 bg-red-900/30 border border-red-700/50 rounded-md">
              {error}
            </div>
          )}

          {renderFormFields(true)}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={closeEditModal}
              className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {updateMutation.isPending ? t('admin.users.updating') : t('common.save')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
