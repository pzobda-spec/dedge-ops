import { NextRequest, NextResponse } from 'next/server'
import { fetchAllZohoProjects } from '@/lib/zoho/projectsClient'
import { computeOwnerWorkload } from '@/lib/onboarding/workload'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function hasValidCronSecret(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false

  const authorization = req.headers.get('authorization') ?? ''
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const headerSecret = req.headers.get('x-cron-secret') ?? ''
  const querySecret = req.nextUrl.searchParams.get('secret') ?? ''

  return [bearer, headerSecret, querySecret].includes(expected)
}

export async function GET(req: NextRequest) {
  if (!hasValidCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const projects = await fetchAllZohoProjects()
    const workload = computeOwnerWorkload(projects)
    const snapshotDate = new Date().toISOString().slice(0, 10)
    const rows = workload.map(entry => ({
      snapshot_date: snapshotDate,
      owner: entry.owner,
      active_projects: entry.active,
      charge_pct: entry.chargePct,
    }))

    if (rows.length > 0) {
      const { error } = await supabaseAdmin
        .from('onboarding_workload_snapshots')
        .upsert(rows, { onConflict: 'snapshot_date,owner' })
      if (error) throw new Error(error.message)
    }

    return NextResponse.json({ snapshot_date: snapshotDate, owners: rows.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/sync-onboarding-workload] GET error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
