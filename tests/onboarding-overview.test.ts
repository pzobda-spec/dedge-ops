import assert from 'node:assert/strict'
import test from 'node:test'
import { getOnboardingOverviewMetrics } from '@/lib/onboarding/overviewMetrics'
import type { OnboardingProject, ProjectStatus } from '@/lib/zoho/projectsClient'

function project(status: ProjectStatus, startDate: string | null, actualGoLiveDate: string | null): OnboardingProject {
  return { status, startDate, actualGoLiveDate } as OnboardingProject
}

test('current active count includes pending, while the monthly go-live cohort uses Live date', () => {
  const result = getOnboardingOverviewMetrics([
    project('in_progress', null, null),
    project('pending_client', null, null),
    project('blocked', null, null),
    project('standby', null, null),
    project('live', '2026-08-01', '2026-09-01'),
    project('live', '2026-08-01', '2026-10-01'),
    project('not_started', '2026-09-15', null),
  ], '2026-09')

  assert.equal(result.active, 2)
  assert.equal(result.pending, 1)
  assert.equal(result.blocked, 1)
  assert.equal(result.standby, 1)
  assert.equal(result.goLives, 1)
  assert.equal(result.starts, 1)
  assert.equal(result.averageTtvDays, 31)
})

test('TTV keeps a go-live on the six-month anniversary and excludes later ones', () => {
  const result = getOnboardingOverviewMetrics([
    project('live', '2026-03-30', '2026-09-30'),
    project('live', '2026-03-30', '2026-09-29'),
    project('live', '2026-03-29', '2026-09-30'),
    project('live', null, '2026-09-20'),
  ], '2026-09')

  assert.equal(result.goLives, 4)
  assert.equal(result.ttvSamples, 2)
  assert.equal(result.ttvExcludedOverSixMonths, 1)
  assert.equal(result.averageTtvDays, 183.5)
})
