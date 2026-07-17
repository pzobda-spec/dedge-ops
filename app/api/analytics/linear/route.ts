import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import {
  computeLinearAnalytics,
  normaliseLinearPriority,
  normaliseLinearStatus,
  type LinearAnalyticsFilters,
  type LinearAnalyticsResponse,
} from '@/lib/linear/analytics'
import type { LinearIssue } from '@/lib/linear/client'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

const DAY_MS = 86_400_000
const MAX_RANGE_DAYS = 5 * 366
const PAGE_SIZE = 1_000
const NO_LABEL = 'Sans label'
const UNKNOWN_CREATOR = 'Créateur inconnu'
const LINEAR_COLUMNS = [
  'id',
  'identifier',
  'title',
  'description',
  'status',
  'status_type',
  'priority',
  'priority_label',
  'labels',
  'creator_name',
  'assignee_name',
  'created_at',
  'completed_at',
  'cancelled_at',
].join(',')

interface LinearAnalyticsRow {
  id: string
  identifier: string | null
  title: string | null
  description: string | null
  status: string | null
  status_type: string | null
  priority: number | null
  priority_label: string | null
  labels: string[] | null
  creator_name: string | null
  assignee_name: string | null
  created_at: string | null
  completed_at: string | null
  cancelled_at: string | null
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const defaults = defaultRange()
  const from = params.get('from') ?? defaults.from
  const to = params.get('to') ?? defaults.to

  if (!isIsoDate(from) || !isIsoDate(to)) {
    return NextResponse.json(
      { error: 'Les dates from/to doivent être au format YYYY-MM-DD.' },
      { status: 400 },
    )
  }
  if (from > to) {
    return NextResponse.json(
      { error: 'La date de début doit précéder la date de fin.' },
      { status: 400 },
    )
  }

  const rangeDays = (
    new Date(`${to}T00:00:00.000Z`).getTime()
    - new Date(`${from}T00:00:00.000Z`).getTime()
  ) / DAY_MS
  if (rangeDays > MAX_RANGE_DAYS) {
    return NextResponse.json(
      { error: 'La période ne peut pas dépasser 5 ans.' },
      { status: 400 },
    )
  }

  const filters: LinearAnalyticsFilters = {
    from,
    to,
    labels: readMultiValue(params, 'label'),
    priorities: normalizePriorityFilters(readMultiValue(params, 'priority')),
    statuses: readMultiValue(params, 'status'),
    creators: readMultiValue(params, 'creator'),
    keyword: (params.get('keyword') ?? '').trim().slice(0, 200),
  }

  const fromDate = new Date(`${from}T00:00:00.000Z`)
  const toExclusive = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + DAY_MS)

  try {
    const [sourceRows, optionRows] = await Promise.all([
      fetchLinearRows(fromDate, toExclusive, filters),
      fetchLinearOptionRows(fromDate, toExclusive, filters.keyword),
    ])
    const issues = sourceRows.map(toLinearIssue)

    // Attribute and keyword predicates have already run in Postgres. Passing
    // empty facets here reuses the established response contract and its time
    // series/KPI logic without filtering a second source in the browser.
    const analytics = computeLinearAnalytics(issues, {
      from,
      to,
      labels: [],
      priorities: [],
      statuses: [],
      creators: [],
      keyword: '',
    })
    analytics.by_status = buildExactStatusBreakdown(issues, fromDate, toExclusive)
    analytics.filter_options = buildFilterOptions(optionRows)
    analytics.source_count = sourceRows.length
    analytics.truncated = false

    return NextResponse.json(analytics)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[analytics/linear]', message)
    return NextResponse.json(
      {
        error: 'Les données analytiques Linear sont temporairement indisponibles.',
        code: 'LINEAR_ANALYTICS_UNAVAILABLE',
      },
      { status: 502 },
    )
  }
}

async function fetchLinearRows(
  from: Date,
  toExclusive: Date,
  filters: LinearAnalyticsFilters,
): Promise<LinearAnalyticsRow[]> {
  const rows: LinearAnalyticsRow[] = []
  const sourceWindow = [
    `and(created_at.gte.${from.toISOString()},created_at.lt.${toExclusive.toISOString()})`,
    `and(completed_at.gte.${from.toISOString()},completed_at.lt.${toExclusive.toISOString()})`,
  ].join(',')

  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabaseAdmin
      .from('linear_analytics')
      .select(LINEAR_COLUMNS)
      .or(sourceWindow)

    query = applyLabelFilter(query, filters.labels)
    if (filters.priorities.length > 0) query = query.in('priority_label', filters.priorities)
    if (filters.statuses.length > 0) query = query.in('status', filters.statuses)
    query = applyCreatorFilter(query, filters.creators)
    query = applyKeywordFilter(query, filters.keyword)

    const { data, error } = await query
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(`Supabase linear_analytics: ${error.message}`)
    const page = (data ?? []) as unknown as LinearAnalyticsRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

async function fetchLinearOptionRows(
  from: Date,
  toExclusive: Date,
  keyword: string,
): Promise<LinearAnalyticsRow[]> {
  const rows: LinearAnalyticsRow[] = []

  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabaseAdmin
      .from('linear_analytics')
      .select(LINEAR_COLUMNS)
      .gte('created_at', from.toISOString())
      .lt('created_at', toExclusive.toISOString())

    query = applyKeywordFilter(query, keyword)

    const { data, error } = await query
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(`Supabase linear_analytics options: ${error.message}`)
    const page = (data ?? []) as unknown as LinearAnalyticsRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

/** Supabase's generated builder is intentionally structural here: this repo
 * does not maintain generated Database types, and every operation keeps the
 * same PostgREST filter-builder shape. */
function applyCreatorFilter<Query extends {
  in(column: string, values: readonly string[]): Query
  is(column: string, value: null): Query
  or(filters: string): Query
}>(query: Query, creators: string[]): Query {
  if (creators.length === 0) return query
  const includesUnknown = creators.includes(UNKNOWN_CREATOR)
  const namedCreators = creators.filter(name => name !== UNKNOWN_CREATOR)

  if (includesUnknown && namedCreators.length === 0) return query.is('creator_name', null)
  if (!includesUnknown) return query.in('creator_name', namedCreators)

  const names = namedCreators.map(postgrestValue).join(',')
  return query.or(`creator_name.is.null,creator_name.in.(${names})`)
}

function applyLabelFilter<Query extends {
  or(filters: string): Query
}>(query: Query, labels: string[]): Query {
  if (labels.length === 0) return query
  const includesNoLabel = labels.includes(NO_LABEL)
  const namedLabels = labels.filter(label => label !== NO_LABEL)

  if (namedLabels.length === 0) return query.or('labels.eq.{},labels.is.null')

  const overlapsNamed = `labels.ov.${postgrestArray(namedLabels)}`
  return includesNoLabel
    ? query.or(`labels.eq.{},labels.is.null,${overlapsNamed}`)
    : query.or(overlapsNamed)
}

function applyKeywordFilter<Query extends {
  or(filters: string): Query
}>(query: Query, keyword: string): Query {
  if (!keyword) return query
  const pattern = postgrestValue(`*${keyword}*`)
  return query.or(`title.ilike.${pattern},description.ilike.${pattern}`)
}

function postgrestValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function postgrestArray(values: string[]): string {
  return `{${values.map(postgrestValue).join(',')}}`
}

function toLinearIssue(row: LinearAnalyticsRow): LinearIssue {
  const status = row.status?.trim() || 'Backlog'
  const stateType = row.status_type?.trim()
    || (row.cancelled_at
      ? 'canceled'
      : row.completed_at
        ? 'completed'
        : stateTypeForStatus(status))
  const canonicalStatus = normaliseLinearStatus({
    linearState: status,
    stateType,
  })

  return {
    id: row.id,
    identifier: row.identifier ?? '',
    title: row.title ?? '',
    description: row.description,
    linearState: status,
    stateType,
    status: canonicalStatus === 'Done' || canonicalStatus === 'Cancelled'
      ? 'resolved'
      : canonicalStatus === 'In Progress'
        ? 'in_progress'
        : 'to_qualify',
    priority: row.priority ?? 0,
    priorityLabel: row.priority_label ?? 'None',
    labels: row.labels ?? [],
    assigneeName: row.assignee_name,
    creatorName: row.creator_name,
    createdAt: row.created_at ?? '',
    updatedAt: '',
    completedAt: row.completed_at,
    url: '',
  }
}

function stateTypeForStatus(status: string): string {
  const canonicalStatus = normaliseLinearStatus({ linearState: status })
  if (canonicalStatus === 'Done') return 'completed'
  if (canonicalStatus === 'Cancelled') return 'canceled'
  if (canonicalStatus === 'In Progress') return 'started'
  if (canonicalStatus === 'Todo') return 'unstarted'
  return 'backlog'
}

function buildFilterOptions(rows: LinearAnalyticsRow[]): LinearAnalyticsResponse['filter_options'] {
  const labels = rows.flatMap(row => row.labels?.length ? row.labels : [NO_LABEL])
  const creators = rows.map(row => row.creator_name?.trim() || UNKNOWN_CREATOR)
  const statuses = rows
    .map(row => row.status?.trim())
    .filter((status): status is string => Boolean(status))
  return {
    labels: uniqueSorted(labels),
    creators: uniqueSorted(creators),
    priorities: ['Urgent', 'High', 'Medium', 'Low', 'None'],
    statuses: uniqueSorted(statuses),
  }
}

function buildExactStatusBreakdown(
  issues: LinearIssue[],
  from: Date,
  toExclusive: Date,
): LinearAnalyticsResponse['by_status'] {
  const counts = new Map<string, number>()
  const fromMs = from.getTime()
  const toMs = toExclusive.getTime()

  for (const issue of issues) {
    const createdAt = Date.parse(issue.createdAt)
    if (!Number.isFinite(createdAt) || createdAt < fromMs || createdAt >= toMs) continue
    const status = issue.linearState.trim() || 'Unknown'
    counts.set(status, (counts.get(status) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'))
}

function normalizePriorityFilters(values: string[]): string[] {
  return [...new Set(values.map(value => {
    const numeric = Number(value)
    return Number.isInteger(numeric) && numeric >= 0 && numeric <= 4
      ? normaliseLinearPriority(numeric)
      : value
  }))].sort((a, b) => a.localeCompare(b, 'fr'))
}

function readMultiValue(params: URLSearchParams, key: string): string[] {
  const values = params.getAll(key)
    .flatMap(value => value.split(','))
    .map(value => value.trim())
    .filter(Boolean)
    .slice(0, 30)
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'fr'))
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'fr'))
}

function defaultRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to)
  from.setUTCDate(from.getUTCDate() - 29)
  return { from: toIsoDay(from), to: toIsoDay(to) }
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && toIsoDay(parsed) === value
}

function toIsoDay(value: Date): string {
  return value.toISOString().slice(0, 10)
}
