import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyUrgency } from '@/lib/support/urgency/classifier'
import { addBusinessMinutes, firstResponseStatus } from '@/lib/support/urgency/businessHours'
import { DEFAULT_BUSINESS_HOURS, DEFAULT_RULESET } from '@/lib/support/urgency/config'
import { buildSlaBuckets, calculateFalsePositiveMetrics } from '@/lib/support/urgency/metrics'
import { parseZohoDeskWebhook } from '@/lib/support/zohoWebhook'

test('2WAY KO on one hotel is internally probable urgent, never an automatic Linear P1', () => {
  const result = classifyUrgency({
    subject: 'Le 2WAY est KO pour un hôtel',
    detectedHotelCount: 1,
    zohoPriority: 'High',
  }, DEFAULT_RULESET)
  assert.equal(result.state, 'probable')
  assert.equal(result.effectiveSlaLevel, 'urgent')
  assert.equal(result.generalizedBugCandidate, false)
  assert.deepEqual(DEFAULT_RULESET.config.writes, { zoho: false, linear: false, slack: false })
})

test('generalized bug threshold is configurable and only produces a candidate flag', () => {
  const result = classifyUrgency({
    subject: 'Bug production KO sur 3 hôtels',
  }, DEFAULT_RULESET)
  assert.equal(result.state, 'probable')
  assert.equal(result.detectedHotelCount, 3)
  assert.equal(result.generalizedBugCandidate, true)
})

test('missing internal level stays to qualify with the temporary 6h target', () => {
  const result = classifyUrgency({ subject: 'Question sur la configuration', zohoPriority: null }, DEFAULT_RULESET)
  assert.equal(result.state, 'to_qualify')
  assert.equal(result.recommendedLevel, null)
  assert.equal(result.effectiveSlaLevel, 'urgent')
})

test('High remains non urgent and receives the 24h target', () => {
  const result = classifyUrgency({ subject: 'Question de paramétrage', zohoPriority: 'High' }, DEFAULT_RULESET)
  assert.equal(result.state, 'non_urgent')
  assert.equal(result.effectiveSlaLevel, 'high')
  assert.equal(DEFAULT_RULESET.config.sla_business_minutes.high, 1440)
})

test('automatic classification cannot downgrade probable or confirmed urgency', () => {
  for (const state of ['probable', 'confirmed'] as const) {
    const result = classifyUrgency({
      subject: 'Tout semble revenu à la normale',
      zohoPriority: 'Low',
      existing: {
        state,
        recommended_level: 'urgent',
        effective_sla_level: 'urgent',
        reason_code: 'two_way_down',
        reason_text: 'Flux 2WAY indisponible',
        confidence: 0.96,
      },
    }, DEFAULT_RULESET)
    assert.equal(result.state, state)
    assert.equal(result.effectiveSlaLevel, 'urgent')
    assert.equal(result.preservedByNonDowngrade, true)
  }
})

test('business-hour SLA crosses the weekend in Europe/Paris', () => {
  const received = new Date('2026-08-28T14:00:00.000Z') // Friday 16:00 Paris
  assert.equal(
    addBusinessMinutes(received, 360, DEFAULT_BUSINESS_HOURS).toISOString(),
    '2026-08-31T11:00:00.000Z', // Monday 13:00 Paris
  )
  assert.equal(
    addBusinessMinutes(received, 1440, DEFAULT_BUSINESS_HOURS).toISOString(),
    '2026-09-02T11:00:00.000Z', // Wednesday 13:00 Paris
  )
})

test('Zoho holidays are excluded from the business-hour clock', () => {
  const config = { ...DEFAULT_BUSINESS_HOURS, holidays: ['2026-08-31'] }
  const received = new Date('2026-08-28T14:00:00.000Z')
  assert.equal(addBusinessMinutes(received, 360, config).toISOString(), '2026-09-01T11:00:00.000Z')
})

test('first-response status honors business duration and live due date', () => {
  assert.equal(firstResponseStatus({
    now: new Date('2026-08-29T00:00:00Z'), dueAt: null,
    firstResponseBusinessDurationMs: 6 * 60 * 60 * 1_000,
    targetBusinessMinutes: 360,
  }), 'within_target')
  assert.equal(firstResponseStatus({
    now: new Date('2026-08-29T00:00:00Z'), dueAt: null,
    firstResponseBusinessDurationMs: 6 * 60 * 60 * 1_000 + 1,
    targetBusinessMinutes: 360,
  }), 'overdue')
})

test('SLA graph separates within, outside and no-data buckets', () => {
  const rows = [
    { effective_sla_level: 'urgent' as const, first_response_status: 'within_target' as const, first_response_due_at: null },
    { effective_sla_level: 'urgent' as const, first_response_status: 'pending' as const, first_response_due_at: '2026-08-28T00:00:00Z' },
    { effective_sla_level: 'high' as const, first_response_status: 'no_data' as const, first_response_due_at: null },
  ]
  const buckets = buildSlaBuckets(rows, new Date('2026-08-29T00:00:00Z'))
  assert.deepEqual(buckets.find(item => item.level === 'urgent'), {
    level: 'urgent', target_business_hours: 6, within_target: 1, outside_target: 1, no_data: 0,
  })
  assert.equal(buckets.find(item => item.level === 'high')?.no_data, 1)
})

test('false-positive measurement counts human outcomes and ignores repeated automatic runs', () => {
  const metrics = calculateFalsePositiveMetrics([
    { ticket_id: 'a', event_kind: 'automatic_assessment', state: 'probable' },
    { ticket_id: 'a', event_kind: 'automatic_assessment', state: 'probable' },
    { ticket_id: 'a', event_kind: 'human_validation', state: 'non_urgent' },
    { ticket_id: 'b', event_kind: 'automatic_assessment', state: 'probable' },
    { ticket_id: 'b', event_kind: 'human_validation', state: 'confirmed' },
    { ticket_id: 'c', event_kind: 'automatic_assessment', state: 'probable' },
  ])
  assert.equal(metrics.auto_probable_total, 3)
  assert.equal(metrics.validated_probable_total, 2)
  assert.equal(metrics.false_positive_count, 1)
  assert.equal(metrics.pending_validation_count, 1)
  assert.equal(metrics.false_positive_rate_pct, 50)
})

test('official Zoho array payload is parsed and flat legacy payload is rejected', () => {
  const events = parseZohoDeskWebhook([{
    eventType: 'Ticket_Update', eventTime: 1_787_960_000_000, orgId: '42', payload: { id: 'ticket-1' },
  }])
  assert.equal(events[0].ticketId, 'ticket-1')
  assert.equal(events[0].eventType, 'Ticket_Update')
  assert.throws(() => parseZohoDeskWebhook({ eventType: 'Ticket_Update' }))
})
