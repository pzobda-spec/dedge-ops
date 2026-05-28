import { NextRequest, NextResponse } from 'next/server'
import { ZOHO_DESK_AGENT_TICKET_BASE_URL } from '@/lib/zoho/constants'
import { fetchTicketsCreatedInRange, isOtherCategory } from '@/lib/zoho/ticketAnalytics'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const fromParam = sp.get('from')
    const toParam = sp.get('to')

    if (!fromParam || !toParam) {
      return NextResponse.json({ error: 'Paramètres from/to manquants' }, { status: 400 })
    }

    const from = new Date(`${fromParam}T00:00:00.000Z`)
    const to = new Date(`${toParam}T23:59:59.999Z`)
    const tickets = await fetchTicketsCreatedInRange(from, to)

    const otherTickets = tickets
      .filter(ticket => isOtherCategory(ticket.category))
      .map(ticket => ({
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        status: ticket.status,
        category: ticket.category || 'Autre',
        createdTime: ticket.createdTime,
        accountName: ticket.account?.accountName ?? ticket.contact?.account?.accountName ?? null,
        contactName: ticket.contact
          ? `${ticket.contact.firstName ?? ''} ${ticket.contact.lastName ?? ''}`.trim() || null
          : null,
        zohoUrl: `${ZOHO_DESK_AGENT_TICKET_BASE_URL}/details/${ticket.id}`,
      }))

    return NextResponse.json({
      from: fromParam,
      to: toParam,
      count: otherTickets.length,
      tickets: otherTickets,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[zoho/analytics/other-tickets]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
