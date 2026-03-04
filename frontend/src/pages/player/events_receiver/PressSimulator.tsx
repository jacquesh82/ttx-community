import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Newspaper,
  Share2,
  Clock,
  Bookmark,
  ArrowRight,
  Loader2,
  ExternalLink,
  Shield,
  Building2,
  FileText,
} from 'lucide-react'
import { simulatedApi, SimulatedPressArticle, SimulatedPressFeed } from '../../../services/simulatedApi'

interface PressSimulatorProps {
  exerciseId: number
  refreshKey?: number
}

// Channel icons and colors
const CHANNEL_CONFIG: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  'libération': { icon: FileText, color: 'text-red-500', bgColor: 'bg-red-500/20' },
  'le monde': { icon: FileText, color: 'text-primary-600', bgColor: 'bg-primary-600/20' },
  'afp': { icon: FileText, color: 'text-gray-600', bgColor: 'bg-gray-600/20' },
  'canal_press': { icon: FileText, color: 'text-red-500', bgColor: 'bg-red-500/20' },
  'canal_anssi': { icon: Shield, color: 'text-indigo-500', bgColor: 'bg-indigo-500/20' },
  'canal_gouvernement': { icon: Building2, color: 'text-violet-500', bgColor: 'bg-violet-500/20' },
}

const DEFAULT_CHANNEL_CONFIG = { icon: FileText, color: 'text-gray-400', bgColor: 'bg-gray-500/20' }

export default function PressSimulator({ exerciseId, refreshKey }: PressSimulatorProps) {
  const [selectedArticle, setSelectedArticle] = useState<SimulatedPressArticle | null>(null)
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()

  // Fetch press feed
  const { data: feedData, isLoading: isLoadingFeed, refetch: refetchFeed } = useQuery({
    queryKey: ['simulated-press-feed', exerciseId, page],
    queryFn: () => simulatedApi.getPressFeed(exerciseId, page),
  })

  // Mark article as read mutation
  const markReadMutation = useMutation({
    mutationFn: async (articleId: number) => {
      await simulatedApi.getPressArticle(exerciseId, articleId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulated-press-feed', exerciseId] })
    },
  })

  // Invalidate queries on WebSocket refresh
  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      queryClient.invalidateQueries({ queryKey: ['simulated-press-feed', exerciseId] })
    }
  }, [refreshKey, exerciseId, queryClient])

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetchFeed()
    }, 5000)
    return () => clearInterval(interval)
  }, [refetchFeed])

  const articles = feedData?.articles || []

  const getChannelConfig = (source: string) => {
    const normalized = source.toLowerCase()
    for (const [key, config] of Object.entries(CHANNEL_CONFIG)) {
      if (normalized.includes(key)) {
        return config
      }
    }
    return DEFAULT_CHANNEL_CONFIG
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const handleSelectArticle = (article: SimulatedPressArticle) => {
    setSelectedArticle(article)
    if (!article.is_read) {
      markReadMutation.mutate(article.id)
    }
  }

  return (
    <div className="h-full flex flex-col bg-gray-800 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Newspaper className="w-5 h-5 text-red-400" />
          <h2 className="text-lg font-semibold text-white">Presse & Médias</h2>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-400">
            {feedData?.unread_count || 0} non lu
          </span>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Article list */}
        <div className="w-1/3 border-r border-gray-700 flex flex-col">
          <div className="p-3 border-b border-gray-700">
            <h3 className="text-sm font-medium text-gray-400">Articles</h3>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
            {isLoadingFeed ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-red-500" />
              </div>
            ) : articles.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Newspaper className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Aucun article</p>
              </div>
            ) : (
              articles.map((article) => {
                const channelConfig = getChannelConfig(article.source)
                const Icon = channelConfig.icon

                return (
                  <button
                    key={article.id}
                    onClick={() => handleSelectArticle(article)}
                    className={`w-full p-3 text-left border-b border-gray-700 hover:bg-gray-700/50 ${
                      selectedArticle?.id === article.id ? 'bg-gray-700' : ''
                    } ${!article.is_read ? 'bg-red-900/10' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`p-1 rounded ${channelConfig.bgColor}`}>
                            <Icon size={12} className={channelConfig.color} />
                          </div>
                          <span className="text-xs text-gray-400 truncate">
                            {article.source}
                          </span>
                          {article.is_breaking_news && (
                            <span className="text-xs text-red-500 font-bold px-1.5 py-0.5 bg-red-500/20 rounded">
                              FLASH
                            </span>
                          )}
                        </div>
                        <p className={`text-sm font-medium truncate ${
                          !article.is_read ? 'text-white' : 'text-gray-300'
                        }`}>
                          {article.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatTime(article.published_at)}
                        </p>
                      </div>
                      {!article.is_read && (
                        <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* Load More */}
          {feedData && feedData.total > articles.length && (
            <div className="p-3 border-t border-gray-700">
              <button
                onClick={() => setPage(prev => prev + 1)}
                className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-white"
              >
                Charger plus
              </button>
            </div>
          )}
        </div>

        {/* Article detail */}
        <div className="flex-1 flex flex-col min-w-0 bg-gray-900">
          {selectedArticle ? (
            <>
              {/* Article Header */}
              <div className="p-4 border-b border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSelectedArticle(null)}
                      className="lg:hidden text-gray-400 hover:text-white"
                    >
                      <ArrowRight size={20} className="rotate-180" />
                    </button>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
                        <Newspaper size={16} className="text-gray-300" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{selectedArticle.source}</p>
                        {selectedArticle.category && (
                          <p className="text-xs text-gray-400">{selectedArticle.category}</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                      {formatTime(selectedArticle.published_at)}
                    </span>
                    <button className="text-gray-400 hover:text-white">
                      <Share2 size={16} />
                    </button>
                    <button className="text-gray-400 hover:text-white">
                      <Bookmark size={16} />
                    </button>
                  </div>
                </div>
                
                <h3 className="text-xl font-bold text-white mb-2">
                  {selectedArticle.title}
                </h3>
                
                {selectedArticle.summary && (
                  <p className="text-sm text-gray-400 italic">
                    {selectedArticle.summary}
                  </p>
                )}
              </div>

              {/* Article Content */}
              <div className="flex-1 p-6 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
                {selectedArticle.content ? (
                  <div className="prose prose-invert max-w-none text-gray-300 whitespace-pre-wrap">
                    {selectedArticle.content}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Aucun contenu disponible</p>
                  </div>
                )}

                {/* Article Image */}
                {selectedArticle.image_url && (
                  <div className="mt-6 rounded-lg overflow-hidden">
                    <img
                      src={selectedArticle.image_url}
                      alt={selectedArticle.title}
                      className="w-full h-auto"
                    />
                  </div>
                )}

                {/* Source Info */}
                <div className="mt-8 pt-6 border-t border-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                      {selectedArticle.article_url ? (
                        <a
                          href={selectedArticle.article_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-primary-400 hover:text-primary-300"
                        >
                          <ExternalLink size={14} />
                          Lire l'article original
                        </a>
                      ) : (
                        <span className="text-gray-500">Article non disponible en ligne</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-600">
                      ID: {selectedArticle.id}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <Newspaper className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Sélectionnez un article</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}