export const IMPLEMENTATION_GROUP = ['Lan', 'Thuy-Tien', 'Dalia', 'Winli'] as const

export const EXCLUDED_ONBOARDING_OWNERS = ['Bruno', 'Admin', 'Dominic', 'Lauren'] as const

export function isExcludedOnboardingOwner(owner: string | null | undefined): boolean {
  return EXCLUDED_ONBOARDING_OWNERS.includes(owner as typeof EXCLUDED_ONBOARDING_OWNERS[number])
}

