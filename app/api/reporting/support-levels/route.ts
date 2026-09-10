import { NextRequest, NextResponse } from 'next/server'
import { monthKey, monthStart, shiftMonth } from '@/lib/reporting/monthly'
import { readTickets } from '@/lib/reporting/source'
import { readSupportLevels } from '@/lib/reporting/supportLevelSource'
import { supportLevelMetrics } from '@/lib/reporting/supportLevels'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get('month') ?? shiftMonth(monthKey(new Date()), -1)
  let from: Date, to: Date
  try {
    from = monthStart(month); to = monthStart(shiftMonth(month, 1))
    if (from > new Date()) throw new Error('Le mois sélectionné est dans le futur.')
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Mois invalide.' }, { status: 400 })
  }
  try {
    const rows = (await readTickets(from, to)).filter(row => row.resolved_at && Date.parse(row.resolved_at) >= from.getTime() && Date.parse(row.resolved_at) < to.getTime())
    const result = await readSupportLevels(rows.flatMap(row => row.id ? [row.id] : []))
    return NextResponse.json({
      month, ...supportLevelMetrics(rows, result.levels),
      coverage: { queried: result.queried, oldest_checked_at: result.oldest_checked_at, cache_minutes: 15 },
      note: 'L1 : champ de lien Linear présent mais vide. L2 : lien d’issue Linear renseigné. Champ absent, invalide ou lecture impossible : niveau non déterminé. Le classement utilise le lien actuel, pas sa présence historique à la clôture. Les délais sont calendaires, du ticket créé au ticket clôturé, hors délais supérieurs à 90 jours ; L2 ne mesure pas uniquement le temps passé chez les développeurs.',
    })
  } catch {
    return NextResponse.json({ error: 'La ventilation L1 / L2 est temporairement indisponible.' }, { status: 502 })
  }
}
