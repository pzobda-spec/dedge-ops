import { supabaseAdmin } from '@/lib/supabase/server'
import type { BusinessHoursConfig, BusinessWeek, UrgencyRuleset, UrgencyRulesetConfig } from './types'

export const DEFAULT_RULESET: UrgencyRuleset = {
  version: '3.1',
  mode: 'shadow',
  config: {
    sla_business_minutes: { urgent: 360, high: 1440, medium: 1440, low: 2880 },
    generalized_bug_hotel_threshold: 3,
    urgent_motifs: [
      {
        code: 'production_down',
        label: 'Production indisponible',
        confidence: 0.98,
        patterns: [
          '\\bprod(?:uction)?\\s+(?:est\\s+)?(?:down|ko|indisponible|hors service)\\b',
          '\\b(?:site|plateforme|service)\\s+(?:est\\s+)?(?:down|ko|indisponible)\\b',
        ],
      },
      {
        code: 'login_impossible',
        label: 'Connexion impossible',
        confidence: 0.95,
        patterns: [
          '\\b(?:connexion|login|authentification)\\s+(?:est\\s+)?impossible\\b',
          '\\b(?:impossible|n’arrive pas|n\'arrive pas)\\s+(?:de|à)\\s+(?:se )?connecter\\b',
        ],
      },
      {
        code: 'one_way_down',
        label: 'Flux 1WAY indisponible',
        confidence: 0.96,
        patterns: [
          '\\b1\\s*[- ]?way\\b.{0,30}\\b(?:ko|down|bloqué|indisponible|ne (?:marche|fonctionne) plus)\\b',
          '\\b(?:ko|down|bloqué|indisponible)\\b.{0,30}\\b1\\s*[- ]?way\\b',
        ],
      },
      {
        code: 'two_way_down',
        label: 'Flux 2WAY indisponible',
        confidence: 0.96,
        patterns: [
          '\\b2\\s*[- ]?way\\b.{0,30}\\b(?:ko|down|bloqué|indisponible|ne (?:marche|fonctionne) plus)\\b',
          '\\b(?:ko|down|bloqué|indisponible)\\b.{0,30}\\b2\\s*[- ]?way\\b',
        ],
      },
      {
        code: 'phishing_suspected',
        label: 'Suspicion de phishing',
        confidence: 0.94,
        patterns: [
          '\\b(?:phishing|hameçonnage)\\b',
          '\\b(?:mail|email|message|lien)\\s+(?:suspect|frauduleux|malveillant)\\b',
        ],
      },
    ],
    writes: { zoho: false, linear: false, slack: false },
  },
}

const DEFAULT_WEEK: BusinessWeek = {
  monday: [{ start: '09:00', end: '18:00' }],
  tuesday: [{ start: '09:00', end: '18:00' }],
  wednesday: [{ start: '09:00', end: '18:00' }],
  thursday: [{ start: '09:00', end: '18:00' }],
  friday: [{ start: '09:00', end: '18:00' }],
  saturday: [],
  sunday: [],
}

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  id: '5861000000007117',
  name: 'Paris office',
  timezone: 'Europe/Paris',
  weeklySchedule: DEFAULT_WEEK,
  holidays: [],
  source: 'fallback_pending_zoho_sync',
  syncedAt: null,
}

export async function loadActiveRuleset(): Promise<UrgencyRuleset> {
  const { data, error } = await supabaseAdmin
    .from('support_urgency_rulesets')
    .select('version,mode,config')
    .eq('active', true)
    .maybeSingle()
  if (error || !data) return DEFAULT_RULESET
  return {
    version: data.version,
    mode: data.mode === 'active' ? 'active' : 'shadow',
    config: sanitizeRulesetConfig(data.config),
  }
}

export async function loadActiveBusinessHours(): Promise<BusinessHoursConfig> {
  const { data, error } = await supabaseAdmin
    .from('support_business_hours')
    .select('id,name,timezone,weekly_schedule,holidays,source,synced_at')
    .eq('active', true)
    .maybeSingle()
  if (error || !data) return DEFAULT_BUSINESS_HOURS
  return {
    id: data.id,
    name: data.name,
    timezone: data.timezone,
    weeklySchedule: data.weekly_schedule as BusinessWeek,
    holidays: Array.isArray(data.holidays) ? data.holidays.filter((item): item is string => typeof item === 'string') : [],
    source: data.source,
    syncedAt: data.synced_at,
  }
}

function sanitizeRulesetConfig(value: unknown): UrgencyRulesetConfig {
  if (!value || typeof value !== 'object') return DEFAULT_RULESET.config
  const candidate = value as Partial<UrgencyRulesetConfig>
  return {
    ...DEFAULT_RULESET.config,
    ...candidate,
    sla_business_minutes: {
      ...DEFAULT_RULESET.config.sla_business_minutes,
      ...(candidate.sla_business_minutes ?? {}),
    },
    writes: {
      zoho: false,
      linear: false,
      slack: false,
    },
    urgent_motifs: Array.isArray(candidate.urgent_motifs)
      ? candidate.urgent_motifs
      : DEFAULT_RULESET.config.urgent_motifs,
  }
}
