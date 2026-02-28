import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MessageCircle,
  Send,
  Heart,
  Repeat2,
  Share2,
  MoreHorizontal,
  User,
  Clock,
  Image as ImageIcon,
  Loader2,
  Home,
  Search,
  Bell,
  Mail,
  Bookmark,
  Feather,
  MoreHorizontal as MoreVertical,
  UserCircle,
} from 'lucide-react'
import { simulatedApi, SimulatedSocialPost, SimulatedSocialFeed } from '../../../services/simulatedApi'

interface SocialSimulatorProps {
  exerciseId: number
  refreshKey?: number
}

export default function SocialSimulator({ exerciseId, refreshKey }: SocialSimulatorProps) {
  const [selectedPost, setSelectedPost] = useState<SimulatedSocialPost | null>(null)
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()

  // Fetch social feed
  const { data: feedData, isLoading: isLoadingFeed, refetch: refetchFeed } = useQuery({
    queryKey: ['simulated-social-feed', exerciseId, page],
    queryFn: () => simulatedApi.getSocialFeed(exerciseId, page),
  })

  // React to post mutation
  const reactMutation = useMutation({
    mutationFn: (data: { postId: number; reactionType: 'like' | 'retweet' }) =>
      simulatedApi.reactToSocialPost(exerciseId, data.postId, data.reactionType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulated-social-feed', exerciseId] })
    },
  })

  // Invalidate queries on WebSocket refresh
  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      queryClient.invalidateQueries({ queryKey: ['simulated-social-feed', exerciseId] })
    }
  }, [refreshKey, exerciseId, queryClient])

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetchFeed()
    }, 5000)
    return () => clearInterval(interval)
  }, [refetchFeed])

  const posts = feedData?.posts || []

  const handleLike = (post: SimulatedSocialPost) => {
    reactMutation.mutate({
      postId: post.id,
      reactionType: post.player_liked ? 'retweet' : 'like',
    })
  }

  const handleRetweet = (post: SimulatedSocialPost) => {
    reactMutation.mutate({
      postId: post.id,
      reactionType: post.player_retweeted ? 'retweet' : 'retweet',
    })
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    
    if (minutes < 1) return 'À l\'instant'
    if (minutes < 60) return `Il y a ${minutes} min`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `Il y a ${hours}h`
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
  }

  return (
    <div className="h-full flex flex-col bg-gray-900 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between sticky top-0 bg-gray-900 z-10">
        <div className="flex items-center gap-3">
          <MessageCircle className="w-6 h-6 text-sky-400" />
          <h2 className="text-lg font-semibold text-white">Réseau Social</h2>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-400">
            {feedData?.unseen_count || 0} non lu
          </span>
        </div>
      </div>

      {/* Main Content - 3 Column Layout like X/Twitter */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Sidebar - Navigation */}
        <div className="hidden lg:flex flex-col w-[275px] xl:w-[350px] border-r border-gray-700 sticky top-0 h-[calc(100vh-80px)] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-900">
          <div className="p-3 space-y-1">
            <button className="flex items-center gap-3 w-full p-3 rounded-full hover:bg-gray-800 transition-colors group">
              <Home className="w-7 h-7 text-white group-hover:text-sky-400" />
              <span className="text-xl font-bold text-white group-hover:text-sky-400">Accueil</span>
            </button>
            <button className="flex items-center gap-3 w-full p-3 rounded-full hover:bg-gray-800 transition-colors group">
              <Search className="w-6 h-6 text-gray-400 group-hover:text-white" />
              <span className="text-base font-medium text-gray-400 group-hover:text-white">Explorer</span>
            </button>
            <button className="flex items-center gap-3 w-full p-3 rounded-full hover:bg-gray-800 transition-colors group">
              <Bell className="w-6 h-6 text-gray-400 group-hover:text-white" />
              <span className="text-base font-medium text-gray-400 group-hover:text-white">Notifications</span>
            </button>
            <button className="flex items-center gap-3 w-full p-3 rounded-full hover:bg-gray-800 transition-colors group">
              <Mail className="w-6 h-6 text-gray-400 group-hover:text-white" />
              <span className="text-base font-medium text-gray-400 group-hover:text-white">Messages</span>
            </button>
            <button className="flex items-center gap-3 w-full p-3 rounded-full hover:bg-gray-800 transition-colors group">
              <Bookmark className="w-6 h-6 text-gray-400 group-hover:text-white" />
              <span className="text-base font-medium text-gray-400 group-hover:text-white">Favoris</span>
            </button>
            <button className="flex items-center gap-3 w-full p-3 rounded-full hover:bg-gray-800 transition-colors group">
              <UserCircle className="w-6 h-6 text-gray-400 group-hover:text-white" />
              <span className="text-base font-medium text-gray-400 group-hover:text-white">Profil</span>
            </button>
            <button className="flex items-center gap-3 w-full p-3 rounded-full hover:bg-gray-800 transition-colors group">
              <MoreVertical className="w-6 h-6 text-gray-400 group-hover:text-white" />
              <span className="text-base font-medium text-gray-400 group-hover:text-white">Plus</span>
            </button>
          </div>
          
          <div className="p-3 mt-4">
            <button className="flex items-center justify-center gap-3 w-full py-3 px-4 bg-sky-500 hover:bg-sky-600 text-white rounded-full font-bold transition-colors shadow-lg">
              <Feather className="w-5 h-5" />
              <span className="text-lg">Tweeter</span>
            </button>
          </div>
          
          <div className="p-3 mt-4 border-t border-gray-700">
            <button className="flex items-center gap-3 w-full p-3 rounded-full hover:bg-gray-800 transition-colors">
              <div className="w-10 h-10 rounded-full bg-sky-600 flex items-center justify-center">
                <User size={18} className="text-white" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-bold text-white text-sm">Votre compte</p>
                <p className="text-gray-400 text-sm">@votre_compte</p>
              </div>
              <MoreHorizontal className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Middle Column - Feed */}
        <div className="flex-1 border-r border-gray-700 min-w-0 flex flex-col h-[calc(100vh-80px)]">
          {/* Feed Header */}
          <div className="sticky top-0 bg-gray-900 z-10 border-b border-gray-700">
            <div className="flex items-center justify-between p-4">
              <h3 className="text-xl font-bold text-white">Fil d'actualité</h3>
              <button className="text-gray-400 hover:text-sky-400">
                <MoreHorizontal size={20} />
              </button>
            </div>
            <div className="flex border-t border-gray-700">
              <button className="flex-1 py-4 text-center border-b-2 border-sky-400 text-white font-medium">
                Pour vous
              </button>
              <button className="flex-1 py-4 text-center text-gray-500 hover:text-gray-300 font-medium">
                Suivis
              </button>
            </div>
          </div>

          {/* Feed Content */}
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-900">
            {isLoadingFeed ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
              </div>
            ) : posts.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Aucun post</p>
              </div>
            ) : (
              <div className="space-y-0">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    className={`border-b border-gray-700 hover:bg-gray-800/50 transition-colors cursor-pointer ${
                      !post.seen_at ? 'bg-sky-900/5' : ''
                    }`}
                  >
                    {/* Post Header */}
                    <div className="p-4 flex gap-3">
                      {/* Avatar */}
                      <div className="flex-shrink-0">
                        {post.author_avatar ? (
                          <img
                            src={post.author_avatar}
                            alt={post.author_name}
                            className="w-10 h-10 rounded-full object-cover hover:opacity-90 transition-opacity"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-sky-600 flex items-center justify-center">
                            <User size={18} className="text-white" />
                          </div>
                        )}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="font-bold text-white truncate hover:underline">
                              {post.author_name}
                            </span>
                            {post.is_verified && (
                              <span className="text-sky-500 flex-shrink-0">
                                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                  <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .495.083.965.238 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z"/>
                                </svg>
                              </span>
                            )}
                            <span className="text-gray-400 text-sm truncate">
                              @{post.author_handle}
                            </span>
                            <span className="text-gray-500 text-sm">·</span>
                            <span className="text-gray-500 text-sm">
                              {formatTime(post.posted_at)}
                            </span>
                          </div>
                          <button className="text-gray-500 hover:text-sky-400 transition-colors">
                            <MoreHorizontal size={18} />
                          </button>
                        </div>
                        
                        {/* Post Content */}
                        <div className="mt-1 text-white text-sm whitespace-pre-wrap leading-relaxed">
                          {post.content}
                        </div>
                        
                        {/* Media */}
                        {post.media_urls && post.media_urls.length > 0 && (
                          <div className="mt-3 rounded-xl overflow-hidden border border-gray-700">
                            <img
                              src={post.media_urls[0]}
                              alt="Post media"
                              className="w-full h-auto max-h-96 object-cover hover:opacity-90 transition-opacity"
                            />
                          </div>
                        )}
                        
                        {/* Post Footer - Stats */}
                        <div className="mt-3 flex items-center justify-between text-gray-500 text-xs max-w-md">
                          <div className="flex items-center gap-1 group hover:text-sky-400 transition-colors">
                            <MessageCircle size={14} />
                            <span>{post.replies_count}</span>
                          </div>
                          <div className={`flex items-center gap-1 group hover:text-green-400 transition-colors ${post.player_retweeted ? 'text-green-400' : ''}`}>
                            <Repeat2 size={14} />
                            <span>{post.retweets_count}</span>
                          </div>
                          <div className={`flex items-center gap-1 group hover:text-red-400 transition-colors ${post.player_liked ? 'text-red-400' : ''}`}>
                            <Heart size={14} />
                            <span>{post.likes_count}</span>
                          </div>
                          <div className="flex items-center gap-1 group hover:text-sky-400 transition-colors">
                            <Share2 size={14} />
                            <span>{post.views_count}</span>
                          </div>
                        </div>
                        
                        {/* Actions */}
                        <div className="mt-2 flex items-center justify-between max-w-md text-gray-500">
                          <button className="flex items-center gap-2 group hover:text-sky-400 transition-colors">
                            <MessageCircle size={18} />
                            <span className="text-xs">{post.replies_count}</span>
                          </button>
                          <button
                            onClick={() => handleRetweet(post)}
                            className={`flex items-center gap-2 transition-colors ${post.player_retweeted ? 'text-green-400' : 'group hover:text-green-400'}`}
                          >
                            <Repeat2 size={18} />
                            <span className="text-xs">{post.retweets_count}</span>
                          </button>
                          <button
                            onClick={() => handleLike(post)}
                            className={`flex items-center gap-2 transition-colors ${post.player_liked ? 'text-red-400' : 'group hover:text-red-400'}`}
                          >
                            <Heart size={18} />
                            <span className="text-xs">{post.likes_count}</span>
                          </button>
                          <button className="flex items-center gap-2 group hover:text-sky-400 transition-colors">
                            <Share2 size={18} />
                            <span className="text-xs">{post.views_count}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Load More */}
                {feedData && feedData.total > posts.length && (
                  <div className="p-4 text-center">
                    <button
                      onClick={() => setPage(prev => prev + 1)}
                      className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-full text-sm text-white transition-colors"
                    >
                      Charger plus
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar - Suggestions */}
        <div className="hidden xl:block w-[350px] pl-8 sticky top-0 h-[calc(100vh-80px)] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-900">
          {/* Search Box */}
          <div className="sticky top-0 bg-gray-900 z-10 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="text"
                placeholder="Rechercher"
                className="w-full bg-gray-800 text-white rounded-full py-3 pl-10 pr-4 border border-gray-700 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 placeholder-gray-500 transition-colors"
              />
            </div>
          </div>

          {/* Trending Box */}
          <div className="bg-gray-800 rounded-2xl overflow-hidden mb-4 border border-gray-700">
            <h3 className="px-4 py-3 text-xl font-bold text-white">Tendances</h3>
            <div className="px-4 pb-3">
              <div className="text-xs text-gray-500 mb-2">France · Tendances</div>
              {[
                { tag: '#SocialSimulator', posts: '12,5K posts' },
                { tag: '#CyberSécurité', posts: '8,2K posts' },
                { tag: '#Inject', posts: '5,4K posts' },
                { tag: '#RéseauSocial', posts: '3,1K posts' },
                { tag: '#Actualité', posts: '125K posts' },
              ].map((trend, i) => (
                <div key={i} className="py-3 hover:bg-gray-700/50 px-2 rounded-lg cursor-pointer transition-colors">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{trend.posts}</span>
                    <MoreHorizontal className="w-4 h-4" />
                  </div>
                  <div className="font-bold text-white text-sm mt-0.5">{trend.tag}</div>
                </div>
              ))}
              <div className="py-3 text-sky-400 text-sm hover:bg-gray-700/50 rounded-lg cursor-pointer transition-colors">
                Afficher plus
              </div>
            </div>
          </div>

          {/* Who to follow Box */}
          <div className="bg-gray-800 rounded-2xl overflow-hidden mb-4 border border-gray-700">
            <h3 className="px-4 py-3 text-xl font-bold text-white">Qui suivre</h3>
            <div className="px-4 pb-3 space-y-3">
              {[
                { name: 'Canal Ansso', handle: '@canal_anssi', avatar: null },
                { name: 'Canal Gouvernement', handle: '@gouvernement', avatar: null },
                { name: 'Canal Press', handle: '@canal_press', avatar: null },
              ].map((user, i) => (
                <div key={i} className="flex items-center justify-between hover:bg-gray-700/50 px-2 py-2 rounded-lg cursor-pointer transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-sky-600 flex items-center justify-center flex-shrink-0">
                      <User size={18} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm truncate hover:underline">{user.name}</p>
                      <p className="text-gray-400 text-sm truncate">{user.handle}</p>
                    </div>
                  </div>
                  <button className="px-4 py-1.5 bg-white text-black font-bold text-sm rounded-full hover:bg-gray-200 transition-colors">
                    Suivre
                  </button>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 text-sky-400 text-sm hover:bg-gray-700/50 rounded-lg cursor-pointer transition-colors">
              Afficher plus
            </div>
          </div>

          {/* Footer Links */}
          <div className="px-4 py-3 text-xs text-gray-500">
            <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
              <a href="#" className="hover:underline">Conditions d'utilisation</a>
              <a href="#" className="hover:underline">Confidentialité</a>
              <a href="#" className="hover:underline">Politique en matière des cookies</a>
              <a href="#" className="hover:underline">Accessibilité</a>
              <a href="#" className="hover:underline">Paramètres des pubs</a>
              <span>© 2024 Inject</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
