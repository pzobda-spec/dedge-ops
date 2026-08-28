import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const allowedKeys = new Set(['range', 'from', 'to', 'product', 'category', 'classification', 'status', 'priority', 'client'])

function sanitize(value: unknown): Record<string, string | string[]> {
  if (!value || typeof value !== 'object') return {}
  const result: Record<string, string | string[]> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!allowedKeys.has(key)) continue
    if (typeof raw === 'string' && raw.trim()) result[key] = raw.trim().slice(0, 200)
    if (Array.isArray(raw)) result[key] = raw.filter(item => typeof item === 'string').map(item => String(item).trim().slice(0, 200)).filter(Boolean).slice(0, 30)
  }
  return result
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabaseAdmin.from('user_settings').select('ticket_analytics_filters').eq('user_id', user.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ filters: sanitize(data?.ticket_analytics_filters) })
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const filters = sanitize(body.filters)
  const { error } = await supabaseAdmin.from('user_settings').upsert({ user_id: user.id, user_email: user.email, ticket_analytics_filters: filters, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ filters })
}
