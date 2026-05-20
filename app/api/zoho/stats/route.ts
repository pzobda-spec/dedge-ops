import { NextRequest, NextResponse } from 'next/server'
import { fetchTickets } from '@/lib/zoho/client'

export const dynamic = 'force-dynamic'

const SUPPORT_DEPT_ID = '5861000000007061'
const PAGE_SIZE = 100
const CLOSED_STATUSES = new Set(['Closed', 'Solved', 'Fermé'])
const LOOKBACK_DAYS = 90

interface PeriodStats {
  label: string
  opened: number
  closed: number
  fcr: number
  topSubjects: { name: string; count: number }[]
}

async function fetchTicketsCreatedInRange(from: Date, to: Date) {
  const fromMs = from.getTime()
  const toMs = to.getTime()
  const result: Awaited<ReturnType<typeof fetchTickets>>['data'] = []
  let offset = 0

  while (true) {
    let page
    try {
      const res = await fetchTickets({
        limit: PAGE_SIZE,
        from: offset,
        sortBy: 'createdTime',
      })
      page = res.data ?? []
    } catch (err) {
      if (offset === 0) throw err
      break
    }

    if (page.length === 0) break

    let pastWindow = false
    for (const ticket of page) {
      const ts = new Date(ticket.createdTime).getTime()
      if (ts > toMs) { pastWindow = true; break }
      if (ts >= fromMs) result.push(ticket)
    }

    if (pastWindow || page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return result
}

async function fetchPeriodStats(from: Date, to: Date, label: string): Promise<PeriodStats> {
  const fromMs = from.getTime()
  const toMs = to.getTime()

  const extendedFrom = new Date(fromMs - LOOKBACK_DAYS * 24 * 3600 * 1000)
  const fetched = await fetchTicketsCreatedInRange(extendedFrom, to)

  const createdInPeriod = fetched.filter(t => {
    const ts = new Date(t.createdTime).getTime()
    return ts >= fromMs && ts <= toMs
  })
  const opened = createdInPeriod.length

  const closedInPeriod = fetched.filter(t => {
    if (!t.closedTime) return false
    const ts = new Date(t.closedTime).getTime()
    return ts >= fromMs && ts <= toMs
  })
  const closed = closedInPeriod.length

  const fcrCount = closedInPeriod.filter(t => (Number(t.threadCount) || 0) <= 2).length
  const fcr = closed > 0 ? Math.round((fcrCount / closed) * 100) : 0

  const subjectCounts: Record<string, number> = {}
  for (const t of createdInPeriod) {
    const subject = t.category || 'Autre'
    subjectCounts[subject] = (subjectCounts[subject] ?? 0) + 1
  }
  const topSubjects = Object.entries(subjectCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }))

  return { label, opened, closed, fcr, topSubjects }
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
