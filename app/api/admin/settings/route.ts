import { NextRequest, NextResponse } from 'next/server'
import { canAccessRestrictedOps } from '@/lib/auth/access'
import { getSessionUserEmail } from '@/lib/auth/session'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const email = await getSessionUserEmail()
  if (!canAccessRestrictedOps(email)) {
    return NextResponse.json({ error: 'Accès restreint' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select('key, value, description, updated_by, updated_at')
    .order('key')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: data ?? [] })
}

export async function POST(req: NextRequest) {
  const email = await getSessionUserEmail()
  if (!canAccessRestrictedOps(email)) {
    return NextResponse.json({ error: 'Accès restreint' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const key = typeof body.key === 'string' ? body.key.trim() : ''
  if (!key) return NextResponse.json({ error: 'key requis' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .upsert({
      key,
      value: typeof body.value === 'string' ? body.value.trim() : null,
      description: typeof body.description === 'string' ? body.description.trim() : null,
      updated_by: email,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })
    .select('key, value, description, updated_by, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ setting: data })
}
