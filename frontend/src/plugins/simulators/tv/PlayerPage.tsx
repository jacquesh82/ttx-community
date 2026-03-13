import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { tvApi, TickerItem, TVLiveState } from '../../../services/api'
import { Tv, FileText, Clock, ChevronRight } from 'lucide-react'
import LoadingScreen from '../../../components/LoadingScreen'

export default function PlayerTVLivePage() {
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
      <div className="text-center py-12">
        <p className="text-red-400">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">TV Live</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main video player */}
        <div className="lg:col-span-2">
          <div className="bg-black rounded-lg overflow-hidden aspect-video relative">
            {liveState?.status === 'playing' && liveState.on_air_media_id ? (
              <video
                src={`/api/media/${liveState.on_air_media_id}/stream`}
                autoPlay
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                <div className="text-center">
                  <div className="text-6xl mb-4">📺</div>
                  <div className="text-white text-2xl font-bold">EN DIRECT</div>
                  <div className="text-gray-400 mt-2">
                    {liveState?.status === 'idle'
                      ? "En attente d'émission..."
                      : liveState?.status}
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
              <div
                className={`w-3 h-3 rounded-full ${
                  liveState?.status === 'playing'
                    ? 'bg-red-500 animate-pulse'
                    : 'bg-gray-500'
                }`}
              ></div>
              <span className="text-white text-sm font-medium">LIVE</span>
            </div>
          </div>

          {/* Current program info */}
          <div className="mt-4 bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h2 className="text-lg font-semibold text-white">En ce moment</h2>
            {liveState?.on_air_type ? (
              <div className="mt-2">
                <p className="text-white">
                  {liveState.on_air_type === 'segment' ? 'Segment en cours' : 'Vidéo en cours'}
                </p>
              </div>
            ) : (
              <p className="text-gray-400 mt-2">Aucun programme en cours</p>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          {/* Status card */}
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <Tv size={20} className="text-purple-400" />
              <h3 className="text-lg font-semibold text-white">Statut</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">État</span>
                <span className="text-white capitalize">{liveState?.status || 'idle'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Type</span>
                <span className="text-white">
                  {liveState?.on_air_type || 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Recent history */}
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white">Historique récent</h3>
            </div>
            <div className="text-center py-4 text-gray-400">
              <Clock size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Aucun historique disponible</p>
            </div>
          </div>

          {/* Related documents */}
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white">Documents liés</h3>
            </div>
            <div className="text-center py-4 text-gray-400">
              <FileText size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Aucun document lié</p>
            </div>
          </div>

          {/* Create decision button */}
          <button className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg flex items-center justify-center gap-2 transition-colors">
            <FileText size={20} />
            Créer une décision depuis ce segment
          </button>
        </div>
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
