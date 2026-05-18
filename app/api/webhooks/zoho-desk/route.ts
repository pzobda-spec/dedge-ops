import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { ingestSingleTicket } from '@/lib/rag/ingest'

export const dynamic = 'force-dynamic'

// Zoho validates the URL with a GET before saving
export async function GET() {
  return NextResponse.json({ ok: true })
}

const CLOSED_STATUSES = new Set(['Closed', 'Solved', 'Fermé'])

export async function POST(req: NextRequest) {
  // Verify webhook token (query param — Zoho doesn't support custom headers)
  const token = req.headers.get('x-zoho-webhook-token') ?? req.nextUrl.searchParams.get('token')
  if (!token || token !== process.env.ZOHO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Zoho sends eventType as "Ticket_Add" or "Ticket_Update"
  const eventType = payload.eventType as string | undefined
  const ticketId = (
    payload.ticketId ??
    (payload.ticket as Record<string, unknown>)?.id
  ) as string | undefined

  // Log event (fire-and-forget)
  void supabaseAdmin.from('webhook_events').insert({
    event_type: eventType ?? 'unknown',
    ticket_id: ticketId ?? null,
    payload,
  })

  if (!ticketId) {
    return NextResponse.json({ ok: true, skipped: 'no ticketId' })
  }

  const newStatus = payload.newStatus as string | undefined
  const shouldIngest =
    eventType === 'Ticket_Add' ||
    (eventType === 'Ticket_Update' && newStatus && CLOSED_STATUSES.has(newStatus))

  if (!shouldIngest) {
    return NextResponse.json({ ok: true, skipped: 'event not handled' })
  }

  // Fire-and-forget — must respond within 5s
  ingestSingleTicket(ticketId).catch(err =>
    console.error(`[webhook] ingest failed for ticket ${ticketId}:`, err)
  )

  return NextResponse.json({ ok: true, ticketId, eventType })
}
