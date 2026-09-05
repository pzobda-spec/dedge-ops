/**
 * Construit le pipeline de comptes « signés pas encore live » à partir de
 * données CRM/Projects Zoho déjà chargées, prêt à être passé au moteur
 * d'attribution (`assignmentEngine`). Module pur : aucun appel réseau, il
 * reçoit ses données déjà chargées, ce qui le rend testable.
 *
 * Deux pièges Zoho documentés en §7 du brief (`docs/plan-charge-attribution-spec.md`) :
 * 1. Sur un deal `Won`, `Account_Name` pointe vers un compte générique
 *    « D-EDGE » et non vers le vrai client : on n'apparie donc JAMAIS un deal
 *    à un compte via ce champ, seulement par similarité de texte entre
 *    `Deal_Name` et le nom du compte, et ce rapprochement reste approximatif.
 * 2. Le lookup `CSM` de Zoho renvoie un libellé non normalisé (nom complet ou
 *    seul nom de famille) : toute résolution passe par `resolveCsmName`, et
 *    un CSM non résolu est explicitement signalé, jamais deviné.
 */

import { distance } from 'fastest-levenshtein'
import type { CRMAccount, ZohoWonDeal } from '@/lib/zoho/crmClient'
import type { OnboardingProject } from '@/lib/zoho/projectsClient'
import { tierFromSegment, type AccountTier } from '@/lib/onboarding/capacityModel'
import type { PipelineAccount } from '@/lib/onboarding/assignmentEngine'
import { resolveCsmName, type CsmDirectoryEntry } from '@/lib/onboarding/csmDirectory'

/** Override manuel persisté, image d'une ligne d'`account_assignments`. */
export interface AccountAssignmentOverride {
  accountId: string
  obOwner: string | null
  obLocked: boolean
  csmName: string | null
  csmLocked: boolean
}

/** Entrée du constructeur de pipeline. */
export interface PlanChargePipelineInput {
  /** TOUS les comptes CRM, y compris ceux à MRR nul (nécessaire au comptage des hôtels d'un groupe). */
  accounts: readonly CRMAccount[]
  projects: readonly OnboardingProject[]
  wonDeals?: readonly ZohoWonDeal[]
  csmDirectory: readonly CsmDirectoryEntry[]
  overrides?: readonly AccountAssignmentOverride[]
  /** Date de référence 'YYYY-MM-DD', injectée pour rester déterministe. */
  referenceDate: string
}

/** Origine de la date de signature retenue pour un compte. */
export type SignedDateSource = 'deal' | 'account_created' | 'unknown'

/** Un compte du pipeline, enrichi des informations de traçabilité. */
export interface PlanChargePipelineEntry {
  /** Compte du moteur, consommé tel quel par `assignmentEngine`. */
  account: PipelineAccount
  signedDateSource: SignedDateSource
  matchedDealId: string | null
  hotelsSource: 'zoho_field' | 'sibling_count' | 'children_count' | 'default'
  rawCsm: string | null
  resolvedCsm: string | null
}

/** Diagnostics de construction du pipeline, jamais de valeur devinée. */
export interface PlanChargeDiagnostics {
  totalAccounts: number
  clientAccounts: number
  withFutureSubStart: number
  excludedAlreadyLive: number
  liveProjectsUnlinked: number
  hotelsFromFallback: number
  /** Comptes du pipeline pour lesquels un deal gagné a pu être apparié par similarité de nom. */
  dealsMatched: number
  /** Comptes du pipeline sans deal gagné apparié : leur date de signature vient d'un repli. */
  dealsUnmatched: number
  /** Comptes dont la date de signature n'a pu être ni appariée ni déduite, retombés sur la date de référence. */
  signedDateUnknown: number
  /** Comptes dont le CSM Zoho n'a pas pu être résolu. Jamais deviné. */
  unresolvedCsm: { accountId: string; accountName: string; rawCsm: string }[]
  /** Groupes du pipeline sans continuité CSM identifiable. */
  groupsWithoutContinuity: string[]
}

/** Résultat complet de la construction du pipeline. */
export interface PlanChargePipelineResult {
  entries: PlanChargePipelineEntry[]
  /** Prêt à être passé au moteur. */
  pipeline: PipelineAccount[]
  /** groupId -> nom canonique du CSM qui suit déjà le groupe. */
  groupContinuity: Record<string, string>
  diagnostics: PlanChargeDiagnostics
}

/** Seuil de similarité minimal pour apparier un deal gagné à un compte. Volontairement
 * conservateur : mieux vaut un repli de date de signature qu'un mauvais rattachement. */
export const DEAL_MATCH_THRESHOLD = 0.9

/** Normalisation stricte de nom de compte pour comparaison (majuscules, trim, espaces réduits). */
function normalizeAccountName(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ')
}

/** Normalisation pour la similarité de texte : minuscules, sans diacritiques, alphanumérique. */
function normalizeForSimilarity(value: string): string {
  return value
    .toLocaleLowerCase('fr-FR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Score de similarité [0, 1] entre deux libellés de compte, via distance de Levenshtein normalisée. */
function accountLabelSimilarity(left: string, right: string): number {
  const a = normalizeForSimilarity(left)
  const b = normalizeForSimilarity(right)
  if (!a || !b) return 0
  if (a === b) return 1
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 0
  return 1 - distance(a, b) / maxLen
}

function isPositiveInteger(value: number | null): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

export function buildPlanChargePipeline(input: PlanChargePipelineInput): PlanChargePipelineResult {
  const { accounts, projects, csmDirectory, referenceDate } = input
  const wonDeals = input.wonDeals ?? []
  const overrides = input.overrides ?? []

  // --- 1. Index. ---
  const accountsById = new Map<string, CRMAccount>()
  for (const account of accounts) accountsById.set(account.id, account)

  const childrenByParentId = new Map<string, CRMAccount[]>()
  for (const account of accounts) {
    if (!account.parentId) continue
    const siblings = childrenByParentId.get(account.parentId) ?? []
    siblings.push(account)
    childrenByParentId.set(account.parentId, siblings)
  }

  const overridesByAccountId = new Map<string, AccountAssignmentOverride>()
  for (const override of overrides) overridesByAccountId.set(override.accountId, override)

  // --- 2. Comptes déjà live. ---
  const liveAccountIds = new Set<string>()
  let liveProjectsUnlinked = 0
  const accountsByNormalizedName = new Map<string, CRMAccount[]>()
  for (const account of accounts) {
    const key = normalizeAccountName(account.name)
    const list = accountsByNormalizedName.get(key) ?? []
    list.push(account)
    accountsByNormalizedName.set(key, list)
  }

  for (const project of projects) {
    if (project.status !== 'live') continue
    let matched = false
    if (project.accountCRMId && accountsById.has(project.accountCRMId)) {
      liveAccountIds.add(project.accountCRMId)
      matched = true
    } else if (project.accountCRMName) {
      const candidates = accountsByNormalizedName.get(normalizeAccountName(project.accountCRMName)) ?? []
      if (candidates.length === 1) {
        liveAccountIds.add(candidates[0].id)
        matched = true
      }
    }
    if (!matched) liveProjectsUnlinked += 1
  }

  // --- 3. Sélection du pipeline. ---
  let clientAccounts = 0
  let withFutureSubStart = 0
  let excludedAlreadyLive = 0

  const selected: CRMAccount[] = []
  for (const account of accounts) {
    const isClient = (account.accountType ?? '').trim().toLowerCase() === 'client'
    if (isClient) clientAccounts += 1

    const hasFutureSubStart = Boolean(account.subStartDate) && account.subStartDate! > referenceDate
    if (isClient && hasFutureSubStart) withFutureSubStart += 1

    if (!isClient || !hasFutureSubStart) continue

    if (liveAccountIds.has(account.id)) {
      excludedAlreadyLive += 1
      continue
    }

    selected.push(account)
  }

  // --- 5. Appariement des deals gagnés (calculé avant l'étape 4 pour renseigner signedDate). ---
  let dealsMatched = 0
  let dealsUnmatched = 0
  const dealForAccountId = new Map<string, ZohoWonDeal>()

  if (selected.length > 0 && wonDeals.length > 0) {
    type Candidate = { account: CRMAccount; deal: ZohoWonDeal; score: number }
    const candidates: Candidate[] = []
    for (const account of selected) {
      for (const deal of wonDeals) {
        const score = accountLabelSimilarity(deal.dealName, account.name)
        if (score >= DEAL_MATCH_THRESHOLD) {
          candidates.push({ account, deal, score })
        }
      }
    }
    // Meilleur score d'abord ; tri stable par id pour rester déterministe en cas d'égalité.
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (a.account.id !== b.account.id) return a.account.id < b.account.id ? -1 : 1
      return a.deal.id < b.deal.id ? -1 : 1
    })

    const usedAccounts = new Set<string>()
    const usedDeals = new Set<string>()
    const ambiguousAccounts = new Set<string>()
    const ambiguousDeals = new Set<string>()

    // Détection des égalités parfaites de meilleur score par compte/deal : on
    // repère les scores maximaux dupliqués et on refuse d'apparier ces cas.
    const bestScoreForAccount = new Map<string, number>()
    const countAtBestForAccount = new Map<string, number>()
    const bestScoreForDeal = new Map<string, number>()
    const countAtBestForDeal = new Map<string, number>()
    for (const candidate of candidates) {
      const accId = candidate.account.id
      const dealId = candidate.deal.id
      const prevAcc = bestScoreForAccount.get(accId)
      if (prevAcc === undefined || candidate.score > prevAcc) {
        bestScoreForAccount.set(accId, candidate.score)
        countAtBestForAccount.set(accId, 1)
      } else if (candidate.score === prevAcc) {
        countAtBestForAccount.set(accId, (countAtBestForAccount.get(accId) ?? 1) + 1)
      }
      const prevDeal = bestScoreForDeal.get(dealId)
      if (prevDeal === undefined || candidate.score > prevDeal) {
        bestScoreForDeal.set(dealId, candidate.score)
        countAtBestForDeal.set(dealId, 1)
      } else if (candidate.score === prevDeal) {
        countAtBestForDeal.set(dealId, (countAtBestForDeal.get(dealId) ?? 1) + 1)
      }
    }
    for (const candidate of candidates) {
      const accId = candidate.account.id
      const dealId = candidate.deal.id
      if (
        candidate.score === bestScoreForAccount.get(accId) &&
        (countAtBestForAccount.get(accId) ?? 0) > 1
      ) {
        ambiguousAccounts.add(accId)
      }
      if (
        candidate.score === bestScoreForDeal.get(dealId) &&
        (countAtBestForDeal.get(dealId) ?? 0) > 1
      ) {
        ambiguousDeals.add(dealId)
      }
    }

    for (const candidate of candidates) {
      const accId = candidate.account.id
      const dealId = candidate.deal.id
      if (usedAccounts.has(accId) || usedDeals.has(dealId)) continue
      if (ambiguousAccounts.has(accId) || ambiguousDeals.has(dealId)) continue
      if (candidate.score !== bestScoreForAccount.get(accId)) continue
      if (candidate.score !== bestScoreForDeal.get(dealId)) continue
      dealForAccountId.set(accId, candidate.deal)
      usedAccounts.add(accId)
      usedDeals.add(dealId)
    }
  }

  for (const account of selected) {
    if (dealForAccountId.has(account.id)) dealsMatched += 1
    else dealsUnmatched += 1
  }

  // --- 4. Construction des entrées. ---
  let hotelsFromFallback = 0
  let signedDateUnknown = 0
  const unresolvedCsm: PlanChargeDiagnostics['unresolvedCsm'] = []
  const entries: PlanChargePipelineEntry[] = []

  for (const account of selected) {
    const tier: AccountTier = tierFromSegment(account.segment)

    const groupId: string | null = account.parentId
      ? account.parentId
      : (childrenByParentId.get(account.id)?.length ?? 0) > 0
        ? account.id
        : null
    const isGroup = groupId !== null

    let hotels: number
    let hotelsSource: PlanChargePipelineEntry['hotelsSource']
    if (isPositiveInteger(account.hotelCount)) {
      hotels = account.hotelCount
      hotelsSource = 'zoho_field'
    } else if (account.parentId) {
      const siblings = childrenByParentId.get(account.parentId) ?? []
      hotels = Math.max(1, siblings.length)
      hotelsSource = 'sibling_count'
      hotelsFromFallback += 1
    } else if ((childrenByParentId.get(account.id)?.length ?? 0) > 0) {
      hotels = childrenByParentId.get(account.id)!.length
      hotelsSource = 'children_count'
      hotelsFromFallback += 1
    } else {
      hotels = 1
      hotelsSource = 'default'
    }

    const plan = account.plan ?? []
    const dmbookOnly =
      plan.length > 0 && plan.every(entry => normalizeForSimilarity(entry).includes('dmbook'))

    const expectedGoLiveMonth = account.subStartDate!.slice(0, 7)

    const matchedDeal = dealForAccountId.get(account.id) ?? null
    let signedDate: string
    let signedDateSource: SignedDateSource
    if (matchedDeal?.closingDate) {
      signedDate = matchedDeal.closingDate
      signedDateSource = 'deal'
    } else if (account.createdTime) {
      signedDate = account.createdTime
      signedDateSource = 'account_created'
    } else {
      signedDate = referenceDate
      signedDateSource = 'unknown'
      signedDateUnknown += 1
    }

    const override = overridesByAccountId.get(account.id)
    const obOverride = override?.obLocked ? override.obOwner : null
    const csmOverride = override?.csmLocked ? override.csmName : null

    const rawCsm = account.csm
    const resolution = resolveCsmName(csmDirectory, { name: account.csm, userId: account.csmUserId })
    const resolvedCsm = resolution.csmName
    if (rawCsm && rawCsm.trim() && !resolvedCsm) {
      unresolvedCsm.push({ accountId: account.id, accountName: account.name, rawCsm: rawCsm.trim() })
    }

    entries.push({
      account: {
        id: account.id,
        name: account.name,
        groupId,
        tier,
        isGroup,
        hotels,
        dmbookOnly,
        signedDate,
        expectedGoLiveMonth,
        obOverride,
        csmOverride,
      },
      signedDateSource,
      matchedDealId: matchedDeal?.id ?? null,
      hotelsSource,
      rawCsm,
      resolvedCsm,
    })
  }

  // --- 6. Continuité de groupe. ---
  const groupContinuity: Record<string, string> = {}
  const groupsWithoutContinuity: string[] = []
  const groupIds = Array.from(new Set(entries.map(entry => entry.account.groupId).filter((id): id is string => id !== null)))

  for (const groupId of groupIds) {
    const members: CRMAccount[] = [...(childrenByParentId.get(groupId) ?? [])]
    const parent = accountsById.get(groupId)
    if (parent && !members.some(member => member.id === parent.id)) {
      members.push(parent)
    }

    const counts = new Map<string, number>()
    for (const member of members) {
      const resolution = resolveCsmName(csmDirectory, { name: member.csm, userId: member.csmUserId })
      if (!resolution.csmName) continue
      counts.set(resolution.csmName, (counts.get(resolution.csmName) ?? 0) + 1)
    }

    if (counts.size === 0) {
      groupsWithoutContinuity.push(groupId)
      continue
    }

    const maxCount = Math.max(...counts.values())
    const topNames = Array.from(counts.entries())
      .filter(([, count]) => count === maxCount)
      .map(([name]) => name)

    let chosen: string
    if (topNames.length === 1) {
      chosen = topNames[0]
    } else {
      const parentResolution = parent
        ? resolveCsmName(csmDirectory, { name: parent.csm, userId: parent.csmUserId }).csmName
        : null
      if (parentResolution && topNames.includes(parentResolution)) {
        chosen = parentResolution
      } else {
        // Repli déterministe : premier par ordre alphabétique de nom de compte
        // dont le CSM résolu figure parmi les noms à égalité de fréquence.
        const membersSorted = [...members].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
        const firstMatch = membersSorted.find(member => {
          const resolved = resolveCsmName(csmDirectory, { name: member.csm, userId: member.csmUserId }).csmName
          return resolved !== null && topNames.includes(resolved)
        })
        chosen = firstMatch
          ? resolveCsmName(csmDirectory, { name: firstMatch.csm, userId: firstMatch.csmUserId }).csmName!
          : topNames.sort()[0]
      }
    }

    groupContinuity[groupId] = chosen
  }

  // --- 7. Tri de sortie. ---
  const sortedEntries = [...entries].sort((a, b) => {
    if (a.account.expectedGoLiveMonth !== b.account.expectedGoLiveMonth) {
      return a.account.expectedGoLiveMonth < b.account.expectedGoLiveMonth ? -1 : 1
    }
    if (a.account.signedDate !== b.account.signedDate) {
      return a.account.signedDate < b.account.signedDate ? -1 : 1
    }
    return a.account.id < b.account.id ? -1 : a.account.id > b.account.id ? 1 : 0
  })

  const diagnostics: PlanChargeDiagnostics = {
    totalAccounts: accounts.length,
    clientAccounts,
    withFutureSubStart,
    excludedAlreadyLive,
    liveProjectsUnlinked,
    hotelsFromFallback,
    dealsMatched,
    dealsUnmatched,
    signedDateUnknown,
    unresolvedCsm,
    groupsWithoutContinuity,
  }

  return {
    entries: sortedEntries,
    pipeline: sortedEntries.map(entry => entry.account),
    groupContinuity,
    diagnostics,
  }
}
