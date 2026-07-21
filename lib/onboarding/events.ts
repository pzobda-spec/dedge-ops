import { supabaseAdmin } from '@/lib/supabase/server'
import { EVENT_TYPES } from './eventTypes'

export type ProjectEventType =
  | 'project_created'
  | 'status_changed'
  | 'email_launch_sent'
  | 'email_content_request_sent'
  | 'email_backoffice_sent'
  | 'email_followup_1_sent'
  | 'email_followup_2_sent'
  | 'first_contact_call'
  | 'kickoff_scheduled'
  | 'kickoff_completed'
  | 'implementation_scheduled'
  | 'implementation_completed'
  | 'recap_generated'
  | 'content_received'
  | 'resource_updated'
  | 'resources_validated'
  | 'implementation_started'
  | 'phase_changed'
  | 'v1_delivered'
  | 'v2_delivered'
  | 'go_live'
  | 'project_blocked'
  | 'meeting_decision'
  | 'note_added'

export interface ProjectEvent {
  id: string
  project_id: string
  event_type: ProjectEventType
  event_label: string
  actor_email: string | null
  metadata: Record<string, unknown>
  occurred_at: string
  created_at: string
}

export interface LogProjectEventInput {
  project_id: string
  event_type: ProjectEventType
  event_label?: string
  actor_email: string | null
  metadata?: Record<string, unknown>
  occurred_at?: Date
}

export async function logProjectEvent(input: LogProjectEventInput): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin
    .from('onboarding_events')
    .insert({
      project_id: input.project_id,
      event_type: input.event_type,
      event_label: input.event_label ?? EVENT_TYPES[input.event_type].label,
      actor_email: input.actor_email,
      metadata: input.metadata ?? {},
      occurred_at: input.occurred_at?.toISOString() ?? new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return { id: data.id as string }
}

export async function getProjectTimeline(project_id: string): Promise<ProjectEvent[]> {
  const { data, error } = await supabaseAdmin
    .from('onboarding_events')
    .select('id, project_id, event_type, event_label, actor_email, metadata, occurred_at, created_at')
    .eq('project_id', project_id)
    .order('occurred_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as ProjectEvent[]
}
