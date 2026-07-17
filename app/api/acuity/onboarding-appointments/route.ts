import { NextRequest, NextResponse } from 'next/server'
import {
  fetchOnboardingAppointmentsWithMeta,
  type OnboardingAppointmentsResult,
} from '@/lib/acuity/client'
import { getOnboardingProjectByIdOrZohoId } from '@/lib/onboarding/projects'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { expiresAt: number; result: OnboardingAppointmentsResult }>()

function hotelSearchName(value: string | null): string | undefined {
  const name = value?.split(' : ')[0]?.trim()
  return name || undefined
}

function projectStartDate(value: string | null): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('project_id')
  if (!projectId) return NextResponse.json({ error: 'project_id requis' }, { status: 400 })

  try {
    const project = await getOnboardingProjectByIdOrZohoId(projectId)
    if (!project) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })

    const now = Date.now()
    const cached = cache.get(project.id)
    if (cached && cached.expiresAt > now) {
      return NextResponse.json({ ...cached.result, cached: true })
    }
    if (cached) cache.delete(project.id)

    const result = await fetchOnboardingAppointmentsWithMeta({
      from: projectStartDate(project.start_date),
      hotelName: hotelSearchName(project.hotel_name),
      projectId: project.zoho_project_id ?? project.id,
      includeOwnerMeetings: true,
    })
    cache.set(project.id, { expiresAt: Date.now() + CACHE_TTL_MS, result })
    return NextResponse.json({ ...result, cached: false })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[acuity/onboarding-appointments] GET error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
