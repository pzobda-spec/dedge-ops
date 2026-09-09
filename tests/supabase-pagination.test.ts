import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchAllPages } from '@/lib/supabase/pagination'

for (const size of [0, 1000, 2060]) {
  test(`pagination complète de ${size} lignes`, async () => {
    const rows = Array.from({ length: size }, (_, id) => ({ id }))
    const calls: number[] = []
    const result = await fetchAllPages(async (from, to) => {
      calls.push(from)
      return { data: rows.slice(from, to + 1), error: null }
    })
    assert.deepEqual(result.data, rows)
    assert.equal(result.error, null)
    assert.equal(calls.length, Math.floor(size / 1000) + 1)
  })
}
test('une erreur tardive ne produit pas de succès partiel', async () => {
  const error = { message: 'indisponible' }
  const result = await fetchAllPages(async from => from === 0 ? { data: [1, 2], error: null } : { data: null, error }, 2)
  assert.deepEqual(result, { data: null, error })
})
test('taille invalide et réponse absente échouent explicitement', async () => {
  await assert.rejects(fetchAllPages(async () => ({ data: [], error: null }), 0))
  await assert.rejects(fetchAllPages(async () => ({ data: null, error: null })))
})
