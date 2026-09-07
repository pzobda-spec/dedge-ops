import type { OnboardingProject, ProjectStatus } from '@/lib/zoho/projectsClient'
import { isExcludedOnboardingOwner, resolveOwnerName } from '@/lib/onboarding/constants'

export const CAPACITY_THRESHOLD = 50

/** Statuts sortis du parcours d'implémentation : mis en ligne, ou hors périmètre. */
const CLOSED_STATUSES: readonly ProjectStatus[] = ['live', 'other']

/**
 * Statuts de mise en pause : le dossier existe toujours, mais personne ne le
 * traite. Mesuré le 6 septembre 2026 sur les 711 projets du portail : 46
 * projets dans ces trois statuts, dont 22 `Blocked` et 22 `Pending (client)`,
 * certains sans mouvement depuis plus de 900 jours.
 */
const PAUSED_STATUSES: readonly ProjectStatus[] = ['blocked', 'pending_client', 'standby']

/**
 * Projet encore au parcours : ni mis en ligne, ni hors périmètre. C'est un
 * PÉRIMÈTRE D'AFFICHAGE, il inclut les dossiers en pause. Ne pas l'utiliser
 * pour calculer une charge, voir `isActiveProject`.
 */
export function isOpenProject(project: OnboardingProject): boolean {
  return !CLOSED_STATUSES.includes(project.status)
}

/** Dossier en pause : il existe, mais personne ne le traite aujourd'hui. */
export function isPausedProject(project: OnboardingProject): boolean {
  return PAUSED_STATUSES.includes(project.status)
}

/**
 * Projet réellement porté par un implémenteur aujourd'hui : on écarte les
 * dossiers terminés ou hors périmètre, ET les dossiers en pause.
 *
 * Compter les pauses dans la charge gonflait le plafond des implémenteurs et
 * celui du moteur d'attribution avec des dossiers que personne ne traite.
 * C'est la CHARGE, distincte du périmètre d'affichage (`isOpenProject`).
 */
export function isActiveProject(project: OnboardingProject): boolean {
  return isOpenProject(project) && !isPausedProject(project)
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
