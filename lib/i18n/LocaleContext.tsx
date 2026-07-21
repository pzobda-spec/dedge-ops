'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { Locale } from './locale'
import { translate } from './translate'

interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (text: string) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)
  const router = useRouter()

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    document.cookie = `ui_lang=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    fetch('/api/settings/me/ui-language', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ui_language: next }),
    }).catch(() => {}).finally(() => router.refresh())
  }, [router])

  const t = useCallback((text: string) => translate(locale, text), [locale])

  return <LocaleContext.Provider value={{ locale, setLocale, t }}>{children}</LocaleContext.Provider>
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext)
  if (!context) throw new Error('useLocale must be used within a LocaleProvider')
  return context
}
