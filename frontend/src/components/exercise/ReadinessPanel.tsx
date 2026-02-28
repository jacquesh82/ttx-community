import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Pause, Play, RotateCcw, Square } from 'lucide-react'

interface ReadinessPanelProps {
  status: string
  isReady: boolean
  missingItems: string[]
  canConfigure: boolean
  isActionPending: boolean
  liveUrl: string
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onEnd: () => void
  onRestart: () => void
}

export default function ReadinessPanel({
  status,
  isReady,
  missingItems,
  canConfigure,
  isActionPending,
  liveUrl,
  onStart,
  onPause,
  onResume,
  onEnd,
  onRestart,
}: ReadinessPanelProps) {
  return (
    <div className="space-y-4">
      <div className={`p-4 rounded-lg border ${isReady ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-start gap-2">
          {isReady ? (
            <CheckCircle2 size={18} className="text-emerald-700 mt-0.5" />
          ) : (
            <AlertTriangle size={18} className="text-amber-700 mt-0.5" />
          )}
          <div>
            <p className={`text-sm font-medium ${isReady ? 'text-emerald-800' : 'text-amber-800'}`}>
              {isReady ? 'Configuration complete: exercice pret a demarrer.' : 'Configuration incomplete.'}
            </p>
            {!isReady && (
              <ul className="mt-2 text-sm text-amber-800 list-disc list-inside space-y-1">
                {missingItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {status === 'draft' && (
          <button
            onClick={onStart}
            disabled={!canConfigure || !isReady || isActionPending}
            className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            <Play size={16} className="mr-2" />
            Demarrer
          </button>
        )}

        {status === 'running' && (
          <>
            <button
              onClick={onPause}
              disabled={!canConfigure || isActionPending}
              className="inline-flex items-center px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
            >
              <Pause size={16} className="mr-2" />
              Pause
            </button>
            <button
              onClick={onEnd}
              disabled={!canConfigure || isActionPending}
              className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            >
              <Square size={16} className="mr-2" />
              Terminer
            </button>
          </>
        )}

        {status === 'paused' && (
          <>
            <button
              onClick={onResume}
              disabled={!canConfigure || isActionPending}
              className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              <Play size={16} className="mr-2" />
              Reprendre
            </button>
            <button
              onClick={onEnd}
              disabled={!canConfigure || isActionPending}
              className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            >
              <Square size={16} className="mr-2" />
              Terminer
            </button>
          </>
        )}

        {(status === 'completed' || status === 'archived') && (
          <button
            onClick={onRestart}
            disabled={!canConfigure || isActionPending}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            <RotateCcw size={16} className="mr-2" />
            Relancer
          </button>
        )}

        <Link
          to={liveUrl}
          className="inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded hover:bg-gray-50"
        >
          Mode live
        </Link>
      </div>
    </div>
  )
}
