import { unstable_cache } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import {
  aggregateTicketAnalyticsFromSource,
  buildAnalyticsRange,
  collectDeskAccountNames,
  collectTicketAnalyticsSource,
  fetchDeskAccountPage,
  fetchModifiedTicketAnalyticsPage,
  fetchTicketAnalyticsPage,
  mergeTicketAnalyticsSources,
  ticketAnalyticsResolutionSourceRange,
  ticketAnalyticsSourceRange,
} from '@/lib/zoho/ticketDashboardAnalytics'
import type { TicketAnalyticsFilters } from '@/lib/zoho/ticketAnalyticsTypes'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CACHE_SECONDS = 15 * 60
const ACCOUNT_CACHE_SECONDS = 60 * 60
const MAX_RANGE_DAYS = 731

// Cache pages independently: a 100-ticket page stays well below Next 14's
// 2 MiB incremental-cache entry limit, even for a 12-month dashboard.
const getCachedTicketPage = unstable_cache(
  fetchTicketAnalyticsPage,
  ['zoho-ticket-dashboard-page-v1'],
  { revalidate: CACHE_SECONDS, tags: ['zoho-ticket-analytics'] },
)

const getCachedModifiedTicketPage = unstable_cache(
  fetchModifiedTicketAnalyticsPage,
  ['zoho-ticket-dashboard-modified-page-v1'],
  { revalidate: CACHE_SECONDS, tags: ['zoho-ticket-analytics'] },
)

const getCachedAccountPage = unstable_cache(
  fetchDeskAccountPage,
  ['zoho-ticket-dashboard-account-page-v1'],
  { revalidate: ACCOUNT_CACHE_SECONDS, tags: ['zoho-ticket-analytics'] },
)

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

  const toExclusive = new Date(to.getTime() + 24 * 60 * 60 * 1000)
  const numberOfDays = (toExclusive.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)
  if (numberOfDays <= 0 || numberOfDays > MAX_RANGE_DAYS) {
    return NextResponse.json(
      { error: `La période doit contenir entre 1 et ${MAX_RANGE_DAYS} jours.` },
      { status: 400 },
    )
  }

  if (!hasZohoCredentials()) {
    return NextResponse.json(
      {
        error: 'L’intégration Zoho Desk n’est pas configurée.',
        code: 'ZOHO_NOT_CONFIGURED',
      },
      { status: 503 },
    )
  }

  const filters = readFilters(request)
  const normalizedFilters = {
    ...filters,
    products: [...filters.products].sort(),
    categories: [...filters.categories].sort(),
    classifications: [...filters.classifications].sort(),
    statuses: [...filters.statuses].sort(),
    priorities: [...filters.priorities].sort(),
  } satisfies TicketAnalyticsFilters

  try {
    const range = buildAnalyticsRange(from, toExclusive)
    const sourceRange = ticketAnalyticsSourceRange(range)
    const resolutionSourceRange = ticketAnalyticsResolutionSourceRange(range)
    // Filtering is intentionally performed after this cached source read. A
    // new filter combination therefore never fans out to Zoho again.
    const [creationSource, resolutionSource, accountNames] = await Promise.all([
      collectTicketAnalyticsSource(sourceRange.from, sourceRange.to, getCachedTicketPage),
      collectTicketAnalyticsSource(
        resolutionSourceRange.from,
        resolutionSourceRange.to,
        getCachedModifiedTicketPage,
        'modifiedTime',
      ),
      // Account enrichment is helpful for the client facet but should never
      // make the ticket metrics unavailable when the contacts scope is absent.
      collectDeskAccountNames(getCachedAccountPage).catch(() => ({})),
    ])
    const source = mergeTicketAnalyticsSources(creationSource, resolutionSource)
    const data = aggregateTicketAnalyticsFromSource(source, range, normalizedFilters, accountNames)
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[zoho/tickets/analytics]', message)
    return NextResponse.json(
      {
        error: 'Zoho Desk est temporairement indisponible. Réessayez dans quelques instants.',
        code: 'ZOHO_UPSTREAM_ERROR',
      },
      { status: 502 },
    )
  }
}

function readFilters(request: NextRequest): TicketAnalyticsFilters {
  const params = request.nextUrl.searchParams
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

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null
  return date
}

function hasZohoCredentials(): boolean {
  if (!process.env.ZOHO_ORG_ID) return false
  if (process.env.ZOHO_ACCESS_TOKEN) return true
  return Boolean(
    process.env.ZOHO_CLIENT_ID
      && process.env.ZOHO_CLIENT_SECRET
      && process.env.ZOHO_REFRESH_TOKEN,
  )
}
