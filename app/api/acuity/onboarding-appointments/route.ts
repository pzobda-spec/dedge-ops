import { NextRequest, NextResponse } from 'next/server'
import { fetchOnboardingAppointments } from '@/lib/acuity/client'
import { getOnboardingProjectByIdOrZohoId } from '@/lib/onboarding/projects'

export const dynamic = 'force-dynamic'

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { expiresAt: number; appointments: Awaited<ReturnType<typeof fetchOnboardingAppointments>> }>()

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('project_id')
  if (!projectId) return NextResponse.json({ error: 'project_id requis' }, { status: 400 })

  const project = await getOnboardingProjectByIdOrZohoId(projectId)
  if (!project) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })

  const key = project.hotel_name ?? project.id
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && cached.expiresAt > now) {
    return NextResponse.json({ appointments: cached.appointments, cached: true })
  }

  try {
    const appointments = await fetchOnboardingAppointments({
      hotelName: project.hotel_name ?? undefined,
    })
    cache.set(key, { expiresAt: now + CACHE_TTL_MS, appointments })
    return NextResponse.json({ appointments, cached: false })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[acuity/onboarding-appointments] GET error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
