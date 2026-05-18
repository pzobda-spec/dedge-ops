import { NextRequest, NextResponse } from 'next/server'
import { fetchTickets } from '@/lib/zoho/client'
import { mapZohoTicket } from '@/lib/zoho/mapper'
import { getCRMAccountsMap, matchAccountByName } from '@/lib/zoho/accountCache'

export const dynamic = 'force-dynamic'

const SUPPORT_DEPT_ID = '5861000000007061'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const month = Number(searchParams.get('month') ?? new Date().getMonth() + 1)
    const year = Number(searchParams.get('year') ?? new Date().getFullYear())

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59)

    // Fetch up to 200 tickets across two pages (no status filter = all tickets)
    const [page1, page2] = await Promise.allSettled([
      fetchTickets({ limit: 100, from: 0, departmentId: SUPPORT_DEPT_ID, sortBy: 'createdTime' }),
      fetchTickets({ limit: 100, from: 100, departmentId: SUPPORT_DEPT_ID, sortBy: 'createdTime' }),
    ])

    const rawAll = [
      ...(page1.status === 'fulfilled' ? page1.value.data ?? [] : []),
      ...(page2.status === 'fulfilled' ? page2.value.data ?? [] : []),
    ]

    // Filter to selected month
    const rawMonth = rawAll.filter(t => {
      const d = new Date(t.createdTime)
      return d >= startDate && d <= endDate
    })

    const crmMap = await getCRMAccountsMap().catch(() => new Map())

    const tickets = rawMonth.map(raw => {
      const clientName = raw.account?.accountName || raw.contact?.lastName || ''
      const crmAccount = matchAccountByName(clientName, crmMap)
      return mapZohoTicket(raw, crmAccount?.segment ?? null)
    })

    // Compute metrics
    const CLOSED = new Set(['Closed', 'Solved', 'Fermé'])

    const totalTickets = tickets.length
    const resolved = tickets.filter(t => CLOSED.has(t.zohoStatus)).length
    const opened = totalTickets - resolved

    // Product breakdown
    const productCounts: Record<string, number> = {}
    for (const t of tickets) {
      const p = t.productArea || 'Autre'
      productCounts[p] = (productCounts[p] ?? 0) + 1
    }
    const topProducts = Object.entries(productCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))

    // Priority breakdown
    const priorityCounts: Record<string, number> = {}
    for (const t of tickets) {
      priorityCounts[t.priority] = (priorityCounts[t.priority] ?? 0) + 1
    }

    // Segment breakdown
    const segmentCounts: Record<string, number> = {}
    for (const t of tickets) {
      const s = t.segment ?? 'Inconnu'
      segmentCounts[s] = (segmentCounts[s] ?? 0) + 1
    }

    return NextResponse.json({
      month,
      year,
      totalTickets,
      topProducts,
      priorityCounts,
      segmentCounts,
      openedVsResolved: { opened, resolved },
      note: rawAll.length >= 200 ? 'Données partielles — plus de 200 tickets ce mois' : undefined,
    })
  } catch (err) {
    console.error('[zoho/stats] error:', err)
    return NextResponse.json({ error: 'Erreur lors du calcul des statistiques' }, { status: 500 })
  }
}
