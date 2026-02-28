import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { exercisesApi } from '../services/api'
import ExerciseSubpageShell from '../components/exercise/ExerciseSubpageShell'
import TimelineGantt from '../components/exercise/TimelineGantt'

export default function ExerciseTimelineGanttPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const exId = parseInt(exerciseId!)
  
  // Queries
  const { data: exercise } = useQuery({
    queryKey: ['exercise', exerciseId],
    queryFn: () => exercisesApi.get(exId),
  })
  
  const targetDurationHours = exercise?.target_duration_hours ?? 4
  
  return (
    <ExerciseSubpageShell
      exerciseId={exId}
      sectionLabel="Timeline GANTT"
      title="Timeline des injects"
    >
      <TimelineGantt
        exerciseId={exId}
        targetDurationHours={targetDurationHours}
        showFullscreenLink={false}
        compact={false}
      />
    </ExerciseSubpageShell>
  )
}