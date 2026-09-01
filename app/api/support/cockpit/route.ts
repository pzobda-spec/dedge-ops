import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { supabaseAdmin } from '@/lib/supabase/server'
import { buildSlaBuckets, measureFalsePositives } from '@/lib/support/urgency/metrics'
import type { FirstResponseStatus, SupportLevel } from '@/lib/support/urgency/types'

export const dynamic = 'force-dynamic'

interface AssessmentRow {
  ticket_id: string
  zoho_ticket_number: string | null
  ticket_created_at: string | null
  zoho_priority: string | null
  linear_priority_label: string | null
  state: string
  effective_sla_level: SupportLevel | null
  reason_text: string | null
  confidence: number | null
  first_response_due_at: string | null
  first_response_status: FirstResponseStatus
  updated_at: string
}

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['admin', 'support'])
    const from = validDate(request.nextUrl.searchParams.get('from'))
    const to = validDate(request.nextUrl.searchParams.get('to'))
    let query = supabaseAdmin
      .from('ticket_urgency_assessments')
      .select('ticket_id,zoho_ticket_number,ticket_created_at,zoho_priority,linear_priority_label,state,effective_sla_level,reason_text,confidence,first_response_due_at,first_response_status,updated_at')
      .order('updated_at', { ascending: false })
      .limit(2_000)
    if (from) query = query.gte('ticket_created_at', `${from}T00:00:00.000Z`)
    if (to) {
      const toExclusive = new Date(`${to}T00:00:00.000Z`)
      toExclusive.setUTCDate(toExclusive.getUTCDate() + 1)
      query = query.lt('ticket_created_at', toExclusive.toISOString())
    }
    const { data, error } = await query
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as AssessmentRow[]
    const now = new Date()
    const buckets = buildSlaBuckets(rows, now)
    const overdueRows = rows.filter(row => isOverdue(row, now))
    const ticketIds = rows.slice(0, 200).map(row => row.ticket_id)
    const { data: tickets } = ticketIds.length > 0
      ? await supabaseAdmin.from('ticket_analytics').select('id,subject,status,client_name').in('id', ticketIds)
      : { data: [] }
    const ticketById = new Map((tickets ?? []).map(ticket => [ticket.id, ticket]))
    const within = buckets.reduce((sum, item) => sum + item.within_target, 0)
    const outside = buckets.reduce((sum, item) => sum + item.outside_target, 0)

    return NextResponse.json({
      mode: 'shadow',
      commitments: { urgent: '6h', high: '24h', medium: '24h', low: '48h', calendar: 'heures ouvrées Zoho' },
      overdue_count: overdueRows.length,
      first_response_within_target_pct: within + outside > 0
        ? Math.round((within / (within + outside)) * 1_000) / 10
        : null,
      by_level: buckets,
      by_state: ['probable', 'confirmed', 'non_urgent', 'to_qualify'].map(state => ({
        state,
        count: rows.filter(row => row.state === state).length,
      })),
      false_positives: await measureFalsePositives(),
      tickets: rows.slice(0, 100).map(row => ({
        ...row,
        first_response_status: isOverdue(row, now) ? 'overdue' : row.first_response_status,
        subject: ticketById.get(row.ticket_id)?.subject ?? null,
        ticket_status: ticketById.get(row.ticket_id)?.status ?? null,
        client_name: ticketById.get(row.ticket_id)?.client_name ?? null,
      })),
      external_writes: { zoho: false, linear: false, slack: false },
    })
  } catch (error) {
    return authErrorResponse(error)
      ?? NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

function isOverdue(row: Pick<AssessmentRow, 'first_response_status' | 'first_response_due_at'>, now: Date): boolean {
  return row.first_response_status === 'overdue'
    || (row.first_response_status === 'pending'
      && row.first_response_due_at !== null
      && Date.parse(row.first_response_due_at) < now.getTime())
}

function validDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null
}
