export const IMPLEMENTATION_GROUP = ['Lan', 'Thuy-Tien', 'Dalia', 'Winli', 'Deydra'] as const

export const EXCLUDED_ONBOARDING_OWNERS = ['Bruno', 'Admin', 'Dominic', 'Lauren'] as const

export function isExcludedOnboardingOwner(owner: string | null | undefined): boolean {
  return EXCLUDED_ONBOARDING_OWNERS.includes(owner as typeof EXCLUDED_ONBOARDING_OWNERS[number])
}

// Zoho sometimes records Winli's owner field as just "W" instead of her full
// first name — normalize so her projects group correctly everywhere.
export function resolveOwnerName(owner: string | null | undefined): string {
  const trimmed = (owner ?? '').trim()
  const normalized = trimmed.toLocaleLowerCase('fr-FR')
  if (normalized === 'w' || normalized === 'winli') return 'Winli'
  return trimmed || 'Non assigné'
}
