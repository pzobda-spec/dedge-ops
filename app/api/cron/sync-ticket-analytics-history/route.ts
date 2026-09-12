import { NextRequest, NextResponse } from 'next/server'
import { requireRole, authErrorResponse } from '@/lib/auth/roles'
import { supabaseAdmin } from '@/lib/supabase/server'
import { fetchZohoAnalyticsTickets, toTicketAnalyticsRow } from '@/lib/zoho/analyticsClient'
import { monthKey, monthStart, parseDate, shiftMonth } from '@/lib/reporting/monthly'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function hasCronSecret(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`)
}

export async function GET(request: NextRequest) {
  if (!hasCronSecret(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return run(request)
}

export async function POST(request: NextRequest) {
  try { await requireRole(request, ['admin']) } catch (error) { return authErrorResponse(error) ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  return run(request)
}

async function run(request: NextRequest) {
  try {
    const now = new Date()
    const defaultTo = monthStart(shiftMonth(monthKey(now), 1))
    const from = request.nextUrl.searchParams.get('from') ? parseDate(request.nextUrl.searchParams.get('from')!) : monthStart(shiftMonth(monthKey(now), -24))
    const to = request.nextUrl.searchParams.get('to') ? parseDate(request.nextUrl.searchParams.get('to')!) : defaultTo
    if (from >= to) return NextResponse.json({ error: 'La date de début doit précéder la date de fin.' }, { status: 400 })
    const exported = await fetchZohoAnalyticsTickets(from, to)
    const rows = exported.map(row => toTicketAnalyticsRow(row, now)).filter(row => row.id && row.created_at)
    if (rows.length !== exported.length) throw new Error('Export incomplet : identifiant ou date de création invalide.')
    let upserted = 0
    for (let offset = 0; offset < rows.length; offset += 250) {
      const batch = rows.slice(offset, offset + 250)
      const existing = await supabaseAdmin.from('ticket_analytics').select('id,zoho_modified_at').in('id', batch.map(row => row.id))
      if (existing.error) throw new Error(existing.error.message)
      const modified = new Map((existing.data ?? []).map(row => [row.id, row.zoho_modified_at]))
      // Analytics peut être en retard sur Desk : ne pas écraser un état plus récent.
      const fresh = batch.filter(row => !modified.get(row.id) || (row.zoho_modified_at && Date.parse(row.zoho_modified_at) >= Date.parse(modified.get(row.id)!)))
      if (!fresh.length) continue
      const { error } = await supabaseAdmin.from('ticket_analytics').upsert(fresh, { onConflict: 'id' })
      upserted += fresh.length
      if (error) throw new Error(`Supabase ticket_analytics upsert failed: ${error.message}`)
    }
    return NextResponse.json({ exported: exported.length, upserted, skipped_newer: rows.length - upserted, from: from.toISOString(), to: to.toISOString(), source: 'Zoho Analytics · Tickets (Zoho Desk)' })
  } catch (error) {
    console.error('[cron/sync-ticket-analytics-history]', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Synchronisation historique indisponible.' }, { status: 502 })
  }
}
