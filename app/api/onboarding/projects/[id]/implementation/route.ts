import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { logProjectEvent } from '@/lib/onboarding/events'
import { getOnboardingProjectByIdOrZohoId } from '@/lib/onboarding/projects'
import {
  implementationDurationWeeks,
  isCommercialPlan,
  isImplementationPhase,
  isResourceStatus,
  resourceTemplates,
} from '@/lib/onboarding/workspace'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const PROJECT_FIELDS = [
  'commercial_plan', 'enabled_options', 'implementation_phase',
  'documents_received', 'documents_received_at', 'document_reservation',
  'resources_validated_at', 'implementation_started_at', 'implementation_target_date',
  'next_action', 'next_action_due', 'next_action_owner', 'current_blocker',
  'current_iteration', 'max_iterations', 'csm_name',
].join(',')

interface CockpitWorkspaceRow {
  commercial_plan: string | null
  enabled_options: Record<string, boolean> | null
  implementation_phase: string
  documents_received: boolean
  documents_received_at: string | null
  document_reservation: string | null
  resources_validated_at: string | null
  implementation_started_at: string | null
  implementation_target_date: string | null
  next_action: string | null
  next_action_due: string | null
  next_action_owner: string | null
  current_blocker: string | null
  current_iteration: number
  max_iterations: number
  csm_name: string | null
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

async function loadCockpit(projectId: string) {
  const { data: rawWorkspace, error } = await supabaseAdmin
    .from('onboarding_projects').select(PROJECT_FIELDS).eq('id', projectId).single()
  if (error) throw error
  const workspace = rawWorkspace as unknown as CockpitWorkspaceRow

  const plan = isCommercialPlan(workspace.commercial_plan) ? workspace.commercial_plan : null
  const options = (workspace.enabled_options ?? {}) as Record<string, boolean>
  const templates = resourceTemplates(plan, options)
  if (templates.length > 0) {
    const { error: seedError } = await supabaseAdmin.from('project_resource_requirements').upsert(
      templates.map(template => ({
        project_id: projectId,
        resource_key: template.key,
        label: template.label,
        category: template.category,
        required: template.required,
      })),
      { onConflict: 'project_id,resource_key' },
    )
    if (seedError) throw seedError
  }

  const activeKeys = new Set(templates.map(template => template.key))
  const [resourceResult, productResult, milestoneResult] = await Promise.all([
    supabaseAdmin.from('project_resource_requirements')
      .select('id,resource_key,label,category,required,status,note,received_at,validated_at,updated_by,updated_at')
      .eq('project_id', projectId).order('category').order('label'),
    supabaseAdmin.from('project_product_updates')
      .select('product_key,status,comment,owner_email,target_date,started_at,completed_at,updated_by,updated_at')
      .eq('project_id', projectId).order('product_key'),
    supabaseAdmin.from('project_implementation_milestones')
      .select('milestone_key,label,planned_date,actual_date,status,updated_at')
      .eq('project_id', projectId).order('planned_date'),
  ])
  if (resourceResult.error) throw resourceResult.error
  if (productResult.error) throw productResult.error
  if (milestoneResult.error) throw milestoneResult.error

  const resources = (resourceResult.data ?? []).filter(row => activeKeys.has(row.resource_key))
  const required = resources.filter(row => row.required)
  const ready = required.filter(row => row.status === 'received' || row.status === 'validated').length
  return {
    workspace,
    resources,
    products: productResult.data ?? [],
    milestones: milestoneResult.data ?? [],
    readiness: { ready, total: required.length, complete: required.length > 0 && ready === required.length },
    duration_weeks: implementationDurationWeeks(plan),
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireRole(req, ['admin', 'onboarder', 'support', 'commercial_readonly'])
    const project = await getOnboardingProjectByIdOrZohoId(params.id)
    if (!project) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
    return NextResponse.json(await loadCockpit(project.id))
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole(req, ['admin', 'onboarder'])
    const project = await getOnboardingProjectByIdOrZohoId(params.id)
    if (!project) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const action = typeof body.action === 'string' ? body.action : ''

    if (action === 'resource') {
      const key = typeof body.resource_key === 'string' ? body.resource_key : ''
      if (!key || !isResourceStatus(body.status)) return NextResponse.json({ error: 'Ressource ou statut invalide' }, { status: 400 })
      const now = new Date().toISOString()
      const status = body.status
      const patch = {
        status,
        note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
        received_at: status === 'received' || status === 'validated' ? now : null,
        validated_at: status === 'validated' ? now : null,
        updated_by: user.email,
        updated_at: now,
      }
      const { data, error } = await supabaseAdmin.from('project_resource_requirements')
        .update(patch).eq('project_id', project.id).eq('resource_key', key).select('label').single()
      if (error) throw error
      await logProjectEvent({ project_id: project.id, event_type: 'resource_updated', event_label: `${data.label} · ${status}`, actor_email: user.email, metadata: { resource_key: key, ...patch } })
    } else if (action === 'documents') {
      const cockpit = await loadCockpit(project.id)
      const received = body.documents_received === true
      const now = new Date()
      const plan = isCommercialPlan(cockpit.workspace.commercial_plan) ? cockpit.workspace.commercial_plan : null
      const targetDate = dateOnly(addDays(now, implementationDurationWeeks(plan) * 7))
      const documentReservation = typeof body.document_reservation === 'string' && body.document_reservation.trim() ? body.document_reservation.trim() : null
      const projectUpdate = received ? {
        documents_received: true, documents_received_at: now.toISOString(), document_reservation: documentReservation,
        resources_validated_at: cockpit.workspace.resources_validated_at ?? now.toISOString(),
        implementation_phase: cockpit.workspace.implementation_phase === 'waiting_resources' ? 'ready_to_start' : cockpit.workspace.implementation_phase,
        implementation_target_date: cockpit.workspace.implementation_target_date ?? targetDate,
        next_action: cockpit.workspace.next_action ?? 'Planifier l’appel de lancement',
        next_action_owner: cockpit.workspace.next_action_owner ?? cockpit.workspace.csm_name,
        updated_at: now.toISOString(),
      } : {
        documents_received: false, documents_received_at: null, document_reservation: documentReservation,
        implementation_phase: cockpit.workspace.implementation_started_at ? cockpit.workspace.implementation_phase : 'waiting_resources',
        resources_validated_at: cockpit.workspace.implementation_started_at ? cockpit.workspace.resources_validated_at : null,
        implementation_target_date: cockpit.workspace.implementation_started_at ? cockpit.workspace.implementation_target_date : null,
        updated_at: now.toISOString(),
      }
      const { error } = await supabaseAdmin.from('onboarding_projects').update(projectUpdate).eq('id', project.id)
      if (error) throw error
      if (received) {
        const { error: milestoneError } = await supabaseAdmin.from('project_implementation_milestones').upsert([
          { project_id: project.id, milestone_key: 'resources_validated', label: 'Documents reçus', planned_date: dateOnly(now), actual_date: dateOnly(now), status: 'completed', updated_by: user.email },
          { project_id: project.id, milestone_key: 'kickoff', label: 'Appel de lancement', planned_date: dateOnly(addDays(now, 2)), status: 'planned', updated_by: user.email },
          { project_id: project.id, milestone_key: 'go_live', label: 'Go live', planned_date: cockpit.workspace.implementation_target_date ?? targetDate, status: 'planned', updated_by: user.email },
        ], { onConflict: 'project_id,milestone_key' })
        if (milestoneError) throw milestoneError
        await logProjectEvent({ project_id: project.id, event_type: 'resources_validated', event_label: 'Documents reçus', actor_email: user.email, metadata: { document_reservation: documentReservation } })
      }
    } else if (action === 'start_implementation') {
      const { data: workspace, error: readError } = await supabaseAdmin.from('onboarding_projects')
        .select('resources_validated_at').eq('id', project.id).single()
      if (readError) throw readError
      if (!workspace.resources_validated_at) return NextResponse.json({ error: 'Cochez d’abord « Documents reçus ».' }, { status: 409 })
      const now = new Date().toISOString()
      const { error } = await supabaseAdmin.from('onboarding_projects').update({
        implementation_phase: 'kickoff', implementation_started_at: now,
        next_action: 'Réaliser l’appel de lancement', updated_at: now,
      }).eq('id', project.id)
      if (error) throw error
      await logProjectEvent({ project_id: project.id, event_type: 'implementation_started', actor_email: user.email })
    } else if (action === 'phase') {
      if (!isImplementationPhase(body.phase)) return NextResponse.json({ error: 'Phase invalide' }, { status: 400 })
      const now = new Date().toISOString()
      const { error } = await supabaseAdmin.from('onboarding_projects').update({ implementation_phase: body.phase, updated_at: now }).eq('id', project.id)
      if (error) throw error
      await logProjectEvent({ project_id: project.id, event_type: 'phase_changed', actor_email: user.email, metadata: { phase: body.phase } })
    } else if (action === 'pilotage') {
      const update = {
        next_action: typeof body.next_action === 'string' && body.next_action.trim() ? body.next_action.trim() : null,
        next_action_due: typeof body.next_action_due === 'string' && body.next_action_due ? body.next_action_due : null,
        next_action_owner: typeof body.next_action_owner === 'string' && body.next_action_owner.trim() ? body.next_action_owner.trim() : null,
        current_blocker: typeof body.current_blocker === 'string' && body.current_blocker.trim() ? body.current_blocker.trim() : null,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabaseAdmin.from('onboarding_projects').update(update).eq('id', project.id)
      if (error) throw error
      await logProjectEvent({ project_id: project.id, event_type: 'note_added', event_label: 'Pilotage du projet mis à jour', actor_email: user.email, metadata: update })
    } else {
      return NextResponse.json({ error: 'Action invalide' }, { status: 400 })
    }

    return NextResponse.json(await loadCockpit(project.id))
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
