import { NextRequest, NextResponse } from 'next/server'
import { fetchTickets } from '@/lib/zoho/client'

export const dynamic = 'force-dynamic'

const SUPPORT_DEPT_ID = '5861000000007061'
const PAGE_SIZE = 100
const CLOSED_STATUSES = new Set(['Closed', 'Solved', 'Fermé'])

interface PeriodStats {
  label: string
  opened: number
  closed: number
  fcr: number
  topSubjects: { name: string; count: number }[]
}

async function fetchPeriodStats(startISO: string, endISO: string, label: string): Promise<PeriodStats> {
  const createdTimeRange = `${startISO},${endISO}`

  // Paginate through all tickets created in the period
  // Zoho Desk caps the from+limit offset — stop at 500 tickets to avoid API errors
  const allRaw = []
  let from = 0
  const MAX_TICKETS = 500
  while (allRaw.length < MAX_TICKETS) {
    let page
    try {
      const res = await fetchTickets({
        limit: PAGE_SIZE,
        from,
        departmentId: SUPPORT_DEPT_ID,
        sortBy: 'createdTime',
        createdTimeRange,
      })
      page = res.data ?? []
    } catch {
      // Zoho may return 422/400 when offset exceeds their internal limit — treat as end of data
      break
    }
    allRaw.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  const opened = allRaw.length
  const closedTickets = allRaw.filter(t => CLOSED_STATUSES.has(t.status))
  const closed = closedTickets.length

  // FCR ≈ closed tickets with ≤ 2 threads (1 client message + 1 agent response)
  const fcrCount = closedTickets.filter(t => (Number(t.threadCount) || 0) <= 2).length
  const fcr = closed > 0 ? Math.round((fcrCount / closed) * 100) : 0

  // Top subjects by category
  const subjectCounts: Record<string, number> = {}
  for (const t of allRaw) {
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
    const monthParam = searchParams.get('month') // YYYY-MM

    const now = new Date()
    let year: number
    let month: number

    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      ;[year, month] = monthParam.split('-').map(Number)
    } else {
      // Default to M-1
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      year = d.getFullYear()
      month = d.getMonth() + 1
    }

    // Current period
    const startCurrent = new Date(year, month - 1, 1)
    const endCurrent = new Date(year, month, 0, 23, 59, 59, 999)

    // Same month last year
    const startYoY = new Date(year - 1, month - 1, 1)
    const endYoY = new Date(year - 1, month, 0, 23, 59, 59, 999)

    const monthNames = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
    const labelCurrent = `${monthNames[month - 1]} ${year}`
    const labelYoY = `${monthNames[month - 1]} ${year - 1}`

    const [current, yoy] = await Promise.all([
      fetchPeriodStats(startCurrent.toISOString(), endCurrent.toISOString(), labelCurrent),
      fetchPeriodStats(startYoY.toISOString(), endYoY.toISOString(), labelYoY),
    ])

    return NextResponse.json({ current, yoy })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[zoho/stats] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
