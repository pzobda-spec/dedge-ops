import type { OnboardingProject } from '@/lib/zoho/projectsClient'

export const CAPACITY_THRESHOLD = 50

export function isActiveProject(project: OnboardingProject): boolean {
  return project.status !== 'live' && project.status !== 'other'
}
