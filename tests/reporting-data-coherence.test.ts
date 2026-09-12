import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest } from 'next/server'
import { GET as monthly } from '@/app/api/reporting/monthly/route'
import { GET as tickets } from '@/app/api/analytics/tickets/route'
import { toTicketAnalyticsRow } from '@/lib/zoho/analyticsClient'
import { normalizePriority, estimateFirstContactResolution } from '@/lib/zoho/analyticsNormalization'
import { monthStart, supportMetrics } from '@/lib/reporting/monthly'

test('Analytics conserve les inconnus et utilise la taxonomie existante, pas la catégorie brute', () => {
  const row = toTicketAnalyticsRow({ ID: '1', Category: 'Administrateur', Classifications: 'Question', Priority: '', Channel: 'Web', 'First Reply Time (hrs)': '', 'Agent Responded Time': '2026-08-03 12:00:00' })
  assert.equal(row.priority, null)
  assert.equal(normalizePriority(null), null)
  assert.equal(normalizePriority('P1'), 'P1')
  assert.equal(row.product_area, 'CRM Core')
  assert.equal(row.category, 'Question')
  assert.equal(row.source, 'Web')
  assert.equal(row.first_response_time_ms, null)
  assert.equal(row.first_response_at, null)
  const business = toTicketAnalyticsRow({ ID: 'business', Priority: 'High', 'Created Time': '2026-08-01 12:00:00', 'First Reply Time (hrs)': '1' })
  assert.equal(business.first_response_at, null)
  assert.equal(business.first_response_time_ms, 3_600_000)
  const calendar = supportMetrics([{ ...business, first_response_time_basis: 'business' }], monthStart('2026-08'), monthStart('2026-09'))
  assert.equal(calendar.first_response_compliance.rate_pct, null)
  assert.equal(calendar.first_response_compliance.without_measurement, 1)
  assert.equal(calendar.first_response_hours, 1)
  assert.equal(estimateFirstContactResolution('', undefined), null)
  assert.equal(estimateFirstContactResolution('0', '8'), true)
  assert.equal(estimateFirstContactResolution('2', '1'), false)
})

test('P4 résolution reste non applicable même sans durée et zéro délai ne fabrique pas une première réponse', () => {
  const rows = [{ ...toTicketAnalyticsRow({ ID: '1', Priority: 'Low' }), created_at: null, resolved_at: '2026-08-05T12:00:00Z' }]
  const result = supportMetrics(rows, monthStart('2026-08'), monthStart('2026-09'))
  assert.equal(result.resolution_compliance.priorities[3].measured, 1)
  assert.equal(result.resolution_compliance.priorities[3].rate_pct, null)
  assert.equal(result.resolution_compliance.measured, 0)
  const zero = toTicketAnalyticsRow({ ID: '2', Priority: 'High', 'Created Time': '2026-08-01 12:00:00', 'First Reply Time (hrs)': '0' })
  const response = supportMetrics([zero], monthStart('2026-08'), monthStart('2026-09')).first_response_compliance
  assert.equal(response.rate_pct, null)
  assert.equal(response.without_measurement, 1)
})

test('routes Tickets et Reporting : mêmes bornes Paris et N-1 limité au même mois', async () => {
  const originalFetch = globalThis.fetch
  const requests: URL[] = []
  const fixture = [
    { ...toTicketAnalyticsRow({ ID: 'start', Priority: 'Low' }), created_at: '2026-07-31T22:00:00Z', resolved_at: '2026-08-01T00:00:00Z' },
    { ...toTicketAnalyticsRow({ ID: 'end' }), created_at: '2026-08-31T22:00:00Z' },
    { ...toTicketAnalyticsRow({ ID: 'previous' }), created_at: '2025-08-15T12:00:00Z' },
    { ...toTicketAnalyticsRow({ ID: 'outside-previous' }), created_at: '2025-09-15T12:00:00Z' },
  ]
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)); requests.push(url)
    const body = url.pathname.endsWith('/ticket_analytics') ? fixture : url.pathname.endsWith('/ticket_analytics_history_coverage') ? null : []
    return new Response(init?.method === 'HEAD' ? null : JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json', 'content-range': '0-3/4' } })
  }
  try {
    const m = await (await monthly(new NextRequest('http://localhost/api/reporting/monthly?month=2026-08'))).json()
    const t = await (await tickets(new NextRequest('http://localhost/api/analytics/tickets?from=2026-08-01&to=2026-08-31'))).json()
    assert.equal(m.support.opened, 1)
    assert.equal(m.year_ago.support.opened, 1)
    assert.equal(t.total, m.support.opened)
    assert.equal(t.resolved, m.support.closed)
    assert.equal(t.fcr_rate, null)
    assert.equal(t.by_date.reduce((sum: number, day: { created: number }) => sum + day.created, 0), t.total)
    assert.equal(t.by_date[0].period, '2026-08-01')
    assert.equal(t.by_date.length, 31)
    assert.ok(requests.some(url => url.searchParams.get('or')?.includes('created_at.lt.2025-08-31T22:00:00.000Z')))
  } finally { globalThis.fetch = originalFetch }
})
