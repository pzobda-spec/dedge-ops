import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { fetchSessionsWithMeta } from '@/lib/acuity/client'
import { getOnboardingProjectByIdOrZohoId } from '@/lib/onboarding/projects'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR').replace(/[^a-z0-9]+/g, ' ').trim()
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireRole(req, ['admin', 'onboarder', 'support', 'commercial_readonly'])
    const project = await getOnboardingProjectByIdOrZohoId(params.id)
    if (!project) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
    if (!project.start_date) return NextResponse.json({ sessions_count: 0, participants: [], warning: 'Date de début du projet non renseignée.' })
    const today = new Date().toISOString().slice(0, 10)
    const maxDate = project.actual_go_live && project.actual_go_live < today ? project.actual_go_live : today
    const result = await fetchSessionsWithMeta({ minDate: project.start_date, maxDate })
    const projectName = normalize(project.hotel_name ?? '')
    const byEmail = new Map<string, { email: string; sessions: Set<string>; names: Set<string> }>()
    for (const session of result.sessions) {
      if (new Date(session.datetime).getTime() > Date.now() || session.status === 'cancelled') continue
      for (const participant of session.participants) {
        if (participant.status !== 'registered' || normalize(participant.hotelName) !== projectName) continue
        const email = participant.email.trim().toLocaleLowerCase('fr-FR')
        if (!email) continue
        const value = byEmail.get(email) ?? { email, sessions: new Set<string>(), names: new Set<string>() }
        value.sessions.add(session.id)
        value.names.add(`${participant.firstName} ${participant.lastName}`.trim())
        byEmail.set(email, value)
      }
    }
    const participants = Array.from(byEmail.values()).map(value => ({ email: value.email, name: Array.from(value.names)[0] ?? '', sessions_count: value.sessions.size })).sort((a, b) => b.sessions_count - a.sessions_count || a.email.localeCompare(b.email))
    const sessionIds = new Set<string>()
    for (const value of byEmail.values()) for (const sessionId of value.sessions) sessionIds.add(sessionId)
    return NextResponse.json({ sessions_count: sessionIds.size, participants, period: { from: project.start_date, to: maxDate }, degraded: result.meta.degraded })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
