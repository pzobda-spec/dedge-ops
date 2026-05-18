import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { ingestSingleTicket } from '@/lib/rag/ingest'

export const dynamic = 'force-dynamic'

const TRIGGER_STATUSES = new Set(['Closed', 'Solved', 'Fermé'])

export async function POST(req: NextRequest) {
  // Verify webhook token
  const token = req.headers.get('x-zoho-webhook-token')
  if (!token || token !== process.env.ZOHO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = payload.eventType as string | undefined
  const ticketId = (payload.ticketId ?? (payload.ticket as Record<string, unknown>)?.id) as string | undefined

  // Log event (fire-and-forget)
  void supabaseAdmin.from('webhook_events').insert({
    event_type: eventType ?? 'unknown',
    ticket_id: ticketId ?? null,
    payload,
  })

  if (!ticketId) {
    return NextResponse.json({ ok: true, skipped: 'no ticketId' })
  }

  const shouldIngest =
    eventType === 'ticket.created' ||
    (eventType === 'ticket.statusChanged' && TRIGGER_STATUSES.has(payload.newStatus as string))

  if (!shouldIngest) {
    return NextResponse.json({ ok: true, skipped: 'event not handled' })
  }

  // Fire-and-forget — must respond within 5s
  ingestSingleTicket(ticketId).catch(err =>
    console.error(`[webhook] ingest failed for ticket ${ticketId}:`, err)
  )

  return NextResponse.json({ ok: true, ticketId, eventType })
}
