import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Tv,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Loader2,
  Clock,
  Radio,
} from 'lucide-react'
import { simulatedApi, SimulatedTvEvent, SimulatedTvFeed } from '../../../services/simulatedApi'

interface TvSimulatorProps {
  exerciseId: number
  refreshKey?: number
}

const CHANNEL_NAME = 'TTX TV'

export default function TvSimulator({ exerciseId, refreshKey }: TvSimulatorProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | null>(null)
  const [showEventsList, setShowEventsList] = useState(true)

  const queryClient = useQueryClient()

  // Fetch TV feed
  const { data: tvFeed, isLoading: isLoadingFeed, refetch: refetchFeed } = useQuery({
    queryKey: ['simulated-tv-feed', exerciseId],
    queryFn: () => simulatedApi.getTvFeed(exerciseId),
  })

  // Mark event as seen mutation
  const markSeenMutation = useMutation({
    mutationFn: (eventId: number) => simulatedApi.markTvEventSeen(exerciseId, eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulated-tv-feed', exerciseId] })
    },
  })

  // Invalidate queries on WebSocket refresh
  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      queryClient.invalidateQueries({ queryKey: ['simulated-tv-feed', exerciseId] })
    }
  }, [refreshKey, exerciseId, queryClient])

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetchFeed()
    }, 5000)
    return () => clearInterval(interval)
  }, [refetchFeed])

  // Auto-play when there's a current live event with video
  useEffect(() => {
    if (tvFeed?.current_live?.video_url) {
      setCurrentVideoUrl(tvFeed.current_live.video_url)
      setIsPlaying(true)
    }
  }, [tvFeed?.current_live])

  const events = tvFeed?.events || []
  const currentLive = tvFeed?.current_live

  const handlePlayVideo = (event: SimulatedTvEvent) => {
    if (event.video_url) {
      setCurrentVideoUrl(event.video_url)
      setIsPlaying(true)
      if (!event.is_seen) {
        markSeenMutation.mutate(event.id)
      }
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="h-full flex flex-col bg-gray-800 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Tv className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-white">{CHANNEL_NAME}</h2>
            {currentLive && (
              <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                EN DIRECT
              </span>
            )}
          </div>
          <button
            onClick={() => setShowEventsList(!showEventsList)}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              showEventsList ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            Événements ({events.length})
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Video player */}
          <div className="bg-black aspect-video relative">
            {currentVideoUrl ? (
              <>
                <video
                  key={currentVideoUrl}
                  src={currentVideoUrl}
                  autoPlay
                  muted={isMuted}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  className="w-full h-full object-contain"
                />
                
                {/* Video controls */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center"
                      >
                        {isPlaying ? <Pause size={20} className="text-white" /> : <Play size={20} className="text-white" />}
                      </button>
                      <button
                        onClick={() => setIsMuted(!isMuted)}
                        className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center"
                      >
                        {isMuted ? <VolumeX size={20} className="text-white" /> : <Volume2 size={20} className="text-white" />}
                      </button>
                    </div>
                    <button className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center">
                      <Maximize size={20} className="text-white" />
                    </button>
                  </div>
                </div>

                {/* Current event info */}
                {currentLive && (
                  <div className="absolute top-0 left-0 right-0 bg-red-600 text-white px-4 py-2 flex items-center gap-2">
                    <span className="font-bold">BREAKING</span>
                    <span>{currentLive.title}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
                <Tv className="w-16 h-16 opacity-50 mb-4" />
                <p className="text-lg font-medium">En attente d'émission</p>
                <p className="text-sm mt-2">
                  Les événements TV apparaîtront ici
                </p>
              </div>
            )}
          </div>

          {/* Events list */}
          {showEventsList && (
            <div className="flex-1 overflow-y-auto p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                <Clock size={14} />
                Émissions récentes
              </h3>
              
              {isLoadingFeed ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                </div>
              ) : events.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <Radio className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Aucune emission</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {events.map((event) => (
                    <button
                      key={event.id}
                      onClick={() => handlePlayVideo(event)}
                      className={`w-full p-3 text-left rounded-lg border transition-colors ${
                        event.id === currentLive?.id
                          ? 'bg-purple-600/20 border-purple-500'
                          : 'bg-gray-700/50 border-gray-600 hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {event.is_live && (
                              <span className="bg-red-600 text-white text-xs px-1.5 py-0.5 rounded">LIVE</span>
                            )}
                            {event.is_breaking && (
                              <span className="bg-yellow-600 text-white text-xs px-1.5 py-0.5 rounded">BREAKING</span>
                            )}
                            <span className="text-sm font-medium text-white truncate">
                              {event.title}
                            </span>
                          </div>
                          {event.description && (
                            <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                              {event.description}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            {formatDate(event.broadcast_at)}
                          </p>
                        </div>
                        {event.thumbnail_url && (
                          <div className="w-20 h-12 bg-gray-600 rounded overflow-hidden flex-shrink-0">
                            <img
                              src={event.thumbnail_url}
                              alt={event.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                      </div>
                      {!event.is_seen && (
                        <div className="mt-2">
                          <span className="text-xs text-primary-400">Non vu</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
