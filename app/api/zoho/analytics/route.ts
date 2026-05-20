import { NextRequest, NextResponse } from 'next/server'
import { fetchTickets } from '@/lib/zoho/client'

export const dynamic = 'force-dynamic'

const SUPPORT_DEPT_ID = '5861000000007061'
const PAGE_SIZE = 100
const CLOSED_STATUSES = new Set(['Closed', 'Solved', 'Fermé'])

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

// Zoho /tickets trie en ASCENDANT (oldest first), pas de filtre date côté API.
// On pagine depuis l'offset 0, on saute jusqu'à `from`, on collecte jusqu'à `to`, on stoppe après.
async function fetchTicketsCreatedInRange(
  from: Date,
  to: Date,
): Promise<Awaited<ReturnType<typeof fetchTickets>>['data']> {
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

interface DebugInfo {
  fetchedCount: number
  firstCreatedTime: string | null
  lastCreatedTime: string | null
  withClosedTime: number
  closedInPeriodCount: number
}

async function computePeriod(from: Date, to: Date, label: string, debug = false): Promise<PeriodMetrics & { _debug?: DebugInfo }> {
  const fromMs = from.getTime()
  const toMs = to.getTime()

  const extendedFrom = new Date(fromMs - LOOKBACK_DAYS * 24 * 3600 * 1000)
  const fetched = await fetchTicketsCreatedInRange(extendedFrom, to)

  // Nouveaux : créés dans la période réelle
  const opened = fetched.filter(t => {
    const ts = new Date(t.createdTime).getTime()
    return ts >= fromMs && ts <= toMs
  }).length

  // Fermés : closedTime tombe dans la période (peu importe la date de création)
  const closedInPeriod = fetched.filter(t => {
    if (!t.closedTime) return false
    const ts = new Date(t.closedTime).getTime()
    return ts >= fromMs && ts <= toMs
  })
  const closed = closedInPeriod.length

  // FCR : fermés dans la période avec ≤ 2 échanges
  const fcrCount = closedInPeriod.filter(t => (Number(t.threadCount) || 0) <= 2).length
  const fcr = closed > 0 ? Math.round((fcrCount / closed) * 100) : 0

  // Résolution : closedTime - createdTime pour tickets fermés dans la période
  const rtSamples = closedInPeriod
    .filter(t => t.closedTime)
    .map(t => (new Date(t.closedTime!).getTime() - new Date(t.createdTime).getTime()) / 3_600_000)
    .filter(h => h > 0 && h < 8_760)
  const avgResolutionHours =
    rtSamples.length > 0
      ? Math.round((rtSamples.reduce((a, b) => a + b, 0) / rtSamples.length) * 10) / 10
      : null

  // 1ère réponse : champ responseTime (ms) — peut ne pas être renvoyé par Zoho en bulk
  const createdInPeriod = fetched.filter(t => {
    const ts = new Date(t.createdTime).getTime()
    return ts >= fromMs && ts <= toMs
  })
  const frtSamples = createdInPeriod
    .map(t => (t as unknown as Record<string, unknown>).responseTime)
    .filter((v): v is number => typeof v === 'number' && v > 0)
    .map(ms => ms / 3_600_000)
  const avgFirstReplyHours =
    frtSamples.length > 0
      ? Math.round((frtSamples.reduce((a, b) => a + b, 0) / frtSamples.length) * 10) / 10
      : null

  // Top 5 catégories sur les tickets créés dans la période
  const catCounts: Record<string, number> = {}
  for (const t of createdInPeriod) {
    const cat = t.category || 'Autre'
    catCounts[cat] = (catCounts[cat] ?? 0) + 1
  }
  const topCategories = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }))

  const result: PeriodMetrics & { _debug?: DebugInfo } = { label, from: from.toISOString(), to: to.toISOString(), opened, closed, fcr, avgFirstReplyHours, avgResolutionHours, topCategories }
  if (debug) {
    result._debug = {
      fetchedCount: fetched.length,
      firstCreatedTime: fetched[0]?.createdTime ?? null,
      lastCreatedTime: fetched[fetched.length - 1]?.createdTime ?? null,
      withClosedTime: fetched.filter(t => !!t.closedTime).length,
      closedInPeriodCount: closed,
    }
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
