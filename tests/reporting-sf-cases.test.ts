import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { NextRequest } from 'next/server'
import { monthStart } from '@/lib/reporting/monthly'
import { caseSlideMetrics, parseCaseBatch, type StoredCaseMonthlyRow } from '@/lib/reporting/sfCases'
import { implementationSlideCopyLines } from '@/lib/reporting/implementationSlide'
import { POST } from '@/app/api/cron/ingest-sf-case-monthly/route'

const baseRows = [
  { case_type: 'welcome', product: '__TOTAL__', opened: 14, closed: 22, open_stock: 90, avg_age_days: 176.5 },
  { case_type: 'setup', product: '__TOTAL__', opened: 0, closed: 0, avg_age_days: null },
]
const batch = { month: '2026-09-01', rows: baseRows }
const stored = (values: Partial<StoredCaseMonthlyRow>): StoredCaseMonthlyRow => ({
  case_type: 'welcome', product: '__TOTAL__', opened: 14, closed: 22,
  open_stock: null, avg_age_days: 176.5, synced_at: '2026-09-29T10:00:00Z', ...values,
})

test('bornes mensuelles Europe/Paris et ratios sans dénominateur', () => {
  assert.equal(monthStart('2026-09').toISOString(), '2026-08-31T22:00:00.000Z')
  assert.equal(monthStart('2026-10').toISOString(), '2026-09-30T22:00:00.000Z')
  const cases = caseSlideMetrics([stored({}), stored({ case_type: 'setup', opened: 0, closed: 0, avg_age_days: null })], '2026-09', new Date('2026-09-30T10:00:00Z'))
  assert.equal(cases.welcome.closed_opened_pct, 22 / 14 * 100)
  assert.equal(cases.setup.closed_opened_pct, null)
  assert.equal(cases.setup.avg_age_days, null)
})

test('total absent ou synchronisation actuelle périmée : aucune valeur inventée', () => {
  const missing = caseSlideMetrics([stored({ case_type: 'setup' })], '2026-09', new Date('2026-09-30T10:00:00Z'))
  assert.equal(missing.welcome.opened, null)
  assert.match(missing.welcome.warning!, /absente/)
  const stale = caseSlideMetrics([stored({ synced_at: '2026-09-20T00:00:00Z' })], '2026-09', new Date('2026-09-30T10:00:00Z'))
  assert.equal(stale.welcome.closed, null)
  assert.match(stale.welcome.warning!, /ancienne/)
})

test('lot complet strict : totaux, unicité et nombres', () => {
  assert.equal(parseCaseBatch(batch).rows[1].open_stock, null)
  for (const invalid of [
    { ...batch, rows: baseRows.slice(0, 1) },
    { ...batch, rows: [...baseRows, baseRows[0]] },
    { ...batch, rows: [{ ...baseRows[0], opened: -1 }, baseRows[1]] },
    { ...batch, rows: [{ ...baseRows[0], opened: 1.5 }, baseRows[1]] },
    { ...batch, rows: [{ ...baseRows[0], avg_age_days: Infinity }, baseRows[1]] },
    { ...batch, month: '2026-09-02' },
  ]) assert.throws(() => parseCaseBatch(invalid))
})

test('copie : 16 valeurs, ratios exacts et absences visibles', () => {
  const projects = {
    official_starts_crm: 8, crm_went_live: 4, crm_live_average_age_days: 12.5,
    crm_current_statuses: { blocked: 1, standby: 2, pending_client: 3, in_progress: 4 },
  } as Parameters<typeof implementationSlideCopyLines>[0]
  const cases = caseSlideMetrics([stored({})], '2026-08', new Date('2026-09-30T10:00:00Z'))
  const lines = implementationSlideCopyLines(projects, cases)
  assert.equal(lines.length, 4)
  assert.match(lines[0], /Started 8 ; Live 4 ; Started \/ Live \(%\) 200 % ; Average age 12,5 j/)
  assert.match(lines[2], /Opened 14 ; Closed 22 ; Closed \/ opened \(%\) 157,1 % ; Average age 176,5 j/)
  assert.match(lines[3], /Opened — ; Closed — ; Closed \/ opened \(%\) — ; Average age —/)
  assert.match(implementationSlideCopyLines({ ...projects!, crm_went_live: 0 }, cases)[0], /Started \/ Live \(%\) —/)
})

test('route : secret rejeté, lot invalide, puis un seul appel RPC atomique', async () => {
  const previousSecret = process.env.SF_INGEST_SECRET
  const previousFetch = globalThis.fetch
  process.env.SF_INGEST_SECRET = 'test-secret'
  const calls: string[] = []
  globalThis.fetch = async input => {
    calls.push(String(input))
    return new Response(JSON.stringify('2026-09-30T10:00:00Z'), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const request = (payload: unknown, secret: string) => new NextRequest('http://localhost/api/cron/ingest-sf-case-monthly', {
    method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify(payload),
  })
  try {
    assert.equal((await POST(request(batch, 'wrong'))).status, 401)
    assert.equal((await POST(request({ ...batch, rows: baseRows.slice(0, 1) }, 'test-secret'))).status, 400)
    assert.equal(calls.length, 0)
    const response = await POST(request(batch, 'test-secret'))
    assert.equal(response.status, 200)
    assert.equal((await response.json()).rows_written, 2)
    assert.equal(calls.length, 1)
    assert.match(calls[0], /\/rpc\/replace_sf_case_monthly/)
  } finally {
    globalThis.fetch = previousFetch
    if (previousSecret === undefined) delete process.env.SF_INGEST_SECRET
    else process.env.SF_INGEST_SECRET = previousSecret
  }
})

test('migration : suppression et insertion dans la même fonction transactionnelle', () => {
  const sql = readFileSync('supabase/migrations/20260930075920_sf_case_monthly.sql', 'utf8')
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.replace_sf_case_monthly/)
  assert.match(sql, /DELETE FROM public\.sf_case_monthly WHERE month = p_month;[\s\S]*INSERT INTO public\.sf_case_monthly/)
  assert.match(sql, /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated/)
})
