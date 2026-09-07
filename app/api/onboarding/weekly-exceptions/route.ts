import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { computePlanCharge } from '@/lib/onboarding/planCharge'
import { loadPlanChargeSources, planChargeMonths, planChargeReferenceDate } from '@/lib/onboarding/planChargeSources'
import { computeMilestoneDelays, type MilestoneDelayRow } from '@/lib/onboarding/milestoneDelay'
import { fetchAllZohoMilestones } from '@/lib/zoho/projectsClient'
import { loadRecentTicketCountsByAccountName } from '@/lib/csm/ticketHealth'
import { computeWeeklyExceptions, TICKET_BURST_WINDOW_DAYS } from '@/lib/onboarding/weeklyExceptions'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ['admin', 'onboarder', 'support', 'commercial_readonly', 'csm_lead'])

    const sources = await loadPlanChargeSources()
    const referenceDate = planChargeReferenceDate()
    const months = planChargeMonths(6)
    const plan = computePlanCharge(sources, { referenceDate, months })

    const warnings = [...plan.warnings]

    // Les jalons en retard viennent d'un appel Zoho distinct, potentiellement
    // limité en débit : sa perte ne doit pas faire échouer toute la vue.
    let overdueMilestones: readonly MilestoneDelayRow[] = []
    let milestonesTruncated = false
    try {
      const { milestones, truncated } = await fetchAllZohoMilestones()
      milestonesTruncated = truncated
      const delays = computeMilestoneDelays({ milestones, projects: sources.projects, referenceDate })
      overdueMilestones = delays.actionable
    } catch (error) {
      warnings.push(
        `Jalons en retard indisponibles (règle milestone_overdue absente de cette réponse) : ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }

    const recentTicketsByAccountName = await loadRecentTicketCountsByAccountName(
      referenceDate,
      TICKET_BURST_WINDOW_DAYS,
      warnings,
    )

    const result = computeWeeklyExceptions({
      overdueMilestones,
      projects: sources.projects,
      csmAccounts: plan.csmAccounts.rows,
      ticketsByAccountName: sources.ticketsByAccountName,
      recentTicketsByAccountName,
      obRoster: plan.obRoster,
      referenceDate,
    })

    return NextResponse.json({
      referenceDate,
      subjectCount: result.subjectCount,
      reasonCount: result.reasonCount,
      countsByRule: result.countsByRule,
      rows: result.rows,
      uncoveredRules: result.uncoveredRules,
      warnings,
      milestonesTruncated,
    })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
