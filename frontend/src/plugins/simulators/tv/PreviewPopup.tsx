import { Tv, Play, Radio } from 'lucide-react'

export default function TvPreview() {
  return (
    <div className="space-y-3">
      <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
        {/* Video area */}
        <div className="relative aspect-video bg-black flex items-center justify-center">
          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-red-600 px-2 py-0.5 rounded text-xs text-white font-medium">
            <Radio className="w-3 h-3" />
            EN DIRECT
          </div>
          <Tv className="w-16 h-16 text-gray-700" />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
            <div className="bg-red-600/90 text-white text-xs px-2 py-1 rounded inline-block">
              FLASH INFO — Incident majeur signalé dans la zone industrielle
            </div>
          </div>
        </div>
        {/* Channel selector */}
        <div className="flex gap-2 p-3 border-t border-gray-700">
          {['Info 24', 'BFM Crisis', 'LCI'].map((ch, i) => (
            <button
              key={ch}
              className={`px-3 py-1 rounded text-xs font-medium ${
                i === 0 ? 'bg-primary-600 text-white' : 'bg-gray-700 text-gray-300'
              }`}
            >
              {ch}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-500 text-center">
        Simulation de chaînes TV en direct avec segments, bandeaux et alertes
      </p>
    </div>
  )
}
