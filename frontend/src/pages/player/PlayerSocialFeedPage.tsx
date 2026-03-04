/**
 * PlayerSocialFeedPage - Social media feed (X/Twitter style)
 */
import { useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Heart,
  MessageCircle,
  Repeat2,
  Share,
  Verified,
  MoreHorizontal,
  Clock,
  TrendingUp,
  Bell,
} from 'lucide-react'
import { simulatedApi, SimulatedSocialPost } from '../../services/simulatedApi'
import { useSimulatedWs } from '../../hooks/useSimulatedWs'

export default function PlayerSocialFeedPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)

  // Fetch social feed
  const { data: feedData, isLoading } = useQuery({
    queryKey: ['social-feed', exerciseId, page],
    queryFn: () => simulatedApi.getSocialFeed(parseInt(exerciseId!), page),
    enabled: !!exerciseId,
  })

  // Like mutation
  const likeMutation = useMutation({
    mutationFn: ({ postId, isLiked }: { postId: number; isLiked: boolean }) =>
      simulatedApi.reactToSocialPost(parseInt(exerciseId!), postId, 'like'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social-feed', exerciseId] })
    },
  })

  // Retweet mutation
  const retweetMutation = useMutation({
    mutationFn: ({ postId }: { postId: number }) =>
      simulatedApi.reactToSocialPost(parseInt(exerciseId!), postId, 'retweet'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social-feed', exerciseId] })
    },
  })

  // WebSocket for real-time updates
  const handleNewPost = useCallback((post: SimulatedSocialPost) => {
    queryClient.setQueryData(['social-feed', exerciseId], (old: any) => {
      if (!old) return old
      return {
        ...old,
        posts: [post, ...old.posts],
        total: old.total + 1,
        unseen_count: old.unseen_count + 1,
      }
    })
  }, [exerciseId, queryClient])

  const { connectionState } = useSimulatedWs({
    exerciseId: parseInt(exerciseId!),
    onSocial: handleNewPost,
  })

  const handleLike = (post: SimulatedSocialPost) => {
    likeMutation.mutate({ postId: post.id, isLiked: post.player_liked })
  }

  const handleRetweet = (post: SimulatedSocialPost) => {
    retweetMutation.mutate({ postId: post.id })
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'now'
    if (diffMins < 60) return `${diffMins}m`
    if (diffHours < 24) return `${diffHours}h`
    if (diffDays < 7) return `${diffDays}d`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  const posts = feedData?.posts || []

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="sticky top-0 bg-black/80 backdrop-blur-md border-b border-gray-800 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Social</h1>
            {feedData?.unseen_count ? (
              <span className="px-2 py-0.5 bg-primary-500 text-white text-xs rounded-full">
                {feedData.unseen_count} new
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-4">
            <div className={`w-2 h-2 rounded-full ${
              connectionState === 'connected' ? 'bg-green-500' :
              connectionState === 'connecting' ? 'bg-yellow-500 animate-pulse' :
              'bg-red-500'
            }`} />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800">
          <button className="flex-1 py-3 text-center font-medium border-b-2 border-primary-500 text-white">
            For you
          </button>
          <button className="flex-1 py-3 text-center font-medium text-gray-500 hover:bg-gray-900">
            Following
          </button>
        </div>
      </header>

      {/* Feed */}
      <div className="divide-y divide-gray-800">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <MessageCircle size={48} className="mb-4 opacity-50" />
            <p className="text-lg">No posts yet</p>
            <p className="text-sm mt-1">Posts will appear here when events are triggered</p>
          </div>
        ) : (
          posts.map((post: SimulatedSocialPost) => (
            <article key={post.id} className="p-4 hover:bg-gray-900/50 transition-colors">
              <div className="flex gap-3">
                {/* Avatar */}
                <div className="flex-shrink-0">
                  {post.author_avatar ? (
                    <img
                      src={post.author_avatar}
                      alt={post.author_name}
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center text-white font-bold">
                      {post.author_name.charAt(0)}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Author */}
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="font-bold text-white hover:underline">
                      {post.author_name}
                    </span>
                    {post.is_verified && (
                      <Verified size={16} className="text-primary-500" />
                    )}
                    <span className="text-gray-500">@{post.author_handle}</span>
                    <span className="text-gray-500">·</span>
                    <span className="text-gray-500">{formatTime(post.posted_at)}</span>
                  </div>

                  {/* Breaking label */}
                  {post.is_breaking && (
                    <div className="flex items-center gap-1 mt-1 text-red-500 text-sm">
                      <TrendingUp size={14} />
                      <span className="font-medium">Breaking News</span>
                    </div>
                  )}

                  {/* Post text */}
                  <p className="mt-2 text-white whitespace-pre-wrap break-words">
                    {post.content}
                  </p>

                  {/* Media */}
                  {post.media_urls && post.media_urls.length > 0 && (
                    <div className="mt-3 rounded-xl overflow-hidden border border-gray-800">
                      <img
                        src={post.media_urls[0]}
                        alt=""
                        className="w-full max-h-96 object-cover"
                      />
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-between mt-3 max-w-md">
                    {/* Reply */}
                    <button className="flex items-center gap-2 text-gray-500 hover:text-primary-500 group">
                      <div className="p-2 rounded-full group-hover:bg-primary-500/10">
                        <MessageCircle size={18} />
                      </div>
                      <span className="text-sm">{formatNumber(post.replies_count)}</span>
                    </button>

                    {/* Retweet */}
                    <button
                      onClick={() => handleRetweet(post)}
                      className={`flex items-center gap-2 group ${
                        post.player_retweeted ? 'text-green-500' : 'text-gray-500 hover:text-green-500'
                      }`}
                    >
                      <div className={`p-2 rounded-full ${
                        post.player_retweeted ? 'bg-green-500/10' : 'group-hover:bg-green-500/10'
                      }`}>
                        <Repeat2 size={18} />
                      </div>
                      <span className="text-sm">{formatNumber(post.retweets_count)}</span>
                    </button>

                    {/* Like */}
                    <button
                      onClick={() => handleLike(post)}
                      className={`flex items-center gap-2 group ${
                        post.player_liked ? 'text-pink-500' : 'text-gray-500 hover:text-pink-500'
                      }`}
                    >
                      <div className={`p-2 rounded-full ${
                        post.player_liked ? 'bg-pink-500/10' : 'group-hover:bg-pink-500/10'
                      }`}>
                        <Heart size={18} fill={post.player_liked ? 'currentColor' : 'none'} />
                      </div>
                      <span className="text-sm">{formatNumber(post.likes_count)}</span>
                    </button>

                    {/* Views */}
                    <div className="flex items-center gap-2 text-gray-500">
                      <span className="text-sm">{formatNumber(post.views_count)} views</span>
                    </div>

                    {/* Share */}
                    <button className="p-2 rounded-full text-gray-500 hover:text-primary-500 hover:bg-primary-500/10">
                      <Share size={18} />
                    </button>
                  </div>
                </div>

                {/* More options */}
                <button className="p-2 rounded-full text-gray-500 hover:text-primary-500 hover:bg-primary-500/10">
                  <MoreHorizontal size={18} />
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      {/* Load more */}
      {feedData && posts.length < feedData.total && (
        <div className="p-4 text-center border-t border-gray-800">
          <button
            onClick={() => setPage(p => p + 1)}
            className="text-primary-500 hover:text-primary-400"
          >
            Load more posts
          </button>
        </div>
      )}
    </div>
  )
}