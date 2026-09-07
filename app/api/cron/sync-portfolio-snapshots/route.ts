import { NextRequest, NextResponse } from 'next/server'
import { persistDailySnapshots } from '@/lib/onboarding/snapshots'
import { planChargeReferenceDate } from '@/lib/onboarding/planChargeSources'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function hasValidCronSecret(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false

  const authorization = req.headers.get('authorization') ?? ''
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const headerSecret = req.headers.get('x-cron-secret') ?? ''
  const querySecret = req.nextUrl.searchParams.get('secret') ?? ''

  return [bearer, headerSecret, querySecret].includes(expected)
}

export async function GET(req: NextRequest) {
  if (!hasValidCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Les crons Vercel tournent en UTC : la clé d'upsert doit porter la date
    // métier Europe/Paris, jamais une date dérivée d'UTC (new Date().toISOString()),
    // sous peine d'écrire sur le lendemain après 22h heure de Paris.
    const referenceDate = planChargeReferenceDate()
    const result = await persistDailySnapshots(referenceDate)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/sync-portfolio-snapshots] GET error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
