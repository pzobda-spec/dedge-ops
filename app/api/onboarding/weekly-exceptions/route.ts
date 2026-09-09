import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { fetchAllPages } from '@/lib/supabase/pagination'
import { buildProjectFollowThrough } from '@/lib/onboarding/followThrough'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { computePlanCharge } from '@/lib/onboarding/planCharge'
import { loadPlanChargeSources, planChargeMonths, planChargeReferenceDate } from '@/lib/onboarding/planChargeSources'
import { computeMilestoneDelays, type MilestoneDelayRow } from '@/lib/onboarding/milestoneDelay'
import { fetchAllZohoMilestones } from '@/lib/zoho/projectsClient'
import { loadRecentTicketCountsByAccountName } from '@/lib/csm/ticketHealth'
import { computeWeeklyExceptions, TICKET_BURST_WINDOW_DAYS, type WeeklyExceptionsResponse } from '@/lib/onboarding/weeklyExceptions'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ['admin', 'onboarder', 'support', 'commercial_readonly', 'csm_lead'])

    const sources = await loadPlanChargeSources()
    const referenceDate = planChargeReferenceDate()
    const months = planChargeMonths(6)
    const plan = computePlanCharge(sources, { referenceDate, months })

    const warnings = [...plan.warnings]
    let projectFollowThrough: ReturnType<typeof buildProjectFollowThrough> | undefined
    try {
      const { data, error } = await fetchAllPages((from, to) => supabaseAdmin.from('onboarding_projects')
        .select('id,zoho_project_id,next_action,next_action_due,next_action_owner,current_blocker').order('id').range(from, to))
      if (error) throw new Error(error.message)
      projectFollowThrough = buildProjectFollowThrough(sources.projects, data ?? [], referenceDate)
    } catch {
      warnings.push('Prochaines actions des projets indisponibles : leur absence dans cette vue ne signifie pas qu’elles sont réalisées.')
    }

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
      ...result,
      referenceDate,
      warnings,
      milestonesTruncated,
      projectFollowThrough,
    } satisfies WeeklyExceptionsResponse)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
