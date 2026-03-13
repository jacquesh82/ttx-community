import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { tvApi, TickerItem, TVLiveState } from '../services/api'
import LoadingScreen from '../components/LoadingScreen'

export default function TVLivePage() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const [liveState, setLiveState] = useState<TVLiveState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLiveState = useCallback(async () => {
    if (!exerciseId) return
    try {
      const state = await tvApi.getLiveState(parseInt(exerciseId))
      setLiveState(state)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load TV state')
    } finally {
      setLoading(false)
    }
  }, [exerciseId])

  useEffect(() => {
    fetchLiveState()
    // Poll for updates every 2 seconds
    const interval = setInterval(fetchLiveState, 2000)
    return () => clearInterval(interval)
  }, [fetchLiveState])

  if (loading) {
    return <LoadingScreen />
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-red-400">{error}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black relative">
      {/* Video Player Area */}
      <div className="aspect-video bg-gray-900 relative">
        {liveState?.status === 'playing' && liveState.on_air_media_id ? (
          <video
            src={`/api/media/${liveState.on_air_media_id}/stream`}
            autoPlay
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl mb-4">📺</div>
              <div className="text-white text-2xl font-bold">EN DIRECT</div>
              <div className="text-gray-400 mt-2">
                {liveState?.status === 'idle' ? "En attente d'émission..." : liveState?.status}
              </div>
            </div>
          </div>
        )}

        {/* Breaking Banner */}
        {liveState?.banner_text && (
          <div className="absolute top-0 left-0 right-0 bg-red-600 text-white py-2 px-4 animate-pulse">
            <div className="flex items-center gap-2">
              <span className="font-bold">BREAKING</span>
              <span className="font-bold">|</span>
              <span>{liveState.banner_text}</span>
            </div>
          </div>
        )}

        {/* Ticker */}
        {liveState?.ticker_items && liveState.ticker_items.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 bg-black/80 py-2 overflow-hidden">
            <div className="ticker-animation whitespace-nowrap">
              {liveState.ticker_items.map((item, idx) => (
                <span key={idx} className="mx-8 text-white">
                  {item.priority === 'urgent' && (
                    <span className="text-red-500 font-bold">URGENT: </span>
                  )}
                  {item.text}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Live indicator */}
        <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/50 px-3 py-1 rounded-full">
          <div className={`w-3 h-3 rounded-full ${
            liveState?.status === 'playing' ? 'bg-red-500 animate-pulse' : 'bg-gray-500'
          }`}></div>
          <span className="text-white text-sm font-medium">LIVE</span>
        </div>
      </div>

      {/* Info Section */}
      <div className="bg-gray-900 p-4">
        <h1 className="text-xl font-bold text-white">TV Live</h1>
        <p className="text-gray-400 text-sm mt-1">
          Statut: {liveState?.status === 'playing' ? 'En diffusion' : liveState?.status === 'idle' ? "En attente" : liveState?.status}
        </p>
        {liveState?.on_air_type && (
          <p className="text-gray-400 text-sm">
            Type: {liveState.on_air_type}
          </p>
        )}
      </div>

      <style>{`
        @keyframes ticker {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        .ticker-animation {
          display: inline-block;
          animation: ticker 20s linear infinite;
        }
      `}</style>
    </div>
  )
}