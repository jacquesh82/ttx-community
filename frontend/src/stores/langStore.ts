import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import i18n from '../i18n'

export type Lang = 'fr' | 'en'

interface LangState {
  lang: Lang
  setLang: (lang: Lang) => void
}

export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      lang: 'fr',
      setLang: (lang) => {
        set({ lang })
        i18n.changeLanguage(lang)
      },
    }),
    {
      name: 'ttx-lang',
    }
  )
)
