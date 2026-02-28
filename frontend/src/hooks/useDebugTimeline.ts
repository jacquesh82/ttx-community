/**
 * useDebugTimeline Hook
 * Manages virtual time simulation for debug events testing
 * 
 * Uses requestAnimationFrame when tab is visible for smooth animations,
 * and falls back to setInterval when tab is hidden to continue running.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { DebugInject } from '../services/debugApi'

export type PlaybackState = 'stopped' | 'playing' | 'paused'

export interface TimelineEvent extends DebugInject {
  triggeredAt: number | null // virtual time when event was triggered (in minutes)
  triggered: boolean
}

export interface UseDebugTimelineOptions {
  injects: DebugInject[]
  speed?: number // multiplier (1x, 2x, 5x, 10x, 30x)
  onEventTriggered?: (event: TimelineEvent, virtualTimeMinutes: number) => void
}

export interface UseDebugTimelineReturn {
  // State
  playbackState: PlaybackState
  virtualTimeMinutes: number
  speed: number
  events: TimelineEvent[]
  triggeredEvents: TimelineEvent[]
  pendingEvents: TimelineEvent[]
  
  // Actions
  play: () => void
  pause: () => void
  stop: () => void
  setSpeed: (speed: number) => void
  seekTo: (minutes: number) => void
  reset: () => void
}

export function useDebugTimeline(options: UseDebugTimelineOptions): UseDebugTimelineReturn {
  const { injects, speed: initialSpeed = 1, onEventTriggered } = options
  
  // State
  const [playbackState, setPlaybackState] = useState<PlaybackState>('stopped')
  const [virtualTimeMinutes, setVirtualTimeMinutes] = useState(0)
  const [speed, setSpeed] = useState(initialSpeed)
  const [events, setEvents] = useState<TimelineEvent[]>([])
  
  // Refs for animation frame and interval
  const animationFrameRef = useRef<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number | null>(null) // Real timestamp when playback started
  const pausedVirtualTimeRef = useRef<number>(0) // Virtual time when paused
  const speedRef = useRef<number>(initialSpeed) // Keep speed in ref for interval callback
  const onEventTriggeredRef = useRef(onEventTriggered) // Keep callback in ref
  const virtualTimeMinutesRef = useRef(0) // Keep virtual time in ref for visibility change handler
  
  // Update refs when props change
  useEffect(() => {
    speedRef.current = initialSpeed
  }, [initialSpeed])
  
  useEffect(() => {
    speedRef.current = speed
  }, [speed])
  
  useEffect(() => {
    onEventTriggeredRef.current = onEventTriggered
  }, [onEventTriggered])
  
  // Initialize events from injects
  useEffect(() => {
    const timelineEvents: TimelineEvent[] = injects
      .filter(inject => inject.time_offset !== null)
      .map(inject => ({
        ...inject,
        triggeredAt: null,
        triggered: false,
      }))
      .sort((a, b) => (a.time_offset ?? 0) - (b.time_offset ?? 0))
    
    setEvents(prevEvents => {
      // Avoid a render loop when callers pass an unstable empty array (e.g. `data?.items ?? []`).
      if (timelineEvents.length === 0 && prevEvents.length === 0) {
        return prevEvents
      }
      return timelineEvents
    })
  }, [injects])
  
  // Derived state
  const triggeredEvents = events.filter(e => e.triggered)
  const pendingEvents = events.filter(e => !e.triggered)
  
  // Trigger events that should have fired - use ref to avoid circular deps
  const triggerEventsUpToRef = useRef<(newTime: number) => void>(() => {})
  
  // Update the trigger function when onEventTriggered changes
  useEffect(() => {
    triggerEventsUpToRef.current = (newTime: number) => {
      setEvents(prevEvents => {
        let updated = false
        const updatedEvents = prevEvents.map(event => {
          if (!event.triggered && event.time_offset !== null && event.time_offset <= newTime) {
            updated = true
            // Call callback asynchronously
            setTimeout(() => {
              onEventTriggeredRef.current?.(event, newTime)
            }, 0)
            return { ...event, triggered: true, triggeredAt: event.time_offset }
          }
          return event
        })
        return updated ? updatedEvents : prevEvents
      })
    }
  }, [onEventTriggered]) // Only recreate when onEventTriggered changes
  
  // Animation loop refs - defined once, never recreated
  const updateVirtualTimeRAFRef = useRef<(timestamp: number) => void>(() => {})
  const updateVirtualTimeIntervalRef = useRef<() => void>(() => {})
  
  // Define the animation functions once
  useEffect(() => {
    updateVirtualTimeRAFRef.current = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp
      }
      
      const elapsedRealMs = timestamp - startTimeRef.current
      const virtualTime = pausedVirtualTimeRef.current + (elapsedRealMs * speedRef.current) / 1000
      
      setVirtualTimeMinutes(virtualTime)
      triggerEventsUpToRef.current(virtualTime)
      
      if (document.visibilityState === 'visible') {
        animationFrameRef.current = requestAnimationFrame(updateVirtualTimeRAFRef.current)
      }
    }
    
    updateVirtualTimeIntervalRef.current = () => {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now()
      }
      
      const elapsedRealMs = Date.now() - startTimeRef.current
      const virtualTime = pausedVirtualTimeRef.current + (elapsedRealMs * speedRef.current) / 1000
      
      setVirtualTimeMinutes(virtualTime)
      triggerEventsUpToRef.current(virtualTime)
    }
  }, []) // Empty deps - only defined once
  
  // Handle visibility change - switch between RAF and interval
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (playbackState !== 'playing') return
      
      if (document.visibilityState === 'visible') {
        // Switching to visible: stop interval, start RAF
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
        // IMPORTANT: sync the paused virtual time with current state before resetting
        pausedVirtualTimeRef.current = virtualTimeMinutesRef.current
        startTimeRef.current = null
        animationFrameRef.current = requestAnimationFrame(updateVirtualTimeRAFRef.current)
      } else {
        // Switching to hidden: stop RAF, start interval
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current)
          animationFrameRef.current = null
        }
        // IMPORTANT: sync the paused virtual time with current state before resetting
        pausedVirtualTimeRef.current = virtualTimeMinutesRef.current
        startTimeRef.current = null
        intervalRef.current = setInterval(updateVirtualTimeIntervalRef.current, 100) // 100ms interval
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [playbackState]) // Only playbackState as dependency
  
  // Start/stop playback based on playback state
  useEffect(() => {
    if (playbackState === 'playing') {
      if (document.visibilityState === 'visible') {
        // Use requestAnimationFrame for visible tab
        animationFrameRef.current = requestAnimationFrame(updateVirtualTimeRAFRef.current)
      } else {
        // Use setInterval for hidden tab
        intervalRef.current = setInterval(updateVirtualTimeIntervalRef.current, 100)
      }
    } else {
      // Clean up both animation frame and interval
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
      }
    }
  }, [playbackState]) // Only playbackState as dependency
  
  // Update virtual time ref when state changes
  useEffect(() => {
    virtualTimeMinutesRef.current = virtualTimeMinutes
  }, [virtualTimeMinutes])
  
  // Actions
  const play = useCallback(() => {
    // When starting playback, store current virtual time as the base
    pausedVirtualTimeRef.current = virtualTimeMinutes
    startTimeRef.current = null
    setPlaybackState('playing')
  }, [virtualTimeMinutes])
  
  const pause = useCallback(() => {
    // Store current virtual time when pausing
    pausedVirtualTimeRef.current = virtualTimeMinutes
    setPlaybackState('paused')
  }, [virtualTimeMinutes])
  
  const stop = useCallback(() => {
    setPlaybackState('stopped')
    setVirtualTimeMinutes(0)
    pausedVirtualTimeRef.current = 0
    startTimeRef.current = null
    setEvents(prev => prev.map(e => ({ ...e, triggered: false, triggeredAt: null })))
  }, [])
  
  const setSpeedWithValidation = useCallback((newSpeed: number) => {
    if ([0.5, 1, 2, 5, 10, 30, 60].includes(newSpeed)) {
      // When changing speed, update the paused virtual time to current time
      // and reset start time so the new speed is applied correctly
      pausedVirtualTimeRef.current = virtualTimeMinutes
      startTimeRef.current = null
      setSpeed(newSpeed)
    }
  }, [virtualTimeMinutes])
  
  const seekTo = useCallback((minutes: number) => {
    // Update virtual time and the base time reference
    pausedVirtualTimeRef.current = minutes
    startTimeRef.current = null
    setVirtualTimeMinutes(minutes)
    // Trigger any events that should have happened
    setEvents(prevEvents => {
      return prevEvents.map(event => {
        if (!event.triggered && event.time_offset !== null && event.time_offset <= minutes) {
          setTimeout(() => {
            onEventTriggeredRef.current?.(event, minutes)
          }, 0)
          return { ...event, triggered: true, triggeredAt: event.time_offset }
        }
        return event
      })
    })
  }, [])
  
  const reset = useCallback(() => {
    pausedVirtualTimeRef.current = 0
    startTimeRef.current = null
    stop()
  }, [stop])
  
  return {
    playbackState,
    virtualTimeMinutes,
    speed,
    events,
    triggeredEvents,
    pendingEvents,
    play,
    pause,
    stop,
    setSpeed: setSpeedWithValidation,
    seekTo,
    reset,
  }
}

/**
 * Format virtual time as T+HH:MM:SS
 */
export function formatVirtualTime(minutes: number): string {
  const totalSeconds = Math.floor(minutes * 60)
  const hours = Math.floor(totalSeconds / 3600)
  const mins = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  
  return `T+${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

/**
 * Format virtual time as T+HH:MM (shorter version)
 */
export function formatVirtualTimeShort(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = Math.floor(minutes % 60)
  
  return `T+${hours}h${mins.toString().padStart(2, '0')}`
}
