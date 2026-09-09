import assert from 'node:assert/strict'
import test from 'node:test'
import { channelMetrics, channelRange, monthStart, parseDate, supportMetrics, RATIO_APPELS_PAR_TICKET, type TicketRow } from '@/lib/reporting/monthly'

const row = (values: Partial<TicketRow>): TicketRow => ({ created_at: null, resolved_at: null, source: null, product_area: null, first_response_at: null, first_response_time_ms: null, first_contact_resolution: null, ...values })

test('mois Paris, passage heure été/hiver et bornes exclusives', () => {
  assert.equal(monthStart('2026-04').toISOString(), '2026-03-31T22:00:00.000Z')
  assert.equal(monthStart('2026-11').toISOString(), '2026-10-31T23:00:00.000Z')
  const stats = channelMetrics([
    row({ created_at: '2026-03-31T21:59:59Z', source: 'Email' }),
    row({ created_at: '2026-03-31T22:00:00Z', source: 'Web' }),
    row({ created_at: '2026-04-30T22:00:00Z', source: 'Phone' }),
  ], monthStart('2026-04'), monthStart('2026-05'))
  assert.equal(stats.months[0].total, 1)
  assert.equal(stats.months[0].web, 1)
  assert.equal(stats.months[0].email, 0)
})

test('canaux bruts conservés, inconnus et estimation centralisée', () => {
  const stats = channelMetrics(['Email', 'Phone', ' Phone ', 'Web', 'Chat', null, 'fax'].map(source => row({ created_at: '2026-08-01T12:00:00Z', source })), monthStart('2026-08'), monthStart('2026-09'))
  assert.equal(stats.totals.total, 7)
  assert.equal(stats.months[0].autre, 2)
  assert.equal(stats.totals.phone_share_pct, 200 / 7)
  assert.equal(stats.totals.estimated_calls, 2 * RATIO_APPELS_PAR_TICKET)
  assert.equal(stats.months[0].phone_regime, 'after')
  const empty = channelMetrics([], monthStart('2026-03'), monthStart('2026-04'))
  assert.equal(empty.months[0].phone_share_pct, null)
  assert.equal(empty.months[0].phone_regime, 'transition')
})

test('clôtures de tickets anciens incluses, données absentes exclues des moyennes', () => {
  const stats = supportMetrics([
    row({ created_at: '2026-07-30T10:00:00Z', resolved_at: '2026-08-01T10:00:00Z', first_contact_resolution: true }),
    row({ created_at: '2026-08-05T10:00:00Z', resolved_at: '2026-08-05T12:00:00Z', first_response_time_ms: 3_600_000, first_response_at: '2026-08-05T15:00:00Z', first_contact_resolution: false }),
    row({ created_at: '2026-08-07T10:00:00Z', first_response_at: '2026-08-07T12:00:00Z' }),
    row({ created_at: '2026-08-08T10:00:00Z' }),
  ], monthStart('2026-08'), monthStart('2026-09'))
  assert.equal(stats.opened, 3)
  assert.equal(stats.closed, 2)
  assert.equal(stats.first_response_hours, 1.5)
  assert.equal(stats.first_response_sample, 2)
  assert.equal(stats.resolution_hours, 25)
  assert.equal(stats.fcr_estimate_pct, 50)
  assert.equal(stats.fcr_sample, 2)
  assert.equal(supportMetrics([], monthStart('2026-08'), monthStart('2026-09')).resolution_hours, null)
})

test('dates invalides rejetées, défaut glissant 24 mois et mois partiels', () => {
  for (const date of ['2026-02-30', '2026-02-30T12:00:00Z', '2026-08-01T12:00:00', 'invalid']) assert.throws(() => parseDate(date))
  assert.throws(() => channelRange(new URLSearchParams('from=2026-09-01&to=2026-08-01')))
  assert.throws(() => channelRange(new URLSearchParams('from=2000-01-01&to=2026-08-01')))
  const range = channelRange(new URLSearchParams(), new Date('2026-09-09T10:30:00Z'))
  assert.equal(range.from.toISOString(), '2024-09-09T10:30:00.000Z')
  const leap = channelRange(new URLSearchParams(), new Date('2024-02-29T10:30:00Z'))
  assert.equal(leap.from.toISOString(), '2022-02-28T10:30:00.000Z')
  const stats = channelMetrics([], range.from, range.to)
  assert.equal(stats.months[0].partial_period, true)
  assert.equal(stats.months.at(-1)?.partial_period, true)
  const current = channelMetrics([], monthStart('2026-09'), monthStart('2026-10'), new Date('2026-09-09T10:00:00Z'))
  assert.equal(current.months[0].partial_period, true)
})

test('historique clairsemé signalé sans modifier les compteurs', () => {
  const rows = Array.from({ length: 6 }, (_, index) => Array.from({ length: 100 }, () => row({ created_at: `2026-0${index + 2}-15T12:00:00Z`, source: 'Email' }))).flat()
  const stats = channelMetrics(rows, monthStart('2026-01'), monthStart('2026-08'))
  assert.equal(stats.months[0].total, 0)
  assert.equal(stats.months[0].sparse_history, true)
  assert.equal(stats.months[1].sparse_history, false)
  assert.equal(stats.totals.total, 600)
})
