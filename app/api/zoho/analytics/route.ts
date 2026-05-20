import { NextRequest, NextResponse } from 'next/server'
import { fetchTickets } from '@/lib/zoho/client'

export const dynamic = 'force-dynamic'

const SUPPORT_DEPT_ID = '5861000000007061'
const PAGE_SIZE = 100
const CLOSED_STATUSES = new Set(['Closed', 'Solved', 'Fermé'])

export interface PeriodMetrics {
  label: string
  from: string
  to: string
  opened: number
  closed: number
  fcr: number
  avgFirstReplyHours: number | null
  avgResolutionHours: number | null
  topCategories: { name: string; count: number }[]
}

// Zoho /tickets ne supporte pas createdTimeRange — on pagine newest-first et on
// s'arrête dès qu'on dépasse la borne inférieure.
async function fetchTicketsInRange(from: Date, to: Date): Promise<Awaited<ReturnType<typeof fetchTickets>>['data']> {
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
        departmentId: SUPPORT_DEPT_ID,
        sortBy: 'createdTime',
      })
      page = res.data ?? []
    } catch (err) {
      if (offset === 0) throw err  // erreur réelle sur la première page
      break                        // offset trop élevé sur les pages suivantes
    }

    if (page.length === 0) break

    let pastWindow = false
    for (const ticket of page) {
      const ts = new Date(ticket.createdTime).getTime()
      if (ts < fromMs) { pastWindow = true; break }
      if (ts <= toMs) result.push(ticket)
    }

    if (pastWindow || page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return result
}

async function computePeriod(from: Date, to: Date, label: string): Promise<PeriodMetrics> {
  const allRaw = await fetchTicketsInRange(from, to)

  const opened = allRaw.length
  const closedTickets = allRaw.filter(t => CLOSED_STATUSES.has(t.status))
  const closed = closedTickets.length

  // FCR: closed with ≤ 2 threads
  const fcrCount = closedTickets.filter(t => (Number(t.threadCount) || 0) <= 2).length
  const fcr = closed > 0 ? Math.round((fcrCount / closed) * 100) : 0

  // Resolution time: closedTime - createdTime (hours)
  const rtSamples = closedTickets
    .filter(t => t.closedTime)
    .map(t => (new Date(t.closedTime!).getTime() - new Date(t.createdTime).getTime()) / 3_600_000)
    .filter(h => h > 0 && h < 8_760)
  const avgResolutionHours =
    rtSamples.length > 0
      ? Math.round((rtSamples.reduce((a, b) => a + b, 0) / rtSamples.length) * 10) / 10
      : null

  // First reply time via responseTime field (ms)
  const frtSamples = allRaw
    .map(t => (t as unknown as Record<string, unknown>).responseTime)
    .filter((v): v is number => typeof v === 'number' && v > 0)
    .map(ms => ms / 3_600_000)
  const avgFirstReplyHours =
    frtSamples.length > 0
      ? Math.round((frtSamples.reduce((a, b) => a + b, 0) / frtSamples.length) * 10) / 10
      : null

  // Top 5 categories
  const catCounts: Record<string, number> = {}
  for (const t of allRaw) {
    const cat = t.category || 'Autre'
    catCounts[cat] = (catCounts[cat] ?? 0) + 1
  }
  const topCategories = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }))

  return { label, from: from.toISOString(), to: to.toISOString(), opened, closed, fcr, avgFirstReplyHours, avgResolutionHours, topCategories }
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

    const primaryPromise = computePeriod(from, to, label || `${fromParam} → ${toParam}`)
    const comparisonPromise =
      compareFromParam && compareToParam
        ? computePeriod(
            new Date(`${compareFromParam}T00:00:00.000Z`),
            new Date(`${compareToParam}T23:59:59.999Z`),
            compareLabel || `${compareFromParam} → ${compareToParam}`,
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
