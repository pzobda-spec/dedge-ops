export type SupportLevel = 'urgent' | 'high' | 'medium' | 'low'
export type UrgencyState = 'probable' | 'confirmed' | 'non_urgent' | 'to_qualify'
export type FirstResponseStatus = 'within_target' | 'overdue' | 'pending' | 'no_data'

export interface UrgentMotif {
  code: string
  label: string
  confidence: number
  patterns: string[]
}

export interface UrgencyRulesetConfig {
  sla_business_minutes: Record<SupportLevel, number>
  generalized_bug_hotel_threshold: number
  urgent_motifs: UrgentMotif[]
  writes: {
    zoho: boolean
    linear: boolean
    slack: boolean
  }
}

export interface UrgencyRuleset {
  version: string
  mode: 'shadow' | 'active'
  config: UrgencyRulesetConfig
}

export interface ExistingAssessment {
  state: UrgencyState
  recommended_level: SupportLevel | null
  effective_sla_level: SupportLevel | null
  reason_code: string | null
  reason_text: string | null
  confidence: number | null
}

export interface ClassificationInput {
  subject: string
  description?: string | null
  zohoPriority?: string | null
  detectedHotelCount?: number | null
  existing?: ExistingAssessment | null
}

export interface ClassificationResult {
  state: UrgencyState
  recommendedLevel: SupportLevel | null
  effectiveSlaLevel: SupportLevel
  reasonCode: string
  reasonText: string
  confidence: number | null
  detectedHotelCount: number | null
  generalizedBugCandidate: boolean
  preservedByNonDowngrade: boolean
}

export interface BusinessHoursInterval {
  start: string
  end: string
}

export type BusinessWeek = Record<
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday',
  BusinessHoursInterval[]
>

export interface BusinessHoursConfig {
  id: string
  name: string
  timezone: string
  weeklySchedule: BusinessWeek
  holidays: string[]
  source: string
  syncedAt: string | null
}
