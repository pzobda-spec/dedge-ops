import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (from && !DATE_RE.test(from)) return NextResponse.json({ error: 'Paramètre from invalide' }, { status: 400 })
  if (to && !DATE_RE.test(to)) return NextResponse.json({ error: 'Paramètre to invalide' }, { status: 400 })

  try {
    let query = supabaseAdmin
      .from('onboarding_workload_snapshots')
      .select('snapshot_date,owner,active_projects,charge_pct')
      .order('snapshot_date', { ascending: true })
    if (from) query = query.gte('snapshot_date', from)
    if (to) query = query.lte('snapshot_date', to)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return NextResponse.json({ snapshots: data ?? [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[onboarding/workload-history] GET error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
