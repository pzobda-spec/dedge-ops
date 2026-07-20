import { supabaseAdmin } from '@/lib/supabase/server'

const ANALYTICS_TABLE = 'ticket_analytics'
const SNAPSHOT_TABLE = 'ticket_analytics_daily_snapshots'
const SNAPSHOT_COVERAGE_TABLE = 'ticket_analytics_snapshot_coverage'
const BACKFILL_STATE_TABLE = 'ticket_analytics_backfill_state'
const BACKFILL_JOB = 'ticket_history_backfill'
const PAGE_SIZE = 1_000
const UPSERT_BATCH_SIZE = 250
const BUSINESS_TIME_ZONE = 'Europe/Paris'

const SNAPSHOT_COLUMNS = [
  'id',
  'ticket_number',
  'status',
  'priority',
  'category',
  'classification',
  'product_area',
  'client_name',
  'client_id',
  'assignee',
  'created_at',
  'resolved_at',
  'first_response_at',
  'first_response_time_ms',
  'first_contact_resolution',
  'source',
].join(',')

interface AnalyticsSnapshotSourceRow {
  id: string
  ticket_number: string | null
  status: string | null
  priority: string | null
  category: string | null
  classification: string | null
  product_area: string | null
  client_name: string | null
  client_id: string | null
  assignee: string | null
  created_at: string | null
  resolved_at: string | null
  first_response_at: string | null
  first_response_time_ms: number | null
  first_contact_resolution: boolean | null
  source: string | null
}

export interface TicketSnapshotResult {
  snapshot_date: string
  rows: number
  captured_at: string
}

export async function persistDailyTicketSnapshotIfHistoryComplete(): Promise<TicketSnapshotResult | null> {
  const { data, error } = await supabaseAdmin
    .from(BACKFILL_STATE_TABLE)
    .select('completed')
    .eq('job_name', BACKFILL_JOB)
    .maybeSingle()
  if (error) throw new Error(`Supabase backfill state read failed: ${error.message}`)
  if (!data?.completed) return null
  return persistDailyTicketSnapshot()
}

export async function persistDailyTicketSnapshot(now = new Date()): Promise<TicketSnapshotResult> {
  const snapshotDate = businessDate(now)
  const capturedAt = now.toISOString()
  const rows = await fetchAllAnalyticsRows()

  for (const batch of chunk(rows, UPSERT_BATCH_SIZE)) {
    const payload = batch.map(row => ({
      snapshot_date: snapshotDate,
      ticket_id: row.id,
      ticket_number: row.ticket_number,
      status: row.status,
      priority: row.priority,
      category: row.category,
      classification: row.classification,
      product_area: row.product_area,
      client_name: row.client_name,
      client_id: row.client_id,
      assignee: row.assignee,
      created_at: row.created_at,
      resolved_at: row.resolved_at,
      first_response_at: row.first_response_at,
      first_response_time_ms: row.first_response_time_ms,
      first_contact_resolution: row.first_contact_resolution,
      source: row.source,
      captured_at: capturedAt,
    }))
    const { error } = await supabaseAdmin
      .from(SNAPSHOT_TABLE)
      .upsert(payload, { onConflict: 'snapshot_date,ticket_id' })
    if (error) throw new Error(`Supabase ticket snapshot upsert failed: ${error.message}`)
  }

  const { data: existingCoverage, error: coverageReadError } = await supabaseAdmin
    .from(SNAPSHOT_COVERAGE_TABLE)
    .select('first_snapshot_date,last_snapshot_date')
    .eq('id', 'daily_ticket_snapshots')
    .maybeSingle()
  if (coverageReadError) throw new Error(`Supabase ticket snapshot coverage read failed: ${coverageReadError.message}`)

  const { error: coverageError } = await supabaseAdmin
    .from(SNAPSHOT_COVERAGE_TABLE)
    .upsert({
      id: 'daily_ticket_snapshots',
      first_snapshot_date: minDate(existingCoverage?.first_snapshot_date, snapshotDate),
      last_snapshot_date: maxDate(existingCoverage?.last_snapshot_date, snapshotDate),
      last_snapshot_rows: rows.length,
      last_captured_at: capturedAt,
      updated_at: capturedAt,
    }, { onConflict: 'id' })
  if (coverageError) throw new Error(`Supabase ticket snapshot coverage failed: ${coverageError.message}`)

  return { snapshot_date: snapshotDate, rows: rows.length, captured_at: capturedAt }
}

async function fetchAllAnalyticsRows(): Promise<AnalyticsSnapshotSourceRow[]> {
  const rows: AnalyticsSnapshotSourceRow[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from(ANALYTICS_TABLE)
      .select(SNAPSHOT_COLUMNS)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(`Supabase ticket analytics snapshot source failed: ${error.message}`)
    const page = (data ?? []) as unknown as AnalyticsSnapshotSourceRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

function businessDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function minDate(current: string | null | undefined, candidate: string): string {
  return current && current < candidate ? current : candidate
}

function maxDate(current: string | null | undefined, candidate: string): string {
  return current && current > candidate ? current : candidate
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size))
  }
  return batches
}
