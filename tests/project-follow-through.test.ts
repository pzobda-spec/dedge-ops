import assert from 'node:assert/strict'
import test from 'node:test'
import { buildProjectFollowThrough, type ProjectActionSource } from '@/lib/onboarding/followThrough'
import type { OnboardingProject } from '@/lib/zoho/projectsClient'

const project = (id: string, status: OnboardingProject['status'] = 'in_progress') => ({ id, name: id, status, ownerName: 'Alice', ownerShort: 'Alice', ownerEmail: null, projectUrl: 'https://projects.zoho.eu/' }) as OnboardingProject
const action = (id: string, due: string | null): ProjectActionSource => ({ id: `local-${id}`, zoho_project_id: id, next_action: 'Valider les contenus', next_action_due: due, next_action_owner: 'Bob', current_blocker: null })

test('suivi : actions échues, sous sept jours et sans date, sans dossiers clos', () => {
  const projects = [project('late'), project('soon'), project('undated'), project('future'), project('live', 'live'), project('missing'), project('paused', 'pending_client')]
  const result = buildProjectFollowThrough(projects, [action('late', '2026-08-01'), action('soon', '2026-09-15'), action('undated', null), action('future', '2026-09-16'), action('live', '2026-09-01')], '2026-09-08')
  assert.equal(result.openProjects, 6)
  assert.equal(result.withoutNextAction, 2)
  assert.deepEqual(result.actions.map(row => row.projectId), ['undated', 'late', 'soon'])
  assert.equal(result.actions[0].owner, 'Bob')
  assert.deepEqual(result.pausedByOwner, [{ owner: 'Alice', count: 1 }])
})
