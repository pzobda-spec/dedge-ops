import { NextRequest, NextResponse } from 'next/server'
import { syncOnboardingProjects } from '@/lib/onboarding/syncProjects'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
    const result = await syncOnboardingProjects({ actorEmail: 'cron' })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/sync-onboarding] GET error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
