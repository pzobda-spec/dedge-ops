import { NextRequest, NextResponse } from 'next/server'
import { isHardcodedAccessEmail } from '@/lib/auth/access'
import { getSessionUserEmail } from '@/lib/auth/session'
import { AuthError, authErrorResponse, requireRole } from '@/lib/auth/roles'
import { syncOnboardingProjects } from '@/lib/onboarding/syncProjects'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function requireSyncActor(req: NextRequest): Promise<string> {
  try {
    return (await requireRole(req, ['admin', 'onboarder'])).email
  } catch (error) {
    // Keep the historical restricted-access account as an admin fallback, but
    // only when it is authenticated and has no active app role of its own.
    if (error instanceof AuthError && error.status === 401) {
      const email = await getSessionUserEmail()
      if (email && isHardcodedAccessEmail(email)) return email
    }
    throw error
  }
}

export async function POST(req: NextRequest) {
  try {
    const actorEmail = await requireSyncActor(req)
    const projectId = req.nextUrl.searchParams.get('project_id') ?? undefined
    const result = await syncOnboardingProjects({ projectId, actorEmail })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[zoho/projects-sync] POST error:', message)
    return authErrorResponse(err) ?? NextResponse.json({ error: message }, { status: 500 })
  }
}
