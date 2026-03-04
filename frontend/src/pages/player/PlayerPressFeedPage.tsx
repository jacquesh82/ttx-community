/**
 * PlayerPressFeedPage - Press articles feed (news sites style)
 */
import { useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Newspaper,
  Clock,
  ExternalLink,
  AlertTriangle,
  Bookmark,
  Share2,
  ChevronRight,
} from 'lucide-react'
import { simulatedApi, SimulatedPressArticle } from '../../services/simulatedApi'
import { useSimulatedWs } from '../../hooks/useSimulatedWs'

export default function PlayerPressFeedPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const queryClient = useQueryClient()
  const [selectedArticle, setSelectedArticle] = useState<SimulatedPressArticle | null>(null)
  const [page, setPage] = useState(1)

  // Fetch press feed
  const { data: feedData, isLoading } = useQuery({
    queryKey: ['press-feed', exerciseId, page],
    queryFn: () => simulatedApi.getPressFeed(parseInt(exerciseId!), page),
    enabled: !!exerciseId,
  })

  // WebSocket for real-time updates
  const handleNewArticle = useCallback((article: SimulatedPressArticle) => {
    queryClient.setQueryData(['press-feed', exerciseId], (old: any) => {
      if (!old) return old
      return {
        ...old,
        articles: [article, ...old.articles],
        total: old.total + 1,
        unread_count: old.unseen_count + 1,
      }
    })
  }, [exerciseId, queryClient])

  const { connectionState } = useSimulatedWs({
    exerciseId: parseInt(exerciseId!),
    onPress: handleNewArticle,
  })

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  const articles = feedData?.articles || []

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Newspaper className="w-6 h-6 text-gray-700" />
              <h1 className="text-xl font-bold text-gray-900">Presse</h1>
              {feedData?.unread_count ? (
                <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                  {feedData.unread_count} new
                </span>
              ) : null}
            </div>
            <div className={`w-2 h-2 rounded-full ${
              connectionState === 'connected' ? 'bg-green-500' :
              connectionState === 'connecting' ? 'bg-yellow-500 animate-pulse' :
              'bg-red-500'
            }`} />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto">
        {/* Breaking News Banner */}
        {articles.some(a => a.is_breaking_news) && (
          <div className="bg-red-600 text-white px-4 py-3 flex items-center gap-2">
            <AlertTriangle size={20} className="animate-pulse" />
            <span className="font-medium">BREAKING NEWS</span>
            <span className="mx-2">•</span>
            <span className="text-sm">
              {articles.find(a => a.is_breaking_news)?.title}
            </span>
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Newspaper size={48} className="mb-4 opacity-50" />
            <p className="text-lg">Aucun article</p>
            <p className="text-sm mt-1">Les articles de presse apparaîtront ici</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 bg-white">
            {articles.map((article: SimulatedPressArticle) => (
              <article
                key={article.id}
                className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => setSelectedArticle(article)}
              >
                <div className="flex gap-4">
                  {/* Image */}
                  {article.image_url && (
                    <div className="flex-shrink-0">
                      <img
                        src={article.image_url}
                        alt=""
                        className="w-32 h-24 object-cover rounded-lg"
                      />
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Source */}
                    <div className="flex items-center gap-2 mb-1">
                      {article.source_logo ? (
                        <img
                          src={article.source_logo}
                          alt={article.source}
                          className="w-4 h-4 rounded"
                        />
                      ) : null}
                      <span className="text-sm text-gray-500 font-medium">
                        {article.source}
                      </span>
                      {article.is_breaking_news && (
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs font-medium rounded">
                          BREAKING
                        </span>
                      )}
                      <span className="text-gray-300">•</span>
                      <span className="text-sm text-gray-500">
                        {formatTime(article.published_at)}
                      </span>
                    </div>

                    {/* Title */}
                    <h2 className="font-semibold text-gray-900 line-clamp-2 mb-1">
                      {article.title}
                    </h2>

                    {/* Summary */}
                    {article.summary && (
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {article.summary}
                      </p>
                    )}

                    {/* Category */}
                    {article.category && (
                      <span className="inline-block mt-2 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                        {article.category}
                      </span>
                    )}
                  </div>

                  {/* Chevron */}
                  <div className="flex items-center">
                    <ChevronRight size={20} className="text-gray-400" />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Load more */}
        {feedData && articles.length < feedData.total && (
          <div className="p-4 text-center bg-white border-t border-gray-200">
            <button
              onClick={() => setPage(p => p + 1)}
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              Charger plus d'articles
            </button>
          </div>
        )}
      </div>

      {/* Article Modal */}
      {selectedArticle && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedArticle(null)}
        >
          <div
            className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-2 mb-3">
                {selectedArticle.source_logo ? (
                  <img
                    src={selectedArticle.source_logo}
                    alt={selectedArticle.source}
                    className="w-5 h-5 rounded"
                  />
                ) : null}
                <span className="text-sm text-gray-500 font-medium">
                  {selectedArticle.source}
                </span>
                {selectedArticle.is_breaking_news && (
                  <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs font-medium rounded">
                    BREAKING
                  </span>
                )}
              </div>
              <h2 className="text-2xl font-bold text-gray-900">
                {selectedArticle.title}
              </h2>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                <span>{formatDate(selectedArticle.published_at)}</span>
                <span>{formatTime(selectedArticle.published_at)}</span>
              </div>
            </div>

            {/* Image */}
            {selectedArticle.image_url && (
              <img
                src={selectedArticle.image_url}
                alt=""
                className="w-full h-64 object-cover"
              />
            )}

            {/* Content */}
            <div className="p-6">
              {selectedArticle.summary && (
                <p className="text-lg text-gray-700 font-medium mb-4 leading-relaxed">
                  {selectedArticle.summary}
                </p>
              )}
              {selectedArticle.content && (
                <div className="prose prose-gray max-w-none">
                  {selectedArticle.content.split('\n').map((paragraph, idx) => (
                    <p key={idx} className="text-gray-700 mb-4">
                      {paragraph}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button className="flex items-center gap-2 text-gray-500 hover:text-primary-600">
                  <Bookmark size={18} />
                  <span className="text-sm">Sauvegarder</span>
                </button>
                <button className="flex items-center gap-2 text-gray-500 hover:text-primary-600">
                  <Share2 size={18} />
                  <span className="text-sm">Partager</span>
                </button>
              </div>
              {selectedArticle.article_url && (
                <a
                  href={selectedArticle.article_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-primary-600 hover:text-primary-700"
                >
                  <span className="text-sm">Voir la source</span>
                  <ExternalLink size={16} />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}