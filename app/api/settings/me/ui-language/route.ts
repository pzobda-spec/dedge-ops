import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function normalizeLocale(value: unknown): 'fr' | 'en' {
  return value === 'en' ? 'en' : 'fr'
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const ui_language = normalizeLocale(body.ui_language)

  const { error } = await supabaseAdmin
    .from('user_settings')
    .upsert({ user_id: user.id, user_email: user.email, ui_language }, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const response = NextResponse.json({ ui_language })
  response.cookies.set('ui_lang', ui_language, { maxAge: 60 * 60 * 24 * 365, path: '/', sameSite: 'lax' })
  return response
}
