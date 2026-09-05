/**
 * Orchestration du plan de charge OB / CSM : pipeline, points de départ du mois
 * courant, puis moteur d'attribution. Module pur, il reçoit les sources déjà
 * chargées par `loadPlanChargeSources`.
 *
 * L'ordre des étapes n'est pas arbitraire. Les points de départ du mois se
 * calculent APRÈS le pipeline et en excluant ses comptes : un compte dont la
 * date de démarrage tombe plus tard dans le mois courant est à la fois au
 * pipeline et sur le mois courant. Le compter des deux côtés le ferait peser
 * deux fois sur le même mois.
 */

import {
  buildPlanChargePipeline,
  computeCurrentMonthBasePoints,
  type CurrentMonthBasePointsResult,
  type PlanChargePipelineResult,
} from '@/lib/onboarding/pipeline'
import {
  runAssignmentEngine,
  type AssignmentEngineResult,
  type BalanceMode,
  type CsmMember,
  type ObMember,
} from '@/lib/onboarding/assignmentEngine'
import type { PlanChargeSources } from '@/lib/onboarding/planChargeSources'

/** Options de calcul du plan de charge. */
export interface ComputePlanChargeOptions {
  /** Date de référence 'YYYY-MM-DD', injectée pour rester déterministe. */
  referenceDate: string
  /** Horizon de projection, 'YYYY-MM' triés. */
  months: readonly string[]
  balanceMode?: BalanceMode
}

/** Résultat complet, prêt à être sérialisé par la route API. */
export interface PlanChargeComputation {
  referenceDate: string
  currentMonth: string
  pipeline: PlanChargePipelineResult
  basePoints: CurrentMonthBasePointsResult
  engine: AssignmentEngineResult
  obRoster: ObMember[]
  /** Roster CSM enrichi des points déjà attribués sur le mois courant. */
  csmRoster: CsmMember[]
  dealsTruncated: boolean
  warnings: string[]
}

/** Enchaîne pipeline, points de départ et moteur à partir des sources chargées. */
export function computePlanCharge(
  sources: PlanChargeSources,
  options: ComputePlanChargeOptions,
): PlanChargeComputation {
  const currentMonth = options.referenceDate.slice(0, 7)
  const warnings = [...sources.warnings]

  const pipeline = buildPlanChargePipeline({
    accounts: sources.accounts,
    projects: sources.projects,
    wonDeals: sources.wonDeals,
    csmDirectory: sources.csmDirectory,
    overrides: sources.overrides,
    referenceDate: options.referenceDate,
  })

  const basePoints = computeCurrentMonthBasePoints({
    accounts: sources.accounts,
    projects: sources.projects,
    csmDirectory: sources.csmDirectory,
    weightRules: sources.weightRules,
    currentMonth,
    excludeAccountIds: new Set(pipeline.pipeline.map(account => account.id)),
  })

  if (basePoints.unresolvedCsm.length > 0) {
    warnings.push(
      `${basePoints.unresolvedCsm.length} compte(s) du mois courant ont un CSM non résolu : leurs points ne sont comptés pour personne.`,
    )
  }
  if (pipeline.diagnostics.unresolvedCsm.length > 0) {
    warnings.push(
      `${pipeline.diagnostics.unresolvedCsm.length} compte(s) du pipeline ont un CSM Zoho non résolu.`,
    )
  }

  const csmRoster: CsmMember[] = sources.csmRoster.map(member => ({
    ...member,
    currentMonthBasePoints: basePoints.pointsByCsm[member.name] ?? 0,
  }))

  const engine = runAssignmentEngine({
    pipeline: pipeline.pipeline,
    obRoster: sources.obRoster,
    csmRoster,
    groupContinuity: pipeline.groupContinuity,
    weightRules: sources.weightRules,
    months: options.months,
    currentMonth,
    balanceMode: options.balanceMode,
  })

  return {
    referenceDate: options.referenceDate,
    currentMonth,
    pipeline,
    basePoints,
    engine,
    obRoster: sources.obRoster,
    csmRoster,
    dealsTruncated: sources.dealsTruncated,
    warnings,
  }
}
