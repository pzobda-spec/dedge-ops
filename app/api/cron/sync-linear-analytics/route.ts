import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { normaliseLinearPriority } from '@/lib/linear/analytics'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const LINEAR_ENDPOINT = 'https://api.linear.app/graphql'
const TABLE_NAME = 'linear_analytics'
const LINEAR_PAGE_SIZE = 250
const ID_LOOKUP_PAGE_SIZE = 1_000
const MAX_UPSERT_BATCH_ROWS = 100
const MAX_UPSERT_BATCH_BYTES = 750_000

const ISSUES_QUERY = `
  query SyncBugsAnalyticsPage($first: Int!, $after: String, $filter: IssueFilter!) {
    issues(first: $first, after: $after, filter: $filter, orderBy: createdAt) {
      nodes {
        id
        identifier
        title
        description
        state { name type }
        priority
        labels { nodes { name } }
        creator { name email }
        assignee { name }
        createdAt
        completedAt
        canceledAt
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`

interface RawLinearIssue {
  id: string
  identifier: string
  title: string
  description: string | null
  state: { name: string; type: string }
  priority: number
  labels: { nodes: Array<{ name: string }> }
  creator: { name: string; email: string | null } | null
  assignee: { name: string } | null
  createdAt: string
  completedAt: string | null
  canceledAt: string | null
}

interface LinearIssuesPage {
  issues: {
    nodes: RawLinearIssue[]
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
  }
}

interface LinearAnalyticsRow {
  id: string
  identifier: string | null
  title: string | null
  description: string | null
  status: string
  status_type: string
  priority: number
  priority_label: string
  labels: string[]
  creator_name: string | null
  creator_email: string | null
  assignee_name: string | null
  created_at: string
  completed_at: string | null
  cancelled_at: string | null
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
    const result = await syncLinearAnalytics()
    return NextResponse.json(result)
  } catch (error) {
    console.error('[cron/sync-linear-analytics]', errorMessage(error))
    return syncErrorResponse(error)
  }
}

async function syncLinearAnalytics(): Promise<SyncResult> {
  const now = new Date()
  const cutoff = twelveMonthsAgo(now)
  const issues = await fetchIssuesSince(cutoff, now)
  const lastSyncedAt = new Date().toISOString()
  const rows = issues.map(issue => toAnalyticsRow(issue, lastSyncedAt))
  const existingIds = await fetchExistingIds(rows.map(row => row.id), cutoff)

  for (const batch of chunkRowsByPayloadSize(rows)) {
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

async function fetchIssuesSince(cutoff: Date, now: Date): Promise<RawLinearIssue[]> {
  const issues = new Map<string, RawLinearIssue>()
  const seenCursors = new Set<string>()
  let cursor: string | null = null

  while (true) {
    const cursorKey = cursor ?? '__first_page__'
    if (seenCursors.has(cursorKey)) {
      throw new Error(`Linear pagination returned a repeated cursor: ${cursorKey}`)
    }
    seenCursors.add(cursorKey)

    const data: LinearIssuesPage = await withRetries<LinearIssuesPage>(
      () => linearQuery<LinearIssuesPage>(ISSUES_QUERY, {
        first: LINEAR_PAGE_SIZE,
        after: cursor,
        filter: {
          team: { key: { eq: 'BUGS' } },
          createdAt: { gte: cutoff.toISOString() },
        },
      }),
      `Linear issues page after ${cursor ?? 'start'}`,
    )

    for (const issue of data.issues.nodes) {
      const createdAt = Date.parse(issue.createdAt)
      if (
        Number.isFinite(createdAt)
        && createdAt >= cutoff.getTime()
        && createdAt <= now.getTime()
      ) {
        issues.set(issue.id, issue)
      }
    }

    if (!data.issues.pageInfo.hasNextPage) break
    const nextCursor: string | null = data.issues.pageInfo.endCursor
    if (!nextCursor) throw new Error('Linear pagination returned no end cursor')
    cursor = nextCursor
  }

  return [...issues.values()]
}

async function linearQuery<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const apiKey = process.env.LINEAR_API_KEY
  if (!apiKey) throw new Error('LINEAR_API_KEY is not configured')

  const response = await fetch(LINEAR_ENDPOINT, {
    method: 'POST',
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  const body = await response.text()

  if (!response.ok) {
    throw new Error(`Linear API request failed (${response.status}): ${body.slice(0, 500)}`)
  }

  let json: { data?: T; errors?: unknown }
  try {
    json = JSON.parse(body) as { data?: T; errors?: unknown }
  } catch {
    throw new Error('Linear API returned invalid JSON')
  }
  if (json.errors) throw new Error(`Linear API error: ${JSON.stringify(json.errors).slice(0, 1_000)}`)
  if (!json.data) throw new Error('Linear API returned no data')
  return json.data
}

function toAnalyticsRow(issue: RawLinearIssue, lastSyncedAt: string): LinearAnalyticsRow {
  return {
    id: issue.id,
    identifier: cleanOptionalText(issue.identifier),
    title: cleanOptionalText(issue.title),
    description: cleanOptionalText(issue.description),
    status: cleanOptionalText(issue.state.name) ?? 'Unknown',
    status_type: cleanOptionalText(issue.state.type) ?? 'unknown',
    priority: issue.priority,
    priority_label: normaliseLinearPriority(issue.priority),
    labels: [...new Set(
      issue.labels.nodes
        .map(label => cleanOptionalText(label.name))
        .filter((label): label is string => label !== null),
    )],
    creator_name: cleanOptionalText(issue.creator?.name),
    creator_email: cleanOptionalText(issue.creator?.email),
    assignee_name: cleanOptionalText(issue.assignee?.name),
    created_at: new Date(issue.createdAt).toISOString(),
    completed_at: validIsoDate(issue.completedAt),
    cancelled_at: validIsoDate(issue.canceledAt),
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

function chunkRowsByPayloadSize(rows: LinearAnalyticsRow[]): LinearAnalyticsRow[][] {
  const batches: LinearAnalyticsRow[][] = []
  let current: LinearAnalyticsRow[] = []
  let currentBytes = 2

  for (const row of rows) {
    const rowBytes = new TextEncoder().encode(JSON.stringify(row)).byteLength + 1
    if (
      current.length > 0
      && (current.length >= MAX_UPSERT_BATCH_ROWS || currentBytes + rowBytes > MAX_UPSERT_BATCH_BYTES)
    ) {
      batches.push(current)
      current = []
      currentBytes = 2
    }
    current.push(row)
    currentBytes += rowBytes
  }
  if (current.length > 0) batches.push(current)
  return batches
}

function validIsoDate(value: string | null | undefined): string | null {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function cleanOptionalText(value: string | null | undefined): string | null {
  const cleaned = value?.replace(/\u0000/g, '').trim() ?? ''
  return cleaned || null
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
  return /\b429\b|\b5\d\d\b|rate.?limit|timeout|timed out|fetch failed|network|econnreset|internal server/i.test(errorMessage(error))
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function syncErrorResponse(_error: unknown) {
  return NextResponse.json(
    {
      error: 'La synchronisation des données analytiques Linear a échoué.',
      code: 'LINEAR_ANALYTICS_SYNC_FAILED',
    },
    { status: 500 },
  )
}
