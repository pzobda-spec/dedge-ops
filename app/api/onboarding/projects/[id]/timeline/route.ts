import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { getProjectTimeline } from '@/lib/onboarding/events'
import { getOnboardingProjectByIdOrZohoId } from '@/lib/onboarding/projects'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await requireRole(req, ['admin', 'onboarder', 'support', 'csm_lead'])

    const project = await getOnboardingProjectByIdOrZohoId(params.id)
    if (!project) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })

    const events = await getProjectTimeline(project.id)
    return NextResponse.json({ events })
  } catch (err) {
    return authErrorResponse(err) ?? NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
