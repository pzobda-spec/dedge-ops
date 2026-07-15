import { fetchAccounts, fetchTickets, type ZohoTicket } from './client'
import { ZOHO_SUPPORT_DEPARTMENT_ID, ZOHO_TICKET_PAGE_SIZE } from './constants'
import type {
  AnalyticsBreakdown,
  TicketAggregateRow,
  TicketAnalyticsFilters,
  TicketAnalyticsResponse,
  TicketDatePoint,
  TicketProductDatePoint,
} from './ticketAnalyticsTypes'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_SOURCE_TICKETS = 10_000
const MAX_AGGREGATE_ROWS = 1_000

const CATEGORY_ORDER = ['Question', 'Problem', 'Task', 'Feature Request', 'Non classé']
const STATUS_ORDER = ['Open', 'Pending', 'Resolved', 'Closed']
const PRIORITY_ORDER = ['Urgent', 'High', 'Medium', 'Low']

interface NormalizedTicket {
  id: string
  status: string
  priority: string
  product: string
  category: string
  classification: string
  client: string
  createdAt: number
  closedAt: number | null
  firstResponseHours: number | null
  firstContactResolution: boolean
}

export interface AnalyticsRange {
  from: Date
  toExclusive: Date
  previousFrom: Date
  previousToExclusive: Date
}

export interface FetchAnalyticsSourceResult {
  tickets: ZohoTicket[]
  truncated: boolean
}

export type DeskAccountNames = Record<string, string>
export type TicketAnalyticsPageFetcher = (offset: number) => Promise<ZohoTicket[]>
export type DeskAccountPageFetcher = (offset: number) => Promise<Array<{ id: string; accountName: string }>>
export type TicketAnalyticsDateField = 'createdTime' | 'modifiedTime'

/**
 * Fetches only the time window needed by the dashboard. The Zoho API is paged,
 * but the browser never receives these ticket-level records.
 */
export async function fetchTicketAnalyticsSource(
  from: Date,
  to: Date,
): Promise<FetchAnalyticsSourceResult> {
  return collectTicketAnalyticsSource(from, to, fetchTicketAnalyticsPage)
}

export async function fetchTicketAnalyticsPage(offset: number): Promise<ZohoTicket[]> {
  const response = await fetchTickets({
    limit: ZOHO_TICKET_PAGE_SIZE,
    from: offset,
    // Desk accepts '-' as the descending prefix. Reading newest first lets
    // the collector stop as soon as a page crosses its lower date boundary.
    sortBy: '-createdTime',
    departmentId: ZOHO_SUPPORT_DEPARTMENT_ID,
  })
  return response.data ?? []
}

export async function fetchModifiedTicketAnalyticsPage(offset: number): Promise<ZohoTicket[]> {
  const response = await fetchTickets({
    limit: ZOHO_TICKET_PAGE_SIZE,
    from: offset,
    sortBy: '-modifiedTime',
    departmentId: ZOHO_SUPPORT_DEPARTMENT_ID,
  })
  return response.data ?? []
}

export async function collectTicketAnalyticsSource(
  from: Date,
  to: Date,
  fetchPage: TicketAnalyticsPageFetcher,
  dateField: TicketAnalyticsDateField = 'createdTime',
): Promise<FetchAnalyticsSourceResult> {
  const tickets: ZohoTicket[] = []
  const seenIds = new Set<string>()
  let offset = 0
  let truncated = false

  while (offset <= MAX_SOURCE_TICKETS) {
    const page = await fetchPage(offset)
    if (page.length === 0) break
    // Fetch one sentinel page at the cap so an exact 10,000-ticket source is
    // not incorrectly reported as truncated.
    if (offset === MAX_SOURCE_TICKETS) {
      truncated = true
      break
    }

    let newRecords = 0
    let passedLowerBoundary = false
    for (const ticket of page) {
      const timestamp = Date.parse(ticket[dateField])
      if (!Number.isFinite(timestamp)) continue
      if (timestamp > to.getTime()) continue
      if (timestamp < from.getTime()) {
        passedLowerBoundary = true
        break
      }
      if (!seenIds.has(ticket.id)) {
        seenIds.add(ticket.id)
        tickets.push(ticket)
        newRecords++
      }
    }

    if (passedLowerBoundary || page.length < ZOHO_TICKET_PAGE_SIZE) break
    // A page can contain only records newer than `to`; that is not a reason to
    // stop because older, in-range records are on the following page.
    if (newRecords === 0 && page.every(ticket => Date.parse(ticket[dateField]) <= to.getTime())) break
    offset += ZOHO_TICKET_PAGE_SIZE
  }

  // Keep a final range check as a safeguard against malformed upstream dates.
  const fromMs = from.getTime()
  const toMs = to.getTime()
  return {
    tickets: tickets.filter(ticket => {
      const timestamp = Date.parse(ticket[dateField])
      return Number.isFinite(timestamp) && timestamp >= fromMs && timestamp <= toMs
    }),
    truncated,
  }
}

export function mergeTicketAnalyticsSources(...sources: FetchAnalyticsSourceResult[]): FetchAnalyticsSourceResult {
  const byId = new Map<string, ZohoTicket>()
  for (const source of sources) {
    for (const ticket of source.tickets) byId.set(ticket.id, ticket)
  }
  return {
    tickets: [...byId.values()],
    truncated: sources.some(source => source.truncated),
  }
}

export async function fetchDeskAccountNames(): Promise<DeskAccountNames> {
  return collectDeskAccountNames(fetchDeskAccountPage)
}

export async function fetchDeskAccountPage(offset: number): Promise<Array<{ id: string; accountName: string }>> {
  const response = await fetchAccounts({ limit: ZOHO_TICKET_PAGE_SIZE, from: offset })
  return response.data ?? []
}

export async function collectDeskAccountNames(fetchPage: DeskAccountPageFetcher): Promise<DeskAccountNames> {
  const names: DeskAccountNames = {}
  let offset = 0

  while (offset < MAX_SOURCE_TICKETS) {
    const page = await fetchPage(offset)
    for (const account of page) {
      if (account.id && account.accountName) names[account.id] = cleanLabel(account.accountName)
    }
    if (page.length < ZOHO_TICKET_PAGE_SIZE) break
    offset += ZOHO_TICKET_PAGE_SIZE
  }

  return names
}

export async function computeTicketDashboardAnalytics(
  range: AnalyticsRange,
  filters: TicketAnalyticsFilters,
): Promise<TicketAnalyticsResponse> {
  const creationRange = ticketAnalyticsSourceRange(range)
  const resolutionRange = ticketAnalyticsResolutionSourceRange(range)
  const [creationSource, resolutionSource, accountNames] = await Promise.all([
    fetchTicketAnalyticsSource(creationRange.from, creationRange.to),
    collectTicketAnalyticsSource(
      resolutionRange.from,
      resolutionRange.to,
      fetchModifiedTicketAnalyticsPage,
      'modifiedTime',
    ),
    fetchDeskAccountNames().catch(() => ({})),
  ])
  const source = mergeTicketAnalyticsSources(creationSource, resolutionSource)
  return aggregateTicketAnalyticsFromSource(source, range, filters, accountNames)
}

export function ticketAnalyticsSourceRange(range: AnalyticsRange): { from: Date; to: Date } {
  return {
    from: new Date(range.previousFrom),
    to: new Date(range.toExclusive.getTime() - 1),
  }
}

export function ticketAnalyticsResolutionSourceRange(range: AnalyticsRange): { from: Date; to: Date } {
  // Closing a ticket updates modifiedTime. A second descending stream catches
  // old tickets resolved now without scanning every ticket created since 2018.
  return {
    from: new Date(range.from),
    to: new Date(range.toExclusive.getTime() - 1),
  }
}

export function aggregateTicketAnalyticsFromSource(
  source: FetchAnalyticsSourceResult,
  range: AnalyticsRange,
  filters: TicketAnalyticsFilters,
  accountNames: DeskAccountNames = {},
): TicketAnalyticsResponse {
  return aggregateTicketAnalytics(
    source.tickets.map(ticket => normalizeTicket(ticket, accountNames)),
    range,
    filters,
    source.truncated,
  )
}

function aggregateTicketAnalytics(
  source: NormalizedTicket[],
  range: AnalyticsRange,
  filters: TicketAnalyticsFilters,
  sourceTruncated: boolean,
): TicketAnalyticsResponse {
  const fromMs = range.from.getTime()
  const toMs = range.toExclusive.getTime()
  const previousFromMs = range.previousFrom.getTime()
  const previousToMs = range.previousToExclusive.getTime()

  const currentUnfiltered = source.filter(ticket => inRange(ticket.createdAt, fromMs, toMs))
  const current = currentUnfiltered.filter(ticket => matchesFilters(ticket, filters))
  const previous = source.filter(ticket =>
    inRange(ticket.createdAt, previousFromMs, previousToMs) && matchesFilters(ticket, filters),
  )
  const resolvedInPeriod = source.filter(ticket =>
    ticket.closedAt !== null
    && inRange(ticket.closedAt, fromMs, toMs)
    && matchesFilters(ticket, filters),
  )

  const firstResponseSamples = current
    .map(ticket => ticket.firstResponseHours)
    .filter((value): value is number => value !== null)
  const fcrSamples = resolvedInPeriod
  const total = current.length
  const previousTotal = previous.length
  const volumeChange = previousTotal > 0
    ? roundOne(((total - previousTotal) / previousTotal) * 100)
    : null

  const { granularity, datePoints, productDatePoints } = buildTimeSeries(
    current,
    resolvedInPeriod,
    fromMs,
    toMs,
  )
  const aggregateResult = buildAggregateRows(current)

  return {
    total,
    open: current.filter(ticket => ticket.status === 'Open' || ticket.status === 'Pending').length,
    resolved: resolvedInPeriod.length,
    previous_total: previousTotal,
    volume_change_pct: volumeChange,
    avg_first_response_hours: average(firstResponseSamples),
    fcr_rate: fcrSamples.length > 0
      ? roundOne((fcrSamples.filter(ticket => ticket.firstContactResolution).length / fcrSamples.length) * 100)
      : 0,
    by_product: countBy(current, ticket => ticket.product),
    by_category: countBy(current, ticket => ticket.category, CATEGORY_ORDER),
    by_classification: countBy(current, ticket => ticket.classification),
    by_status: countBy(current, ticket => ticket.status, STATUS_ORDER),
    by_priority: countBy(current, ticket => ticket.priority, PRIORITY_ORDER),
    by_date: datePoints,
    by_product_date: productDatePoints,
    top_clients: countBy(current, ticket => ticket.client).slice(0, 10),
    aggregates: aggregateResult.rows,
    filter_options: {
      categories: sortWithOrder(unique(currentUnfiltered.map(ticket => ticket.category)), CATEGORY_ORDER),
      classifications: unique(currentUnfiltered.map(ticket => ticket.classification)).sort(localeSort),
      products: unique(currentUnfiltered.map(ticket => ticket.product)).sort(localeSort),
      clients: unique(currentUnfiltered.map(ticket => ticket.client)).sort(localeSort),
      statuses: sortWithOrder(unique(currentUnfiltered.map(ticket => ticket.status)), STATUS_ORDER),
      priorities: sortWithOrder(unique(currentUnfiltered.map(ticket => ticket.priority)), PRIORITY_ORDER),
    },
    meta: {
      from: isoDate(range.from),
      to: isoDate(new Date(range.toExclusive.getTime() - 1)),
      granularity,
      generated_at: new Date().toISOString(),
      source_ticket_count: source.length,
      source_truncated: sourceTruncated,
      aggregates_truncated: aggregateResult.truncated,
      // Desk's ticket listing does not expose a full reopen history. We use
      // reopenCount when present, with thread count as a documented fallback.
      fcr_is_estimate: true,
    },
  }
}

function normalizeTicket(ticket: ZohoTicket, accountNames: DeskAccountNames): NormalizedTicket {
  const createdAt = Date.parse(ticket.createdTime)
  const closedAt = ticket.closedTime ? Date.parse(ticket.closedTime) : NaN
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
  const threadCount = Number(ticket.threadCount) || 0
  const reopenCount = readReopenCount(ticket)

  return {
    id: ticket.id,
    status: normalizeStatus(ticket.status),
    priority: normalizePriority(ticket.priority),
    product: normalizeProduct(rawProduct, ticket.subject),
    category: normalizeCategory(classification),
    classification,
    client: cleanLabel(
      ticket.account?.accountName
        || ticket.contact?.account?.accountName
        || (ticket.accountId ? accountNames[ticket.accountId] : '')
        || [ticket.contact?.firstName, ticket.contact?.lastName].filter(Boolean).join(' ')
        || ticket.email
        || 'Client inconnu',
    ),
    createdAt,
    closedAt: Number.isFinite(closedAt) ? closedAt : null,
    firstResponseHours: readFirstResponseHours(ticket, createdAt),
    firstContactResolution: reopenCount !== null ? reopenCount === 0 : threadCount <= 2,
  }
}

function matchesFilters(ticket: NormalizedTicket, filters: TicketAnalyticsFilters): boolean {
  return matchesOne(ticket.product, filters.products)
    && matchesOne(ticket.category, filters.categories)
    && matchesOne(ticket.classification, filters.classifications)
    && matchesOne(ticket.status, filters.statuses)
    && matchesOne(ticket.priority, filters.priorities)
    && (!filters.client || equalLabel(ticket.client, filters.client))
}

function matchesOne(value: string, accepted: string[]): boolean {
  return accepted.length === 0 || accepted.some(candidate => equalLabel(candidate, value))
}

function equalLabel(a: string, b: string): boolean {
  return a.trim().localeCompare(b.trim(), undefined, { sensitivity: 'accent' }) === 0
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

/**
 * Zoho categories are maintained as fine-grained, partially legacy modules.
 * This conservative roll-up follows the current support taxonomy without
 * hiding CSM, Hub or Dmbook in a catch-all family. Filter options remain fully
 * dynamic: a family is visible only when matching tickets exist in the period.
 */
function normalizeProduct(product: string, subject: string): string {
  const normalized = normalizeText(product).replace(/[-_]/g, ' ')
  const normalizedSubject = normalizeText(subject).replace(/[-_]/g, ' ')
  const searchable = `${normalized} ${normalizedSubject}`

  // CSM is intentionally not inferred from content. It is a review queue for
  // non-bug topics and must stay visible until the weekly business pass.
  if (/^csm$/.test(normalized)) return 'CSM'

  // DNS authentication is managed with the newsletter sending configuration,
  // even when the legacy Zoho category says "Email delivery".
  if (/\b(dns|spf|dkim|dmarc)\b/.test(searchable)) return 'Newsletters'
  if (normalized === 'email delivery' || /mailinblack/.test(normalizedSubject)) return 'Autre'

  if (/whats\s*app/.test(normalized)) return 'WhatsApp'
  if (/loyalty program|programme de fidelite|\bloyalty\b/.test(normalized)) return 'Loyalty Program'
  if (/dmbook/.test(normalized)) return 'Dmbook Pro'
  if (/hub de messagerie|messaging hub|^hub$/.test(normalized)) return 'Hub de messagerie'
  if (/newsletter/.test(normalized)) return 'Newsletters'
  if (/campaign|campagne/.test(normalized)) return 'Campaigns'

  const isCsvImportOrExport = /\b(import|export)\b.*\bcsv\b|\bcsv\b.*\b(import|export)\b/.test(searchable)
  if (
    /guest profile|profil (client|invite)|customer profile/.test(normalized)
    || /\bsegment(ation|s)?\b/.test(searchable)
    || isCsvImportOrExport
  ) return 'Guest Profile'

  if (/\bpms\b|integration|interface|connecteur|synchronis/.test(normalized)) return 'PMS'
  if (/guest app|application|check ?in|commande|kiosque|wifi|statistiques app|\bpages?\b|formulaire|\bforms?\b/.test(normalized)) return 'Guest App'
  if (/crm|administrateur|admin|\b2fa\b/.test(normalized)) return 'CRM Core'
  return 'Autre'
}

function readFirstResponseHours(ticket: ZohoTicket, createdAt: number): number | null {
  const raw = ticket.firstResponseTime ?? ticket.responseTime
  if (raw === null || raw === undefined || raw === '') return null

  if (typeof raw === 'string' && /[T:-]/.test(raw)) {
    const responseAt = Date.parse(raw)
    if (Number.isFinite(responseAt) && responseAt >= createdAt) {
      return sensibleHours((responseAt - createdAt) / 3_600_000)
    }
  }

  const numeric = Number(raw)
  if (!Number.isFinite(numeric) || numeric < 0) return null
  // A millisecond timestamp can also be returned by custom Desk layouts.
  if (numeric > 100_000_000_000) return sensibleHours((numeric - createdAt) / 3_600_000)
  // Desk responseTime is a duration in milliseconds on the list endpoint.
  return sensibleHours(numeric / 3_600_000)
}

function sensibleHours(hours: number): number | null {
  return hours >= 0 && hours <= 8_760 ? hours : null
}

function readReopenCount(ticket: ZohoTicket): number | null {
  const direct = ticket.reopenCount
  if (direct !== null && direct !== undefined && Number.isFinite(Number(direct))) return Number(direct)
  const custom = firstCustomField(ticket.cf, ['reopen_count', 'reopened_count', 'reouverture'])
  return custom !== null && Number.isFinite(Number(custom)) ? Number(custom) : null
}

function firstCustomField(cf: Record<string, unknown> | null | undefined, needles: string[]): string | null {
  if (!cf) return null
  for (const [key, value] of Object.entries(cf)) {
    const normalizedKey = normalizeText(key)
    if (!needles.some(needle => normalizedKey.includes(normalizeText(needle)))) continue
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return null
}

function buildTimeSeries(
  createdTickets: NormalizedTicket[],
  resolvedTickets: NormalizedTicket[],
  fromMs: number,
  toMs: number,
): {
  granularity: 'day' | 'week' | 'month'
  datePoints: TicketDatePoint[]
  productDatePoints: TicketProductDatePoint[]
} {
  const numberOfDays = Math.ceil((toMs - fromMs) / DAY_MS)
  const granularity = numberOfDays <= 45 ? 'day' : numberOfDays <= 180 ? 'week' : 'month'
  const starts = bucketStarts(fromMs, toMs, granularity)
  const dateMap = new Map<string, TicketDatePoint>()
  const productMap = new Map<string, TicketProductDatePoint>()

  for (const start of starts) {
    const period = isoDate(start)
    const label = bucketLabel(start, granularity)
    dateMap.set(period, { period, label, created: 0, resolved: 0 })
    productMap.set(period, { period, label, values: {} })
  }

  for (const ticket of createdTickets) {
    const period = isoDate(bucketDate(ticket.createdAt, granularity))
    const point = dateMap.get(period)
    const productPoint = productMap.get(period)
    if (point) point.created++
    if (productPoint) productPoint.values[ticket.product] = (productPoint.values[ticket.product] ?? 0) + 1
  }
  for (const ticket of resolvedTickets) {
    if (ticket.closedAt === null) continue
    const period = isoDate(bucketDate(ticket.closedAt, granularity))
    const point = dateMap.get(period)
    if (point) point.resolved++
  }

  return {
    granularity,
    datePoints: [...dateMap.values()],
    productDatePoints: [...productMap.values()],
  }
}

function bucketStarts(fromMs: number, toMs: number, granularity: 'day' | 'week' | 'month'): Date[] {
  const starts: Date[] = []
  let cursor = bucketDate(fromMs, granularity)
  while (cursor.getTime() < toMs) {
    starts.push(new Date(cursor))
    if (granularity === 'day') cursor.setUTCDate(cursor.getUTCDate() + 1)
    else if (granularity === 'week') cursor.setUTCDate(cursor.getUTCDate() + 7)
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return starts
}

function bucketDate(timestamp: number, granularity: 'day' | 'week' | 'month'): Date {
  const date = new Date(timestamp)
  date.setUTCHours(0, 0, 0, 0)
  if (granularity === 'week') {
    const offsetFromMonday = (date.getUTCDay() + 6) % 7
    date.setUTCDate(date.getUTCDate() - offsetFromMonday)
  } else if (granularity === 'month') {
    date.setUTCDate(1)
  }
  return date
}

function bucketLabel(date: Date, granularity: 'day' | 'week' | 'month'): string {
  return new Intl.DateTimeFormat('fr-FR', granularity === 'month'
    ? { month: 'short', year: '2-digit', timeZone: 'UTC' }
    : { day: '2-digit', month: 'short', timeZone: 'UTC' }
  ).format(date)
}

function buildAggregateRows(tickets: NormalizedTicket[]): { rows: TicketAggregateRow[]; truncated: boolean } {
  interface MutableAggregate extends TicketAggregateRow {
    responseTotal: number
    responseSamples: number
  }
  const groups = new Map<string, MutableAggregate>()

  for (const ticket of tickets) {
    const key = `${ticket.client}\u0000${ticket.product}\u0000${ticket.category}`
    const row = groups.get(key) ?? {
      client: ticket.client,
      product: ticket.product,
      category: ticket.category,
      volume: 0,
      avg_first_response_hours: null,
      open: 0,
      resolved: 0,
      responseTotal: 0,
      responseSamples: 0,
    }
    row.volume++
    if (ticket.status === 'Open' || ticket.status === 'Pending') row.open++
    else row.resolved++
    if (ticket.firstResponseHours !== null) {
      row.responseTotal += ticket.firstResponseHours
      row.responseSamples++
    }
    groups.set(key, row)
  }

  const allRows = [...groups.values()]
    .sort((a, b) => b.volume - a.volume || localeSort(a.client, b.client))
  const rows = allRows.slice(0, MAX_AGGREGATE_ROWS).map(({ responseTotal, responseSamples, ...row }) => ({
    ...row,
    avg_first_response_hours: responseSamples > 0 ? roundOne(responseTotal / responseSamples) : null,
  }))
  return { rows, truncated: allRows.length > MAX_AGGREGATE_ROWS }
}

function countBy(
  tickets: NormalizedTicket[],
  selector: (ticket: NormalizedTicket) => string,
  preferredOrder?: string[],
): AnalyticsBreakdown[] {
  const counts = new Map<string, number>()
  for (const ticket of tickets) {
    const name = selector(ticket)
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const result = [...counts].map(([name, count]) => ({ name, count }))
  if (!preferredOrder) return result.sort((a, b) => b.count - a.count || localeSort(a.name, b.name))
  return result.sort((a, b) => {
    const ai = preferredOrder.indexOf(a.name)
    const bi = preferredOrder.indexOf(b.name)
    if (ai !== -1 || bi !== -1) return (ai === -1 ? preferredOrder.length : ai) - (bi === -1 ? preferredOrder.length : bi)
    return b.count - a.count || localeSort(a.name, b.name)
  })
}

function sortWithOrder(values: string[], order: string[]): string[] {
  return [...values].sort((a, b) => {
    const ai = order.indexOf(a)
    const bi = order.indexOf(b)
    if (ai !== -1 || bi !== -1) return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi)
    return localeSort(a, b)
  })
}

function average(values: number[]): number | null {
  return values.length > 0 ? roundOne(values.reduce((sum, value) => sum + value, 0) / values.length) : null
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10
}

function cleanLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ') || 'Non renseigné'
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function localeSort(a: string, b: string): number {
  return a.localeCompare(b, 'fr', { sensitivity: 'base' })
}

function inRange(timestamp: number, from: number, toExclusive: number): boolean {
  return Number.isFinite(timestamp) && timestamp >= from && timestamp < toExclusive
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function buildAnalyticsRange(from: Date, toExclusive: Date): AnalyticsRange {
  const duration = toExclusive.getTime() - from.getTime()
  const previousToExclusive = new Date(from)
  const previousFrom = new Date(from.getTime() - duration)
  return { from, toExclusive, previousFrom, previousToExclusive }
}
