import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { tvApi, mediaApi, TVLiveState, TVChannel, TVSegment, TVPlaylistItem, Media, TickerItem } from '../services/api'
import Modal from '../components/Modal'

export default function TVStudioPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const [channels, setChannels] = useState<TVChannel[]>([])
  const [selectedChannel, setSelectedChannel] = useState<TVChannel | null>(null)
  const [liveState, setLiveState] = useState<TVLiveState | null>(null)
  const [playlist, setPlaylist] = useState<TVPlaylistItem[]>([])
  const [segments, setSegments] = useState<TVSegment[]>([])
  const [mediaFiles, setMediaFiles] = useState<Media[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddVideoModal, setShowAddVideoModal] = useState(false)
  const [showAddSegmentModal, setShowAddSegmentModal] = useState(false)
  const [bannerText, setBannerText] = useState('')
  const [tickerText, setTickerText] = useState('')

  const fetchData = useCallback(async () => {
    if (!exerciseId) return
    try {
      const [channelsData, mediaData, segmentsData] = await Promise.all([
        tvApi.listChannels(parseInt(exerciseId)),
        mediaApi.list({ exercise_id: parseInt(exerciseId), mime_type: 'video', page_size: 100 }),
        tvApi.listSegments(parseInt(exerciseId)),
      ])
      setChannels(channelsData)
      setMediaFiles(mediaData.media)
      setSegments(segmentsData)

      if (channelsData.length > 0 && !selectedChannel) {
        setSelectedChannel(channelsData[0])
      }

      if (selectedChannel || channelsData.length > 0) {
        const channelId = selectedChannel?.id || channelsData[0].id
        const [liveData, playlistData] = await Promise.all([
          tvApi.getLiveState(parseInt(exerciseId), channelId),
          tvApi.getPlaylist(parseInt(exerciseId), channelId),
        ])
        setLiveState(liveData)
        setPlaylist(playlistData)
        setBannerText(liveData.banner_text || '')
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [exerciseId, selectedChannel?.id])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 3000)
    return () => clearInterval(interval)
  }, [fetchData])

  const handleControl = async (action: 'start' | 'stop' | 'pause' | 'resume' | 'skip', targetId?: number) => {
    try {
      await tvApi.control(parseInt(exerciseId!), action, targetId, selectedChannel?.id)
      fetchData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Control failed')
    }
  }

  const handleUpdateBanner = async () => {
    try {
      await tvApi.updateBanner(parseInt(exerciseId!), bannerText || null, selectedChannel?.id)
      fetchData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update banner')
    }
  }

  const handleAddTicker = async () => {
    if (!tickerText.trim()) return
    try {
      await tvApi.updateTicker(
        parseInt(exerciseId!),
        'add',
        { text: tickerText, priority: 'normal' },
        undefined,
        selectedChannel?.id
      )
      setTickerText('')
      fetchData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add ticker')
    }
  }

  const handleClearTicker = async () => {
    try {
      await tvApi.updateTicker(parseInt(exerciseId!), 'clear', undefined, undefined, selectedChannel?.id)
      fetchData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to clear ticker')
    }
  }

  const handleAddVideoToPlaylist = async (mediaId: number, title?: string) => {
    try {
      await tvApi.addToPlaylist(parseInt(exerciseId!), {
        channel_id: selectedChannel!.id,
        item_type: 'video_inject',
        media_id: mediaId,
        title: title,
      })
      setShowAddVideoModal(false)
      fetchData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add to playlist')
    }
  }

  const handleRemoveFromPlaylist = async (itemId: number) => {
    try {
      await tvApi.removeFromPlaylist(itemId)
      fetchData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to remove from playlist')
    }
  }

  const handleStartSegment = async (segmentId: number) => {
    try {
      await tvApi.startSegment(segmentId)
      fetchData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to start segment')
    }
  }

  const handleEndSegment = async (segmentId: number) => {
    try {
      await tvApi.endSegment(segmentId)
      fetchData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to end segment')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Régie TV</h1>
          <p className="mt-1 text-sm text-gray-400">Contrôlez la diffusion en direct</p>
        </div>
        {channels.length > 1 && (
          <select
            value={selectedChannel?.id || ''}
            onChange={(e) => {
              const channel = channels.find(c => c.id === parseInt(e.target.value))
              setSelectedChannel(channel || null)
            }}
            className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
          >
            {channels.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: On Air Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Live State */}
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${
                  liveState?.status === 'playing' ? 'bg-red-500 animate-pulse' : 'bg-gray-500'
                }`}></span>
                On Air
              </h2>
              <span className={`px-3 py-1 rounded text-sm ${
                liveState?.status === 'playing' ? 'bg-red-600 text-white' :
                liveState?.status === 'paused' ? 'bg-yellow-600 text-white' :
                'bg-gray-600 text-gray-300'
              }`}>
                {liveState?.status || 'idle'}
              </span>
            </div>

            {liveState?.on_air_media_id && (
              <div className="mb-4 bg-gray-900 rounded p-3">
                <p className="text-gray-400 text-sm">En diffusion:</p>
                <p className="text-white">Media ID: {liveState.on_air_media_id}</p>
              </div>
            )}

            <div className="flex gap-2">
              {liveState?.status === 'idle' && (
                <button
                  onClick={() => handleControl('start')}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  ▶ Démarrer
                </button>
              )}
              {liveState?.status === 'playing' && (
                <>
                  <button
                    onClick={() => handleControl('pause')}
                    className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
                  >
                    ⏸ Pause
                  </button>
                  <button
                    onClick={() => handleControl('skip')}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    ⏭ Suivant
                  </button>
                </>
              )}
              {liveState?.status === 'paused' && (
                <button
                  onClick={() => handleControl('resume')}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  ▶ Reprendre
                </button>
              )}
              {liveState?.status !== 'idle' && (
                <button
                  onClick={() => handleControl('stop')}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  ⏹ Arrêter
                </button>
              )}
            </div>
          </div>

          {/* Playlist */}
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Playlist</h2>
              <button
                onClick={() => setShowAddVideoModal(true)}
                className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700"
              >
                + Ajouter vidéo
              </button>
            </div>

            {playlist.length === 0 ? (
              <p className="text-gray-400 text-center py-8">Aucun élément dans la playlist</p>
            ) : (
              <div className="space-y-2">
                {playlist.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between p-3 rounded ${
                      item.status === 'on_air' ? 'bg-red-900/50 border border-red-700' :
                      item.status === 'done' ? 'bg-gray-700/50' :
                      'bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 w-6">{idx + 1}</span>
                      <div>
                        <p className="text-white">{item.title || `Vidéo #${item.media_id}`}</p>
                        <p className="text-sm text-gray-400">{item.item_type}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.status === 'queued' && (
                        <button
                          onClick={() => handleControl('start', item.id)}
                          className="px-2 py-1 bg-green-600/20 text-green-400 rounded text-sm hover:bg-green-600/40"
                        >
                          Diffuser
                        </button>
                      )}
                      <button
                        onClick={() => handleRemoveFromPlaylist(item.id)}
                        className="px-2 py-1 bg-red-600/20 text-red-400 rounded text-sm hover:bg-red-600/40"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Segments */}
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Segments</h2>
            </div>

            {segments.length === 0 ? (
              <p className="text-gray-400 text-center py-8">Aucun segment préparé</p>
            ) : (
              <div className="space-y-2">
                {segments.map((segment) => (
                  <div
                    key={segment.id}
                    className={`flex items-center justify-between p-3 rounded ${
                      segment.status === 'live' ? 'bg-red-900/50 border border-red-700' :
                      segment.status === 'ended' ? 'bg-gray-700/50' :
                      'bg-gray-700'
                    }`}
                  >
                    <div>
                      <p className="text-white">{segment.title || `Segment #${segment.id}`}</p>
                      <p className="text-sm text-gray-400">{segment.segment_type}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {segment.status === 'prepared' && (
                        <button
                          onClick={() => handleStartSegment(segment.id)}
                          className="px-2 py-1 bg-green-600/20 text-green-400 rounded text-sm hover:bg-green-600/40"
                        >
                          Diffuser
                        </button>
                      )}
                      {segment.status === 'live' && (
                        <button
                          onClick={() => handleEndSegment(segment.id)}
                          className="px-2 py-1 bg-red-600/20 text-red-400 rounded text-sm hover:bg-red-600/40"
                        >
                          Terminer
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Overlays */}
        <div className="space-y-6">
          {/* Banner */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Bandeau Breaking</h2>
            <div className="space-y-3">
              <input
                type="text"
                value={bannerText}
                onChange={(e) => setBannerText(e.target.value)}
                placeholder="Texte du bandeau..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              />
              <button
                onClick={handleUpdateBanner}
                className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Mettre à jour
              </button>
            </div>
          </div>

          {/* Ticker */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Ticker</h2>
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tickerText}
                  onChange={(e) => setTickerText(e.target.value)}
                  placeholder="Nouvel élément..."
                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
                <button
                  onClick={handleAddTicker}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  +
                </button>
              </div>
              {liveState?.ticker_items && liveState.ticker_items.length > 0 && (
                <>
                  <div className="space-y-1">
                    {liveState.ticker_items.map((item, idx) => (
                      <div key={idx} className="text-sm text-gray-300 bg-gray-700 p-2 rounded">
                        {item.text}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleClearTicker}
                    className="w-full px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
                  >
                    Effacer tout
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Statistiques</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Version:</span>
                <span className="text-white">{liveState?.version || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Segments:</span>
                <span className="text-white">{segments.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">En playlist:</span>
                <span className="text-white">{playlist.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Video Modal */}
      {showAddVideoModal && (
        <Modal isOpen={showAddVideoModal} title="Ajouter une vidéo" onClose={() => setShowAddVideoModal(false)}>
          <div className="space-y-4">
            {mediaFiles.length === 0 ? (
              <p className="text-gray-400 text-center py-4">
                Aucune vidéo disponible. Uploadez d'abord des vidéos dans la médiathèque.
              </p>
            ) : (
              <div className="max-h-96 overflow-y-auto space-y-2">
                {mediaFiles.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => handleAddVideoToPlaylist(m.id, m.title || m.original_filename)}
                    className="flex items-center gap-3 p-3 bg-gray-700 rounded cursor-pointer hover:bg-gray-600"
                  >
                    <span className="text-2xl">🎬</span>
                    <div>
                      <p className="text-white">{m.title || m.original_filename}</p>
                      <p className="text-sm text-gray-400">{m.mime_type}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
