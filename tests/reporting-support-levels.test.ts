import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyLinearLink, supportLevelMetrics } from '@/lib/reporting/supportLevels'
import type { TicketRow } from '@/lib/reporting/monthly'

test('lien Linear explicite, absence vérifiée et données inconnues distincts', () => {
  assert.equal(classifyLinearLink({ cf_linear_issue_url: 'https://linear.app/loungeup/issue/BUGS-123/title' }), 'l2')
  assert.equal(classifyLinearLink({ cf_linear_issue_url: null }), 'l1')
  assert.equal(classifyLinearLink({ cf_linear_issue_url: '  ' }), 'l1')
  for (const cf of [undefined, {}, { cf_linear_issue_url: undefined }, { cf_linear_issue_url: false }, { cf_linear_issue_url: 'BUGS-123' }, { cf_linear_issue_url: 'https://linear.app.evil.test/issue/BUGS-123' }]) assert.equal(classifyLinearLink(cf), 'unknown')
})

test('moyennes L1/L2 séparées et seuil de 90 jours appliqué à chaque groupe', () => {
  const make = (id: string, hours: number): TicketRow => ({ id, created_at: new Date(Date.parse('2026-08-20T12:00:00Z') - hours * 3_600_000).toISOString(), resolved_at: '2026-08-20T12:00:00Z', source: null, product_area: null, priority: null, first_response_at: null, first_response_time_ms: null, first_contact_resolution: null })
  const result = supportLevelMetrics([make('a', 2), make('b', 4), make('c', 48), make('d', 90 * 24 + 1), make('e', 12)], new Map([['a', 'l1'], ['b', 'l1'], ['c', 'l2'], ['d', 'l2']]))
  assert.equal(result.l1.resolution_hours, 3)
  assert.equal(result.l2.resolution_hours, 48)
  assert.equal(result.l2.resolution_excluded_count, 1)
  assert.equal(result.unknown.closed, 1)
  assert.equal(result.l1.closed + result.l2.closed + result.unknown.closed, result.total_closed)
  const empty = supportLevelMetrics([], new Map())
  assert.equal(empty.l1.resolution_hours, null)
  assert.equal(empty.l2.resolution_hours, null)
})
