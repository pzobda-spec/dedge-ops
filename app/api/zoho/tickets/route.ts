import { NextRequest, NextResponse } from 'next/server'
import { fetchTickets } from '@/lib/zoho/client'
import { mapZohoTicket } from '@/lib/zoho/mapper'
import { getCRMAccountsMap, matchAccountByName } from '@/lib/zoho/accountCache'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const limit = Number(searchParams.get('limit') ?? 100)
    const from = Number(searchParams.get('from') ?? 0)
    // Default to Open only — exclude closed/fermé tickets
    const status = searchParams.get('status') ?? 'Open'
    const sortBy = searchParams.get('sortBy') ?? 'modifiedTime'

    const SUPPORT_DEPT_ID = '5861000000007061'
    const CLOSED_STATUSES = new Set(['Fermé', 'Closed', 'Solved'])

    const response = await fetchTickets({ limit, from, status, sortBy, departmentId: SUPPORT_DEPT_ID })
    const crmMap = await getCRMAccountsMap().catch(() => new Map())

    const tickets = (response.data || [])
      .filter(raw => !CLOSED_STATUSES.has(raw.status))
      .map(raw => {
        const clientName =
          raw.account?.accountName ||
          raw.contact?.lastName ||
          ''

        const crmAccount = matchAccountByName(clientName, crmMap)
        const segment = crmAccount?.segment ?? null

        return mapZohoTicket(raw, segment)
      })

    return NextResponse.json({ tickets, count: tickets.length })
  } catch (err) {
    console.error('[zoho/tickets] GET error:', err)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des tickets Zoho' },
      { status: 500 }
    )
  }
}
