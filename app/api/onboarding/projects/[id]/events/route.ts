import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { logProjectEvent } from '@/lib/onboarding/events'
import { isProjectEventType } from '@/lib/onboarding/eventTypes'
import { getOnboardingProjectByIdOrZohoId } from '@/lib/onboarding/projects'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireRole(req, ['admin', 'onboarder', 'support'])

    const project = await getOnboardingProjectByIdOrZohoId(params.id)
    if (!project) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const eventType = isProjectEventType(body.event_type) ? body.event_type : 'note_added'
    const metadata = typeof body.metadata === 'object' && body.metadata !== null
      ? body.metadata as Record<string, unknown>
      : {}

    const event = await logProjectEvent({
      project_id: project.id,
      event_type: eventType,
      event_label: typeof body.event_label === 'string' && body.event_label.trim() ? body.event_label.trim() : undefined,
      actor_email: user.email,
      metadata,
    })

    return NextResponse.json(event, { status: 201 })
  } catch (err) {
    return authErrorResponse(err) ?? NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
