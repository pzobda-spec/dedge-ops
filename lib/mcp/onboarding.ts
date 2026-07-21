import { createHash } from 'crypto'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/server'
import {
  enabledProductKeys,
  isCommercialPlan,
  PRODUCT_STATUSES,
  type ProjectProductKey,
} from '@/lib/onboarding/workspace'
import { createConfirmationToken, verifyConfirmationToken } from './confirmation'

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format YYYY-MM-DD')
const productKeySchema = z.enum(['campaigns', 'app', 'guest_profile', 'membership_lite', 'whatsapp', 'loyalty_program'])
const productStatusSchema = z.enum(PRODUCT_STATUSES)

export const decisionSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  product_key: productKeySchema.optional(),
  effective_until: dateSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const actionSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(2000).optional(),
  owner: z.string().trim().max(200).optional(),
  due_date: dateSchema.optional(),
  product_key: productKeySchema.optional(),
})

export const productUpdateSchema = z.object({
  product_key: productKeySchema,
  status: productStatusSchema,
  comment: z.string().trim().max(2000).optional(),
  owner_email: z.string().email().optional(),
  target_date: dateSchema.optional(),
  paused_until: dateSchema.optional(),
  pause_reason: z.string().trim().max(1000).optional(),
}).superRefine((value, context) => {
  if (value.status === 'on_hold' && !value.paused_until) {
    context.addIssue({ code: 'custom', path: ['paused_until'], message: 'Une date de reprise est requise pour une mise en pause.' })
  }
  if (value.status === 'on_hold' && !value.pause_reason) {
    context.addIssue({ code: 'custom', path: ['pause_reason'], message: 'La raison de la mise en pause est requise.' })
  }
})

export const calendarEventSchema = z.object({
  google_event_id: z.string().trim().min(1).max(500),
  calendar_id: z.string().trim().max(500).optional(),
  title: z.string().trim().min(1).max(500),
  starts_at: z.string().datetime({ offset: true }).optional(),
  ends_at: z.string().datetime({ offset: true }).optional(),
  html_link: z.string().url().optional(),
  attendees: z.array(z.string().email()).max(100).optional(),
})

export const meetingOutcomeSchema = z.object({
  summary: z.string().trim().min(1).max(4000),
  meeting_date: dateSchema,
  source_type: z.enum(['manual', 'google_calendar', 'gmail', 'slack', 'combined']).default('manual'),
  source_reference: z.string().trim().max(2000).optional(),
  decisions: z.array(decisionSchema).max(20).default([]),
  actions: z.array(actionSchema).max(20).default([]),
  product_updates: z.array(productUpdateSchema).max(10).default([]),
  calendar_event: calendarEventSchema.optional(),
})

export type MeetingOutcome = z.infer<typeof meetingOutcomeSchema>

interface ProjectCandidate {
  id: string
  zoho_project_id: string | null
  hotel_name: string | null
  owner: string | null
  owner_email: string | null
  zoho_status: string | null
  implementation_phase: string | null
  commercial_plan: string | null
  enabled_options: Record<string, boolean> | null
}

const PROJECT_SELECT = 'id,zoho_project_id,hotel_name,owner,owner_email,zoho_status,implementation_phase,commercial_plan,enabled_options'

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, character => `\\${character}`)
}

export async function searchMcpProjects(query: string, limit = 10): Promise<ProjectCandidate[]> {
  const normalized = query.trim()
  if (!normalized) return []
  const escaped = escapeLike(normalized)
  const { data, error } = await supabaseAdmin
    .from('onboarding_projects')
    .select(PROJECT_SELECT)
    .or(`hotel_name.ilike.%${escaped}%,zoho_project_id.eq.${escaped},owner.ilike.%${escaped}%`)
    .limit(Math.min(Math.max(limit, 1), 20))
  if (error) throw new Error(error.message)
  return (data ?? []) as ProjectCandidate[]
}

export async function resolveMcpProject(reference: string): Promise<ProjectCandidate> {
  const normalized = reference.trim()
  const { data: directById, error: idError } = await supabaseAdmin
    .from('onboarding_projects')
    .select(PROJECT_SELECT)
    .eq('id', normalized)
    .maybeSingle()
  if (idError) throw new Error(idError.message)
  if (directById) return directById as ProjectCandidate

  const { data: directByZohoId, error: zohoIdError } = await supabaseAdmin
    .from('onboarding_projects')
    .select(PROJECT_SELECT)
    .eq('zoho_project_id', normalized)
    .maybeSingle()
  if (zohoIdError) throw new Error(zohoIdError.message)
  if (directByZohoId) return directByZohoId as ProjectCandidate

  const candidates = await searchMcpProjects(normalized, 10)
  const exact = candidates.filter(project => project.hotel_name?.localeCompare(normalized, 'fr', { sensitivity: 'base' }) === 0)
  if (exact.length === 1) return exact[0]
  if (candidates.length === 1) return candidates[0]
  if (candidates.length === 0) throw new Error(`Aucun projet ne correspond à « ${normalized} ».`)
  throw new Error(`Projet ambigu. Précisez l’un de ces identifiants : ${candidates.map(project => `${project.hotel_name ?? 'Sans nom'} (${project.id})`).join(', ')}`)
}

export async function getMcpProjectContext(reference: string) {
  const project = await resolveMcpProject(reference)
  const [products, decisions, actions, events, calendarEvents] = await Promise.all([
    supabaseAdmin.from('project_product_updates')
      .select('product_key,status,comment,owner_email,target_date,paused_until,pause_reason,updated_by,updated_at')
      .eq('project_id', project.id).order('product_key'),
    supabaseAdmin.from('project_decisions')
      .select('id,summary,decision_date,product_key,effective_until,source_type,source_reference,actor_email,created_at')
      .eq('project_id', project.id).order('decision_date', { ascending: false }).limit(20),
    supabaseAdmin.from('project_actions')
      .select('id,title,description,status,owner,due_date,product_key,created_by,completed_at,created_at,updated_at')
      .eq('project_id', project.id).order('status').order('due_date', { ascending: true, nullsFirst: false }).limit(50),
    supabaseAdmin.from('onboarding_events')
      .select('id,event_type,event_label,actor_email,metadata,occurred_at')
      .eq('project_id', project.id).order('occurred_at', { ascending: false }).limit(30),
    supabaseAdmin.from('project_calendar_events')
      .select('google_event_id,calendar_id,title,starts_at,ends_at,html_link,attendees,linked_by,updated_at')
      .eq('project_id', project.id).order('starts_at', { ascending: false }).limit(20),
  ])
  const failed = [products, decisions, actions, events, calendarEvents].find(result => result.error)
  if (failed?.error) throw new Error(failed.error.message)
  return {
    project,
    products: products.data ?? [],
    decisions: decisions.data ?? [],
    actions: actions.data ?? [],
    timeline: events.data ?? [],
    calendar_events: calendarEvents.data ?? [],
  }
}

function validateEnabledProducts(project: ProjectCandidate, outcome: MeetingOutcome): void {
  const plan = isCommercialPlan(project.commercial_plan) ? project.commercial_plan : null
  const enabled = new Set(enabledProductKeys(plan, project.enabled_options ?? {}))
  const referenced = new Set<ProjectProductKey>()
  outcome.product_updates.forEach(update => referenced.add(update.product_key))
  outcome.decisions.forEach(decision => { if (decision.product_key) referenced.add(decision.product_key) })
  outcome.actions.forEach(action => { if (action.product_key) referenced.add(action.product_key) })
  const invalid = [...referenced].filter(product => !enabled.has(product))
  if (invalid.length > 0) throw new Error(`Produit non activé sur ce projet : ${invalid.join(', ')}.`)
}

function normalizedPayload(project: ProjectCandidate, outcome: MeetingOutcome) {
  return { project_id: project.id, project_name: project.hotel_name, ...outcome }
}

export async function previewMeetingOutcome(reference: string, rawOutcome: unknown, actorEmail: string) {
  const project = await resolveMcpProject(reference)
  const outcome = meetingOutcomeSchema.parse(rawOutcome)
  validateEnabledProducts(project, outcome)
  const payload = normalizedPayload(project, outcome)
  return {
    preview: payload,
    confirmation_token: createConfirmationToken(actorEmail, payload),
    expires_in_minutes: 15,
    warning: 'Aucune donnée n’a encore été modifiée. Appelez record_meeting_outcome avec ce contenu exact et le jeton de confirmation.',
  }
}

export async function applyMeetingOutcome(
  projectId: string,
  rawOutcome: unknown,
  confirmationToken: string,
  actorEmail: string,
) {
  const project = await resolveMcpProject(projectId)
  const outcome = meetingOutcomeSchema.parse(rawOutcome)
  validateEnabledProducts(project, outcome)
  const payload = normalizedPayload(project, outcome)
  if (!verifyConfirmationToken(actorEmail, payload, confirmationToken)) {
    throw new Error('Confirmation absente, expirée ou différente de la prévisualisation. Relancez preview_meeting_outcome.')
  }

  const idempotencyKey = createHash('sha256')
    .update(`${actorEmail}\n${confirmationToken}`)
    .digest('hex')
  const { data, error } = await supabaseAdmin.rpc('record_mcp_meeting_outcome', {
    p_project_id: project.id,
    p_summary: outcome.summary,
    p_meeting_date: outcome.meeting_date,
    p_actor_email: actorEmail,
    p_source_type: outcome.source_type,
    p_source_reference: outcome.source_reference ?? null,
    p_idempotency_key: idempotencyKey,
    p_decisions: outcome.decisions,
    p_actions: outcome.actions,
    p_product_updates: outcome.product_updates,
    p_calendar_event: outcome.calendar_event ?? null,
  })
  if (error) throw new Error(error.message)
  return { project: { id: project.id, hotel_name: project.hotel_name }, result: data }
}
