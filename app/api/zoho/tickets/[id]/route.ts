import { NextRequest, NextResponse } from 'next/server'
import { fetchTicket } from '@/lib/zoho/client'
import { mapZohoTicket } from '@/lib/zoho/mapper'
import { getCRMAccountsMap, matchAccountByName } from '@/lib/zoho/accountCache'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const [raw, crmMap] = await Promise.all([
      fetchTicket(params.id),
      getCRMAccountsMap().catch(() => new Map()),
    ])

    const clientName =
      raw.account?.accountName ||
      raw.contact?.lastName ||
      ''

    const crmAccount = matchAccountByName(clientName, crmMap)
    const segment = crmAccount?.segment ?? null

    const ticket = mapZohoTicket(raw, segment)
    return NextResponse.json(ticket)
  } catch (err) {
    console.error(`[zoho/tickets/${params.id}] GET error:`, err)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération du ticket' },
      { status: 500 }
    )
  }
}
