import { NextRequest, NextResponse } from 'next/server'
import { monthKey, monthStart, shiftMonth, supportMetrics, PHONE_BREAK_NOTE } from '@/lib/reporting/monthly'
import { readCoverage, readTickets, readImplementation, certifiedPeriod } from '@/lib/reporting/source'
import { CRM_P1_FIRST_RESPONSE_PALIER, MAX_RESOLUTION_DAYS } from '@/lib/reporting/slaProfiles'

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
    const yearAgoMonth = shiftMonth(month, -12)
    const yearAgoFrom = monthStart(yearAgoMonth)
    const yearAgoTo = monthStart(shiftMonth(yearAgoMonth, 1))
    const [rows, yearAgoRows, coverage, implementation] = await Promise.all([
      readTickets(from, to), readTickets(yearAgoFrom, yearAgoTo), readCoverage(),
      readImplementation(from, to).then(data => ({ data, error: null })).catch(() => ({ data: null, error: 'Les données Zoho Projects synchronisées sont indisponibles.' })),
    ])
    return NextResponse.json({
      month, support: supportMetrics(rows, from, to), year_ago: { month: yearAgoMonth, support: supportMetrics(yearAgoRows, yearAgoFrom, yearAgoTo) }, implementation,
      coverage: { ...coverage, tickets_read: rows.length, certified: certifiedPeriod(coverage, from, to), partial_month: to > new Date() },
      unavailable: {
        quality: 'CSAT, insatisfaction, taux de réponse aux enquêtes et IQS : aucune source de qualité exploitable dans les données synchronisées.',
        sla: `Conformité calculée séparément pour la première réponse et la résolution : temps calendaires, sans horaires ouvrés ni jours fériés. La première réponse reste une réponse mesurée, pas la première action. Les priorités sont mappées approximativement Urgent→P1, High→P2, Medium→P3, Low→P4 car la source ne contient pas P1–P4. Les paliers P1 CRM (${CRM_P1_FIRST_RESPONSE_PALIER.map(palier => `${palier.hours} h ${palier.label.toLowerCase()}`).join(' ; ')}) ont des dates d’effet à renseigner ; le palier actif est donc appliqué à toute la période et l’historique n’est pas remesuré au seuil passé. P2–P4 en première réponse et toutes les résolutions CRM reprennent provisoirement les seuils du profil groupe. Les délais de résolution >${MAX_RESOLUTION_DAYS} jours sont non conformes dans le taux, même s’ils restent exclus de la moyenne.`,
        cancellation: 'Exclusion des annulations non garantie : le statut brut n’est pas conservé. Les volumes incluent tous les tickets synchronisés.',
        phone: 'Appels entrants, appels manqués et décrochés en moins de 30 s : journal de téléphonie non connecté au cockpit. Les tickets Phone ne permettent pas ces mesures.',
        implementation: 'Les lancements officiels utilisent la date de démarrage renseignée dans Zoho Projects, ventilés CRM et Dmbook. Les transitions Non démarré → In Progress sont conservées à part comme signal observé ; les reprises et imports ne sont pas assimilés à un lancement. Live utilise le champ Live date renseigné, sinon une transition observée ; les remises en Live successives ne sont pas toutes historisées.',
        projects: 'Projets transverses Support / Implémentation / CSM : prochaines étapes et décisions à renseigner dans les slides. Le portefeuille ci-dessous reflète les statuts actuels des projets d’onboarding, pas une situation historique de fin de mois.',
      },
      phone_break_note: PHONE_BREAK_NOTE,
      meta: { from: from.toISOString(), to: to.toISOString(), source: 'Supabase · ticket_analytics, onboarding_projects et onboarding_events (Zoho Projects synchronisé)', generated_at: new Date().toISOString() },
    })
  } catch {
    return NextResponse.json({ error: 'La synthèse mensuelle est temporairement indisponible.' }, { status: 502 })
  }
}
