import { NextRequest, NextResponse } from 'next/server'
import { fetchOnboardingAppointments, type OnboardingAppointment } from '@/lib/acuity/client'
import { logProjectEvent, type ProjectEventType } from '@/lib/onboarding/events'
import { supabaseAdmin } from '@/lib/supabase/server'

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

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
}

function getCompletionType(appt: OnboardingAppointment): ProjectEventType | null {
  const haystack = normalize(`${appt.type_name} ${appt.category}`)
  if (haystack.includes('implementation') || haystack.includes('implementation') || haystack.includes('implémentation')) {
    return 'implementation_completed'
  }
  if (haystack.includes('kick') || appt.duration <= 45) return 'kickoff_completed'
  if (appt.duration >= 60) return 'implementation_completed'
  return null
}

async function findProjectId(appt: OnboardingAppointment): Promise<string | null> {
  const referencedProjectId = appt.project_id?.trim()
  if (referencedProjectId) {
    const { data: projectById, error: projectByIdError } = await supabaseAdmin
      .from('onboarding_projects')
      .select('id')
      .eq('id', referencedProjectId)
      .maybeSingle()
    if (projectByIdError) throw new Error(projectByIdError.message)
    if (projectById?.id) return projectById.id as string

    const { data: projectByZohoId, error: projectByZohoIdError } = await supabaseAdmin
      .from('onboarding_projects')
      .select('id')
      .eq('zoho_project_id', referencedProjectId)
      .maybeSingle()
    if (projectByZohoIdError) throw new Error(projectByZohoIdError.message)
    if (projectByZohoId?.id) return projectByZohoId.id as string
  }

  const target = normalize(appt.hotel_name)
  // Never fall back to fuzzy matching without an actual hotel name: every
  // string contains an empty string, which could otherwise select any project.
  if (!target) return null

  const { data, error } = await supabaseAdmin
    .from('onboarding_projects')
    .select('id, hotel_name')
    .not('hotel_name', 'is', null)

  if (error) throw new Error(error.message)
  const candidates = (data ?? []).map(row => ({
    id: row.id as string,
    hotel: normalize(String(row.hotel_name ?? '')),
  })).filter(row => Boolean(row.hotel))

  const exactMatches = candidates.filter(row => row.hotel === target)
  if (exactMatches.length === 1) return exactMatches[0].id

  // A fuzzy hotel match is accepted only when unambiguous. Multiple products
  // can legitimately share the same hotel name, in which case project_id is
  // required to avoid logging the completion on an arbitrary project.
  const fuzzyMatches = candidates.filter(row => row.hotel.includes(target) || target.includes(row.hotel))
  return fuzzyMatches.length === 1 ? fuzzyMatches[0].id : null
}

async function eventExists(projectId: string, eventType: ProjectEventType, appt: OnboardingAppointment): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('onboarding_events')
    .select('id, metadata')
    .eq('project_id', projectId)
    .eq('event_type', eventType)
    .limit(50)

  if (error) throw new Error(error.message)
  return (data ?? []).some(row => {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>
    return metadata.acuity_id === appt.acuity_id || metadata.appointment_datetime === appt.datetime
  })
}

export async function GET(req: NextRequest) {
  if (!hasValidCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - 7)
  const errors: string[] = []
  let eventsCreated = 0

  try {
    const appointments = await fetchOnboardingAppointments({ from, to: now })
    const completed = appointments.filter(appt => appt.status === 'completed')

    for (const appt of completed) {
      try {
        const eventType = getCompletionType(appt)
        if (!eventType) continue
        const projectId = await findProjectId(appt)
        if (!projectId) continue
        if (await eventExists(projectId, eventType, appt)) continue

        await logProjectEvent({
          project_id: projectId,
          event_type: eventType,
          actor_email: 'cron',
          occurred_at: new Date(appt.datetime),
          metadata: {
            acuity_id: appt.acuity_id,
            duration_minutes: appt.duration,
            appointment_datetime: appt.datetime,
            type_name: appt.type_name,
          },
        })
        eventsCreated += 1
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
      }
    }

    return NextResponse.json({
      appointments_checked: appointments.length,
      events_created: eventsCreated,
      errors,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/detect-acuity-events] GET error:', message)
    return NextResponse.json({ appointments_checked: 0, events_created: eventsCreated, errors: [message] }, { status: 500 })
  }
}
