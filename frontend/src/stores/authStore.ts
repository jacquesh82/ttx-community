import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface User {
  id: number
  email: string
  username: string
  role: 'admin' | 'animateur' | 'observateur' | 'participant'
  is_active: boolean
  display_name?: string | null
  avatar_url?: string | null
  tenant?: {
    id: number
    slug: string
    name: string
  }
}

interface AuthState {
  user: User | null
  csrfToken: string | null
  setUser: (user: User | null) => void
  setCsrfToken: (token: string | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      csrfToken: null,
      setUser: (user) => set({ user }),
      setCsrfToken: (csrfToken) => set({ csrfToken }),
      logout: () => set({ user: null, csrfToken: null }),
    }),
    {
      name: 'ttx-auth',
    }
  )
)
