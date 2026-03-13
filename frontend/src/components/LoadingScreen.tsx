import clsx from 'clsx'

interface LoadingScreenProps {
  /** Full-page centered overlay (auth check, player init) vs inline block */
  fullPage?: boolean
  /** Optional message below the logo */
  message?: string
}

/**
 * Branded loading indicator using the Crisis Lab logo.
 *
 * Two modes:
 *  - `fullPage` (default false): renders inside a flex container sized to fill its parent
 *  - `fullPage={true}`: renders a full-viewport overlay with dark background
 */
export default function LoadingScreen({ fullPage = false, message }: LoadingScreenProps) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center',
        fullPage
          ? 'fixed inset-0 z-50 bg-gray-950/90 backdrop-blur-sm'
          : 'w-full py-16',
      )}
    >
      <div className="relative flex items-center justify-center">
        {/* Pulsing ring */}
        <span className="absolute h-20 w-20 rounded-full border-2 border-primary-500/40 animate-ping" />
        {/* Rotating ring */}
        <span className="absolute h-24 w-24 rounded-full border-2 border-transparent border-t-primary-500 animate-spin" />
        {/* Logo */}
        <img
          src="/crisis_lab_v3.png"
          alt="Crisis Lab"
          className="h-12 w-12 object-contain animate-pulse"
          style={{ animationDuration: '2s' }}
        />
      </div>
      {message && (
        <p className="mt-6 text-sm text-gray-400 animate-pulse">{message}</p>
      )}
    </div>
  )
}
