import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { supabaseAdmin } from '@/lib/supabase/server'
import { addBusinessMinutes, firstResponseStatus } from '@/lib/support/urgency/businessHours'
import { loadActiveBusinessHours, loadActiveRuleset } from '@/lib/support/urgency/config'
import type { SupportLevel, UrgencyState } from '@/lib/support/urgency/types'

const HUMAN_STATES = new Set<UrgencyState>(['confirmed', 'non_urgent', 'to_qualify'])
const NON_URGENT_LEVELS = new Set<SupportLevel>(['high', 'medium', 'low'])

export async function POST(request: NextRequest, { params }: { params: { ticketId: string } }) {
  try {
    const user = await requireRole(request, ['admin', 'support'])
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const state = body.state as UrgencyState
    const requestedLevel = body.level as SupportLevel | undefined
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1_000) : null
    if (!HUMAN_STATES.has(state)) {
      return NextResponse.json({ error: 'État de validation invalide.' }, { status: 400 })
    }
    if (state === 'non_urgent' && (!requestedLevel || !NON_URGENT_LEVELS.has(requestedLevel))) {
      return NextResponse.json({ error: 'Un niveau High, Medium ou Low est requis.' }, { status: 400 })
    }

    const [{ data: current, error: currentError }, { data: ticket, error: ticketError }, ruleset, businessHours] = await Promise.all([
      supabaseAdmin.from('ticket_urgency_assessments').select('*').eq('ticket_id', params.ticketId).maybeSingle(),
      supabaseAdmin.from('ticket_analytics').select('created_at,first_response_at,first_response_time_ms').eq('id', params.ticketId).maybeSingle(),
      loadActiveRuleset(),
      loadActiveBusinessHours(),
    ])
    if (currentError) throw new Error(currentError.message)
    if (!current) return NextResponse.json({ error: 'Ticket non préqualifié.' }, { status: 404 })
    if (ticketError) throw new Error(ticketError.message)

    const level: SupportLevel = state === 'confirmed'
      ? 'urgent'
      : state === 'to_qualify'
        ? 'urgent'
        : requestedLevel!
    const targetMinutes = ruleset.config.sla_business_minutes[level]
    const createdAt = ticket?.created_at ? new Date(ticket.created_at) : null
    const dueAt = createdAt && Number.isFinite(createdAt.getTime())
      ? addBusinessMinutes(createdAt, targetMinutes, businessHours)
      : null
    const firstResponseAt = ticket?.first_response_at ? new Date(ticket.first_response_at) : null
    const responseStatus = firstResponseStatus({
      now: new Date(),
      dueAt,
      firstResponseAt: firstResponseAt && Number.isFinite(firstResponseAt.getTime()) ? firstResponseAt : null,
      firstResponseBusinessDurationMs: finiteNumber(ticket?.first_response_time_ms),
      targetBusinessMinutes: targetMinutes,
    })
    const now = new Date().toISOString()
    const reasonText = state === 'confirmed'
      ? 'Urgence confirmée humainement'
      : state === 'non_urgent'
        ? 'Urgence écartée humainement'
        : 'Qualification humaine requise'
    const { error: updateError } = await supabaseAdmin.from('ticket_urgency_assessments').update({
      state,
      recommended_level: state === 'to_qualify' ? null : level,
      effective_sla_level: level,
      reason_code: `human_${state}`,
      reason_text: reasonText,
      first_response_due_at: dueAt?.toISOString() ?? null,
      sla_target_business_minutes: targetMinutes,
      first_response_status: responseStatus,
      source: 'human',
      human_validated_at: now,
      human_validated_by: user.id,
      human_validation_note: note,
      updated_at: now,
    }).eq('ticket_id', params.ticketId)
    if (updateError) throw new Error(updateError.message)

    const { error: eventError } = await supabaseAdmin.from('ticket_urgency_assessment_events').insert({
      ticket_id: params.ticketId,
      event_kind: 'human_validation',
      state,
      recommended_level: state === 'to_qualify' ? null : level,
      reason_code: `human_${state}`,
      reason_text: reasonText,
      confidence: 1,
      ruleset_version: ruleset.version,
      validated_by: user.id,
      validation_note: note,
      metadata: { external_writes: { zoho: false, linear: false, slack: false } },
    })
    if (eventError) throw new Error(eventError.message)
    return NextResponse.json({ ok: true, mode: 'shadow', state, level })
  } catch (error) {
    return authErrorResponse(error)
      ?? NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}
