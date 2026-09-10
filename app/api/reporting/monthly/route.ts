import { NextRequest, NextResponse } from 'next/server'
import { monthKey, monthStart, shiftMonth, supportMetrics, PHONE_BREAK_NOTE } from '@/lib/reporting/monthly'
import { readCoverage, readTickets, readImplementation, certifiedPeriod } from '@/lib/reporting/source'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get('month') ?? shiftMonth(monthKey(new Date()), -1)
  let from: Date, to: Date
  try {
    from = monthStart(month)
    to = monthStart(shiftMonth(month, 1))
    if (from > new Date()) throw new Error('Le mois sélectionné est dans le futur.')
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Mois invalide.' }, { status: 400 })
  }
  try {
    const [rows, coverage, implementation] = await Promise.all([
      readTickets(from, to), readCoverage(),
      readImplementation(from, to).then(data => ({ data, error: null })).catch(() => ({ data: null, error: 'Les données Zoho Projects synchronisées sont indisponibles.' })),
    ])
    return NextResponse.json({
      month, support: supportMetrics(rows, from, to), implementation,
      coverage: { ...coverage, tickets_read: rows.length, certified: certifiedPeriod(coverage, from, to), partial_month: to > new Date() },
      unavailable: {
        quality: 'CSAT, insatisfaction, taux de réponse aux enquêtes et IQS : aucune source de qualité exploitable dans les données synchronisées.',
        sla: 'Première action et SLA P1–P4 : la première réponse n’est pas la première action. Priorités normalisées et calendrier de service insuffisants pour appliquer les seuils des slides.',
        cancellation: 'Exclusion des annulations non garantie : le statut brut n’est pas conservé. Les volumes incluent tous les tickets synchronisés.',
        phone: 'Appels entrants, appels manqués et décrochés en moins de 30 s : journal de téléphonie non connecté au cockpit. Les tickets Phone ne permettent pas ces mesures.',
        implementation: 'Les nouveaux démarrages comptent uniquement les transitions Non démarré → In Progress, détectées pendant le mois par la synchronisation quotidienne. Les reprises depuis Pending, une pause ou un autre statut sont exclues. Un import déjà In Progress ne prouve pas un nouveau démarrage. Les dates de détection peuvent différer du jour exact dans Zoho ; les transitions entre deux synchronisations et avant le début du suivi ne sont pas reconstituées. Live utilise le champ Live date renseigné, sinon une transition observée ; les remises en Live successives ne sont pas toutes historisées.',
        projects: 'Projets transverses Support / Implémentation / CSM : prochaines étapes et décisions à renseigner dans les slides. Le portefeuille ci-dessous reflète les statuts actuels des projets d’onboarding, pas une situation historique de fin de mois.',
      },
      phone_break_note: PHONE_BREAK_NOTE,
      meta: { from: from.toISOString(), to: to.toISOString(), source: 'Supabase · ticket_analytics, onboarding_projects et onboarding_events (Zoho Projects synchronisé)', generated_at: new Date().toISOString() },
    })
  } catch {
    return NextResponse.json({ error: 'La synthèse mensuelle est temporairement indisponible.' }, { status: 502 })
  }
}
