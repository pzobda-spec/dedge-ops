/**
 * Analyse du portefeuille CSM : une ligne par CSM, dérivée des comptes CRM et
 * des projets Zoho déjà chargés. Module pur, aucun appel réseau, aucune
 * mutation de ses entrées — même contrat que `lib/onboarding/pipeline.ts`.
 */

import type { CRMAccount } from '@/lib/zoho/crmClient'
import type { OnboardingProject } from '@/lib/zoho/projectsClient'
import { effectiveMonthForAccount, indexProjectsByAccount, oldestGoLiveByAccount } from '@/lib/onboarding/pipeline'
import { resolveCsmName, type CsmDirectoryEntry } from '@/lib/onboarding/csmDirectory'

/** Une ligne d'analyse du portefeuille d'un CSM. */
export interface CsmPortfolioRow {
  csmName: string
  /** Comptes CRM du portefeuille ayant au moins un projet en statut `live`. */
  liveAccounts: number
  /** Comptes du portefeuille, live ou non. */
  totalAccounts: number
  /** Projets du portefeuille bloqués, en retard, ou à risque élevé ou critique. */
  attentionProjects: number
  /** Comptes du portefeuille dont la passation ou le go-live tombe sur le mois courant. */
  goLivesThisMonth: number
}

/** Entrée de `computeCsmPortfolios`. */
export interface CsmPortfolioInput {
  accounts: readonly CRMAccount[]
  projects: readonly OnboardingProject[]
  csmDirectory: readonly CsmDirectoryEntry[]
  /** Noms canoniques du roster, pour produire une ligne même à portefeuille vide. */
  csmNames: readonly string[]
  /** Mois courant, 'YYYY-MM'. */
  currentMonth: string
}

/** Résultat de `computeCsmPortfolios`. */
export interface CsmPortfolioResult {
  rows: CsmPortfolioRow[]
  /** Comptes dont le CSM Zoho n'a pas pu être résolu : rattachés à aucun portefeuille. */
  unresolvedAccounts: { accountId: string; accountName: string; rawCsm: string }[]
}

function isAttentionProject(project: OnboardingProject): boolean {
  return (
    project.isBlocked ||
    project.isOverdue ||
    project.riskLevel === 'high' ||
    project.riskLevel === 'critical'
  )
}

export function computeCsmPortfolios(input: CsmPortfolioInput): CsmPortfolioResult {
  const { accounts, projects, csmDirectory, csmNames, currentMonth } = input

  const projectsIndex = indexProjectsByAccount(accounts, projects)
  const goLiveByAccountId = oldestGoLiveByAccount(projectsIndex)

  const accountsByCsm = new Map<string, CRMAccount[]>()
  const unresolvedAccounts: CsmPortfolioResult['unresolvedAccounts'] = []

  for (const account of accounts) {
    const rawCsm = account.csm
    const resolution = resolveCsmName(csmDirectory, { name: account.csm, userId: account.csmUserId })
    if (!resolution.csmName) {
      if (rawCsm && rawCsm.trim()) {
        unresolvedAccounts.push({ accountId: account.id, accountName: account.name, rawCsm: rawCsm.trim() })
      }
      continue
    }
    const list = accountsByCsm.get(resolution.csmName) ?? []
    list.push(account)
    accountsByCsm.set(resolution.csmName, list)
  }

  const allCsmNames = new Set<string>(csmNames)
  for (const name of accountsByCsm.keys()) allCsmNames.add(name)

  const rows: CsmPortfolioRow[] = []
  for (const csmName of allCsmNames) {
    const portfolioAccounts = accountsByCsm.get(csmName) ?? []

    let liveAccounts = 0
    let attentionProjects = 0
    let goLivesThisMonth = 0

    for (const account of portfolioAccounts) {
      const accountProjects = projectsIndex.byAccountId.get(account.id) ?? []
      if (accountProjects.some(project => project.status === 'live')) liveAccounts += 1
      for (const project of accountProjects) {
        if (isAttentionProject(project)) attentionProjects += 1
      }

      const effectiveMonth = effectiveMonthForAccount(account, goLiveByAccountId)

      if (effectiveMonth === currentMonth) goLivesThisMonth += 1
    }

    rows.push({
      csmName,
      liveAccounts,
      totalAccounts: portfolioAccounts.length,
      attentionProjects,
      goLivesThisMonth,
    })
  }

  rows.sort((a, b) => (a.csmName < b.csmName ? -1 : a.csmName > b.csmName ? 1 : 0))

  return { rows, unresolvedAccounts }
}
