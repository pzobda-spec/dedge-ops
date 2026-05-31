import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ['admin'])

    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('key, value, description, updated_by, updated_at')
      .order('key')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ settings: data ?? [] })
  } catch (err) {
    return authErrorResponse(err) ?? NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, ['admin'])

    const body = await req.json().catch(() => ({}))
    const key = typeof body.key === 'string' ? body.key.trim() : ''
    if (!key) return NextResponse.json({ error: 'key requis' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .upsert({
        key,
        value: typeof body.value === 'string' ? body.value.trim() : null,
        description: typeof body.description === 'string' ? body.description.trim() : null,
        updated_by: user.email,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })
      .select('key, value, description, updated_by, updated_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ setting: data })
  } catch (err) {
    return authErrorResponse(err) ?? NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
