import { NextRequest, NextResponse } from 'next/server'
import { channelRange, channelMetrics, PHONE_BREAK_NOTE, monthStart, shiftMonth } from '@/lib/reporting/monthly'
import { readTickets, readCoverage, certifiedPeriod } from '@/lib/reporting/source'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

export async function GET(request: NextRequest) {
  let range
  try { range = channelRange(request.nextUrl.searchParams) } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Période invalide.' }, { status: 400 })
  }
  try {
    const { from, to } = range
    const [rows, coverage] = await Promise.all([readTickets(from, to, true), readCoverage()])
    const stats = channelMetrics(rows, from, to)
    return NextResponse.json({
      ...stats,
      months: stats.months.map(month => ({ ...month, certified: certifiedPeriod(coverage, monthStart(month.key), monthStart(shiftMonth(month.key, 1))) })),
      coverage: { ...coverage, tickets_read: rows.length },
      meta: { from: from.toISOString(), to: to.toISOString(), end_exclusive: true, source: 'Supabase · ticket_analytics.source (canal brut)', generated_at: new Date().toISOString() },
      phone_break: { from: '2026-03', to: '2026-04', note: PHONE_BREAK_NOTE },
      limitations: ['Les tickets Phone sont une mesure de tickets, pas un journal d’appels. Le ratio d’estimation de 0,5 appel par ticket reste une hypothèse non validée.', 'Les bornes observées ne garantissent pas l’exhaustivité ; les mois non certifiés et les mois partiels sont signalés.'],
    })
  } catch {
    return NextResponse.json({ error: 'Les statistiques par canal sont temporairement indisponibles.' }, { status: 502 })
  }
}
