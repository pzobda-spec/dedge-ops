import type {
  ClassificationInput,
  ClassificationResult,
  SupportLevel,
  UrgencyRuleset,
} from './types'

const PRIORITY_LEVELS: Record<string, SupportLevel> = {
  urgent: 'urgent',
  urgence: 'urgent',
  high: 'high',
  haute: 'high',
  medium: 'medium',
  moyenne: 'medium',
  low: 'low',
  basse: 'low',
}

export function classifyUrgency(input: ClassificationInput, ruleset: UrgencyRuleset): ClassificationResult {
  const text = normalizeText(`${input.subject}\n${input.description ?? ''}`)
  const detectedHotelCount = input.detectedHotelCount ?? detectHotelCount(text)
  const motif = ruleset.config.urgent_motifs.find(candidate =>
    candidate.patterns.some(pattern => safeRegexTest(pattern, text)),
  )

  if (motif) {
    const result: ClassificationResult = {
      state: 'probable',
      recommendedLevel: 'urgent',
      effectiveSlaLevel: 'urgent',
      reasonCode: motif.code,
      reasonText: motif.label,
      confidence: clampConfidence(motif.confidence),
      detectedHotelCount,
      generalizedBugCandidate: isGeneralizedBug(text, detectedHotelCount, ruleset),
      preservedByNonDowngrade: false,
    }
    return input.existing?.state === 'confirmed'
      ? preserveExisting(input.existing, result, detectedHotelCount)
      : result
  }

  if (input.existing?.state === 'confirmed' || input.existing?.state === 'probable') {
    return preserveExisting(input.existing, null, detectedHotelCount)
  }

  const zohoLevel = mapZohoPriority(input.zohoPriority)
  if (zohoLevel === 'urgent') {
    return {
      state: 'probable',
      recommendedLevel: 'urgent',
      effectiveSlaLevel: 'urgent',
      reasonCode: 'zoho_priority_urgent',
      reasonText: 'Priorité Zoho urgente à valider',
      confidence: 0.8,
      detectedHotelCount,
      generalizedBugCandidate: false,
      preservedByNonDowngrade: false,
    }
  }

  if (zohoLevel) {
    return {
      state: 'non_urgent',
      recommendedLevel: zohoLevel,
      effectiveSlaLevel: zohoLevel,
      reasonCode: 'no_urgent_motif',
      reasonText: 'Aucun motif d’urgence détecté',
      confidence: 0.9,
      detectedHotelCount,
      generalizedBugCandidate: false,
      preservedByNonDowngrade: false,
    }
  }

  return {
    state: 'to_qualify',
    recommendedLevel: null,
    // Safe temporary target: doubt and unqualified tickets receive the 6h clock.
    effectiveSlaLevel: 'urgent',
    reasonCode: 'missing_internal_level',
    reasonText: 'Niveau interne absent — qualification requise',
    confidence: null,
    detectedHotelCount,
    generalizedBugCandidate: false,
    preservedByNonDowngrade: false,
  }
}

export function mapZohoPriority(value: string | null | undefined): SupportLevel | null {
  return value ? PRIORITY_LEVELS[normalizeText(value).trim()] ?? null : null
}

function preserveExisting(
  existing: NonNullable<ClassificationInput['existing']>,
  fallback: ClassificationResult | null,
  detectedHotelCount: number | null,
): ClassificationResult {
  return {
    state: existing.state,
    recommendedLevel: existing.recommended_level ?? fallback?.recommendedLevel ?? 'urgent',
    effectiveSlaLevel: existing.effective_sla_level ?? fallback?.effectiveSlaLevel ?? 'urgent',
    reasonCode: existing.reason_code ?? fallback?.reasonCode ?? 'non_downgrade_guard',
    reasonText: existing.reason_text ?? fallback?.reasonText ?? 'État urgent conservé automatiquement',
    confidence: existing.confidence ?? fallback?.confidence ?? null,
    detectedHotelCount,
    generalizedBugCandidate: fallback?.generalizedBugCandidate ?? false,
    preservedByNonDowngrade: true,
  }
}

function detectHotelCount(text: string): number | null {
  const explicit = [...text.matchAll(/(?:sur|pour|dans|impacte?|concerne)\s+(\d+)\s+h[oô]tels?/gi)]
    .map(match => Number(match[1]))
    .filter(Number.isFinite)
  return explicit.length > 0 ? Math.max(...explicit) : null
}

function isGeneralizedBug(text: string, hotelCount: number | null, ruleset: UrgencyRuleset): boolean {
  return hotelCount !== null
    && hotelCount >= ruleset.config.generalized_bug_hotel_threshold
    && /\b(?:bug|incident|panne|ko|bloqu)/i.test(text)
}

function safeRegexTest(pattern: string, text: string): boolean {
  try {
    return new RegExp(pattern, 'iu').test(text)
  } catch {
    return false
  }
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('fr-FR')
}

function clampConfidence(value: number): number {
  return Math.min(1, Math.max(0, value))
}
