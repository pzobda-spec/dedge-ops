import { randomUUID } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase/server'
import { fetchTicket, fetchTickets, type ZohoTicket } from '@/lib/zoho/client'
import { ZOHO_SUPPORT_DEPARTMENT_ID, ZOHO_TICKET_PAGE_SIZE } from '@/lib/zoho/constants'
import { addBusinessMinutes, firstResponseStatus } from './urgency/businessHours'
import { classifyUrgency } from './urgency/classifier'
import { loadActiveBusinessHours, loadActiveRuleset } from './urgency/config'
import { syncBusinessHoursFromZoho } from './urgency/syncBusinessHours'
import type { ExistingAssessment } from './urgency/types'
import {
  claimShadowJobs,
  completeShadowJob,
  enqueueReconciliationTicket,
  failShadowJob,
  type ShadowJob,
} from './shadowQueue'

const MAX_RECONCILIATION_TICKETS = 500
const INITIAL_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1_000
const OVERLAP_MS = 30 * 60 * 1_000

interface AssessmentRow extends ExistingAssessment {
  source?: string | null
}

interface AnalyticsMetricRow {
  first_response_at: string | null
  first_response_time_ms: number | null
}

export interface ShadowWorkerResult {
  mode: 'shadow'
  reconciled: number
  claimed: number
  completed: number
  failed: number
  business_hours_synced: boolean
  external_writes: { zoho: false; linear: false; slack: false }
}

export async function runShadowWorker(options: { reconcile?: boolean; limit?: number } = {}): Promise<ShadowWorkerResult> {
  const businessHoursSync = await maybeSyncBusinessHours()
  const reconciled = options.reconcile === false ? 0 : await reconcileZohoTickets()
  const ruleset = await loadActiveRuleset()
  const businessHours = await loadActiveBusinessHours()
  const workerId = `shadow-${randomUUID()}`
  const jobs = await claimShadowJobs(workerId, options.limit ?? 40)
  let completed = 0
  let failed = 0

  for (const job of jobs) {
    try {
      await processJob(job, ruleset, businessHours)
      await completeShadowJob(job)
      completed += 1
    } catch (error) {
      await failShadowJob(job, error)
      failed += 1
    }
  }

  return {
    mode: 'shadow',
    reconciled,
    claimed: jobs.length,
    completed,
    failed,
    business_hours_synced: businessHoursSync,
    external_writes: { zoho: false, linear: false, slack: false },
  }
}

async function processJob(
  job: ShadowJob,
  ruleset: Awaited<ReturnType<typeof loadActiveRuleset>>,
  businessHours: Awaited<ReturnType<typeof loadActiveBusinessHours>>,
): Promise<void> {
  const ticket = await fetchTicket(job.ticket_id)
  const [{ data: existingData, error: existingError }, { data: metricData, error: metricError }] = await Promise.all([
    supabaseAdmin.from('ticket_urgency_assessments')
      .select('state,recommended_level,effective_sla_level,reason_code,reason_text,confidence,source')
      .eq('ticket_id', ticket.id)
      .maybeSingle(),
    supabaseAdmin.from('ticket_analytics')
      .select('first_response_at,first_response_time_ms')
      .eq('id', ticket.id)
      .maybeSingle(),
  ])
  if (existingError) throw new Error(`Assessment lookup failed: ${existingError.message}`)
  if (metricError) throw new Error(`First-response lookup failed: ${metricError.message}`)

  const existing = existingData as AssessmentRow | null
  const result = classifyUrgency({
    subject: ticket.subject,
    description: ticket.description,
    zohoPriority: ticket.priority,
    existing,
  }, ruleset)
  const targetMinutes = ruleset.config.sla_business_minutes[result.effectiveSlaLevel]
  const createdAt = new Date(ticket.createdTime)
  const dueAt = Number.isFinite(createdAt.getTime())
    ? addBusinessMinutes(createdAt, targetMinutes, businessHours)
    : null
  const metric = metricData as AnalyticsMetricRow | null
  const firstResponseAt = metric?.first_response_at ? new Date(metric.first_response_at) : null
  const responseStatus = firstResponseStatus({
    now: new Date(),
    dueAt,
    firstResponseAt: firstResponseAt && Number.isFinite(firstResponseAt.getTime()) ? firstResponseAt : null,
    firstResponseBusinessDurationMs: finiteNumber(metric?.first_response_time_ms),
    targetBusinessMinutes: targetMinutes,
  })
  const now = new Date().toISOString()
  const row = {
    ticket_id: ticket.id,
    zoho_ticket_number: ticket.ticketNumber,
    ticket_created_at: Number.isFinite(createdAt.getTime()) ? createdAt.toISOString() : null,
    zoho_priority: ticket.priority || null,
    state: result.state,
    recommended_level: result.recommendedLevel,
    effective_sla_level: result.effectiveSlaLevel,
    reason_code: result.reasonCode,
    reason_text: result.reasonText,
    confidence: result.confidence,
    ruleset_version: ruleset.version,
    detected_hotel_count: result.detectedHotelCount,
    generalized_bug_candidate: result.generalizedBugCandidate,
    first_response_due_at: dueAt?.toISOString() ?? null,
    sla_target_business_minutes: targetMinutes,
    first_response_status: responseStatus,
    source: existing?.state === 'confirmed' ? (existing.source ?? 'human') : 'automatic',
    last_auto_assessed_at: now,
    updated_at: now,
  }
  const { error: upsertError } = await supabaseAdmin
    .from('ticket_urgency_assessments')
    .upsert(row, { onConflict: 'ticket_id' })
  if (upsertError) throw new Error(`Assessment upsert failed: ${upsertError.message}`)

  const { error: eventError } = await supabaseAdmin.from('ticket_urgency_assessment_events').insert({
    ticket_id: ticket.id,
    event_kind: 'automatic_assessment',
    state: result.state,
    recommended_level: result.recommendedLevel,
    reason_code: result.reasonCode,
    reason_text: result.reasonText,
    confidence: result.confidence,
    ruleset_version: ruleset.version,
    metadata: {
      job_id: job.id,
      preserved_by_non_downgrade: result.preservedByNonDowngrade,
      generalized_bug_candidate: result.generalizedBugCandidate,
      external_writes: { zoho: false, linear: false, slack: false },
    },
  })
  if (eventError) throw new Error(`Assessment event insert failed: ${eventError.message}`)

}

async function maybeSyncBusinessHours(): Promise<boolean> {
  const { data } = await supabaseAdmin.from('support_business_hours')
    .select('synced_at')
    .eq('active', true)
    .maybeSingle()
  const syncedAt = Date.parse(data?.synced_at ?? '')
  if (Number.isFinite(syncedAt) && Date.now() - syncedAt < 24 * 60 * 60 * 1_000) return false
  return (await syncBusinessHoursFromZoho()).synced
}

async function reconcileZohoTickets(): Promise<number> {
  const { data: state } = await supabaseAdmin.from('support_shadow_sync_state')
    .select('value')
    .eq('key', 'zoho_reconciliation')
    .maybeSingle()
  const previous = state?.value && typeof state.value === 'object'
    ? Date.parse(String((state.value as Record<string, unknown>).last_successful_modified_time ?? ''))
    : Number.NaN
  const cutoff = Number.isFinite(previous)
    ? new Date(previous - OVERLAP_MS)
    : new Date(Date.now() - INITIAL_LOOKBACK_MS)
  const tickets = await fetchModifiedSince(cutoff)
  let enqueued = 0
  for (const ticket of tickets) {
    if (await enqueueReconciliationTicket({ ticketId: ticket.id, modifiedTime: ticket.modifiedTime })) enqueued += 1
  }
  const newest = tickets.reduce((latest, ticket) => {
    const time = Date.parse(ticket.modifiedTime)
    return Number.isFinite(time) && time > latest ? time : latest
  }, cutoff.getTime())
  await supabaseAdmin.from('support_shadow_sync_state').upsert({
    key: 'zoho_reconciliation',
    value: { last_successful_modified_time: new Date(newest).toISOString() },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })
  return enqueued
}

async function fetchModifiedSince(cutoff: Date): Promise<ZohoTicket[]> {
  const tickets: ZohoTicket[] = []
  for (let offset = 0; tickets.length < MAX_RECONCILIATION_TICKETS; offset += ZOHO_TICKET_PAGE_SIZE) {
    const response = await fetchTickets({
      limit: ZOHO_TICKET_PAGE_SIZE,
      from: offset,
      sortBy: '-modifiedTime',
      departmentId: ZOHO_SUPPORT_DEPARTMENT_ID,
    })
    const page = response.data ?? []
    let reachedCutoff = false
    for (const ticket of page) {
      const modified = Date.parse(ticket.modifiedTime)
      if (!Number.isFinite(modified) || modified < cutoff.getTime()) {
        reachedCutoff = true
        continue
      }
      tickets.push(ticket)
      if (tickets.length >= MAX_RECONCILIATION_TICKETS) break
    }
    if (reachedCutoff || page.length < ZOHO_TICKET_PAGE_SIZE) break
  }
  return tickets
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}
