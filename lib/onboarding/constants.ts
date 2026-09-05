// Roster implémentation courant, aligné sur la table `ob_capacity_rules`
// (migration 20260905120000_plan_charge_attribution.sql). Lan est partie,
// Deydra bascule CSM.
export const IMPLEMENTATION_GROUP = ['Thuy-Tien', 'Dalia', 'Winli'] as const

export const EXCLUDED_ONBOARDING_OWNERS = ['Bruno', 'Admin', 'Dominic', 'Lauren'] as const

const WINLI_OWNER_ALIASES = new Set(['w', 'wilini', 'winli'])
const WINLI_EMAILS = new Set(['winli@d-edge.com'])

export function isExcludedOnboardingOwner(owner: string | null | undefined): boolean {
  return EXCLUDED_ONBOARDING_OWNERS.includes(owner as typeof EXCLUDED_ONBOARDING_OWNERS[number])
}

// Zoho sometimes records Winli's owner field as just "W" instead of her full
// first name — normalize so her projects group correctly everywhere.
export function resolveOwnerName(owner: string | null | undefined, email?: string | null): string {
  const trimmed = (owner ?? '').trim()
  const normalized = trimmed.toLocaleLowerCase('fr-FR')
  const normalizedEmail = (email ?? '').trim().toLocaleLowerCase('fr-FR')
  if (WINLI_EMAILS.has(normalizedEmail) || WINLI_OWNER_ALIASES.has(normalized)) return 'Winli'
  return trimmed || 'Non assigné'
}

export function normalizeOnboardingProjectOwner<T extends {
  ownerShort: string
  ownerName: string
  ownerEmail?: string | null
}>(project: T): T {
  const fallbackName = project.ownerName.trim().split(/\s+/)[0] ?? ''
  const ownerShort = resolveOwnerName(project.ownerShort || fallbackName, project.ownerEmail)
  if (ownerShort === project.ownerShort && ownerShort !== 'Winli') return project
  return {
    ...project,
    ownerShort,
    ownerName: ownerShort === 'Winli' ? 'Winli' : project.ownerName,
  }
}
