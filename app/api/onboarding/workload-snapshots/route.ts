import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { supabaseAdmin } from '@/lib/supabase/server'
import { fetchAllPages } from '@/lib/supabase/pagination'

export const dynamic = 'force-dynamic'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ['admin', 'onboarder', 'support', 'commercial_readonly', 'csm_lead'])

    const from = req.nextUrl.searchParams.get('from') ?? ''
    const to = req.nextUrl.searchParams.get('to') ?? ''
    if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to) || from > to) {
      return NextResponse.json({ error: 'Paramètres from et to requis au format AAAA-MM-JJ.' }, { status: 400 })
    }

    const { data, error } = await fetchAllPages((start, end) => supabaseAdmin
      .from('onboarding_workload_snapshots')
      .select('snapshot_date, owner, active_projects, charge_pct, capacity, is_backfilled, captured_at')
      .gte('snapshot_date', from)
      .lte('snapshot_date', to)
      .order('snapshot_date', { ascending: true }).order('owner').range(start, end))

    if (error) {
      if (isMissingSnapshotsTable(error)) {
        console.warn('[onboarding/workload-snapshots] onboarding_workload_snapshots table is missing; returning empty data set')
        return NextResponse.json({ snapshots: [], firstSnapshotDate: null, lastSnapshotDate: null, tableAvailable: false })
      }
      throw new Error(error.message)
    }

    const rows = data ?? []
    const snapshots = rows.map(row => ({
      snapshotDate: row.snapshot_date,
      owner: row.owner,
      activeProjects: row.active_projects,
      chargePct: row.charge_pct,
      capacity: row.capacity,
      isBackfilled: row.is_backfilled,
      capturedAt: row.captured_at,
    }))

    return NextResponse.json({
      snapshots,
      firstSnapshotDate: snapshots.length > 0 ? snapshots[0].snapshotDate : null,
      lastSnapshotDate: snapshots.length > 0 ? snapshots[snapshots.length - 1].snapshotDate : null,
      tableAvailable: true,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[onboarding/workload-snapshots] GET error:', msg)
    return authErrorResponse(err) ?? NextResponse.json({ error: msg }, { status: 500 })
  }
}

function isMissingSnapshotsTable(error: { code?: string; message?: string }) {
  return error.code === '42P01' || error.code === 'PGRST205'
}
