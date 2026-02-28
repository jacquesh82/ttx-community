/**
 * WebSocket Service for real-time exercise updates
 * Used by both Animateur and Player interfaces
 */

export type WebSocketEventType =
  | 'connected'
  | 'inject:sent'
  | 'inject:received'
  | 'inject:created'
  | 'inject:updated'
  | 'inject:deleted'
  | 'exercise:started'
  | 'exercise:paused'
  | 'exercise:resumed'
  | 'exercise:ended'
  | 'exercise:updated'
  | 'event:new'
  | 'ping'
  | 'pong'

export interface WebSocketMessage {
  type: WebSocketEventType
  exercise_id: number
  data?: any
  timestamp: string
  personal?: boolean
}

export interface WebSocketOptions {
  ticket?: string
  getTicket?: () => Promise<string>
  onMessage?: (message: WebSocketMessage) => void
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Event) => void
  reconnect?: boolean
  reconnectInterval?: number
  maxReconnectAttempts?: number
}

class WebSocketService {
  private ws: WebSocket | null = null
  private exerciseId: number | null = null
  private options: WebSocketOptions | null = null
  private reconnectAttempts = 0
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private isIntentionallyClosed = false
  private lastErrorLogAt = 0
  private lastCloseLogAt = 0
  private lastReconnectLogAt = 0

  private logThrottled(kind: 'error' | 'close' | 'reconnect', message: string, payload?: unknown): void {
    const now = Date.now()
    const interval = 5000
    const map = {
      error: this.lastErrorLogAt,
      close: this.lastCloseLogAt,
      reconnect: this.lastReconnectLogAt,
    }
    if (now - map[kind] < interval) return
    if (kind === 'error') this.lastErrorLogAt = now
    if (kind === 'close') this.lastCloseLogAt = now
    if (kind === 'reconnect') this.lastReconnectLogAt = now
    if (payload !== undefined) console.error(message, payload)
    else console.log(message)
  }

  connect(exerciseId: number, options: WebSocketOptions): void {
    this.exerciseId = exerciseId
    this.options = options
    this.isIntentionallyClosed = false
    void this.createConnection()
  }

  private async createConnection(): Promise<void> {
    if (!this.exerciseId || !this.options) return

    let ticket = this.options.ticket
    if (this.options.getTicket) {
      try {
        ticket = await this.options.getTicket()
      } catch (error) {
        this.logThrottled('error', '[WebSocket] Failed to fetch WS ticket:', error)
        this.options?.onError?.(new Event('error'))
        this.attemptReconnect()
        return
      }
    }
    if (!ticket) {
      this.logThrottled('error', '[WebSocket] Missing WS ticket')
      this.attemptReconnect()
      return
    }
    if (this.isIntentionallyClosed) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const url = `${protocol}//${host}/api/ws/exercise/${this.exerciseId}?ticket=${encodeURIComponent(ticket)}`

    try {
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        console.log(`[WebSocket] Connected to exercise ${this.exerciseId}`)
        this.reconnectAttempts = 0
        this.options?.onConnect?.()
        this.startPingInterval()
      }

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          this.handleMessage(message)
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error)
        }
      }

      this.ws.onclose = (event) => {
        this.logThrottled('close', `[WebSocket] Disconnected: code=${event.code}, reason=${event.reason}`)
        this.stopPingInterval()
        this.options?.onDisconnect?.()

        // Attempt reconnection if not intentionally closed
        if (!this.isIntentionallyClosed && this.options?.reconnect !== false) {
          this.attemptReconnect()
        }
      }

      this.ws.onerror = (error) => {
        this.logThrottled('error', '[WebSocket] Error:', error)
        this.options?.onError?.(error)
      }
    } catch (error) {
      this.logThrottled('error', '[WebSocket] Failed to create connection:', error)
      this.attemptReconnect()
    }
  }

  private handleMessage(message: WebSocketMessage): void {
    // Handle ping/pong internally
    if (message.type === 'ping') {
      this.send({ type: 'pong' })
      return
    }

    if (message.type === 'pong') {
      return
    }

    // Forward to callback
    this.options?.onMessage?.(message)
  }

  private attemptReconnect(): void {
    if (!this.options) return

    const maxAttempts = this.options.maxReconnectAttempts ?? 10
    const interval = this.options.reconnectInterval ?? 3000

    if (this.reconnectAttempts >= maxAttempts) {
      console.error('[WebSocket] Max reconnect attempts reached')
      return
    }

    this.reconnectAttempts++
    this.logThrottled('reconnect', `[WebSocket] Reconnecting in ${interval}ms (attempt ${this.reconnectAttempts}/${maxAttempts})`)

    this.reconnectTimeout = setTimeout(() => {
      void this.createConnection()
    }, interval)
  }

  private startPingInterval(): void {
    // Send ping every 25 seconds to keep connection alive
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' })
      }
    }, 25000)
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  send(data: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  disconnect(): void {
    this.isIntentionallyClosed = true
    this.stopPingInterval()

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    if (this.ws) {
      this.ws.close(1000, 'User disconnected')
      this.ws = null
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

// Singleton instance
export const websocketService = new WebSocketService()

// Helper hook-friendly functions
export function createWebSocketConnection(
  exerciseId: number,
  ticket: string,
  callbacks: {
    onMessage?: (message: WebSocketMessage) => void
    onConnect?: () => void
    onDisconnect?: () => void
    onError?: (error: Event) => void
  }
): () => void {
  websocketService.connect(exerciseId, {
    ticket,
    ...callbacks,
    reconnect: true,
    reconnectInterval: 3000,
    maxReconnectAttempts: 10,
  })

  return () => websocketService.disconnect()
}
