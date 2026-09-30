import assert from 'node:assert/strict'
import test from 'node:test'
import { currentQuarter, quarterCoverageStatus } from '@/lib/reporting/quarterSelection'
import { monthStart } from '@/lib/reporting/monthly'

test('le trimestre courant suit le calendrier Europe/Paris', () => {
  assert.equal(currentQuarter(new Date('2026-09-30T21:59:59Z')).key, '2026-Q3')
  assert.equal(currentQuarter(new Date('2026-09-30T22:00:00Z')).key, '2026-Q4')
  assert.equal(currentQuarter(new Date('2026-12-31T23:00:00Z')).key, '2027-Q1')
})

test('un trimestre en cours reste partiel, même le dernier jour', () => {
  const quarter = {
    key: '2026-Q3', label: 'T3 2026', year: 2026, number: 3,
    start: monthStart('2026-07'), end: monthStart('2026-10'),
  }
  const from = '2026-07-01T00:00:00Z'
  const to = '2026-09-30T08:41:00Z'
  assert.equal(quarterCoverageStatus(quarter, from, to, new Date('2026-09-30T11:00:00Z')), 'partial')
  assert.equal(quarterCoverageStatus(quarter, from, to, new Date('2026-09-30T22:00:00Z')), 'complete')
  assert.equal(quarterCoverageStatus(quarter, from, '2026-06-30T00:00:00Z', new Date('2026-09-30T11:00:00Z')), 'absent')
})
