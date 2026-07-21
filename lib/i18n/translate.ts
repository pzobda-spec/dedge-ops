import type { Locale } from './locale'
import { translations } from './translations'

export function translate(locale: Locale, text: string): string {
  return locale === 'fr' ? text : translations[text] ?? text
}
