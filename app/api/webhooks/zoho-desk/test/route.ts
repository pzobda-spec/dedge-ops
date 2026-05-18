import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const secret = process.env.ZOHO_WEBHOOK_SECRET

    if (!secret) {
      return NextResponse.json({ ok: false, error: 'ZOHO_WEBHOOK_SECRET non configuré' })
    }

    const res = await fetch(`${appUrl}/api/webhooks/zoho-desk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-zoho-webhook-token': secret,
      },
      body: JSON.stringify({
        eventType: 'ticket.test',
        ticketId: null,
      }),
    })

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `HTTP ${res.status}` })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) })
  }
}
