import { useEffect, useState } from 'react'

const CHATGPT_CONNECTED_KEY = 'admin.chatgpt.connected'
const CHATGPT_CHANGED_EVENT = 'chatgpt-connection-changed'

export function isChatGptConnected(): boolean {
  return localStorage.getItem(CHATGPT_CONNECTED_KEY) === 'true'
}

export function setChatGptConnected(connected: boolean): void {
  localStorage.setItem(CHATGPT_CONNECTED_KEY, connected ? 'true' : 'false')
  window.dispatchEvent(new Event(CHATGPT_CHANGED_EVENT))
}

export function openChatGpt(): void {
  window.open('https://chatgpt.com', '_blank', 'noopener,noreferrer')
}

export function useChatGptConnection() {
  const [isConnected, setIsConnected] = useState<boolean>(() => isChatGptConnected())

  useEffect(() => {
    const onStorageChange = (event: StorageEvent) => {
      if (event.key === CHATGPT_CONNECTED_KEY) {
        setIsConnected(event.newValue === 'true')
      }
    }

    const onConnectionChange = () => {
      setIsConnected(isChatGptConnected())
    }

    window.addEventListener('storage', onStorageChange)
    window.addEventListener(CHATGPT_CHANGED_EVENT, onConnectionChange)

    return () => {
      window.removeEventListener('storage', onStorageChange)
      window.removeEventListener(CHATGPT_CHANGED_EVENT, onConnectionChange)
    }
  }, [])

  return {
    isConnected,
    setIsConnected: setChatGptConnected,
    openChatGpt,
  }
}
