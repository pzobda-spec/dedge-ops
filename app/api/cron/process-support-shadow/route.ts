import { NextRequest, NextResponse } from 'next/server'
import { runShadowWorker } from '@/lib/support/shadowWorker'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  return handleWorkerRequest(request)
}

export async function POST(request: NextRequest) {
  return handleWorkerRequest(request)
}

async function handleWorkerRequest(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await runShadowWorker({ reconcile: true, limit: 60 }))
  } catch (error) {
    console.error('[cron/process-support-shadow]', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
      mode: 'shadow',
      external_writes: { zoho: false, linear: false, slack: false },
    }, { status: 500 })
  }
}
