import { waitUntil } from '@vercel/functions'
import { NextRequest, NextResponse } from 'next/server'
import { enqueueWebhookBatch } from '@/lib/support/shadowQueue'
import { runShadowWorker } from '@/lib/support/shadowWorker'
import { parseZohoDeskWebhook, verifyZohoDeskJwt } from '@/lib/support/zohoWebhook'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// Zoho validates the URL before saving the webhook.
export async function GET() {
  return NextResponse.json({ ok: true, mode: 'shadow' })
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('x-zdesk-jwt')
  if (!token) return NextResponse.json({ error: 'Missing X-ZDesk-JWT' }, { status: 401 })

  try {
    await verifyZohoDeskJwt(token)
  } catch (error) {
    console.warn('[zoho-webhook] JWT rejected:', errorMessage(error))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let events
  try {
    events = parseZohoDeskWebhook(await request.json())
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 })
  }

  try {
    const queued = await enqueueWebhookBatch(events)
    if (queued.queued > 0) {
      waitUntil(runShadowWorker({ reconcile: false, limit: 20 }).catch(error => {
        console.error('[zoho-webhook] background shadow worker failed:', errorMessage(error))
      }))
    }
    return NextResponse.json({
      ok: true,
      mode: 'shadow',
      received: events.length,
      inserted: queued.inserted,
      queued: queued.queued,
      external_writes: { zoho: false, linear: false, slack: false },
    })
  } catch (error) {
    // A non-2xx response asks Zoho to retry; nothing is acknowledged before durable enqueue.
    console.error('[zoho-webhook] durable enqueue failed:', errorMessage(error))
    return NextResponse.json({ error: 'Durable queue unavailable' }, { status: 503 })
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
