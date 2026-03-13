import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { PackageX, ArrowLeft } from 'lucide-react'

export default function LogsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 6rem)' }}>
      <div className="text-center space-y-6 max-w-sm px-4">
        <div className="flex justify-center">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-card-border)' }}
          >
            <PackageX className="w-10 h-10" style={{ color: 'var(--app-fg)', opacity: 0.35 }} />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--app-fg)' }}>
            {t('common.module_unavailable')}
          </h1>
          <p className="text-sm" style={{ color: 'var(--sidebar-muted)' }}>
            {t('common.module_unavailable_desc')}
          </p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors"
          style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--surface-card-border)',
            color: 'var(--app-fg)',
          }}
        >
          <ArrowLeft className="w-4 h-4" />
          {t('common.back_home')}
        </button>
      </div>
    </div>
  )
}
