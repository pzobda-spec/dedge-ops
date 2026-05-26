import { NextRequest, NextResponse } from 'next/server'
import { computeTicketPeriodMetrics, topCategories } from '@/lib/zoho/ticketAnalytics'

export const dynamic = 'force-dynamic'

// Fenêtre étendue avant la période pour capturer les tickets créés avant mais fermés pendant
const LOOKBACK_DAYS = 90

export interface PeriodMetrics {
  label: string
  from: string
  to: string
  opened: number   // créés dans la période
  closed: number   // closedTime dans la période
  fcr: number
  avgFirstReplyHours: number | null
  avgResolutionHours: number | null
  topCategories: { name: string; count: number }[]
}

interface DebugInfo {
  fetchedCount: number
  firstCreatedTime: string | null
  lastCreatedTime: string | null
  withClosedTime: number
  closedInPeriodCount: number
}

async function computePeriod(from: Date, to: Date, label: string, debug = false): Promise<PeriodMetrics & { _debug?: DebugInfo }> {
  const metrics = await computeTicketPeriodMetrics(from, to, LOOKBACK_DAYS)
  const result: PeriodMetrics & { _debug?: DebugInfo } = {
    label,
    from: from.toISOString(),
    to: to.toISOString(),
    opened: metrics.opened,
    closed: metrics.closed,
    fcr: metrics.fcr,
    avgFirstReplyHours: metrics.avgFirstReplyHours,
    avgResolutionHours: metrics.avgResolutionHours,
    topCategories: topCategories(metrics.createdInPeriod, 5),
  }
  if (debug) {
    result._debug = metrics.debug
  }
  return result
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const fromParam = sp.get('from')
    const toParam = sp.get('to')
    const compareFromParam = sp.get('compareFrom')
    const compareToParam = sp.get('compareTo')
    const label = sp.get('label') ?? ''
    const compareLabel = sp.get('compareLabel') ?? ''

    if (!fromParam || !toParam) {
      return NextResponse.json({ error: 'Paramètres from/to manquants' }, { status: 400 })
    }

    const from = new Date(`${fromParam}T00:00:00.000Z`)
    const to = new Date(`${toParam}T23:59:59.999Z`)

    const isDebug = sp.get('debug') === '1'
    const primaryPromise = computePeriod(from, to, label || `${fromParam} → ${toParam}`, isDebug)
    const comparisonPromise =
      compareFromParam && compareToParam
        ? computePeriod(
            new Date(`${compareFromParam}T00:00:00.000Z`),
            new Date(`${compareToParam}T23:59:59.999Z`),
            compareLabel || `${compareFromParam} → ${compareToParam}`,
            isDebug,
          )
        : Promise.resolve(null)

    const [primary, comparison] = await Promise.all([primaryPromise, comparisonPromise])
    return NextResponse.json({ primary, comparison })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[zoho/analytics]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
