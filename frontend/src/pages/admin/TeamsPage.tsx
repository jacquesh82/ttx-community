import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { exercisesApi, teamsApi, usersApi } from '../../services/api'
import { Plus, Users, Edit, UserPlus, Trash2, Search } from 'lucide-react'
import Modal from '../../components/Modal'

// Predefined team colors
const TEAM_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#84cc16', // lime
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#78716c', // stone
]

type TeamRow = {
  id: number
  name: string
  description?: string | null
  color?: string
  member_count?: number
}

type ExerciseRow = {
  id: number
  name: string
}

type TeamSection = {
  key: string
  title: string
  teams: TeamRow[]
}

export default function TeamsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [exerciseFilter, setExerciseFilter] = useState<'all' | 'none' | string>('all')
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#3b82f6',
  })
  const [error, setError] = useState('')

  const { data: teamsData, isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsApi.list({ page: 1, page_size: 100 }),
  })

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list({ page: 1, page_size: 100 }),
  })

  const { data: exerciseGroupsData, isLoading: isExercisesLoading } = useQuery({
    queryKey: ['teams', 'exercise-groups'],
    queryFn: async () => {
      const exercisesResponse = await exercisesApi.list({ page: 1, page_size: 100 })
      const exercises = (exercisesResponse?.exercises || []) as ExerciseRow[]

      const links = await Promise.all(
        exercises.map(async (exercise) => {
          const response = await exercisesApi.listTeams(exercise.id)
          return {
            exercise,
            teamIds: new Set((response?.teams || []).map((team) => team.id)),
          }
        })
      )

      return { exercises, links }
    },
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
      setError(err.response?.data?.detail || t('admin.teams.error_create'))
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
      setError(err.response?.data?.detail || t('admin.teams.error_update'))
    },
  })

  const addMemberMutation = useMutation({
    mutationFn: ({ teamId, userId, isLeader }: { teamId: number; userId: number; isLeader?: boolean }) =>
      teamsApi.addMember(teamId, userId, isLeader),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', selectedTeam?.id] })
      queryClient.invalidateQueries({ queryKey: ['teams'] })
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || t('admin.teams.error_add_member'))
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: ({ teamId, userId }: { teamId: number; userId: number }) => teamsApi.removeMember(teamId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', selectedTeam?.id] })
      queryClient.invalidateQueries({ queryKey: ['teams'] })
    },
  })

  const deleteOrphanTeamsMutation = useMutation({
    mutationFn: async (teamIds: number[]) => Promise.all(teamIds.map((teamId) => teamsApi.delete(teamId))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      queryClient.invalidateQueries({ queryKey: ['teams', 'exercise-groups'] })
      setError('')
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || t('admin.teams.error_delete'))
    },
  })

  const teams = (teamsData?.teams || []) as TeamRow[]
  const users = usersData?.users || []
  const members = teamDetail?.members || []
  const exerciseLinks = exerciseGroupsData?.links || []
  const exercises = (exerciseGroupsData?.exercises || []) as ExerciseRow[]

  const teamIdsByExercise = useMemo(() => {
    const map = new Map<number, Set<number>>()
    for (const link of exerciseLinks) {
      map.set(link.exercise.id, link.teamIds)
    }
    return map
  }, [exerciseLinks])

  const exerciseNamesByTeam = useMemo(() => {
    const map = new Map<number, string[]>()
    for (const link of exerciseLinks) {
      for (const teamId of link.teamIds) {
        if (!map.has(teamId)) {
          map.set(teamId, [])
        }
        map.get(teamId)?.push(link.exercise.name)
      }
    }
    return map
  }, [exerciseLinks])

  const exerciseOptions = useMemo(
    () => [...exercises].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [exercises]
  )

  const matchesSearch = (team: TeamRow) => {
    const needle = searchTerm.trim().toLowerCase()
    if (!needle) return true
    return `${team.name} ${team.description || ''}`.toLowerCase().includes(needle)
  }

  const sections = useMemo(() => {
    const built: TeamSection[] = []

    const teamsWithoutExercise = teams.filter((team) => !exerciseNamesByTeam.has(team.id) && matchesSearch(team))

    if (exerciseFilter === 'none') {
      built.push({
        key: 'none',
        title: t('admin.teams.no_exercise'),
        teams: teamsWithoutExercise,
      })
      return built
    }

    const selectedExerciseId = exerciseFilter === 'all' ? null : Number(exerciseFilter)
    const scopedExercises =
      selectedExerciseId == null ? exerciseOptions : exerciseOptions.filter((exercise) => exercise.id === selectedExerciseId)

    for (const exercise of scopedExercises) {
      const attachedIds = teamIdsByExercise.get(exercise.id) || new Set<number>()
      const groupedTeams = teams.filter((team) => attachedIds.has(team.id) && matchesSearch(team))
      built.push({
        key: `exercise-${exercise.id}`,
        title: `${exercise.name}`,
        teams: groupedTeams,
      })
    }

    if (exerciseFilter === 'all') {
      built.push({
        key: 'none',
        title: t('admin.teams.no_exercise'),
        teams: teamsWithoutExercise,
      })
    }

    return built
  }, [exerciseFilter, exerciseNamesByTeam, exerciseOptions, searchTerm, teamIdsByExercise, teams])

  const totalVisibleTeams = useMemo(
    () => sections.reduce((acc, section) => acc + section.teams.length, 0),
    [sections]
  )

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

  const openEditModal = (team: TeamRow) => {
    setSelectedTeam(team)
    setFormData({
      name: team.name,
      description: team.description || '',
      color: team.color || '#3b82f6',
    })
    setIsEditModalOpen(true)
    setError('')
  }

  const openMembersModal = (team: TeamRow) => {
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

  const handleDeleteTeamsWithoutExercise = (teamsToDelete: TeamRow[]) => {
    if (teamsToDelete.length === 0) return
    const ok = window.confirm(
      t('admin.teams.confirm_delete_orphan', { count: teamsToDelete.length })
    )
    if (!ok) return
    deleteOrphanTeamsMutation.mutate(teamsToDelete.map((team) => team.id))
  }

  const renderTeamCard = (team: TeamRow) => (
    <div key={team.id} className="bg-gray-800 border border-gray-700 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: team.color || '#3b82f6' }} />
          <h3 className="text-lg font-medium text-white">{team.name}</h3>
        </div>
        <button onClick={() => openEditModal(team)} className="text-primary-600 hover:text-primary-700">
          <Edit size={16} />
        </button>
      </div>
      <p className="text-gray-400 text-sm mb-4">{team.description || t('admin.teams.no_description')}</p>
      {(exerciseNamesByTeam.get(team.id) || []).length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {(exerciseNamesByTeam.get(team.id) || []).slice(0, 3).map((exerciseName) => (
            <span key={`${team.id}-${exerciseName}`} className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-gray-700 text-gray-300">
              {exerciseName}
            </span>
          ))}
          {(exerciseNamesByTeam.get(team.id) || []).length > 3 && (
            <span className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-gray-700 text-gray-300">
              +{(exerciseNamesByTeam.get(team.id) || []).length - 3}
            </span>
          )}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center text-gray-400 text-sm">
          <Users className="mr-1" size={16} />
          <span>{t('admin.teams.member_count', { count: team.member_count || 0 })}</span>
        </div>
        <button
          onClick={() => openMembersModal(team)}
          className="inline-flex items-center text-sm text-primary-600 hover:text-primary-700"
        >
          <UserPlus className="mr-1" size={16} />
          {t('admin.teams.manage')}
        </button>
      </div>
    </div>
  )

  return (
    <div className="options-theme space-y-6">
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">{t('admin.teams.title')}</h1>
            <p className="text-sm text-gray-400 mt-1">{t('admin.teams.subtitle')}</p>
            <p className="text-sm text-gray-400 mt-2 leading-relaxed max-w-2xl">{t('admin.teams.intro')}</p>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
          >
            <Plus size={16} />
            {t('admin.teams.new')}
          </button>
        </div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-1">{t('common.search')}</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('admin.teams.search_placeholder')}
                className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{t('admin.teams.filter_exercise')}</label>
            <select
              value={exerciseFilter}
              onChange={(e) => setExerciseFilter(e.target.value as 'all' | 'none' | string)}
              className="w-full px-3 py-2 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-900 text-white"
            >
              <option value="all">{t('admin.teams.all_exercises')}</option>
              <option value="none">{t('admin.teams.no_exercise')}</option>
              {exerciseOptions.map((exercise) => (
                <option key={exercise.id} value={String(exercise.id)}>
                  {exercise.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-sm text-gray-400 mt-3">{t('admin.teams.visible_count', { count: totalVisibleTeams })}</p>
      </div>

      {(isLoading || isExercisesLoading) && <div className="text-center py-8 text-gray-400">{t('common.loading')}</div>}

      {!isLoading && !isExercisesLoading && sections.every((section) => section.teams.length === 0) && (
        <div className="text-center py-12 bg-gray-800 border border-gray-700 rounded-xl">
          <Users className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-400">{t('admin.teams.no_teams_found')}</p>
        </div>
      )}

      {!isLoading &&
        !isExercisesLoading &&
        sections
          .filter((section) => section.teams.length > 0)
          .map((section) => (
            <section key={section.key} className="mb-8">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">{section.title}</h2>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-400">{t('admin.teams.count', { count: section.teams.length })}</span>
                  {section.key === 'none' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTeamsWithoutExercise(section.teams)}
                      disabled={deleteOrphanTeamsMutation.isPending}
                      className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-red-400 bg-red-900/20 border border-red-700/40 rounded-md hover:bg-red-900/30 disabled:opacity-50"
                    >
                      <Trash2 className="mr-1" size={14} />
                      {deleteOrphanTeamsMutation.isPending ? t('admin.teams.deleting') : t('admin.teams.delete_orphan')}
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {section.teams.map((team) => renderTeamCard(team))}
              </div>
            </section>
          ))}

      {/* Create Team Modal */}
      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title={t('admin.teams.new')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 text-sm text-red-400 bg-red-900/30 border border-red-700/50 rounded-md">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{t('admin.teams.name_label')}</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-gray-900 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{t('common.description')}</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 bg-gray-900 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{t('common.color')}</label>
            <div className="flex flex-wrap gap-2">
              {TEAM_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData({ ...formData, color })}
                  className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${formData.color === color ? 'border-white ring-2 ring-offset-2 ring-offset-gray-900 ring-white' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {createMutation.isPending ? t('admin.teams.creating') : t('admin.teams.create')}
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
        title={t('admin.teams.edit')}
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {error && <div className="p-3 text-sm text-red-400 bg-red-900/30 border border-red-700/50 rounded-md">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{t('admin.teams.name_label')}</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-gray-900 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{t('common.description')}</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 bg-gray-900 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{t('common.color')}</label>
            <div className="flex flex-wrap gap-2">
              {TEAM_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData({ ...formData, color })}
                  className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${formData.color === color ? 'border-white ring-2 ring-offset-2 ring-offset-gray-900 ring-white' : 'border-transparent'}`}
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
              className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {updateMutation.isPending ? t('admin.teams.updating') : t('admin.teams.update')}
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
        title={t('admin.teams.members_modal_title', { name: selectedTeam?.name || '' })}
      >
        <div className="space-y-4">
          {error && <div className="p-3 text-sm text-red-400 bg-red-900/30 border border-red-700/50 rounded-md">{error}</div>}

          {/* Current Members */}
          <div>
            <h4 className="text-sm font-medium text-gray-300 mb-2">{t('admin.teams.current_members')}</h4>
            {members.length === 0 ? (
              <p className="text-sm text-gray-400">{t('admin.teams.no_members')}</p>
            ) : (
              <ul className="space-y-2">
                {members.map((member: any) => (
                  <li key={member.id} className="flex items-center justify-between p-2 bg-gray-900 rounded-md">
                    <div>
                      <span className="text-sm font-medium text-white">{member.username}</span>
                      {member.is_leader && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-primary-900/30 text-primary-400 rounded">{t('admin.teams.leader')}</span>
                      )}
                    </div>
                    <button onClick={() => handleRemoveMember(member.id)} className="text-red-600 hover:text-red-700">
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Add Member */}
          <div>
            <h4 className="text-sm font-medium text-gray-300 mb-2">{t('admin.teams.add_member')}</h4>
            {availableUsers.length === 0 ? (
              <p className="text-sm text-gray-400">{t('admin.teams.all_members_added')}</p>
            ) : (
              <div className="space-y-2">
                <select
                  id="user-select"
                  className="w-full px-3 py-2 bg-gray-900 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  defaultValue=""
                >
                  <option value="" disabled>
                    {t('admin.teams.select_participant')}
                  </option>
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
                    className="flex-1 px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
                  >
                    {t('admin.teams.add_as_member')}
                  </button>
                  <button
                    onClick={() => {
                      const select = document.getElementById('user-select') as HTMLSelectElement
                      const userId = parseInt(select.value)
                      if (userId) handleAddMember(userId, true)
                    }}
                    className="flex-1 px-3 py-2 text-sm font-medium text-white bg-primary-700 rounded-lg hover:bg-primary-800"
                  >
                    {t('admin.teams.add_as_leader')}
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
