import { Heart, MessageCircle, Repeat2, Share } from 'lucide-react'

export default function SocialPreview() {
  return (
    <div className="space-y-3">
      <div className="bg-gray-900 rounded-lg border border-gray-700 divide-y divide-gray-700">
        {[
          {
            user: '@prefet_region',
            name: 'Préfet de Région',
            verified: true,
            text: '🔴 Activation du plan ORSEC. Toutes les équipes sont mobilisées. Point presse à 15h.',
            likes: 234,
            retweets: 89,
            time: '14:28',
          },
          {
            user: '@info_locale',
            name: 'Info Locale 24',
            verified: false,
            text: 'Des témoins rapportent une forte odeur dans le quartier sud. Évitez la zone. #incident',
            likes: 56,
            retweets: 23,
            time: '14:15',
          },
        ].map((post, i) => (
          <div key={i} className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                <span className="text-xs text-white font-bold">{post.name[0]}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-white">{post.name}</span>
                <span className="text-xs text-gray-500 ml-1">{post.user} · {post.time}</span>
              </div>
            </div>
            <p className="text-sm text-gray-200 mb-3">{post.text}</p>
            <div className="flex items-center gap-6 text-gray-500">
              <span className="flex items-center gap-1 text-xs"><MessageCircle className="w-3.5 h-3.5" /> 12</span>
              <span className="flex items-center gap-1 text-xs"><Repeat2 className="w-3.5 h-3.5" /> {post.retweets}</span>
              <span className="flex items-center gap-1 text-xs"><Heart className="w-3.5 h-3.5" /> {post.likes}</span>
              <span className="flex items-center gap-1 text-xs"><Share className="w-3.5 h-3.5" /></span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 text-center">
        Fil social interne simulant un réseau type X/Twitter
      </p>
    </div>
  )
}
