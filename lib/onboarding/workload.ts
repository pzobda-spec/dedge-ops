import { isExcludedOnboardingOwner } from './constants'
import type { OnboardingProject } from '@/lib/zoho/projectsClient'

export const CAPACITY_THRESHOLD = 50
export const OVERLOADED_THRESHOLD_PCT = 80

export function isActiveProject(project: OnboardingProject): boolean {
  return project.status !== 'live' && project.status !== 'other'
}

export interface OwnerWorkload {
  owner: string
  active: number
  chargePct: number
}

export function computeOwnerWorkload(projects: OnboardingProject[]): OwnerWorkload[] {
  const grouped = new Map<string, number>()
  for (const project of projects) {
    if (isExcludedOnboardingOwner(project.ownerShort)) continue
    if (!isActiveProject(project)) continue
    const owner = project.ownerShort || project.ownerName || 'Non assigné'
    grouped.set(owner, (grouped.get(owner) ?? 0) + 1)
  }
  return [...grouped.entries()].map(([owner, active]) => ({
    owner,
    active,
    chargePct: Math.round((active / CAPACITY_THRESHOLD) * 100),
  }))
}
