import { NextRequest, NextResponse } from 'next/server'
import { canAccessRestrictedOps } from '@/lib/auth/access'
import { getSessionUserEmail } from '@/lib/auth/session'
import { getProjectTimeline } from '@/lib/onboarding/events'
import { getOnboardingProjectByIdOrZohoId } from '@/lib/onboarding/projects'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const email = await getSessionUserEmail()
  if (!canAccessRestrictedOps(email)) {
    return NextResponse.json({ error: 'Accès restreint' }, { status: 403 })
  }

  const project = await getOnboardingProjectByIdOrZohoId(params.id)
  if (!project) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })

  const events = await getProjectTimeline(project.id)
  return NextResponse.json({ events })
}
