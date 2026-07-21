import { cookies } from 'next/headers'
import { getSessionUserEmail } from '@/lib/auth/session'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Locale } from './locale'

export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get('ui_lang')?.value
  if (cookieLocale === 'fr' || cookieLocale === 'en') return cookieLocale

  const email = await getSessionUserEmail()
  if (!email) return 'fr'
  const { data } = await supabaseAdmin
    .from('user_settings')
    .select('ui_language')
    .eq('user_email', email)
    .maybeSingle()
  return data?.ui_language === 'en' ? 'en' : 'fr'
}
