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
import { countActiveProjectsByOwner } from '@/lib/onboarding/workload'
import { computeCsmPortfolios, type CsmPortfolioResult } from '@/lib/onboarding/csmAnalytics'
import type { PlanChargeSources } from '@/lib/onboarding/planChargeSources'
import { buildCsmAccountRows, type CsmAccountRowsResult } from '@/lib/csm/dashboard'

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
  /** Projets actifs par implémenteur, tels que comptés par /onboarding/pilotage. */
  activeProjectsByOwner: Record<string, number>
  dealsTruncated: boolean
  warnings: string[]
  csmPortfolios: CsmPortfolioResult
  csmAccounts: CsmAccountRowsResult
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

  // Charge OB de départ : les projets actifs réels. Sans cet amorçage le
  // moteur partirait de zéro, afficherait un implémenteur en surcharge comme
  // vide, et lui attribuerait encore des comptes.
  const activeProjectsByOwner = countActiveProjectsByOwner(sources.projects)
  const obRoster: ObMember[] = sources.obRoster.map(member => ({
    ...member,
    currentActiveProjects: activeProjectsByOwner[member.name] ?? 0,
  }))

  const orphanOwners = Object.keys(activeProjectsByOwner).filter(
    owner => !sources.obRoster.some(member => member.name === owner),
  )
  if (orphanOwners.length > 0) {
    warnings.push(
      `Projets actifs portés par des personnes absentes du roster OB, non comptés dans la capacité : ${orphanOwners.join(', ')}.`,
    )
  }

  const engine = runAssignmentEngine({
    pipeline: pipeline.pipeline,
    obRoster,
    csmRoster,
    groupContinuity: pipeline.groupContinuity,
    weightRules: sources.weightRules,
    months: options.months,
    currentMonth,
    balanceMode: options.balanceMode,
  })

  const csmPortfolios = computeCsmPortfolios({
    accounts: sources.accounts,
    projects: sources.projects,
    csmDirectory: sources.csmDirectory,
    csmNames: sources.csmRoster.map(member => member.name),
    currentMonth,
  })

  if (csmPortfolios.unresolvedAccounts.length > 0) {
    warnings.push(
      `${csmPortfolios.unresolvedAccounts.length} compte(s) ne sont rattachés à aucun portefeuille CSM faute de résolution du nom.`,
    )
  }

  const csmAccounts = buildCsmAccountRows({
    accounts: sources.accounts,
    projects: sources.projects,
    csmDirectory: sources.csmDirectory,
    csmNames: sources.csmRoster.map(member => member.name),
    ticketsByAccountName: sources.ticketsByAccountName,
  })

  const unmanagedRows = csmAccounts.rows.filter(row => row.unmanagedOwner)
  if (unmanagedRows.length > 0) {
    const unmanagedMrr = unmanagedRows.reduce((sum, row) => sum + row.mrr, 0)
    warnings.push(
      `${unmanagedRows.length} compte(s) portés par un ancien CSM sont à réattribuer, pour un MRR de ${unmanagedMrr}.`,
    )
  }

  return {
    referenceDate: options.referenceDate,
    currentMonth,
    pipeline,
    basePoints,
    engine,
    obRoster,
    csmRoster,
    activeProjectsByOwner,
    dealsTruncated: sources.dealsTruncated,
    warnings,
    csmPortfolios,
    csmAccounts,
  }
}
