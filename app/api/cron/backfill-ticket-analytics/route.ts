import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { supabaseAdmin } from '@/lib/supabase/server'
import { fetchTickets, type ZohoTicket } from '@/lib/zoho/client'
import {
  fetchDeskAccountNames,
  type DeskAccountNames,
} from '@/lib/zoho/ticketDashboardAnalytics'
import {
  ZOHO_SUPPORT_DEPARTMENT_ID,
  ZOHO_TICKET_PAGE_SIZE,
} from '@/lib/zoho/constants'
import {
  persistDailyTicketSnapshotIfHistoryComplete,
  type TicketSnapshotResult,
} from '@/lib/zoho/ticketAnalyticsSnapshots'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const TABLE_NAME = 'ticket_analytics'
const STATE_TABLE = 'ticket_analytics_backfill_state'
const COVERAGE_TABLE = 'ticket_analytics_history_coverage'
const JOB_NAME = 'ticket_history_backfill'
const UPSERT_BATCH_SIZE = 250
const PAGE_LIMIT = ZOHO_TICKET_PAGE_SIZE
const MAX_PAGES_PER_RUN = 30
const PAGE_OVERLAP = PAGE_LIMIT

interface TicketAnalyticsRow {
  id: string
  ticket_number: string | null
  subject: string | null
  status: string
  priority: string
  category: string
  classification: string
  product_area: string
  client_name: string
  client_id: string | null
  assignee: string | null
  created_at: string
  resolved_at: string | null
  first_response_at: string | null
  first_contact_resolution: boolean
  source: string | null
  last_synced_at: string
  zoho_modified_at: string | null
}

interface BackfillState {
  job_name: string
  phase: string
  cursor_offset: number
  rows_synced: number
  completed: boolean
  started_at: string
  last_run_at: string
  completed_at: string | null
  last_error: string | null
  earliest_created_at: string | null
  latest_created_at: string | null
}

function hasValidCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`)
}

export async function GET(request: NextRequest) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runBackfill()
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ['admin'])
  } catch (error) {
    return authErrorResponse(error) ?? backfillErrorResponse(error)
  }

  return runBackfill()
}

async function runBackfill() {
  try {
    const result = await backfillTicketAnalytics()
    return NextResponse.json(result)
  } catch (error) {
    console.error('[cron/backfill-ticket-analytics]', errorMessage(error))
    return backfillErrorResponse(error)
  }
}

async function backfillTicketAnalytics(): Promise<{
  synced: number
  created: number
  updated: number
  completed: boolean
  cursor_offset: number
  snapshot: TicketSnapshotResult | null
}> {
  const now = new Date().toISOString()
  const [state, accountNames] = await Promise.all([
    loadState(),
    fetchDeskAccountNames().catch(error => {
      console.warn('[cron/backfill-ticket-analytics] account enrichment unavailable:', errorMessage(error))
      return {} satisfies DeskAccountNames
    }),
  ])

  // Offset pagination can shift when a new Zoho ticket is created between two
  // cron runs. Re-read one full page at every resume so the boundary cannot
  // leave a permanent hole; upserts make the overlap idempotent.
  const initialOffset = state.completed ? 0 : Math.max(0, state.cursor_offset - PAGE_OVERLAP)
  let cursorOffset = initialOffset
  let processedRows = 0
  let created = 0
  let updated = 0
  let earliestCreatedAt = state.earliest_created_at
  let latestCreatedAt = state.latest_created_at
  let completed = state.completed
  let phase = state.phase
  let lastError: string | null = null

  try {
    let pages = 0
    while (pages < MAX_PAGES_PER_RUN && !completed) {
      const response = await fetchTickets({
        limit: PAGE_LIMIT,
        from: cursorOffset,
        sortBy: '-createdTime',
        departmentId: ZOHO_SUPPORT_DEPARTMENT_ID,
      })
      const page = response.data ?? []
      if (page.length === 0) {
        completed = true
        break
      }

      const pageRows = page.map(ticket => toAnalyticsRow(ticket, accountNames, now))
      const existingIds = await fetchExistingIds(pageRows.map(row => row.id))

      for (const batch of chunk(pageRows, UPSERT_BATCH_SIZE)) {
        const { error } = await supabaseAdmin.from(TABLE_NAME).upsert(batch, { onConflict: 'id' })
        if (error) throw new Error(`Supabase upsert failed: ${error.message}`)
      }

      processedRows += pageRows.length
      created += pageRows.reduce((count, row) => count + (existingIds.has(row.id) ? 0 : 1), 0)
      updated += pageRows.length - pageRows.reduce((count, row) => count + (existingIds.has(row.id) ? 0 : 1), 0)

      const orderedCreated = pageRows
        .map(row => row.created_at)
        .filter(Boolean)
        .sort()
      if (orderedCreated.length > 0) {
        earliestCreatedAt = earliestCreatedAt ? minIso(earliestCreatedAt, orderedCreated[0]) : orderedCreated[0]
        latestCreatedAt = latestCreatedAt ? maxIso(latestCreatedAt, orderedCreated[orderedCreated.length - 1]) : orderedCreated[orderedCreated.length - 1]
      }

      cursorOffset += page.length
      pages += 1
      if (page.length < PAGE_LIMIT) {
        completed = true
        break
      }
    }
  } catch (error) {
    lastError = errorMessage(error)
    throw error
  } finally {
    const storedCoverage = await fetchStoredCoverage()
    const statePatch = {
      job_name: JOB_NAME,
      phase,
      cursor_offset: cursorOffset,
      rows_synced: storedCoverage.count,
      completed,
      started_at: state.started_at,
      last_run_at: now,
      completed_at: completed ? now : state.completed_at,
      last_error: lastError,
      earliest_created_at: storedCoverage.earliestCreatedAt ?? earliestCreatedAt,
      latest_created_at: storedCoverage.latestCreatedAt ?? latestCreatedAt,
    }

    const { error: stateError } = await supabaseAdmin
      .from(STATE_TABLE)
      .upsert(statePatch, { onConflict: 'job_name' })
    if (stateError) throw new Error(`Supabase backfill state failed: ${stateError.message}`)

    const { error: coverageError } = await supabaseAdmin
      .from(COVERAGE_TABLE)
      .upsert({
        id: JOB_NAME,
        certified_from: statePatch.earliest_created_at,
        certified_to: statePatch.latest_created_at,
        rows_synced: statePatch.rows_synced,
        backfill_completed_at: completed ? now : null,
        updated_at: now,
      }, { onConflict: 'id' })
    if (coverageError) throw new Error(`Supabase coverage state failed: ${coverageError.message}`)
  }

  // If the loop throws, the catch below records the error after state persistence.
  // The state table is still updated in the finally block.

  const snapshot = completed
    ? await persistDailyTicketSnapshotIfHistoryComplete()
    : null

  return {
    synced: processedRows,
    created,
    updated,
    completed,
    cursor_offset: cursorOffset,
    snapshot,
  }
}

async function fetchStoredCoverage(): Promise<{
  count: number
  earliestCreatedAt: string | null
  latestCreatedAt: string | null
}> {
  const [countResult, earliestResult, latestResult] = await Promise.all([
    supabaseAdmin.from(TABLE_NAME).select('id', { count: 'exact', head: true }),
    supabaseAdmin.from(TABLE_NAME).select('created_at').not('created_at', 'is', null)
      .order('created_at', { ascending: true }).limit(1),
    supabaseAdmin.from(TABLE_NAME).select('created_at').not('created_at', 'is', null)
      .order('created_at', { ascending: false }).limit(1),
  ])
  for (const result of [countResult, earliestResult, latestResult]) {
    if (result.error) throw new Error(`Supabase stored coverage failed: ${result.error.message}`)
  }
  return {
    count: countResult.count ?? 0,
    earliestCreatedAt: earliestResult.data?.[0]?.created_at ?? null,
    latestCreatedAt: latestResult.data?.[0]?.created_at ?? null,
  }
}

async function loadState(): Promise<BackfillState> {
  const { data, error } = await supabaseAdmin
    .from(STATE_TABLE)
    .select('*')
    .eq('job_name', JOB_NAME)
    .maybeSingle()
  if (error) throw new Error(`Supabase backfill state read failed: ${error.message}`)
  if (data) return data as BackfillState
  return {
    job_name: JOB_NAME,
    phase: 'created',
    cursor_offset: 0,
    rows_synced: 0,
    completed: false,
    started_at: new Date().toISOString(),
    last_run_at: new Date().toISOString(),
    completed_at: null,
    last_error: null,
    earliest_created_at: null,
    latest_created_at: null,
  }
}

async function fetchExistingIds(ids: string[]): Promise<Set<string>> {
  const existing = new Set<string>()
  if (ids.length === 0) return existing

  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .select('id')
    .in('id', ids)
  if (error) throw new Error(`Supabase id lookup failed: ${error.message}`)
  for (const row of data ?? []) {
    if (typeof row.id === 'string') existing.add(row.id)
  }
  return existing
}

function toAnalyticsRow(
  ticket: ZohoTicket,
  accountNames: DeskAccountNames,
  lastSyncedAt: string,
): TicketAnalyticsRow {
  const classification = cleanLabel(
    ticket.classification
      ?? firstCustomField(ticket.cf, ['classification', 'type', 'ticket_type'])
      ?? 'Non classé',
  )
  const rawProduct = cleanLabel(
    ticket.category
      ?? firstCustomField(ticket.cf, ['product', 'produit', 'module'])
      ?? 'Autre',
  )
  const clientId = ticket.account?.id
    || ticket.contact?.account?.id
    || ticket.accountId
    || ticket.contactId
    || ticket.contact?.id
    || null
  const clientName = cleanLabel(
    ticket.account?.accountName
      || ticket.contact?.account?.accountName
      || (ticket.accountId ? accountNames[ticket.accountId] : '')
      || [ticket.contact?.firstName, ticket.contact?.lastName].filter(Boolean).join(' ')
      || ticket.email
      || 'Client inconnu',
  )
  const assignee = ticket.assignee
    ? cleanOptionalLabel(`${ticket.assignee.firstName ?? ''} ${ticket.assignee.lastName ?? ''}`)
    : null

  return {
    id: ticket.id,
    ticket_number: cleanOptionalLabel(ticket.ticketNumber),
    subject: cleanOptionalLabel(ticket.subject),
    status: normalizeStatus(ticket.status),
    priority: normalizePriority(ticket.priority),
    category: normalizeCategory(classification),
    classification,
    product_area: normalizeProduct(rawProduct, ticket.subject ?? ''),
    client_name: clientName,
    client_id: clientId,
    assignee,
    created_at: new Date(ticket.createdTime).toISOString(),
    resolved_at: validIsoDate(ticket.closedTime),
    first_response_at: firstResponseAt(ticket),
    first_contact_resolution: isFirstContactResolution(ticket),
    source: cleanOptionalLabel(ticket.channel),
    last_synced_at: lastSyncedAt,
    zoho_modified_at: validIsoDate(ticket.modifiedTime),
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function minIso(a: string, b: string): string {
  return a < b ? a : b
}

function maxIso(a: string, b: string): string {
  return a > b ? a : b
}

function firstCustomField(
  fields: Record<string, unknown> | null | undefined,
  keys: string[],
): string | null {
  if (!fields) return null
  for (const key of keys) {
    const value = fields[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function cleanLabel(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, ' ') ?? ''
}

function cleanOptionalLabel(value: string | null | undefined): string | null {
  const cleaned = cleanLabel(value)
  return cleaned || null
}

function normalizeStatus(value: string | null | undefined): string {
  return cleanLabel(value) || 'Ouvert'
}

function normalizePriority(value: string | null | undefined): string {
  return cleanLabel(value) || 'Moyenne'
}

function normalizeCategory(value: string): string {
  return cleanLabel(value) || 'Non classé'
}

function normalizeProduct(value: string, subject: string | null | undefined): string {
  return cleanLabel(value) || (subject ? cleanLabel(subject) : 'Autre')
}

function validIsoDate(value: string | null | undefined): string | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function firstResponseAt(ticket: ZohoTicket): string | null {
  const raw = ticket.firstResponseTime ?? ticket.responseTime
  if (raw === null || raw === undefined || raw === '') return null

  const createdAt = Date.parse(ticket.createdTime)
  if (!Number.isFinite(createdAt)) return null

  if (typeof raw === 'string' && /[T:-]/.test(raw)) {
    const parsed = Date.parse(raw)
    if (Number.isFinite(parsed) && parsed >= createdAt) return new Date(parsed).toISOString()
  }

  const numeric = Number(raw)
  if (!Number.isFinite(numeric) || numeric < 0) return null
  const responseAt = numeric > 100_000_000_000 ? numeric : createdAt + numeric
  return responseAt >= createdAt ? new Date(responseAt).toISOString() : null
}

function isFirstContactResolution(ticket: ZohoTicket): boolean {
  const reopenCount = readReopenCount(ticket)
  return reopenCount !== null ? reopenCount === 0 : (Number(ticket.threadCount) || 0) <= 2
}

function readReopenCount(ticket: ZohoTicket): number | null {
  if (
    ticket.reopenCount !== null
    && ticket.reopenCount !== undefined
    && Number.isFinite(Number(ticket.reopenCount))
  ) return Number(ticket.reopenCount)
  return null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function backfillErrorResponse(error: unknown) {
  const message = errorMessage(error)
  return NextResponse.json({ error: message }, { status: 500 })
}
