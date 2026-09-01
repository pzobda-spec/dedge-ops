import type { FirstResponseStatus, SupportLevel, UrgencyState } from './urgency/types'
import type { FalsePositiveMetrics, SlaLevelBucket } from './urgency/metrics'

export interface SupportCockpitTicket {
  ticket_id: string
  zoho_ticket_number: string | null
  ticket_created_at: string | null
  subject: string | null
  ticket_status: string | null
  client_name: string | null
  zoho_priority: string | null
  linear_priority_label: string | null
  state: UrgencyState
  effective_sla_level: SupportLevel | null
  reason_text: string | null
  confidence: number | null
  first_response_due_at: string | null
  first_response_status: FirstResponseStatus
  updated_at: string
}

export interface SupportCockpitResponse {
  mode: 'shadow'
  commitments: Record<SupportLevel, string> & { calendar: string }
  overdue_count: number
  first_response_within_target_pct: number | null
  by_level: SlaLevelBucket[]
  by_state: Array<{ state: UrgencyState; count: number }>
  false_positives: FalsePositiveMetrics
  tickets: SupportCockpitTicket[]
  external_writes: { zoho: false; linear: false; slack: false }
}
