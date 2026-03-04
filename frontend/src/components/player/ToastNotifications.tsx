import { useEffect, useState } from 'react'
import { X, Bell, Tv, Mail, MessageCircle } from 'lucide-react'
import { Notification } from '../../services/playerApi'

interface ToastNotificationsProps {
  notifications: Notification[]
}

interface Toast extends Notification {
  visible: boolean
  id: string
}

export default function ToastNotifications({ notifications }: ToastNotificationsProps) {
  const [toasts, setToasts] = useState<Toast[]>([])

  // Show new notifications as toasts
  useEffect(() => {
    const unreadNotifications = notifications.filter((n) => !n.is_read)
    const existingIds = new Set(toasts.map((t) => t.id))

    // Add new unread notifications
    unreadNotifications.forEach((notification) => {
      if (!existingIds.has(notification.id)) {
        setToasts((prev) => [
          ...prev,
          { ...notification, visible: true, id: notification.id },
        ])
      }
    })
  }, [notifications])

  // Auto-hide toasts after 5 seconds
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []

    toasts.forEach((toast) => {
      if (toast.visible) {
        const timer = setTimeout(() => {
          dismissToast(toast.id)
        }, 5000)
        timers.push(timer)
      }
    })

    return () => {
      timers.forEach(clearTimeout)
    }
  }, [toasts])

  const dismissToast = (id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, visible: false } : t))
    )

    // Remove completely after animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 300)
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'inject.received':
        return <Bell size={20} />
      case 'tv.segment':
        return <Tv size={20} />
      case 'mail.received':
        return <Mail size={20} />
      case 'chat.message':
      case 'social.mention':
        return <MessageCircle size={20} />
      default:
        return <Bell size={20} />
    }
  }

  const getBackgroundColor = (criticity: string) => {
    switch (criticity) {
      case 'critical':
        return 'bg-red-900 border-red-700'
      case 'important':
        return 'bg-yellow-900 border-yellow-700'
      default:
        return 'bg-primary-900 border-primary-700'
    }
  }

  if (toasts.filter((t) => t.visible).length === 0) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts
        .filter((t) => t.visible)
        .slice(0, 3)
        .map((toast) => (
          <div
            key={toast.id}
            className={`flex items-start gap-3 p-4 rounded-lg border shadow-lg min-w-80 max-w-md transition-all duration-300 ${getBackgroundColor(
              toast.criticity
            )}`}
          >
            <div className="flex-shrink-0 text-white">{getIcon(toast.type)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{toast.title}</p>
              <p className="text-xs text-gray-300 mt-1">{toast.message}</p>
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className="flex-shrink-0 text-gray-400 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        ))}
    </div>
  )
}
