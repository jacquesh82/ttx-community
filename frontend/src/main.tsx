import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { AppDialogProvider } from './contexts/AppDialogContext'
import { applyThemeToDocument, useThemeStore } from './stores/themeStore'
import './i18n'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
})

applyThemeToDocument(useThemeStore.getState().mode)

const edition = import.meta.env.VITE_EDITION || 'community'
document.title = `Crisis Lab ${edition.charAt(0).toUpperCase() + edition.slice(1)}`

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppDialogProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppDialogProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
