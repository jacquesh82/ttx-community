/**
 * useExerciseControl Hook
 * Hook for controlling exercise state (start, pause, end)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { exercisesApi, injectsApi, crisisManagementApi, Inject } from '../services/api'

interface UseExerciseControlOptions {
  exerciseId: number
  onExerciseStarted?: () => void
  onExercisePaused?: () => void
  onExerciseEnded?: () => void
  onInjectSent?: (inject: Inject) => void
}

interface ExerciseTimeInfo {
  exerciseTime: string
  realTime: string
  elapsedMinutes: number
  totalDurationMinutes: number
  progressPercent: number
}

export function useExerciseControl(options: UseExerciseControlOptions) {
  const { exerciseId, onExerciseStarted, onExercisePaused, onExerciseEnded, onInjectSent } = options
  const queryClient = useQueryClient()

  // Fetch exercise data
  const { data: exercise, isLoading: isLoadingExercise } = useQuery({
    queryKey: ['exercise', exerciseId],
    queryFn: () => exercisesApi.get(exerciseId),
    enabled: !!exerciseId,
  })

  // Fetch live dashboard
  const { data: dashboard, isLoading: isLoadingDashboard } = useQuery({
    queryKey: ['live-dashboard', exerciseId],
    queryFn: () => crisisManagementApi.getLiveDashboard(exerciseId),
    enabled: !!exerciseId && exercise?.status !== 'draft',
    refetchInterval: 5000,
  })

  // Fetch injects
  const { data: injectsData, isLoading: isLoadingInjects } = useQuery({
    queryKey: ['injects-control', exerciseId],
    queryFn: () => injectsApi.list({ exercise_id: exerciseId, page: 1, page_size: 500 }),
    enabled: !!exerciseId,
  })

  const injects = injectsData?.injects ?? []

  // Start exercise mutation
  const startMutation = useMutation({
    mutationFn: () => exercisesApi.start(exerciseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] })
      queryClient.invalidateQueries({ queryKey: ['exercises'] })
      onExerciseStarted?.()
    },
  })

  // Pause exercise mutation
  const pauseMutation = useMutation({
    mutationFn: () => exercisesApi.pause(exerciseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] })
      onExercisePaused?.()
    },
  })

  // End exercise mutation
  const endMutation = useMutation({
    mutationFn: () => exercisesApi.end(exerciseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] })
      queryClient.invalidateQueries({ queryKey: ['exercises'] })
      onExerciseEnded?.()
    },
  })

  // Send inject mutation
  const sendInjectMutation = useMutation({
    mutationFn: (injectId: number) => injectsApi.send(injectId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['injects-control', exerciseId] })
      queryClient.invalidateQueries({ queryKey: ['live-dashboard', exerciseId] })
      onInjectSent?.(data)
    },
  })

  // Delete inject mutation
  const deleteInjectMutation = useMutation({
    mutationFn: (injectId: number) => injectsApi.delete(injectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['injects-control', exerciseId] })
    },
  })

  // Speed change mutation
  const speedMutation = useMutation({
    mutationFn: (multiplier: number) =>
      crisisManagementApi.sendLiveAction(exerciseId, 'speed', { multiplier }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] })
    },
  })

  // Rewind mutation
  const rewindMutation = useMutation({
    mutationFn: (minutes: number) =>
      crisisManagementApi.sendLiveAction(exerciseId, 'rewind', { minutes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live-dashboard', exerciseId] })
    },
  })

  // Calculate exercise time info
  const getTimeInfo = (): ExerciseTimeInfo => {
    if (!exercise || !exercise.started_at) {
      return {
        exerciseTime: 'T+0h00',
        realTime: '--:--',
        elapsedMinutes: 0,
        totalDurationMinutes: exercise?.target_duration_hours ? exercise.target_duration_hours * 60 : 0,
        progressPercent: 0,
      }
    }

    const startedAt = new Date(exercise.started_at)
    const now = new Date()
    const elapsedMs = now.getTime() - startedAt.getTime()
    const elapsedMinutes = Math.floor(elapsedMs / 60000)
    const multiplier = parseFloat(exercise.time_multiplier) || 1
    const exerciseMinutes = Math.floor(elapsedMinutes * multiplier)
    
    const hours = Math.floor(exerciseMinutes / 60)
    const minutes = exerciseMinutes % 60
    const totalDurationMinutes = exercise.target_duration_hours * 60
    const progressPercent = Math.min(100, (exerciseMinutes / totalDurationMinutes) * 100)

    return {
      exerciseTime: `T+${hours}h${minutes.toString().padStart(2, '0')}`,
      realTime: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      elapsedMinutes: exerciseMinutes,
      totalDurationMinutes,
      progressPercent,
    }
  }

  // Get injects by status
  const getInjectsByStatus = () => {
    const sent = injects.filter((i) => i.status === 'sent')
    const scheduled = injects.filter((i) => i.status === 'scheduled')
    const draft = injects.filter((i) => i.status === 'draft')
    const cancelled = injects.filter((i) => i.status === 'cancelled')

    return { sent, scheduled, draft, cancelled }
  }

  // Get upcoming injects (sorted by time_offset)
  const getUpcomingInjects = (limit?: number) => {
    const { scheduled, draft } = getInjectsByStatus()
    const upcoming = [...scheduled, ...draft]
      .filter((i) => i.time_offset !== null)
      .sort((a, b) => (a.time_offset ?? 0) - (b.time_offset ?? 0))
    
    return limit ? upcoming.slice(0, limit) : upcoming
  }

  // Get past injects (sent, sorted by sent_at descending)
  const getPastInjects = (limit?: number) => {
    const { sent } = getInjectsByStatus()
    const past = [...sent]
      .filter((i) => i.sent_at)
      .sort((a, b) => new Date(b.sent_at!).getTime() - new Date(a.sent_at!).getTime())
    
    return limit ? past.slice(0, limit) : past
  }

  return {
    // Data
    exercise,
    dashboard,
    injects,
    isLoading: isLoadingExercise || isLoadingDashboard || isLoadingInjects,
    
    // Mutations
    startExercise: () => startMutation.mutate(),
    pauseExercise: () => pauseMutation.mutate(),
    endExercise: () => endMutation.mutate(),
    sendInject: (injectId: number) => sendInjectMutation.mutate(injectId),
    deleteInject: (injectId: number) => deleteInjectMutation.mutate(injectId),
    setSpeed: (multiplier: number) => speedMutation.mutate(multiplier),
    rewind: (minutes: number) => rewindMutation.mutate(minutes),
    
    // Mutation states
    isStarting: startMutation.isPending,
    isPausing: pauseMutation.isPending,
    isEnding: endMutation.isPending,
    isSendingInject: sendInjectMutation.isPending,
    
    // Helpers
    getTimeInfo,
    getInjectsByStatus,
    getUpcomingInjects,
    getPastInjects,
    
    // Computed
    isRunning: exercise?.status === 'running',
    isPaused: exercise?.status === 'paused',
    isDraft: exercise?.status === 'draft',
    isEnded: exercise?.status === 'completed',
  }
}