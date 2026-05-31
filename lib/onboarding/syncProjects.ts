import { supabaseAdmin } from '@/lib/supabase/server'
import { fetchAllZohoProjects, type OnboardingProject } from '@/lib/zoho/projectsClient'

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
    case 'other':
    default:
      return 'ready'
  }
}

function clientIdForProject(project: OnboardingProject): string {
  return `zoho-project-${project.id}`
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
    hotel_name: project.name,
    product: project.product || null,
    owner: project.ownerShort || project.ownerName || '',
    owner_email: project.ownerEmail,
    status: legacyStatusFromZoho(project.status),
    start_date: project.startDate,
    target_go_live: project.endDate,
    actual_go_live: project.status === 'live' ? project.endDate : null,
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
  const goLiveProjects = statusChangedProjects.filter(project => project.status === 'live')
  const blockedProjects = statusChangedProjects.filter(project => project.status === 'blocked')

  const eventRows = [
    ...createdProjects.map(project => ({
      project_id: insertedByZohoId.get(project.id)?.id ?? project.id,
      event_type: 'project_created',
      event_label: 'Projet créé',
      actor_email: 'system',
      metadata: {
        zoho_project_id: project.id,
        hotel_name: project.name,
        zoho_status: project.status,
      },
      occurred_at: now,
    })),
    ...goLiveProjects.map(project => ({
      project_id: existingByZohoId.get(project.id)?.id ?? project.id,
      event_type: 'go_live',
      event_label: 'Projet passé live',
      actor_email: 'system',
      metadata: {
        zoho_project_id: project.id,
        previous_status: existingByZohoId.get(project.id)?.zoho_status,
        new_status: project.status,
      },
      occurred_at: now,
    })),
    ...blockedProjects.map(project => ({
      project_id: existingByZohoId.get(project.id)?.id ?? project.id,
      event_type: 'project_blocked',
      event_label: 'Projet bloqué',
      actor_email: 'system',
      metadata: {
        zoho_project_id: project.id,
        previous_status: existingByZohoId.get(project.id)?.zoho_status,
        new_status: project.status,
      },
      occurred_at: now,
    })),
  ]

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
