import { supabaseAdmin } from '@/lib/supabase/server'
import { eventTimeIso, type ZohoDeskWebhookEvent } from './zohoWebhook'

export interface ShadowJob {
  id: number
  webhook_event_id: number | null
  ticket_id: string
  payload: Record<string, unknown>
  attempt_count: number
}

export async function enqueueWebhookBatch(events: ZohoDeskWebhookEvent[]): Promise<{
  inserted: number
  queued: number
}> {
  const { data, error } = await supabaseAdmin.rpc('enqueue_support_webhook_batch', {
    p_events: events.map(event => ({
      event_type: event.eventType,
      ticket_id: event.ticketId,
      payload: event.payload,
      dedupe_key: event.dedupeKey,
      event_time: eventTimeIso(event.eventTime),
      org_id: event.orgId,
    })),
  })
  if (error) throw new Error(`Unable to enqueue Zoho webhook batch: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  return {
    inserted: Number(row?.inserted_count ?? 0),
    queued: Number(row?.queued_count ?? 0),
  }
}

export async function enqueueWebhookEvent(event: ZohoDeskWebhookEvent): Promise<boolean> {
  const { data: inserted, error } = await supabaseAdmin
    .from('webhook_events')
    .insert({
      event_type: event.eventType,
      ticket_id: event.ticketId,
      payload: event.payload,
      dedupe_key: event.dedupeKey,
      event_time: eventTimeIso(event.eventTime),
      org_id: event.orgId,
      jwt_verified: true,
      processing_status: event.ticketId ? 'queued' : 'completed',
      completed_at: event.ticketId ? null : new Date().toISOString(),
    })
    .select('id')
    .maybeSingle()

  if (error?.code === '23505') return false
  if (error) throw new Error(`Unable to persist Zoho webhook: ${error.message}`)
  if (!inserted || !event.ticketId) return true

  const { error: jobError } = await supabaseAdmin.from('support_shadow_jobs').insert({
    webhook_event_id: inserted.id,
    ticket_id: event.ticketId,
    payload: {
      source: 'zoho_webhook',
      eventType: event.eventType,
      eventTime: event.eventTime,
      payload: event.payload,
    },
  })
  if (jobError) {
    await supabaseAdmin.from('webhook_events').update({
      processing_status: 'failed',
      last_error: jobError.message.slice(0, 500),
    }).eq('id', inserted.id)
    throw new Error(`Unable to queue Zoho webhook: ${jobError.message}`)
  }
  return true
}

export async function enqueueReconciliationTicket(input: {
  ticketId: string
  modifiedTime: string
}): Promise<boolean> {
  const dedupeKey = `reconcile:${input.ticketId}:${input.modifiedTime}`
  const { data, error } = await supabaseAdmin
    .from('webhook_events')
    .insert({
      event_type: 'Ticket_Reconcile',
      ticket_id: input.ticketId,
      payload: input,
      dedupe_key: dedupeKey,
      event_time: input.modifiedTime,
      org_id: process.env.ZOHO_ORG_ID ?? null,
      jwt_verified: false,
      processing_status: 'queued',
    })
    .select('id')
    .maybeSingle()
  if (error?.code === '23505') return false
  if (error) throw new Error(`Unable to persist reconciliation event: ${error.message}`)
  if (!data) return false
  const { error: jobError } = await supabaseAdmin.from('support_shadow_jobs').insert({
    webhook_event_id: data.id,
    ticket_id: input.ticketId,
    payload: { source: 'reconciliation', modifiedTime: input.modifiedTime },
  })
  if (jobError) throw new Error(`Unable to queue reconciliation event: ${jobError.message}`)
  return true
}

export async function claimShadowJobs(workerId: string, limit = 20): Promise<ShadowJob[]> {
  const { data, error } = await supabaseAdmin.rpc('claim_support_shadow_jobs', {
    p_worker_id: workerId,
    p_limit: limit,
  })
  if (error) throw new Error(`Unable to claim shadow jobs: ${error.message}`)
  return (data ?? []) as ShadowJob[]
}

export async function completeShadowJob(job: ShadowJob): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabaseAdmin.from('support_shadow_jobs').update({
    status: 'completed',
    completed_at: now,
    locked_at: null,
    locked_by: null,
    last_error: null,
  }).eq('id', job.id)
  if (error) throw new Error(`Unable to complete shadow job: ${error.message}`)
  if (job.webhook_event_id) {
    await supabaseAdmin.from('webhook_events').update({
      processing_status: 'completed',
      completed_at: now,
      last_error: null,
      attempt_count: job.attempt_count,
    }).eq('id', job.webhook_event_id)
  }
}

export async function failShadowJob(job: ShadowJob, failure: unknown): Promise<void> {
  const message = (failure instanceof Error ? failure.message : String(failure)).slice(0, 500)
  const exhausted = job.attempt_count >= 5
  const delayMinutes = Math.min(60, 2 ** Math.max(0, job.attempt_count - 1))
  const { error } = await supabaseAdmin.from('support_shadow_jobs').update({
    status: exhausted ? 'failed' : 'queued',
    available_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
    locked_at: null,
    locked_by: null,
    last_error: message,
  }).eq('id', job.id)
  if (error) console.error('[shadow-queue] unable to record failure:', error.message)
  if (job.webhook_event_id) {
    await supabaseAdmin.from('webhook_events').update({
      processing_status: exhausted ? 'failed' : 'queued',
      last_error: message,
      attempt_count: job.attempt_count,
    }).eq('id', job.webhook_event_id)
  }
}
