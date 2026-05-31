import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function normalizeLanguage(value: unknown): 'fr' | 'en' {
  return value === 'en' ? 'en' : 'fr'
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('user_settings')
    .select('user_id, user_email, acuity_link_15min, acuity_link_30min, acuity_link_60min, default_language, signature')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    settings: data ?? {
      user_id: user.id,
      user_email: user.email,
      acuity_link_15min: '',
      acuity_link_30min: '',
      acuity_link_60min: '',
      default_language: 'fr',
      signature: '',
    },
  })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('user_settings')
    .upsert({
      user_id: user.id,
      user_email: user.email,
      acuity_link_15min: typeof body.acuity_link_15min === 'string' ? body.acuity_link_15min.trim() : null,
      acuity_link_30min: typeof body.acuity_link_30min === 'string' ? body.acuity_link_30min.trim() : null,
      acuity_link_60min: typeof body.acuity_link_60min === 'string' ? body.acuity_link_60min.trim() : null,
      default_language: normalizeLanguage(body.default_language),
      signature: typeof body.signature === 'string' ? body.signature : null,
      updated_at: now,
    }, { onConflict: 'user_id' })
    .select('user_id, user_email, acuity_link_15min, acuity_link_30min, acuity_link_60min, default_language, signature')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: data })
}
