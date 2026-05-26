import { NextRequest, NextResponse } from 'next/server'
import { computeTicketPeriodMetrics, topCategories } from '@/lib/zoho/ticketAnalytics'

export const dynamic = 'force-dynamic'

const LOOKBACK_DAYS = 90

interface PeriodStats {
  label: string
  opened: number
  closed: number
  fcr: number
  topSubjects: { name: string; count: number }[]
}

async function fetchPeriodStats(from: Date, to: Date, label: string): Promise<PeriodStats> {
  const metrics = await computeTicketPeriodMetrics(from, to, LOOKBACK_DAYS)
  return {
    label,
    opened: metrics.opened,
    closed: metrics.closed,
    fcr: metrics.fcr,
    topSubjects: topCategories(metrics.createdInPeriod, 3),
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const monthParam = searchParams.get('month')

    const now = new Date()
    let year: number
    let month: number

    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      ;[year, month] = monthParam.split('-').map(Number)
    } else {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      year = d.getFullYear()
      month = d.getMonth() + 1
    }

    const startCurrent = new Date(year, month - 1, 1)
    const endCurrent = new Date(year, month, 0, 23, 59, 59, 999)
    const startYoY = new Date(year - 1, month - 1, 1)
    const endYoY = new Date(year - 1, month, 0, 23, 59, 59, 999)

    const monthNames = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']

    const [current, yoy] = await Promise.all([
      fetchPeriodStats(startCurrent, endCurrent, `${monthNames[month - 1]} ${year}`),
      fetchPeriodStats(startYoY, endYoY, `${monthNames[month - 1]} ${year - 1}`),
    ])

    return NextResponse.json({ current, yoy })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[zoho/stats] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
