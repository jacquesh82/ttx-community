/**
 * Debug API Service
 * For development testing only - disabled in production
 */

const API_BASE = '/api/debug';

export interface DebugExercise {
  id: number;
  name: string;
  status: string;
  created_at: string;
}

export interface DebugAudience {
  kind: string;
  value: string;
}

export interface DebugInject {
  id: number;
  title: string;
  type: string;
  status: string;
  time_offset: number | null;
  duration_min: number | null;
  description: string | null;
  content: Record<string, unknown> | null;
  timeline_type: string | null;
  audiences: DebugAudience[];
}

export interface DebugTimeline {
  exercise_id: number;
  exercise_name: string;
  injects: DebugInject[];
}

export interface DebugStatus {
  enabled: boolean;
  environment: string;
}

/**
 * Check if debug mode is enabled
 */
export async function getDebugStatus(): Promise<DebugStatus> {
  const response = await fetch(`${API_BASE}/status`);
  if (!response.ok) {
    throw new Error('Failed to check debug status');
  }
  return response.json();
}

/**
 * List all exercises for debug
 */
export async function listExercises(): Promise<DebugExercise[]> {
  const response = await fetch(`${API_BASE}/exercises`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Debug endpoints disabled in production');
    }
    throw new Error('Failed to fetch exercises');
  }
  return response.json();
}

/**
 * Get timeline (injects) for an exercise
 */
export async function getExerciseTimeline(exerciseId: number): Promise<DebugTimeline> {
  const response = await fetch(`${API_BASE}/exercises/${exerciseId}/timeline`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Exercise not found or debug disabled');
    }
    throw new Error('Failed to fetch timeline');
  }
  return response.json();
}

export const debugApi = {
  getDebugStatus,
  listExercises,
  getExerciseTimeline,
};