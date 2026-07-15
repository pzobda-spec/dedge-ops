import { unstable_cache } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { fetchIssuesAnalyticsPage, fetchLinearMemberNames, type LinearIssue } from '@/lib/linear/client'
import {
  computeLinearAnalytics,
  LINEAR_ANALYTICS_CACHE_SECONDS,
  type LinearAnalyticsFilters,
} from '@/lib/linear/analytics'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_ANALYTICS_ISSUES = 5000
const MAX_RANGE_DAYS = 5 * 366

// Each compact GraphQL page is cached independently. This keeps every cache
// entry below Next 14's 2 MiB FetchCache limit while allowing new filter
// combinations to reuse the same source pages without querying Linear again.
const getCachedSourcePage = unstable_cache(
  async (cursor: string) => fetchIssuesAnalyticsPage(cursor || null),
  ['linear-analytics-source-page-v2'],
  { revalidate: LINEAR_ANALYTICS_CACHE_SECONDS, tags: ['linear-issues', 'linear-analytics'] },
)

const getCachedMemberNames = unstable_cache(
  fetchLinearMemberNames,
  ['linear-analytics-member-names-v1'],
  { revalidate: 60 * 60, tags: ['linear-members', 'linear-analytics'] },
)

const getCachedAnalytics = unstable_cache(
  async (
    from: string,
    to: string,
    labelsJson: string,
    prioritiesJson: string,
    statusesJson: string,
    creatorsJson: string,
    keyword: string,
  ) => {
    const [source, memberNames] = await Promise.all([
      collectCachedSourceIssues(),
      getCachedMemberNames().catch(() => []),
    ])
    const filters: LinearAnalyticsFilters = {
      from,
      to,
      labels: JSON.parse(labelsJson) as string[],
      priorities: JSON.parse(prioritiesJson) as string[],
      statuses: JSON.parse(statusesJson) as string[],
      creators: JSON.parse(creatorsJson) as string[],
      keyword,
    }
    const analytics = computeLinearAnalytics(source.issues, filters, {
      truncated: source.truncated,
    })
    analytics.filter_options.creators = [...new Set([
      ...memberNames,
      ...analytics.filter_options.creators,
    ])].sort((a, b) => a.localeCompare(b, 'fr'))
    return analytics
  },
  ['linear-issues-analytics-v2'],
  { revalidate: LINEAR_ANALYTICS_CACHE_SECONDS, tags: ['linear-issues', 'linear-analytics'] },
)

async function collectCachedSourceIssues(): Promise<{ issues: LinearIssue[]; truncated: boolean }> {
  const issues: LinearIssue[] = []
  const seenCursors = new Set<string>()
  let cursor = ''
  let hasNextPage = true
  let truncated = false

  while (hasNextPage && issues.length < MAX_ANALYTICS_ISSUES) {
    if (seenCursors.has(cursor)) throw new Error('Linear pagination returned a repeated cursor')
    seenCursors.add(cursor)

    const page = await getCachedSourcePage(cursor)
    const remaining = MAX_ANALYTICS_ISSUES - issues.length
    issues.push(...page.issues.slice(0, remaining))

    const pageWasClipped = page.issues.length > remaining
    const reachedLimitWithMorePages = issues.length >= MAX_ANALYTICS_ISSUES && page.pageInfo.hasNextPage
    truncated = pageWasClipped || reachedLimitWithMorePages
    hasNextPage = page.pageInfo.hasNextPage && issues.length < MAX_ANALYTICS_ISSUES

    if (hasNextPage && !page.pageInfo.endCursor) {
      throw new Error('Linear pagination returned no end cursor')
    }
    cursor = page.pageInfo.endCursor ?? ''
  }

  return { issues, truncated }
}

export async function GET(request: NextRequest) {
  if (!process.env.LINEAR_API_KEY) {
    return NextResponse.json(
      {
        error: 'Linear n’est pas configuré sur cet environnement.',
        code: 'LINEAR_NOT_CONFIGURED',
      },
      { status: 503 },
    )
  }

  const searchParams = request.nextUrl.searchParams
  const defaults = defaultRange()
  const from = searchParams.get('from') ?? defaults.from
  const to = searchParams.get('to') ?? defaults.to

  if (!isIsoDate(from) || !isIsoDate(to)) {
    return NextResponse.json({ error: 'Les dates from/to doivent être au format YYYY-MM-DD.' }, { status: 400 })
  }
  if (from > to) {
    return NextResponse.json({ error: 'La date de début doit précéder la date de fin.' }, { status: 400 })
  }
  const rangeDays = (new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime()) / 86_400_000
  if (rangeDays > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: 'La période ne peut pas dépasser 5 ans.' }, { status: 400 })
  }

  const labels = readMultiValue(searchParams, 'label')
  const priorities = readMultiValue(searchParams, 'priority')
  const statuses = readMultiValue(searchParams, 'status')
  const creators = readMultiValue(searchParams, 'creator')
  const keyword = (searchParams.get('keyword') ?? '').trim().slice(0, 200)

  try {
    const analytics = await getCachedAnalytics(
      from,
      to,
      JSON.stringify(labels),
      JSON.stringify(priorities),
      JSON.stringify(statuses),
      JSON.stringify(creators),
      keyword,
    )
    return NextResponse.json(analytics)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur Linear inconnue'
    console.error('[linear/issues/analytics]', message)
    return NextResponse.json(
      {
        error: 'Les données Linear sont temporairement indisponibles.',
        code: 'LINEAR_UNAVAILABLE',
      },
      { status: 502 },
    )
  }
}

function readMultiValue(searchParams: URLSearchParams, key: string): string[] {
  const values = searchParams.getAll(key)
    .flatMap(value => value.split(','))
    .map(value => value.trim())
    .filter(Boolean)
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
  return !Number.isNaN(parsed.getTime()) && toIsoDay(parsed) === value
}

function toIsoDay(value: Date): string {
  return value.toISOString().slice(0, 10)
}
