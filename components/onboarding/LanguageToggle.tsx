'use client'

import { useLocale } from '@/lib/i18n/LocaleContext'

export default function LanguageToggle() {
  const { locale, setLocale } = useLocale()
  return (
    <div className="inline-flex rounded-lg border border-[#d9d9d9] bg-white p-0.5 text-xs font-semibold">
      <button
        onClick={() => setLocale('fr')}
        className={`rounded-md px-2.5 py-1 transition-colors ${locale === 'fr' ? 'bg-[#59319f] text-white' : 'text-[#696969] hover:bg-[#f7f7f7]'}`}
      >
        FR
      </button>
      <button
        onClick={() => setLocale('en')}
        className={`rounded-md px-2.5 py-1 transition-colors ${locale === 'en' ? 'bg-[#59319f] text-white' : 'text-[#696969] hover:bg-[#f7f7f7]'}`}
      >
        EN
      </button>
    </div>
  )
}
