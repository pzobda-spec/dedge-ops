import { supabaseAdmin } from '@/lib/supabase/server'
import { fetchAllZohoProjects, type OnboardingProject } from '@/lib/zoho/projectsClient'
import type { ProjectEventType } from './events'

export interface OnboardingProjectsSyncResult {
  synced: number
  created: number
  updated: number
  status_changes: number
  events_created: number
}

interface ExistingOnboardingProject {
  id: string
  zoho_project_id: string | null
  zoho_status: string | null
}

interface OnboardingEventInsert {
  project_id: string
  event_type: ProjectEventType
  event_label: string
  actor_email: string | null
  metadata: Record<string, unknown>
  occurred_at: string
}

const EVENT_LOOKUP_BATCH_SIZE = 100

/**
 * Zoho exposes the go-live as a calendar date, without a time or timezone.
 * Store it at noon UTC so formatting it in the app does not accidentally move
 * it to the previous day for the timezones used by the onboarding team.
 */
function goLiveOccurredAt(actualGoLiveDate: string | null, fallback: string): string {
  if (!actualGoLiveDate || !/^\d{4}-\d{2}-\d{2}$/.test(actualGoLiveDate)) return fallback

  const parsed = new Date(`${actualGoLiveDate}T12:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== actualGoLiveDate) {
    return fallback
  }

  return parsed.toISOString()
}

function legacyStatusFromZoho(status: OnboardingProject['status']): string {
  switch (status) {
    case 'not_started':
      return 'kickoff'
    case 'in_progress':
      return 'build'
    case 'pending_client':
      return 'client_review'
    case 'live':
      return 'live'
    case 'blocked':
      return 'blocked'
    case 'standby':
      return 'ready'
    case 'other':
    default:
      return 'ready'
  }
}

function clientIdForProject(project: OnboardingProject): string {
  return `zoho-project-${project.id}`
}

async function hasRecentStatusTransition(params: {
  projectId: string
  eventType: ProjectEventType
  from: string | null
  to: string
}): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabaseAdmin
    .from('onboarding_events')
    .select('metadata')
    .eq('project_id', params.projectId)
    .eq('event_type', params.eventType)
    .gte('occurred_at', since)

  if (error) throw new Error(error.message)

  return (data ?? []).some(row => {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>
    return metadata.from === params.from && metadata.to === params.to
  })
}

async function getProjectIdsWithEvent(
  projectIds: string[],
  eventType: ProjectEventType,
): Promise<Set<string>> {
  const result = new Set<string>()

  for (let index = 0; index < projectIds.length; index += EVENT_LOOKUP_BATCH_SIZE) {
    const batch = projectIds.slice(index, index + EVENT_LOOKUP_BATCH_SIZE)
    const { data, error } = await supabaseAdmin
      .from('onboarding_events')
      .select('project_id')
      .eq('event_type', eventType)
      .in('project_id', batch)

    if (error) throw new Error(error.message)
    for (const row of data ?? []) result.add(row.project_id as string)
  }

  return result
}

export async function syncOnboardingProjects(options?: {
  projectId?: string
  actorEmail?: string | null
}): Promise<OnboardingProjectsSyncResult> {
  let requestedZohoProjectId = options?.projectId

  if (options?.projectId) {
    const { data: existingById, error: existingByIdError } = await supabaseAdmin
      .from('onboarding_projects')
      .select('zoho_project_id')
      .eq('id', options.projectId)
      .maybeSingle()

    if (existingByIdError) throw new Error(existingByIdError.message)
    requestedZohoProjectId = existingById?.zoho_project_id ?? options.projectId
  }

  const allProjects = await fetchAllZohoProjects()
  const projects = requestedZohoProjectId
    ? allProjects.filter(project => project.id === requestedZohoProjectId)
    : allProjects

  if (projects.length === 0) {
    return { synced: 0, created: 0, updated: 0, status_changes: 0, events_created: 0 }
  }

  const zohoIds = projects.map(project => project.id)
  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from('onboarding_projects')
    .select('id, zoho_project_id, zoho_status')
    .in('zoho_project_id', zohoIds)

  if (existingError) throw new Error(existingError.message)

  const existingByZohoId = new Map<string, ExistingOnboardingProject>()
  for (const row of (existingRows ?? []) as ExistingOnboardingProject[]) {
    if (row.zoho_project_id) existingByZohoId.set(row.zoho_project_id, row)
  }

  const now = new Date().toISOString()

  const clientRows = projects.map(project => ({
    id: clientIdForProject(project),
    name: project.hotelName || project.name,
    segment: 'Bronze',
    country: '',
    language: 'FR',
    products: project.product ? [project.product] : [],
    updated_at: now,
  }))

  const { error: clientsError } = await supabaseAdmin
    .from('clients')
    .upsert(clientRows, { onConflict: 'id' })

  if (clientsError) throw new Error(clientsError.message)

  const projectRows = projects.map(project => ({
    id: existingByZohoId.get(project.id)?.id ?? project.id,
    client_id: clientIdForProject(project),
    zoho_project_id: project.id,
    zoho_status: project.status,
    hotel_name: project.hotelName,
    product: project.product || null,
    owner: project.ownerShort || project.ownerName || '',
    owner_email: project.ownerEmail,
    status: legacyStatusFromZoho(project.status),
    start_date: project.startDate,
    target_go_live: project.endDate,
    actual_go_live: project.actualGoLiveDate,
    blockers: project.isBlocked ? 'Projet marque bloque dans Zoho Projects' : null,
    last_synced_at: now,
    updated_at: now,
  }))

  const { data: insertedRows, error: insertError } = await supabaseAdmin
    .from('onboarding_projects')
    .upsert(projectRows, { onConflict: 'zoho_project_id', ignoreDuplicates: true })
    .select('id, zoho_project_id')

  if (insertError) throw new Error(insertError.message)

  const insertedByZohoId = new Map<string, ExistingOnboardingProject>()
  for (const row of (insertedRows ?? []) as ExistingOnboardingProject[]) {
    if (row.zoho_project_id) insertedByZohoId.set(row.zoho_project_id, row)
  }

  const { error: upsertError } = await supabaseAdmin
    .from('onboarding_projects')
    .upsert(projectRows, { onConflict: 'zoho_project_id' })

  if (upsertError) throw new Error(upsertError.message)

  const createdProjects = projects.filter(project => insertedByZohoId.has(project.id))
  const statusChangedProjects = projects.filter(project => {
    const existing = existingByZohoId.get(project.id)
    return existing && existing.zoho_status !== project.status
  })
  const blockedProjects = statusChangedProjects.filter(project => project.status === 'blocked')
  const regularStatusChangedProjects = statusChangedProjects.filter(
    project => project.status !== 'live' && project.status !== 'blocked',
  )

  const eventRows: OnboardingEventInsert[] = [
    ...createdProjects.map(project => ({
      project_id: insertedByZohoId.get(project.id)?.id ?? project.id,
      event_type: 'project_created' as const,
      event_label: 'Projet créé',
      actor_email: 'system',
      metadata: {
        zoho_project_id: project.id,
        hotel_name: project.name,
        zoho_status: project.status,
      },
      occurred_at: now,
    })),
  ]

  // Backfill the canonical go-live event for every synced Live project. This
  // covers both first imports and older rows created before go-live events were
  // generated, while keeping subsequent syncs idempotent.
  const liveProjects = projects.filter(project => project.status === 'live')
  const liveProjectIds = liveProjects.map(
    project => existingByZohoId.get(project.id)?.id ?? insertedByZohoId.get(project.id)?.id ?? project.id,
  )
  const projectsWithGoLiveEvent = await getProjectIdsWithEvent(liveProjectIds, 'go_live')

  for (const project of liveProjects) {
    const projectId = existingByZohoId.get(project.id)?.id ?? project.id
    if (projectsWithGoLiveEvent.has(projectId)) continue

    const from = existingByZohoId.get(project.id)?.zoho_status ?? null
    eventRows.push({
      project_id: projectId,
      event_type: 'go_live',
      event_label: 'Go-live',
      actor_email: 'system',
      metadata: { zoho_project_id: project.id, from, to: project.status },
      occurred_at: goLiveOccurredAt(project.actualGoLiveDate, now),
    })
  }

  for (const project of blockedProjects) {
    const projectId = existingByZohoId.get(project.id)?.id ?? project.id
    const from = existingByZohoId.get(project.id)?.zoho_status ?? null
    const duplicate = await hasRecentStatusTransition({ projectId, eventType: 'project_blocked', from, to: project.status })
    if (!duplicate) {
      eventRows.push({
        project_id: projectId,
        event_type: 'project_blocked',
        event_label: 'Projet bloqué',
        actor_email: 'system',
        metadata: { zoho_project_id: project.id, from, to: project.status },
        occurred_at: now,
      })
    }
  }

  for (const project of regularStatusChangedProjects) {
    const projectId = existingByZohoId.get(project.id)?.id ?? project.id
    const from = existingByZohoId.get(project.id)?.zoho_status ?? null
    const duplicate = await hasRecentStatusTransition({ projectId, eventType: 'status_changed', from, to: project.status })
    if (!duplicate) {
      eventRows.push({
        project_id: projectId,
        event_type: 'status_changed',
        event_label: 'Statut mis à jour',
        actor_email: 'system',
        metadata: { zoho_project_id: project.id, from, to: project.status },
        occurred_at: now,
      })
    }
  }

  if (eventRows.length > 0) {
    const { error: eventsError } = await supabaseAdmin
      .from('onboarding_events')
      .insert(eventRows)

    if (eventsError) throw new Error(eventsError.message)
  }

  return {
    synced: projects.length,
    created: createdProjects.length,
    updated: projects.length - createdProjects.length,
    status_changes: statusChangedProjects.length,
    events_created: eventRows.length,
  }
}
