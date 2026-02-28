import { Loader2, Check, AlertCircle } from 'lucide-react'

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface AutoSaveIndicatorProps {
  status: AutoSaveStatus
  errorMessage?: string | null
  savedLabel?: string
}

export default function AutoSaveIndicator({
  status,
  errorMessage,
  savedLabel = 'Sauvegardé',
}: AutoSaveIndicatorProps) {
  if (status === 'idle') return null

  return (
    <div className="flex items-center gap-1.5">
      {status === 'saving' && (
        <>
          <Loader2 size={13} className="animate-spin text-gray-400" />
          <span className="text-xs text-gray-400">Sauvegarde…</span>
        </>
      )}
      {status === 'saved' && (
        <>
          <Check size={13} className="text-emerald-600" />
          <span className="text-xs text-emerald-600">{savedLabel}</span>
        </>
      )}
      {status === 'error' && (
        <>
          <AlertCircle size={13} className="text-red-500" />
          <span className="text-xs text-red-500">{errorMessage || 'Erreur de sauvegarde'}</span>
        </>
      )}
    </div>
  )
}
