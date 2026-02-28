import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const edition = env.VITE_EDITION || 'community'
  
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    define: {
      'import.meta.env.VITE_EDITION': JSON.stringify(edition),
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        // Debug WS must NOT use changeOrigin — the backend origin check
        // compares Origin header vs host header and they must match.
        '/api/debug/ws': {
          target: 'ws://backend:3000',
          ws: true,
          xfwd: true,
        },
        '/api': {
          target: 'http://backend:3000',
          changeOrigin: true,
          xfwd: true,
          ws: true,
        },
        '/ws': {
          target: 'ws://backend:3000',
          xfwd: true,
          ws: true,
        },
      },
    },
  }
})
