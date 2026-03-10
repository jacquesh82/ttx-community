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
    <div className={`bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-col gap-3 ${className}`}>
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-xs mt-0.5 text-gray-400">{subtitle}</p>}
      </div>
      <div className="flex-1">{children}</div>
      {footer && <div className="pt-2 border-t border-gray-700">{footer}</div>}
    </div>
  )
}
