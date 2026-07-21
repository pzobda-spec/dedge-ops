export type Locale = 'fr' | 'en'

export function normalizeLocale(value: unknown): Locale {
  return value === 'en' ? 'en' : 'fr'
}
