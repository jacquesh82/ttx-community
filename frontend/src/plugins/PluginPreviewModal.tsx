import { Suspense } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PluginManifest } from './types'
import LoadingScreen from '../components/LoadingScreen'

interface PluginPreviewModalProps {
  plugin: PluginManifest
  onClose: () => void
}

export default function PluginPreviewModal({ plugin, onClose }: PluginPreviewModalProps) {
  const { t } = useTranslation()
  const PreviewComponent = plugin.PreviewPopup

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <plugin.icon className="w-5 h-5 text-gray-300" />
            <h2 className="text-lg font-semibold text-white">
              {t('plugins.previewTitle')} — {t(plugin.name)}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto max-h-[calc(80vh-4rem)]">
          {PreviewComponent ? (
            <Suspense fallback={<LoadingScreen />}>
              <PreviewComponent />
            </Suspense>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <plugin.icon className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{t(plugin.description)}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
