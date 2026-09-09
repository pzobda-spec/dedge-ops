import type { OnboardingProject } from '@/lib/zoho/projectsClient'
import { isOpenProject, isPausedProject } from './workload'
import { resolveOwnerName } from './constants'

export interface ProjectActionSource {
  id: string
  zoho_project_id: string | null
  next_action: string | null
  next_action_due: string | null
  next_action_owner: string | null
  current_blocker: string | null
}

export function buildProjectFollowThrough(projects: readonly OnboardingProject[], saved: ProjectActionSource[], referenceDate: string) {
  const byId = new Map(saved.map(row => [row.zoho_project_id ?? row.id, row]))
  const horizon = new Date(`${referenceDate}T00:00:00Z`)
  horizon.setUTCDate(horizon.getUTCDate() + 7)
  const until = horizon.toISOString().slice(0, 10)
  const open = projects.filter(isOpenProject)
  const pauses = new Map<string, number>()
  let withoutNextAction = 0
  const actions = open.flatMap(project => {
    const owner = resolveOwnerName(project.ownerShort || project.ownerName, project.ownerEmail) || 'Non assigné'
    if (isPausedProject(project)) pauses.set(owner, (pauses.get(owner) ?? 0) + 1)
    const row = byId.get(project.id)
    if (!row?.next_action?.trim()) { withoutNextAction++; return [] }
    if (row.next_action_due && row.next_action_due > until) return []
    return [{ projectId: project.id, projectName: project.name, action: row.next_action, due: row.next_action_due, owner: row.next_action_owner || owner, blocker: row.current_blocker, projectUrl: project.projectUrl }]
  }).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? '') || a.projectName.localeCompare(b.projectName))
  return { actions, openProjects: open.length, withoutNextAction, pausedByOwner: [...pauses].map(([owner, count]) => ({ owner, count })).sort((a, b) => b.count - a.count) }
}

export type ProjectFollowThrough = ReturnType<typeof buildProjectFollowThrough>
