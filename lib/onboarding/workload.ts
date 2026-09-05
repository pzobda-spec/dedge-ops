import type { OnboardingProject } from '@/lib/zoho/projectsClient'
import { isExcludedOnboardingOwner, resolveOwnerName } from '@/lib/onboarding/constants'

export const CAPACITY_THRESHOLD = 50

export function isActiveProject(project: OnboardingProject): boolean {
  return project.status !== 'live' && project.status !== 'other'
}

/**
 * Nombre de projets actifs par implémenteur, c'est-à-dire la charge réellement
 * portée aujourd'hui. Mêmes règles que `/onboarding/pilotage` : owners exclus
 * écartés, normalisation du nom (dont les alias de Winli), et un projet Zoho
 * par hôtel, donc un groupe de N hôtels pèse N projets.
 *
 * Sert à amorcer la charge du moteur d'attribution : sans cela il partirait de
 * zéro, croirait tout le monde libre et empilerait le pipeline sur des
 * implémenteurs déjà en surcharge.
 */
export function countActiveProjectsByOwner(
  projects: readonly OnboardingProject[],
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const project of projects) {
    if (isExcludedOnboardingOwner(project.ownerShort)) continue
    if (!isActiveProject(project)) continue
    const owner = resolveOwnerName(project.ownerShort || project.ownerName, project.ownerEmail)
    if (!owner || owner === 'Non assigné') continue
    counts[owner] = (counts[owner] ?? 0) + 1
  }
  return counts
}
