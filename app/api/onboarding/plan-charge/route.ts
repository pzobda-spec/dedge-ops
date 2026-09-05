import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { effectiveCapacity } from '@/lib/onboarding/capacityModel'
import { computePlanCharge } from '@/lib/onboarding/planCharge'
import { loadPlanChargeSources, planChargeMonths, planChargeReferenceDate } from '@/lib/onboarding/planChargeSources'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ['admin', 'onboarder', 'support', 'commercial_readonly', 'csm_lead'])

    const sources = await loadPlanChargeSources()
    const referenceDate = planChargeReferenceDate()
    const months = planChargeMonths(6)
    const plan = computePlanCharge(sources, { referenceDate, months })

    const assignmentsByAccountId = new Map(
      plan.engine.assignments.map(assignment => [assignment.accountId, assignment]),
    )

    const accounts = plan.pipeline.entries.map(entry => {
      const assignment = assignmentsByAccountId.get(entry.account.id)
      const obSource = assignment?.obSource ?? null
      const csmSource = assignment?.csmSource ?? null

      return {
        accountId: entry.account.id,
        accountName: entry.account.name,
        groupId: entry.account.groupId,
        tier: entry.account.tier,
        isGroup: entry.account.isGroup,
        hotels: entry.account.hotels,
        hotelsSource: entry.hotelsSource,
        dmbookOnly: entry.account.dmbookOnly,
        weight: assignment?.weight ?? 0,
        signedDate: entry.account.signedDate,
        signedDateSource: entry.signedDateSource,
        goLiveMonth: entry.account.expectedGoLiveMonth,
        obOwner: assignment?.obOwner ?? null,
        obSource,
        obEligibleCount: assignment?.obEligibleCount ?? 0,
        obLocked: obSource === 'override',
        csmName: assignment?.csmName ?? null,
        csmSource,
        csmEligibleCount: assignment?.csmEligibleCount ?? 0,
        csmLocked: csmSource === 'override',
        rawCsm: entry.rawCsm,
        resolvedCsm: entry.resolvedCsm,
      }
    })

    const obRoster = plan.obRoster.map(member => ({
      name: member.name,
      role: member.role,
      maxProjects: member.maxProjects,
      availability: member.availability,
      effectiveCapacity: effectiveCapacity(member.maxProjects, member.availability),
      load: plan.engine.obLoad[member.name] ?? 0,
      // Part de la charge déjà portée avant toute pré-attribution du pipeline.
      currentActiveProjects: member.currentActiveProjects ?? 0,
    }))

    const csmRoster = plan.csmRoster.map(member => ({
      name: member.name,
      monthlyCapacityPoints: member.monthlyCapacityPoints,
      availability: member.availability,
      effectiveCapacity: effectiveCapacity(member.monthlyCapacityPoints, member.availability),
      currentMonthBasePoints: member.currentMonthBasePoints ?? 0,
    }))

    return NextResponse.json({
      referenceDate: plan.referenceDate,
      currentMonth: plan.currentMonth,
      // Horizon effectif du moteur, pas les 6 mois demandés : il inclut les
      // mois de go-live plus lointains du pipeline. Renvoyer l'horizon court
      // afficherait des dépassements sur des mois absents des graphiques.
      months: plan.engine.months,
      accounts,
      obRoster,
      csmRoster,
      obLoadByMonth: plan.engine.obLoadByMonth,
      csmLoadByMonth: plan.engine.csmLoadByMonth,
      obOverloads: plan.engine.obOverloads,
      csmOverloads: plan.engine.csmOverloads,
      groupContinuity: plan.pipeline.groupContinuity,
      weightRules: sources.weightRules,
      unassigned: plan.engine.unassigned,
      diagnostics: plan.pipeline.diagnostics,
      dealsTruncated: plan.dealsTruncated,
      warnings: plan.warnings,
      csmPortfolios: plan.csmPortfolios.rows,
    })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
