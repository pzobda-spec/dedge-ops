import { supabaseAdmin } from '@/lib/supabase/server'
import { monthKey, type TicketRow } from './monthly'
import { implementationMetrics, type ReportingProject, type ReportingProjectEvent } from './implementation'

const PAGE_SIZE = 1_000

export async function readTickets(from: Date, to: Date, channelsOnly = false): Promise<TicketRow[]> {
  const rows: TicketRow[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabaseAdmin.from('ticket_analytics')
      .select(channelsOnly ? 'created_at,source' : 'id,created_at,resolved_at,source,product_area,first_response_at,first_response_time_ms,first_contact_resolution')
    query = channelsOnly ? query.gte('created_at', from.toISOString()).lt('created_at', to.toISOString())
      : query.or(`and(created_at.gte.${from.toISOString()},created_at.lt.${to.toISOString()}),and(resolved_at.gte.${from.toISOString()},resolved_at.lt.${to.toISOString()})`)
    const { data, error } = await query.order('id', { ascending: true }).range(offset, offset + PAGE_SIZE - 1)
    if (error || !data) throw new Error('Lecture des tickets indisponible.')
    rows.push(...data as unknown as TicketRow[])
    if (data.length < PAGE_SIZE) return rows
  }
}

export async function readCoverage() {
  const [first, last, sync, count, certified] = await Promise.all([
    supabaseAdmin.from('ticket_analytics').select('created_at').not('created_at', 'is', null).order('created_at').limit(1),
    supabaseAdmin.from('ticket_analytics').select('created_at').not('created_at', 'is', null).order('created_at', { ascending: false }).limit(1),
    supabaseAdmin.from('ticket_analytics').select('last_synced_at').not('last_synced_at', 'is', null).order('last_synced_at', { ascending: false }).limit(1),
    supabaseAdmin.from('ticket_analytics').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('ticket_analytics_history_coverage').select('certified_from,certified_to,backfill_completed_at').eq('id', 'ticket_history_backfill').maybeSingle(),
  ])
  if ([first, last, sync, count].some(result => result.error)) throw new Error('Couverture des tickets indisponible.')
  const from = first.data?.[0]?.created_at ?? null
  const to = last.data?.[0]?.created_at ?? null
  return {
    from, to, first_month: from ? monthKey(from) : null, last_month: to ? monthKey(to) : null,
    ticket_count: count.count, last_synced_at: sync.data?.[0]?.last_synced_at ?? null,
    certified_from: certified.data?.backfill_completed_at ? certified.data.certified_from as string | null : null,
    certified_to: certified.data?.backfill_completed_at ? certified.data.certified_to as string | null : null,
  }
}

export function certifiedPeriod(coverage: Awaited<ReturnType<typeof readCoverage>>, from: Date, to: Date) {
  return !!coverage.certified_from && !!coverage.certified_to
    && Date.parse(coverage.certified_from) <= from.getTime()
    && Date.parse(coverage.certified_to) >= to.getTime() - 1
}

export async function readImplementation(from: Date, to: Date) {
  const rows: ReportingProject[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin.from('onboarding_projects')
      .select('id,zoho_project_id,actual_go_live,zoho_status,last_synced_at').not('zoho_project_id', 'is', null)
      .order('id').range(offset, offset + PAGE_SIZE - 1)
    if (error || !data) throw new Error('Les données Zoho Projects synchronisées sont indisponibles.')
    rows.push(...data as ReportingProject[])
    if (data.length < PAGE_SIZE) break
  }
  const events: ReportingProjectEvent[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin.from('onboarding_events')
      .select('project_id,event_type,occurred_at,metadata')
      .in('event_type', ['status_changed', 'go_live', 'project_created'])
      .gte('occurred_at', from.toISOString()).lt('occurred_at', to.toISOString())
      .order('id').range(offset, offset + PAGE_SIZE - 1)
    if (error || !data) throw new Error('Historique des statuts Zoho Projects indisponible.')
    events.push(...data as ReportingProjectEvent[])
    if (data.length < PAGE_SIZE) break
  }
  // Date d'insertion, pas occurred_at : les événements Live peuvent être antidatés.
  const first = await supabaseAdmin.from('onboarding_events').select('created_at')
    .in('event_type', ['status_changed', 'go_live', 'project_created']).order('created_at').limit(1)
  if (first.error) throw new Error('Couverture de l’historique projet indisponible.')
  return implementationMetrics(rows, events, from, to, first.data?.[0]?.created_at ?? null)
}
