import { supabaseAdmin } from '@/lib/supabase/server'
import { monthKey, type TicketRow } from './monthly'

const PAGE_SIZE = 1_000

export async function readTickets(from: Date, to: Date, channelsOnly = false): Promise<TicketRow[]> {
  const rows: TicketRow[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabaseAdmin.from('ticket_analytics')
      .select(channelsOnly ? 'created_at,source' : 'created_at,resolved_at,source,product_area,first_response_at,first_response_time_ms,first_contact_resolution')
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
  interface Row { start_date: string | null; actual_go_live: string | null; zoho_status: string | null; last_synced_at: string | null }
  const rows: Row[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin.from('onboarding_projects')
      .select('start_date,actual_go_live,zoho_status,last_synced_at').not('zoho_project_id', 'is', null)
      .order('id').range(offset, offset + PAGE_SIZE - 1)
    if (error || !data) throw new Error('Les données Zoho Projects synchronisées sont indisponibles.')
    rows.push(...data as Row[])
    if (data.length < PAGE_SIZE) break
  }
  // Zoho Projects fournit des dates calendaires, sans fuseau.
  const firstDay = `${monthKey(from)}-01`
  const nextDay = `${monthKey(to)}-01`
  const during = (value: string | null) => !!value && value.slice(0, 10) >= firstDay && value.slice(0, 10) < nextDay
  const live = rows.filter(row => during(row.actual_go_live))
  const durations = live.flatMap(row => {
    if (!row.start_date || !row.actual_go_live) return []
    const days = (Date.parse(row.actual_go_live.slice(0, 10)) - Date.parse(row.start_date.slice(0, 10))) / 86_400_000
    return Number.isFinite(days) && days >= 0 ? [days] : []
  })
  const labels: Record<string, string> = { not_started: 'Non démarré', in_progress: 'En cours', pending_client: 'En attente client', live: 'En production', blocked: 'Bloqué', standby: 'En pause', other: 'Autre' }
  const statuses = new Map<string, number>()
  rows.forEach(row => { const label = labels[row.zoho_status ?? ''] ?? 'Non renseigné'; statuses.set(label, (statuses.get(label) ?? 0) + 1) })
  return {
    started: rows.filter(row => during(row.start_date)).length, went_live: live.length,
    average_start_to_live_days: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
    duration_sample: durations.length, project_count: rows.length,
    missing_start_dates: rows.filter(row => !row.start_date).length,
    missing_live_dates: rows.filter(row => row.zoho_status === 'live' && !row.actual_go_live).length,
    last_synced_at: rows.map(row => row.last_synced_at).filter((value): value is string => !!value).sort().at(-1) ?? null,
    current_statuses: [...statuses].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  }
}
