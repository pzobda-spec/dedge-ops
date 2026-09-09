import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeBacklog } from '@/lib/support/backlog'
import { summarizeTrainingPlanning } from '@/lib/acuity/planning'
import type { AcuitySession } from '@/lib/acuity/client'

test('le stock distingue ancienneté, clients uniques et dates inconnues', () => {
  const now = Date.parse('2026-09-08T00:00:00Z')
  const result = summarizeBacklog([
    { created_at: '2026-07-01', last_synced_at: '2026-09-07', product_area: 'PMS', client_name: 'Hotel A' },
    { created_at: '2026-08-29', last_synced_at: '2026-09-08', product_area: 'PMS', client_name: ' hotel a ' },
    { created_at: null, last_synced_at: null, product_area: null, client_name: null },
    { created_at: '2027-01-01', last_synced_at: null, product_area: null, client_name: null },
  ], now)
  assert.equal(result.total, 4)
  assert.equal(result.over7Days, 2)
  assert.equal(result.over30Days, 1)
  assert.equal(result.unknownAge, 2)
  assert.equal(result.products[0].clients, 1)
  assert.equal(result.oldestSync, '2026-09-07')
})

test('stock vide : pas d’ancienneté ni de fraîcheur inventée', () => {
  const result = summarizeBacklog([])
  assert.equal(result.total, 0)
  assert.equal(result.oldestDays, null)
  assert.equal(result.oldestSync, null)
})

test('formation : taux sur capacités connues uniquement, hors brouillons et annulations', () => {
  const session = { theme: 'PMS', language: 'FR', status: 'scheduled', isDraft: false, duration: 60, totalRegistered: 2, capacity: 10 } as AcuitySession
  const result = summarizeTrainingPlanning([
    session,
    { ...session, capacity: null, totalRegistered: 8 },
    { ...session, totalRegistered: 0 },
    { ...session, isDraft: true },
    { ...session, status: 'cancelled' },
    { ...session, status: 'completed' },
  ])
  assert.equal(result.length, 1)
  assert.equal(result[0].sessions, 3)
  assert.equal(result[0].minutes, 180)
  assert.equal(result[0].empty, 1)
  assert.equal(result[0].registrations, 10)
  assert.equal(result[0].capacity, 20)
  assert.equal(result[0].registrationsWithCapacity, 2)
  assert.equal(result[0].knownCapacitySessions, 2)
})
