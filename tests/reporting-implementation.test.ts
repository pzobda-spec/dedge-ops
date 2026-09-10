import assert from 'node:assert/strict'
import test from 'node:test'
import { implementationMetrics, type ReportingProject, type ReportingProjectEvent } from '@/lib/reporting/implementation'
import { monthStart } from '@/lib/reporting/monthly'

const project = (id: string, values: Partial<ReportingProject> = {}): ReportingProject => ({ id, zoho_project_id: `zp-${id}`, actual_go_live: null, zoho_status: 'in_progress', last_synced_at: null, ...values })
const event = (project_id: string, from: string | null, to: string, event_type = 'status_changed'): ReportingProjectEvent => ({ project_id, event_type, occurred_at: '2026-08-15T08:00:00Z', metadata: { from, to } })
const aggregate = (projects: ReportingProject[], events: ReportingProjectEvent[], since: string | null = '2026-05-31T08:00:00Z') => implementationMetrics(projects, events, monthStart('2026-08'), monthStart('2026-09'), since)

test('nouveaux démarrages : Non démarré uniquement, reprises et imports exclus, déduplication par projet', () => {
  const result = aggregate(['a', 'b', 'c', 'd'].map(id => project(id)), [
    event('a', 'not_started', 'in_progress'), event('a', 'not_started', 'in_progress'), event('a', 'pending_client', 'in_progress'),
    event('b', 'pending_client', 'in_progress'), event('c', 'standby', 'in_progress'),
    { ...event('d', null, 'in_progress', 'project_created'), metadata: { zoho_status: 'in_progress' } },
    event('outside', 'not_started', 'in_progress'),
  ])
  assert.equal(result.in_progress, 1)
  assert.equal(result.in_progress_resumed_or_other, 2)
  assert.equal(result.imported_in_progress_without_transition, 1)
  assert.equal(result.project_count, 4)
})

test('lancements officiels : date de démarrage Zoho Projects ventilée CRM / Dmbook', () => {
  const result = aggregate([
    project('crm', { start_date: '2026-08-05', product: 'LoungeUp' }),
    project('dmbook', { start_date: '2026-08-21', product: 'Dmbook Pro' }),
    project('old', { start_date: '2026-07-31', product: 'LoungeUp' }),
  ], [])
  assert.equal(result.official_starts, 2)
  assert.equal(result.official_starts_crm, 1)
  assert.equal(result.official_starts_dmbook, 1)
  assert.equal(result.status_transition_starts, 0)
})

test('Live : date métier prioritaire, observation en repli, imports sans date exclus', () => {
  const result = aggregate([
    project('a', { actual_go_live: '2026-08-01', zoho_status: 'live' }),
    project('b', { actual_go_live: '2026-07-31', zoho_status: 'live' }),
    project('c', { zoho_status: 'live' }), project('d', { zoho_status: 'live' }),
  ], [event('a', 'in_progress', 'live', 'go_live'), event('b', 'in_progress', 'live', 'go_live'), event('c', 'in_progress', 'live', 'go_live'), event('c', 'in_progress', 'live', 'go_live'), event('d', 'live', 'live', 'go_live')])
  assert.equal(result.went_live, 2)
  assert.equal(result.live_dated, 1)
  assert.equal(result.live_observed_without_date, 1)
  assert.equal(result.live_without_usable_date, 1)
})

test('bornes Paris exclusives et absence de suivi distincte de zéro', () => {
  const entries = [event('a', 'not_started', 'in_progress'), event('b', 'not_started', 'in_progress')]
  entries[0].occurred_at = '2026-07-31T22:00:00Z'
  entries[1].occurred_at = '2026-08-31T22:00:00Z'
  assert.equal(aggregate([project('a'), project('b')], entries).in_progress, 1)
  assert.equal(aggregate([], [], null).in_progress, null)
  assert.equal(aggregate([], [], '2026-09-01T00:00:00Z').in_progress, null)
  assert.equal(aggregate([], []).in_progress, 0)
})
