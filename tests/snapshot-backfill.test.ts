import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reconcileSnapshotDates, SNAPSHOT_BACKFILL_WINDOW_DAYS } from '@/lib/onboarding/snapshots'

test('trou d\'un jour rattrapé', () => {
  const result = reconcileSnapshotDates({
    referenceDate: '2026-09-07',
    existingDates: ['2026-09-05'],
    firstEverDate: '2026-08-01',
  })

  assert.ok(result.toBackfill.includes('2026-09-06'))
  assert.ok(result.toWrite.includes('2026-09-06'))
  assert.ok(result.toWrite.includes('2026-09-07'))
  assert.ok(!result.toBackfill.includes('2026-09-07'))
})

test('date existante laissée intacte', () => {
  const result = reconcileSnapshotDates({
    referenceDate: '2026-09-07',
    existingDates: [
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ],
    firstEverDate: '2026-08-01',
  })

  assert.deepEqual(result.toBackfill, [])
  assert.deepEqual(result.toWrite, ['2026-09-07'])
})

test('trou de plus de sept jours non rattrapé', () => {
  const result = reconcileSnapshotDates({
    referenceDate: '2026-09-07',
    existingDates: [],
    firstEverDate: '2026-08-01',
  })

  // 2026-08-26 est à douze jours de la référence, hors fenêtre de 7 jours.
  assert.ok(result.beyondWindow.includes('2026-08-26'))
  assert.ok(!result.toWrite.includes('2026-08-26'))
  assert.ok(!result.toBackfill.includes('2026-08-26'))
})

test('base vide, firstEverDate null : seule la date du jour est écrite', () => {
  const result = reconcileSnapshotDates({
    referenceDate: '2026-09-07',
    existingDates: [],
    firstEverDate: null,
  })

  assert.deepEqual(result.toWrite, ['2026-09-07'])
  assert.deepEqual(result.toBackfill, [])
  assert.deepEqual(result.beyondWindow, [])
})

test('aucune date manquante', () => {
  const windowDates: string[] = []
  for (let offset = SNAPSHOT_BACKFILL_WINDOW_DAYS; offset >= 1; offset--) {
    const d = new Date(Date.UTC(2026, 8, 7 - offset))
    windowDates.push(d.toISOString().slice(0, 10))
  }

  const result = reconcileSnapshotDates({
    referenceDate: '2026-09-07',
    existingDates: windowDates,
    firstEverDate: windowDates[0],
  })

  assert.deepEqual(result.toWrite, ['2026-09-07'])
  assert.deepEqual(result.toBackfill, [])
  assert.deepEqual(result.beyondWindow, [])
})

test('les trois listes sont triées de la plus ancienne à la plus récente', () => {
  const result = reconcileSnapshotDates({
    referenceDate: '2026-09-07',
    existingDates: ['2026-09-06'],
    firstEverDate: '2026-08-20',
  })

  const isSorted = (arr: string[]) => arr.every((v, i) => i === 0 || arr[i - 1] < v)
  assert.ok(isSorted(result.toWrite))
  assert.ok(isSorted(result.toBackfill))
  assert.ok(isSorted(result.beyondWindow))
})

test('une date antérieure à firstEverDate n\'est jamais comblée, même dans la fenêtre', () => {
  const result = reconcileSnapshotDates({
    referenceDate: '2026-09-07',
    existingDates: [],
    firstEverDate: '2026-09-05',
  })

  // 2026-09-01 à 2026-09-04 sont dans la fenêtre mais avant firstEverDate.
  for (const date of ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']) {
    assert.ok(!result.toBackfill.includes(date), `${date} ne devrait pas être comblée`)
    assert.ok(!result.toWrite.includes(date), `${date} ne devrait pas être écrite`)
    assert.ok(!result.beyondWindow.includes(date), `${date} est avant firstEverDate, pas un trou`)
  }
  // 2026-09-05 est firstEverDate elle-même : absente d'existingDates mais pas
  // avant firstEverDate, donc comblée.
  assert.ok(result.toBackfill.includes('2026-09-05'))
})
