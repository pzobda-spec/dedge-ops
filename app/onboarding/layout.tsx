import type { ReactNode } from 'react'
import { getServerLocale } from '@/lib/i18n/serverLocale'
import { LocaleProvider } from '@/lib/i18n/LocaleContext'
import LanguageToggle from '@/components/onboarding/LanguageToggle'

export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  const initialLocale = await getServerLocale()
  return (
    <LocaleProvider initialLocale={initialLocale}>
      <div className="flex justify-end border-b border-[#e2e2e2] bg-white px-4 py-1.5 sm:px-6 lg:px-8">
        <LanguageToggle />
      </div>
      {children}
    </LocaleProvider>
  )
}
