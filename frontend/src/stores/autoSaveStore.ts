import { create } from 'zustand'

export type GlobalAutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface AutoSaveStore {
  status: GlobalAutoSaveStatus
  errorMessage: string | null
  setStatus: (status: GlobalAutoSaveStatus, error?: string | null) => void
}

export const useAutoSaveStore = create<AutoSaveStore>((set) => ({
  status: 'idle',
  errorMessage: null,
  setStatus: (status, errorMessage = null) => set({ status, errorMessage }),
}))
