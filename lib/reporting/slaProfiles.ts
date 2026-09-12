export type Priority = 'P1' | 'P2' | 'P3' | 'P4'
export type SlaProfileName = 'crm' | 'groupe'

export const SLA_TARGET_PERCENT = 90
export const MAX_RESOLUTION_DAYS = 90
export const ACTIVE_SLA_PROFILE: SlaProfileName = 'crm'
export const PRIORITY_APPROXIMATION = {
  Urgent: 'P1', High: 'P2', Medium: 'P3', Low: 'P4',
} as const

// Dates à arbitrer. Tant qu’elles sont nulles, le palier actif (4 h) s’applique
// à toute la période et l’historique n’est pas présenté comme mesuré au seuil passé.
export const CRM_P1_FIRST_RESPONSE_PALIER = [
  { effective_from: null, hours: 2, label: 'Historique LoungeUp' },
  { effective_from: null, hours: 4, label: 'Palier actif aujourd’hui' },
  { effective_from: null, hours: 6, label: 'Cible d’alignement D-EDGE' },
] as const

export const SLA_PROFILES = {
  groupe: {
    first_response_hours: { P1: 24, P2: 48, P3: 72, P4: 120 },
    resolution_hours: { P1: 48, P2: 96, P3: 120, P4: null },
  },
  crm: {
    first_response_hours: { P1: 4, P2: 48, P3: 72, P4: 120 },
    resolution_hours: { P1: 48, P2: 96, P3: 120, P4: null },
  },
} as const

export function thresholdHours(kind: 'first_response' | 'resolution', priority: Priority, profile: SlaProfileName = ACTIVE_SLA_PROFILE): number | null {
  return SLA_PROFILES[profile][kind === 'first_response' ? 'first_response_hours' : 'resolution_hours'][priority]
}

export const thresholdLabel = (hours: number | null): string => hours === null ? 'best effort' : hours >= 24 ? `${hours / 24}j` : `${hours}h`
