import type { ReactNode } from 'react'

interface KpiCardProps {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}

export default function KpiCard({ title, subtitle, children, footer, className = '' }: KpiCardProps) {
  return (
    <div
      className={`rounded-xl p-4 flex flex-col gap-3 ${className}`}
      style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-card-border)' }}
    >
      <div>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--app-fg)' }}>{title}</h3>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--sidebar-muted)' }}>{subtitle}</p>}
      </div>
      <div className="flex-1">{children}</div>
      {footer && <div className="pt-2" style={{ borderTop: '1px solid var(--surface-card-border)' }}>{footer}</div>}
    </div>
  )
}
