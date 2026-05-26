import { unstable_cache } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { fetchTickets } from '@/lib/zoho/client'
import { mapZohoTicket } from '@/lib/zoho/mapper'
import { getCRMAccountsMap, matchAccountByName } from '@/lib/zoho/accountCache'
import {
  ZOHO_CLOSED_STATUSES,
  ZOHO_SUPPORT_DEPARTMENT_ID,
  ZOHO_TICKET_PAGE_SIZE,
  ZOHO_TICKETS_CACHE_SECONDS,
} from '@/lib/zoho/constants'

export const dynamic = 'force-dynamic'

const getTicketsData = unstable_cache(
  async (sortBy: string, maxTickets: number | null) => {
    const crmMap = await getCRMAccountsMap().catch(() => new Map())
    const allRaw: Awaited<ReturnType<typeof fetchTickets>>['data'] = []
    let from = 0
    let visibleRawCount = 0

    while (true) {
      const response = await fetchTickets({
        limit: ZOHO_TICKET_PAGE_SIZE,
        from,
        sortBy,
        departmentId: ZOHO_SUPPORT_DEPARTMENT_ID,
      })
      const page = response.data || []
      allRaw.push(...page)
      visibleRawCount += page.filter(raw => !ZOHO_CLOSED_STATUSES.has(raw.status)).length
      if (page.length < ZOHO_TICKET_PAGE_SIZE || (maxTickets !== null && visibleRawCount >= maxTickets)) break
      from += ZOHO_TICKET_PAGE_SIZE
    }

    const tickets = allRaw
      .filter(raw => !ZOHO_CLOSED_STATUSES.has(raw.status))
      .slice(0, maxTickets ?? undefined)
      .map(raw => {
        const clientName = raw.account?.accountName || raw.contact?.account?.accountName || raw.contact?.lastName || ''
        const crmAccount = matchAccountByName(clientName, crmMap)
        return mapZohoTicket(raw, crmAccount?.segment ?? null)
      })

    return { tickets, count: tickets.length }
  },
  ['zoho-tickets'],
  { revalidate: ZOHO_TICKETS_CACHE_SECONDS, tags: ['zoho-tickets'] }
)

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const sortBy = searchParams.get('sortBy') ?? 'modifiedTime'
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? Math.max(1, Math.min(Number(limitParam) || 0, 500)) : null
    const data = await getTicketsData(sortBy, limit)
    return NextResponse.json(data)
  } catch (err) {
    console.error('[zoho/tickets] GET error:', err)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des tickets Zoho' },
      { status: 500 }
    )
  }
}
