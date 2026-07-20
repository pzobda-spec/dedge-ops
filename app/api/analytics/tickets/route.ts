import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import type {
  AnalyticsBreakdown,
  TicketAggregateRow,
  TicketAnalyticsFilters,
  TicketAnalyticsResponse,
  TicketDatePoint,
  TicketProductDatePoint,
} from '@/lib/zoho/ticketAnalyticsTypes'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

const DAY_MS = 86_400_000
const MAX_RANGE_DAYS = 731
const PAGE_SIZE = 1_000
const MAX_AGGREGATE_ROWS = 1_000
const TICKET_COLUMNS = [
  'id',
  'status',
  'priority',
  'category',
  'classification',
  'product_area',
  'client_name',
  'created_at',
  'resolved_at',
  'first_response_at',
  'first_response_time_ms',
  'first_contact_resolution',
].join(',')

const CATEGORY_ORDER = ['Question', 'Problem', 'Task', 'Feature Request', 'Non classé']
const STATUS_ORDER = ['Open', 'Pending', 'Resolved', 'Closed']
const PRIORITY_ORDER = ['Urgent', 'High', 'Medium', 'Low']

interface TicketAnalyticsRow {
  id: string
  status: string | null
  priority: string | null
  category: string | null
  classification: string | null
  product_area: string | null
  client_name: string | null
  created_at: string | null
  resolved_at: string | null
  first_response_at: string | null
  first_response_time_ms: number | string | null
  first_contact_resolution: boolean | null
}

interface NormalizedTicket {
  id: string
  status: string
  priority: string
  product: string
  category: string
  classification: string
  client: string
  createdAt: number
  resolvedAt: number | null
  firstResponseHours: number | null
  firstContactResolution: boolean
}

export async function GET(request: NextRequest) {
  const fromParam = request.nextUrl.searchParams.get('from')
  const toParam = request.nextUrl.searchParams.get('to')

  if (!fromParam || !toParam) {
    return NextResponse.json(
      { error: 'Les paramètres from et to sont requis (AAAA-MM-JJ).' },
      { status: 400 },
    )
  }

  const from = parseDate(fromParam)
  const to = parseDate(toParam)
  if (!from || !to) {
    return NextResponse.json(
      { error: 'La période fournie est invalide. Utilisez le format AAAA-MM-JJ.' },
      { status: 400 },
    )
  }

  const toExclusive = new Date(to.getTime() + DAY_MS)
  const rangeDays = (toExclusive.getTime() - from.getTime()) / DAY_MS
  if (rangeDays <= 0 || rangeDays > MAX_RANGE_DAYS) {
    return NextResponse.json(
      { error: `La période doit contenir entre 1 et ${MAX_RANGE_DAYS} jours.` },
      { status: 400 },
    )
  }

  const filters = readFilters(request.nextUrl.searchParams)
  const previousFrom = new Date(from.getTime() - rangeDays * DAY_MS)

  try {
    // Options deliberately ignore the active facets, matching the historical
    // dashboard contract. Both reads are paged because PostgREST defaults to
    // 1,000 rows per response.
    const [sourceRows, optionRows] = await Promise.all([
      fetchTicketRows(previousFrom, from, toExclusive, filters),
      fetchTicketOptionRows(from, toExclusive),
    ])

    const analytics = aggregateTickets(
      sourceRows.map(normalizeTicket),
      optionRows.map(normalizeTicket),
      from,
      toExclusive,
      previousFrom,
    )
    return NextResponse.json(analytics)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[analytics/tickets]', message)
    return NextResponse.json(
      {
        error: 'Les données analytiques Tickets sont temporairement indisponibles.',
        code: 'TICKET_ANALYTICS_UNAVAILABLE',
      },
      { status: 502 },
    )
  }
}

async function fetchTicketRows(
  previousFrom: Date,
  from: Date,
  toExclusive: Date,
  filters: TicketAnalyticsFilters,
): Promise<TicketAnalyticsRow[]> {
  const rows: TicketAnalyticsRow[] = []
  const sourceWindow = [
    `and(created_at.gte.${previousFrom.toISOString()},created_at.lt.${toExclusive.toISOString()})`,
    `and(resolved_at.gte.${from.toISOString()},resolved_at.lt.${toExclusive.toISOString()})`,
  ].join(',')

  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabaseAdmin
      .from('ticket_analytics')
      .select(TICKET_COLUMNS)
      .or(sourceWindow)

    if (filters.products.length > 0) query = query.in('product_area', filters.products)
    if (filters.categories.length > 0) query = query.in('category', filters.categories)
    if (filters.classifications.length > 0) query = query.in('classification', filters.classifications)
    if (filters.statuses.length > 0) query = query.in('status', filters.statuses)
    if (filters.priorities.length > 0) query = query.in('priority', filters.priorities)
    if (filters.client) query = query.eq('client_name', filters.client)

    const { data, error } = await query
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(`Supabase ticket_analytics: ${error.message}`)
    const page = (data ?? []) as unknown as TicketAnalyticsRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

async function fetchTicketOptionRows(from: Date, toExclusive: Date): Promise<TicketAnalyticsRow[]> {
  const rows: TicketAnalyticsRow[] = []

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('ticket_analytics')
      .select(TICKET_COLUMNS)
      .gte('created_at', from.toISOString())
      .lt('created_at', toExclusive.toISOString())
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(`Supabase ticket_analytics options: ${error.message}`)
    const page = (data ?? []) as unknown as TicketAnalyticsRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

function aggregateTickets(
  source: NormalizedTicket[],
  optionSource: NormalizedTicket[],
  from: Date,
  toExclusive: Date,
  previousFrom: Date,
): TicketAnalyticsResponse {
  const fromMs = from.getTime()
  const toMs = toExclusive.getTime()
  const previousFromMs = previousFrom.getTime()

  const current = source.filter(ticket => inRange(ticket.createdAt, fromMs, toMs))
  const previous = source.filter(ticket => inRange(ticket.createdAt, previousFromMs, fromMs))
  const resolvedInPeriod = source.filter(ticket => (
    ticket.resolvedAt !== null && inRange(ticket.resolvedAt, fromMs, toMs)
  ))
  const options = optionSource.filter(ticket => inRange(ticket.createdAt, fromMs, toMs))
  const firstResponseSamples = current
    .map(ticket => ticket.firstResponseHours)
    .filter((value): value is number => value !== null)
  const timeSeries = buildTimeSeries(current, resolvedInPeriod, fromMs, toMs)
  const aggregateResult = buildAggregateRows(current)
  const volumeChange = previous.length > 0
    ? roundOne(((current.length - previous.length) / previous.length) * 100)
    : null

  return {
    total: current.length,
    open: current.filter(ticket => ticket.status === 'Open' || ticket.status === 'Pending').length,
    resolved: resolvedInPeriod.length,
    previous_total: previous.length,
    volume_change_pct: volumeChange,
    avg_first_response_hours: average(firstResponseSamples),
    fcr_rate: resolvedInPeriod.length > 0
      ? roundOne((resolvedInPeriod.filter(ticket => ticket.firstContactResolution).length / resolvedInPeriod.length) * 100)
      : 0,
    by_product: countBy(current, ticket => ticket.product),
    by_category: countBy(current, ticket => ticket.category, CATEGORY_ORDER),
    by_classification: countBy(current, ticket => ticket.classification),
    by_status: countBy(current, ticket => ticket.status, STATUS_ORDER),
    by_priority: countBy(current, ticket => ticket.priority, PRIORITY_ORDER),
    by_date: timeSeries.datePoints,
    by_product_date: timeSeries.productDatePoints,
    top_clients: countBy(current, ticket => ticket.client).slice(0, 10),
    aggregates: aggregateResult.rows,
    filter_options: {
      categories: sortWithOrder(unique(options.map(ticket => ticket.category)), CATEGORY_ORDER),
      classifications: unique(options.map(ticket => ticket.classification)).sort(localeSort),
      products: unique(options.map(ticket => ticket.product)).sort(localeSort),
      clients: unique(options.map(ticket => ticket.client)).sort(localeSort),
      statuses: sortWithOrder(unique(options.map(ticket => ticket.status)), STATUS_ORDER),
      priorities: sortWithOrder(unique(options.map(ticket => ticket.priority)), PRIORITY_ORDER),
    },
    meta: {
      from: isoDate(from),
      to: isoDate(new Date(toMs - 1)),
      granularity: timeSeries.granularity,
      generated_at: new Date().toISOString(),
      source_ticket_count: source.length,
      unfiltered_total: options.length,
      source_truncated: false,
      aggregates_truncated: aggregateResult.truncated,
      fcr_is_estimate: true,
    },
  }
}

function normalizeTicket(row: TicketAnalyticsRow): NormalizedTicket {
  const createdAt = Date.parse(row.created_at ?? '')
  const resolvedAt = Date.parse(row.resolved_at ?? '')
  const firstResponseAt = Date.parse(row.first_response_at ?? '')
  const officialResponseMs = row.first_response_time_ms === null
    ? Number.NaN
    : Number(row.first_response_time_ms)
  const firstResponseHours = Number.isFinite(officialResponseMs) && officialResponseMs >= 0
    ? sensibleHours(officialResponseMs / 3_600_000)
    : Number.isFinite(createdAt)
    && Number.isFinite(firstResponseAt)
    && firstResponseAt >= createdAt
    ? sensibleHours((firstResponseAt - createdAt) / 3_600_000)
    : null

  return {
    id: row.id,
    status: cleanLabel(row.status, 'Open'),
    priority: cleanLabel(row.priority, 'Medium'),
    product: cleanLabel(row.product_area, 'Autre'),
    category: cleanLabel(row.category, 'Non classé'),
    classification: cleanLabel(row.classification, 'Non classé'),
    client: cleanLabel(row.client_name, 'Client inconnu'),
    createdAt,
    resolvedAt: Number.isFinite(resolvedAt) ? resolvedAt : null,
    firstResponseHours,
    firstContactResolution: row.first_contact_resolution === true,
  }
}

function readFilters(params: URLSearchParams): TicketAnalyticsFilters {
  return {
    products: readMany(params, 'product'),
    categories: readMany(params, 'category'),
    classifications: readMany(params, 'classification'),
    statuses: readMany(params, 'status'),
    priorities: readMany(params, 'priority'),
    client: cleanSingle(params.get('client')),
  }
}

function readMany(params: URLSearchParams, key: string): string[] {
  const values = params.getAll(key)
    .flatMap(value => value.split(','))
    .map(value => value.trim())
    .filter(Boolean)
    .slice(0, 30)
  return [...new Set(values)]
}

function cleanSingle(value: string | null): string | null {
  const cleaned = value?.trim().slice(0, 200) ?? ''
  return cleaned || null
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
  const dateMap = new Map<string, TicketDatePoint>()
  const productMap = new Map<string, TicketProductDatePoint>()

  for (const start of bucketStarts(fromMs, toMs, granularity)) {
    const period = isoDate(start)
    const label = bucketLabel(start, granularity)
    dateMap.set(period, { period, label, created: 0, resolved: 0 })
    productMap.set(period, { period, label, values: {} })
  }

  for (const ticket of createdTickets) {
    const period = isoDate(bucketDate(ticket.createdAt, granularity))
    const datePoint = dateMap.get(period)
    const productPoint = productMap.get(period)
    if (datePoint) datePoint.created++
    if (productPoint) {
      productPoint.values[ticket.product] = (productPoint.values[ticket.product] ?? 0) + 1
    }
  }
  for (const ticket of resolvedTickets) {
    if (ticket.resolvedAt === null) continue
    const period = isoDate(bucketDate(ticket.resolvedAt, granularity))
    const datePoint = dateMap.get(period)
    if (datePoint) datePoint.resolved++
  }

  return {
    granularity,
    datePoints: [...dateMap.values()],
    productDatePoints: [...productMap.values()],
  }
}

function bucketStarts(
  fromMs: number,
  toMs: number,
  granularity: 'day' | 'week' | 'month',
): Date[] {
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
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
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

function buildAggregateRows(tickets: NormalizedTicket[]): {
  rows: TicketAggregateRow[]
  truncated: boolean
} {
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
    if (ai !== -1 || bi !== -1) {
      return (ai === -1 ? preferredOrder.length : ai) - (bi === -1 ? preferredOrder.length : bi)
    }
    return b.count - a.count || localeSort(a.name, b.name)
  })
}

function sortWithOrder(values: string[], order: string[]): string[] {
  return [...values].sort((a, b) => {
    const ai = order.indexOf(a)
    const bi = order.indexOf(b)
    if (ai !== -1 || bi !== -1) {
      return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi)
    }
    return localeSort(a, b)
  })
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return roundOne(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function sensibleHours(hours: number): number | null {
  return hours >= 0 && hours <= 8_760 ? hours : null
}

function cleanLabel(value: string | null, fallback: string): string {
  return value?.trim().replace(/\s+/g, ' ') || fallback
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function localeSort(a: string, b: string): number {
  return a.localeCompare(b, 'fr', { sensitivity: 'base' })
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10
}

function inRange(timestamp: number, from: number, toExclusive: number): boolean {
  return Number.isFinite(timestamp) && timestamp >= from && timestamp < toExclusive
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(date.getTime()) || isoDate(date) !== value) return null
  return date
}
