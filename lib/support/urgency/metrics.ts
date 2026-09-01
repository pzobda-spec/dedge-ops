import { supabaseAdmin } from '@/lib/supabase/server'
import type { FirstResponseStatus, SupportLevel, UrgencyState } from './types'

export interface FalsePositiveMetrics {
  auto_probable_total: number
  validated_probable_total: number
  false_positive_count: number
  confirmed_positive_count: number
  pending_validation_count: number
  false_positive_rate_pct: number | null
}

export interface UrgencyMetricEvent {
  ticket_id: string
  event_kind: 'automatic_assessment' | 'human_validation'
  state: UrgencyState
}

export async function measureFalsePositives(): Promise<FalsePositiveMetrics> {
  const { data, error } = await supabaseAdmin
    .from('ticket_urgency_assessment_events')
    .select('ticket_id,event_kind,state,created_at')
    .in('event_kind', ['automatic_assessment', 'human_validation'])
    .order('created_at', { ascending: true })
    .limit(20_000)
  if (error) throw new Error(`False-positive measurement failed: ${error.message}`)

  return calculateFalsePositiveMetrics((data ?? []) as UrgencyMetricEvent[])
}

export function calculateFalsePositiveMetrics(events: UrgencyMetricEvent[]): FalsePositiveMetrics {
  const lastState = new Map<string, UrgencyState>()
  let autoProbable = 0
  let validated = 0
  let falsePositive = 0
  let confirmed = 0
  let pending = 0
  for (const event of events) {
    const state = event.state
    const previous = lastState.get(event.ticket_id)
    if (event.event_kind === 'automatic_assessment' && state === 'probable' && previous !== 'probable') {
      autoProbable += 1
      pending += 1
    }
    if (event.event_kind === 'human_validation' && previous === 'probable') {
      if (state === 'non_urgent') falsePositive += 1
      if (state === 'confirmed') confirmed += 1
      if (state === 'non_urgent' || state === 'confirmed') {
        validated += 1
        pending = Math.max(0, pending - 1)
      }
    }
    lastState.set(event.ticket_id, state)
  }
  return {
    auto_probable_total: autoProbable,
    validated_probable_total: validated,
    false_positive_count: falsePositive,
    confirmed_positive_count: confirmed,
    pending_validation_count: pending,
    false_positive_rate_pct: validated > 0 ? Math.round((falsePositive / validated) * 1_000) / 10 : null,
  }
}

export interface SlaLevelBucket {
  level: SupportLevel
  target_business_hours: number
  within_target: number
  outside_target: number
  no_data: number
}

export function buildSlaBuckets(rows: Array<{
  effective_sla_level: SupportLevel | null
  first_response_status: FirstResponseStatus
  first_response_due_at: string | null
}>, now = new Date()): SlaLevelBucket[] {
  const targets: Record<SupportLevel, number> = { urgent: 6, high: 24, medium: 24, low: 48 }
  const buckets = (Object.keys(targets) as SupportLevel[]).map(level => ({
    level,
    target_business_hours: targets[level],
    within_target: 0,
    outside_target: 0,
    no_data: 0,
  }))
  const byLevel = new Map(buckets.map(bucket => [bucket.level, bucket]))
  for (const row of rows) {
    if (!row.effective_sla_level) continue
    const bucket = byLevel.get(row.effective_sla_level)
    if (!bucket) continue
    const dynamicallyOverdue = row.first_response_status === 'pending'
      && row.first_response_due_at !== null
      && Date.parse(row.first_response_due_at) < now.getTime()
    if (row.first_response_status === 'within_target') bucket.within_target += 1
    else if (row.first_response_status === 'overdue' || dynamicallyOverdue) bucket.outside_target += 1
    else bucket.no_data += 1
  }
  return buckets
}
