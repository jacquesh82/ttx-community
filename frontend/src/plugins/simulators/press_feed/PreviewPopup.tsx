import { Newspaper, Clock, ExternalLink } from 'lucide-react'

export default function PressFeedPreview() {
  return (
    <div className="space-y-3">
      <div className="bg-gray-900 rounded-lg border border-gray-700 divide-y divide-gray-700">
        {[
          {
            source: 'Reuters',
            title: 'Incident industriel majeur : les autorités activent le plan d\'urgence',
            time: '14:20',
            breaking: true,
          },
          {
            source: 'AFP',
            title: 'Les riverains invités à se confiner dans un rayon de 2 km',
            time: '14:05',
            breaking: false,
          },
          {
            source: 'Le Monde',
            title: 'Retour sur la chronologie des événements depuis ce matin',
            time: '13:40',
            breaking: false,
          },
        ].map((article, i) => (
          <div key={i} className="px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-primary-400">{article.source}</span>
              {article.breaking && (
                <span className="text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded font-medium">
                  BREAKING
                </span>
              )}
              <span className="text-[10px] text-gray-500 ml-auto flex items-center gap-1">
                <Clock className="w-3 h-3" /> {article.time}
              </span>
            </div>
            <p className="text-sm text-gray-200">{article.title}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 text-center">
        Fil d'actualités presse avec articles, sources et alertes breaking news
      </p>
    </div>
  )
}
