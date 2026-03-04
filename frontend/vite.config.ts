import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

function getCommitIdFromGitFiles(projectDir: string): string | null {
  const gitDirCandidates = [
    path.resolve(projectDir, '.git'),
    path.resolve(projectDir, '../.git'),
  ]

  for (const gitDir of gitDirCandidates) {
    if (!fs.existsSync(gitDir)) continue
    try {
      const headPath = path.join(gitDir, 'HEAD')
      const head = fs.readFileSync(headPath, 'utf-8').trim()
      if (!head) continue

      if (!head.startsWith('ref: ')) {
        return head.slice(0, 7)
      }

      const ref = head.slice(5).trim()
      const refPath = path.join(gitDir, ref)
      if (fs.existsSync(refPath)) {
        const sha = fs.readFileSync(refPath, 'utf-8').trim()
        if (sha) return sha.slice(0, 7)
      }

      const packedRefsPath = path.join(gitDir, 'packed-refs')
      if (fs.existsSync(packedRefsPath)) {
        const packedRefs = fs.readFileSync(packedRefsPath, 'utf-8')
        const match = packedRefs
          .split('\n')
          .find((line) => line && !line.startsWith('#') && !line.startsWith('^') && line.endsWith(` ${ref}`))
        if (match) {
          const sha = match.split(' ')[0].trim()
          if (sha) return sha.slice(0, 7)
        }
      }
    } catch {
      // Continue to next candidate
    }
  }

  return null
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const edition = env.VITE_EDITION || 'community'
  const packageJsonPath = path.resolve(__dirname, './package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as { version?: string }
  const appVersion = env.VITE_APP_VERSION || packageJson.version || 'dev'
  const buildDate = env.VITE_BUILD_DATE || new Date().toISOString()
  const commitId = env.VITE_COMMIT_ID || getCommitIdFromGitFiles(__dirname) || 'unknown'
  
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    define: {
      'import.meta.env.VITE_EDITION': JSON.stringify(edition),
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
      'import.meta.env.VITE_BUILD_DATE': JSON.stringify(buildDate),
      'import.meta.env.VITE_COMMIT_ID': JSON.stringify(commitId),
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
