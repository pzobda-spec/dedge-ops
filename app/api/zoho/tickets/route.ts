import { unstable_cache } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { fetchTickets } from '@/lib/zoho/client'
import { mapZohoTicket } from '@/lib/zoho/mapper'
import { getCRMAccountsMap, matchAccountByName } from '@/lib/zoho/accountCache'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 100
const SUPPORT_DEPT_ID = '5861000000007061'
const CLOSED_STATUSES = new Set(['Fermé', 'Closed', 'Solved'])

const getTicketsData = unstable_cache(
  async (sortBy: string) => {
    const crmMap = await getCRMAccountsMap().catch(() => new Map())
    const allRaw: Awaited<ReturnType<typeof fetchTickets>>['data'] = []
    let from = 0

    while (true) {
      const response = await fetchTickets({ limit: PAGE_SIZE, from, sortBy, departmentId: SUPPORT_DEPT_ID })
      const page = response.data || []
      allRaw.push(...page)
      if (page.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }

    const tickets = allRaw
      .filter(raw => !CLOSED_STATUSES.has(raw.status))
      .map(raw => {
        const clientName = raw.account?.accountName || raw.contact?.lastName || ''
        const crmAccount = matchAccountByName(clientName, crmMap)
        return mapZohoTicket(raw, crmAccount?.segment ?? null)
      })

    return { tickets, count: tickets.length }
  },
  ['zoho-tickets'],
  { revalidate: 120, tags: ['zoho-tickets'] }
)

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const sortBy = searchParams.get('sortBy') ?? 'modifiedTime'
    const data = await getTicketsData(sortBy)
    return NextResponse.json(data)
  } catch (err) {
    console.error('[zoho/tickets] GET error:', err)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des tickets Zoho' },
      { status: 500 }
    )
  }
}
