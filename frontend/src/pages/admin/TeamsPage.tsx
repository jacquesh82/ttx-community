import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { teamsApi, usersApi } from '../../services/api'
import { Plus, Users, Edit, UserPlus, Trash2 } from 'lucide-react'
import Modal from '../../components/Modal'

// Predefined team colors
const TEAM_COLORS = [
  "#ef4444",  // red
  "#f97316",  // orange
  "#f59e0b",  // amber
  "#84cc16",  // lime
  "#22c55e",  // green
  "#14b8a6",  // teal
  "#06b6d4",  // cyan
  "#3b82f6",  // blue
  "#6366f1",  // indigo
  "#8b5cf6",  // violet
  "#a855f7",  // purple
  "#d946ef",  // fuchsia
  "#ec4899",  // pink
  "#78716c",  // stone
]

export default function TeamsPage() {
  const queryClient = useQueryClient()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState<any>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#3b82f6',
  })
  const [error, setError] = useState('')

  const { data: teamsData, isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsApi.list({ page: 1, page_size: 50 }),
  })

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list({ page: 1, page_size: 100 }),
  })

  const { data: teamDetail } = useQuery({
    queryKey: ['team', selectedTeam?.id],
    queryFn: () => teamsApi.get(selectedTeam.id),
    enabled: !!selectedTeam,
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => teamsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      setIsCreateModalOpen(false)
      setFormData({ name: '', description: '', color: '#3b82f6' })
      setError('')
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Erreur lors de la création')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => teamsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      setIsEditModalOpen(false)
      setSelectedTeam(null)
      setError('')
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Erreur lors de la modification')
    },
  })

  const addMemberMutation = useMutation({
    mutationFn: ({ teamId, userId, isLeader }: { teamId: number; userId: number; isLeader?: boolean }) =>
      teamsApi.addMember(teamId, userId, isLeader),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', selectedTeam?.id] })
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Erreur lors de l\'ajout du membre')
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: ({ teamId, userId }: { teamId: number; userId: number }) =>
      teamsApi.removeMember(teamId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', selectedTeam?.id] })
    },
  })

  const teams = teamsData?.teams || []
  const users = usersData?.users || []
  const members = teamDetail?.members || []

  // Get available users (not already in team)
  const memberIds = new Set(members.map((m: any) => m.id))
  const availableUsers = users.filter((u: any) => !memberIds.has(u.id))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    createMutation.mutate(formData)
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (selectedTeam) {
      updateMutation.mutate({ id: selectedTeam.id, data: formData })
    }
  }

  const openEditModal = (team: any) => {
    setSelectedTeam(team)
    setFormData({
      name: team.name,
      description: team.description || '',
      color: team.color || '#3b82f6',
    })
    setIsEditModalOpen(true)
    setError('')
  }

  const openMembersModal = (team: any) => {
    setSelectedTeam(team)
    setIsMembersModalOpen(true)
    setError('')
  }

  const handleAddMember = (userId: number, isLeader: boolean = false) => {
    if (selectedTeam) {
      addMemberMutation.mutate({ teamId: selectedTeam.id, userId, isLeader })
    }
  }

  const handleRemoveMember = (userId: number) => {
    if (selectedTeam) {
      removeMemberMutation.mutate({ teamId: selectedTeam.id, userId })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Équipes</h1>
          <p className="text-gray-600">Gérez les équipes participantes</p>
        </div>
        <button 
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
        >
          <Plus className="mr-2" size={20} />
          Nouvelle équipe
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {teams.map((team: any) => (
          <div key={team.id} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div 
                  className="w-4 h-4 rounded-full flex-shrink-0" 
                  style={{ backgroundColor: team.color || '#3b82f6' }}
                />
                <h3 className="text-lg font-medium text-gray-900">{team.name}</h3>
              </div>
              <button 
                onClick={() => openEditModal(team)}
                className="text-primary-600 hover:text-primary-700"
              >
                <Edit size={16} />
              </button>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              {team.description || 'Aucune description'}
            </p>
            <div className="flex items-center justify-between">
              <div className="flex items-center text-gray-600 text-sm">
                <Users className="mr-1" size={16} />
                <span>{team.member_count || 0} membres</span>
              </div>
              <button
                onClick={() => openMembersModal(team)}
                className="inline-flex items-center text-sm text-primary-600 hover:text-primary-700"
              >
                <UserPlus className="mr-1" size={16} />
                Gérer
              </button>
            </div>
          </div>
        ))}
      </div>

      {teams.length === 0 && !isLoading && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <Users className="mx-auto text-gray-500 mb-4" size={48} />
          <p className="text-gray-600">Aucune équipe créée</p>
        </div>
      )}

      {/* Create Team Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Nouvelle équipe"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom de l'équipe
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Couleur
            </label>
            <div className="flex flex-wrap gap-2">
              {TEAM_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData({ ...formData, color })}
                  className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${formData.color === color ? 'border-gray-900 ring-2 ring-offset-1 ring-gray-400' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
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

      {/* Edit Team Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setSelectedTeam(null)
        }}
        title="Modifier l'équipe"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom de l'équipe
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Couleur
            </label>
            <div className="flex flex-wrap gap-2">
              {TEAM_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData({ ...formData, color })}
                  className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${formData.color === color ? 'border-gray-900 ring-2 ring-offset-1 ring-gray-400' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => {
                setIsEditModalOpen(false)
                setSelectedTeam(null)
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Modification...' : 'Modifier'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Manage Members Modal */}
      <Modal
        isOpen={isMembersModalOpen}
        onClose={() => {
          setIsMembersModalOpen(false)
          setSelectedTeam(null)
        }}
        title={`Membres - ${selectedTeam?.name || ''}`}
      >
        <div className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
              {error}
            </div>
          )}

          {/* Current Members */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Membres actuels</h4>
            {members.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun membre</p>
            ) : (
              <ul className="space-y-2">
                {members.map((member: any) => (
                  <li key={member.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                    <div>
                      <span className="text-sm font-medium text-gray-900">{member.username}</span>
                      {member.is_leader && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-primary-100 text-primary-800 rounded">
                          Chef
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveMember(member.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Add Member */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Ajouter un membre</h4>
            {availableUsers.length === 0 ? (
              <p className="text-sm text-gray-500">Tous les utilisateurs sont déjà dans l'équipe</p>
            ) : (
              <div className="space-y-2">
                <select
                  id="user-select"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                  defaultValue=""
                >
                  <option value="" disabled>Sélectionner un utilisateur</option>
                  {availableUsers.map((user: any) => (
                    <option key={user.id} value={user.id}>
                      {user.username} ({user.email})
                    </option>
                  ))}
                </select>
                <div className="flex space-x-2">
                  <button
                    onClick={() => {
                      const select = document.getElementById('user-select') as HTMLSelectElement
                      const userId = parseInt(select.value)
                      if (userId) handleAddMember(userId, false)
                    }}
                    className="flex-1 px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
                  >
                    Ajouter comme membre
                  </button>
                  <button
                    onClick={() => {
                      const select = document.getElementById('user-select') as HTMLSelectElement
                      const userId = parseInt(select.value)
                      if (userId) handleAddMember(userId, true)
                    }}
                    className="flex-1 px-3 py-2 text-sm font-medium text-white bg-primary-700 rounded-md hover:bg-primary-800"
                  >
                    Ajouter comme chef
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}