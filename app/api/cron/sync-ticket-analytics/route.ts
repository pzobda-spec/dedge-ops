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

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const TABLE_NAME = 'ticket_analytics'
const DAY_MS = 24 * 60 * 60 * 1000
const UPSERT_BATCH_SIZE = 250
const ID_LOOKUP_PAGE_SIZE = 1_000

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
}

interface SyncResult {
  synced: number
  created: number
  updated: number
}

function hasValidCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(
    secret
      && request.headers.get('authorization') === `Bearer ${secret}`,
  )
}

export async function GET(request: NextRequest) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runSync()
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ['admin'])
  } catch (error) {
    return authErrorResponse(error) ?? syncErrorResponse(error)
  }

  return runSync()
}

async function runSync() {
  try {
    const result = await syncTicketAnalytics()
    return NextResponse.json(result)
  } catch (error) {
    console.error('[cron/sync-ticket-analytics]', errorMessage(error))
    return syncErrorResponse(error)
  }
}

async function syncTicketAnalytics(): Promise<SyncResult> {
  const now = new Date()
  const cutoff = twelveMonthsAgo(now)
  const [tickets, accountNames] = await Promise.all([
    fetchTicketsSince(cutoff, now),
    fetchDeskAccountNames().catch(error => {
      console.warn('[cron/sync-ticket-analytics] account enrichment unavailable:', errorMessage(error))
      return {} satisfies DeskAccountNames
    }),
  ])

  const lastSyncedAt = new Date().toISOString()
  const rows = tickets.map(ticket => toAnalyticsRow(ticket, accountNames, lastSyncedAt))
  const existingIds = await fetchExistingIds(rows.map(row => row.id), cutoff)

  for (const batch of chunk(rows, UPSERT_BATCH_SIZE)) {
    const { error } = await supabaseAdmin
      .from(TABLE_NAME)
      .upsert(batch, { onConflict: 'id' })
    if (error) throw new Error(`Supabase upsert failed: ${error.message}`)
  }

  const created = rows.reduce((count, row) => count + (existingIds.has(row.id) ? 0 : 1), 0)
  return {
    synced: rows.length,
    created,
    updated: rows.length - created,
  }
}

async function fetchTicketsSince(cutoff: Date, now: Date): Promise<ZohoTicket[]> {
  const tickets = new Map<string, ZohoTicket>()
  const seenPages = new Set<string>()
  let offset = 0

  while (true) {
    const response = await withRetries(
      () => fetchTickets({
        limit: ZOHO_TICKET_PAGE_SIZE,
        from: offset,
        sortBy: '-createdTime',
        departmentId: ZOHO_SUPPORT_DEPARTMENT_ID,
      }),
      `Zoho tickets page at offset ${offset}`,
    )
    const page = response.data ?? []
    if (page.length === 0) break

    const pageSignature = page.map(ticket => ticket.id).join(',')
    if (seenPages.has(pageSignature)) {
      throw new Error(`Zoho pagination returned a repeated page at offset ${offset}`)
    }
    seenPages.add(pageSignature)

    let reachedCutoff = false
    for (const ticket of page) {
      const createdAt = Date.parse(ticket.createdTime)
      if (!Number.isFinite(createdAt)) continue
      if (createdAt < cutoff.getTime()) {
        reachedCutoff = true
        continue
      }
      if (createdAt <= now.getTime()) tickets.set(ticket.id, ticket)
    }

    if (reachedCutoff || page.length < ZOHO_TICKET_PAGE_SIZE) break
    offset += ZOHO_TICKET_PAGE_SIZE
  }

  return [...tickets.values()]
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
    product_area: normalizeProduct(rawProduct, ticket.subject),
    client_name: clientName,
    client_id: clientId,
    assignee,
    created_at: new Date(ticket.createdTime).toISOString(),
    resolved_at: validIsoDate(ticket.closedTime),
    first_response_at: firstResponseAt(ticket),
    first_contact_resolution: isFirstContactResolution(ticket),
    source: cleanOptionalLabel(ticket.channel),
    last_synced_at: lastSyncedAt,
  }
}

async function fetchExistingIds(ids: string[], cutoff: Date): Promise<Set<string>> {
  const existing = new Set<string>()
  if (ids.length === 0) return existing

  const requested = new Set(ids)
  for (let offset = 0; ; offset += ID_LOOKUP_PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .select('id')
      .gte('created_at', cutoff.toISOString())
      .order('id', { ascending: true })
      .range(offset, offset + ID_LOOKUP_PAGE_SIZE - 1)
    if (error) throw new Error(`Supabase id lookup failed: ${error.message}`)
    const page = data ?? []
    for (const row of page) {
      if (typeof row.id === 'string' && requested.has(row.id)) existing.add(row.id)
    }
    if (page.length < ID_LOOKUP_PAGE_SIZE) return existing
  }
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
  const responseDelay = responseAt - createdAt
  if (responseDelay < 0 || responseDelay > 365 * DAY_MS) return null
  return new Date(responseAt).toISOString()
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

  const custom = firstCustomField(ticket.cf, ['reopen_count', 'reopened_count', 'reouverture'])
  return custom !== null && Number.isFinite(Number(custom)) ? Number(custom) : null
}

function normalizeStatus(status: string): string {
  const normalized = normalizeText(status)
  if (['closed', 'ferme', 'fermee'].includes(normalized)) return 'Closed'
  if (['solved', 'resolved', 'resolu', 'resolue'].includes(normalized)) return 'Resolved'
  if (['pending', 'managed', 'on hold', 'onhold', 'stuck client', 'waiting'].includes(normalized)) return 'Pending'
  return 'Open'
}

function normalizePriority(priority: string | null): string {
  const normalized = normalizeText(priority ?? '')
  if (normalized === 'urgent') return 'Urgent'
  if (['high', 'haute', 'elevee'].includes(normalized)) return 'High'
  if (['low', 'basse', 'faible'].includes(normalized)) return 'Low'
  return 'Medium'
}

function normalizeCategory(classification: string): string {
  const normalized = normalizeText(classification).replace(/[-_]/g, ' ')
  if (normalized === 'question') return 'Question'
  if (['problem', 'probleme', 'incident', 'bug'].includes(normalized)) return 'Problem'
  if (['task', 'tache', 'demande'].includes(normalized)) return 'Task'
  if (['feature request', 'feature', 'suggestion', 'amelioration'].includes(normalized)) return 'Feature Request'
  return 'Non classé'
}

function normalizeProduct(product: string, subject: string): string {
  const normalized = normalizeText(product).replace(/[-_]/g, ' ')
  const normalizedSubject = normalizeText(subject).replace(/[-_]/g, ' ')
  const searchable = `${normalized} ${normalizedSubject}`

  if (/^csm$/.test(normalized)) return 'CSM'
  if (/\b(dns|spf|dkim|dmarc)\b/.test(searchable)) return 'Newsletters'
  if (normalized === 'email delivery' || /mailinblack/.test(normalizedSubject)) return 'Autre'
  if (/whats\s*app/.test(normalized)) return 'WhatsApp'
  if (/loyalty program|programme de fidelite|\bloyalty\b/.test(normalized)) return 'Loyalty Program'
  if (/dmbook/.test(normalized)) return 'Dmbook Pro'
  if (/hub de messagerie|messaging hub|^hub$/.test(normalized)) return 'Hub de messagerie'
  if (/newsletter/.test(normalized)) return 'Newsletters'
  if (/campaign|campagne/.test(normalized)) return 'Campaigns'

  const csvImportOrExport = /\b(import|export)\b.*\bcsv\b|\bcsv\b.*\b(import|export)\b/.test(searchable)
  if (
    /guest profile|profil (client|invite)|customer profile/.test(normalized)
    || /\bsegment(ation|s)?\b/.test(searchable)
    || csvImportOrExport
  ) return 'Guest Profile'
  if (/\bpms\b|integration|interface|connecteur|synchronis/.test(normalized)) return 'PMS'
  if (/guest app|application|check ?in|commande|kiosque|wifi|statistiques app|\bpages?\b|formulaire|\bforms?\b/.test(normalized)) return 'Guest App'
  if (/crm|administrateur|admin|\b2fa\b/.test(normalized)) return 'CRM Core'
  return 'Autre'
}

function firstCustomField(
  fields: Record<string, unknown> | null | undefined,
  needles: string[],
): string | null {
  if (!fields) return null
  for (const [key, value] of Object.entries(fields)) {
    const normalizedKey = normalizeText(key)
    if (!needles.some(needle => normalizedKey.includes(normalizeText(needle)))) continue
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return null
}

function validIsoDate(value: string | null | undefined): string | null {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function cleanLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ') || 'Non renseigné'
}

function cleanOptionalLabel(value: string | null | undefined): string | null {
  const cleaned = value?.trim().replace(/\s+/g, ' ') ?? ''
  return cleaned || null
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function twelveMonthsAgo(now: Date): Date {
  const cutoff = new Date(now)
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1)
  return cutoff
}

async function withRetries<T>(operation: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt === 3 || !isRetryable(error)) break
      await delay(250 * 2 ** (attempt - 1))
    }
  }
  throw new Error(`${label} failed: ${errorMessage(lastError)}`)
}

function isRetryable(error: unknown): boolean {
  return /\b429\b|\b5\d\d\b|timeout|timed out|fetch failed|network|econnreset/i.test(errorMessage(error))
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size))
  }
  return batches
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function syncErrorResponse(_error: unknown) {
  return NextResponse.json(
    {
      error: 'La synchronisation des données analytiques Tickets a échoué.',
      code: 'TICKET_ANALYTICS_SYNC_FAILED',
    },
    { status: 500 },
  )
}
