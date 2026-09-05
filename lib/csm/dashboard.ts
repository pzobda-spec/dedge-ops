/**
 * Dashboard du portefeuille CSM : compteurs bruts par CSM et global, dérivés
 * des comptes CRM, des projets Zoho et des tickets Desk déjà chargés. Module
 * pur, aucun appel réseau, aucune mutation de ses entrées — même contrat que
 * `lib/onboarding/pipeline.ts` et `lib/onboarding/csmAnalytics.ts`.
 *
 * N'invente aucun seuil de « bonne » ou « mauvaise » santé ni de score
 * composite : ce module expose des compteurs bruts, la qualification vient du
 * métier.
 */

import type { CRMAccount } from '@/lib/zoho/crmClient'
import type { OnboardingProject } from '@/lib/zoho/projectsClient'
import { deriveAccountShape, indexProjectsByAccount } from '@/lib/onboarding/pipeline'
import { resolveCsmName, type CsmDirectoryEntry } from '@/lib/onboarding/csmDirectory'

/** Anciens CSM qui portent encore des comptes, à réattribuer. Grégoire Tiers, ancien Head of CSM. */
export const UNMANAGED_OWNER_IDS = ['93025000000092011'] as const

/** Motif de millésime de churn : `churn` suivi de chiffres (churn25, churn26, churn27...).
 * Le tag générique `churn`, sans chiffres, est comptabilisé à part sous la clé `churn`. */
export const CHURN_VINTAGE_PATTERN = /^churn(\d+)$/

/** Compteurs d'un portefeuille, global ou par CSM. */
export interface CsmDashboardBucket {
  accounts: number
  liveAccounts: number
  mrr: number
  groupAccounts: number
  individualAccounts: number
  /** Comptes par millésime de churn, clé = nom du tag ('churn25', 'churn26'...). */
  churnByVintage: Record<string, number>
  /** MRR des comptes churnés, même découpage. */
  churnMrrByVintage: Record<string, number>
  /** Tickets Desk actuellement ouverts sur le portefeuille. */
  openTickets: number
  /** Tickets Desk créés sur les 6 derniers mois. */
  tickets6m: number
}

export interface CsmDashboardRow extends CsmDashboardBucket {
  csmName: string
}

/** Un compte au plus fort volume de tickets ouverts, pour la santé de compte. */
export interface AccountHealthRow {
  accountId: string
  accountName: string
  csmName: string | null
  mrr: number
  openTickets: number
  tickets6m: number
}

export interface CsmDashboardInput {
  accounts: readonly CRMAccount[]
  projects: readonly OnboardingProject[]
  csmDirectory: readonly CsmDirectoryEntry[]
  csmNames: readonly string[]
  /** Compteurs de tickets par nom de compte NORMALISÉ. */
  ticketsByAccountName: ReadonlyMap<string, { open: number; last6m: number }>
  /** Id utilisateur Zoho des porteurs qui ne sont plus CSM, à isoler. */
  unmanagedOwnerIds?: readonly string[]
}

export interface CsmDashboardResult {
  global: CsmDashboardBucket
  byCsm: CsmDashboardRow[]
  /** Comptes encore portés par un ancien CSM, à réattribuer. */
  unmanaged: CsmDashboardBucket & { ownerLabels: string[] }
  /** Les 20 comptes aux plus forts volumes de tickets ouverts. */
  accountHealth: AccountHealthRow[]
  diagnostics: {
    accountsWithoutCsm: number
    unresolvedCsm: { accountId: string; accountName: string; rawCsm: string }[]
    /** Comptes dont aucun ticket n'a pu être rattaché par le nom. */
    accountsWithoutTicketMatch: number
  }
}

/** Normalisation stricte de nom de compte pour comparaison (majuscules, trim, espaces réduits).
 * Même règle que `normalizeAccountName` de `lib/onboarding/pipeline.ts`, dupliquée ici car non exportée. */
function normalizeAccountName(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ')
}

function emptyBucket(): CsmDashboardBucket {
  return {
    accounts: 0,
    liveAccounts: 0,
    mrr: 0,
    groupAccounts: 0,
    individualAccounts: 0,
    churnByVintage: {},
    churnMrrByVintage: {},
    openTickets: 0,
    tickets6m: 0,
  }
}

function addChurnTags(bucket: CsmDashboardBucket, tags: readonly string[], mrr: number): void {
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase().replace(/\s+/g, '')
    if (!normalized) continue
    let key: string | null = null
    if (normalized === 'churn') {
      key = 'churn'
    } else {
      const match = CHURN_VINTAGE_PATTERN.exec(normalized)
      if (match) key = normalized
    }
    if (key === null) continue
    bucket.churnByVintage[key] = (bucket.churnByVintage[key] ?? 0) + 1
    bucket.churnMrrByVintage[key] = (bucket.churnMrrByVintage[key] ?? 0) + mrr
  }
}

export function computeCsmDashboard(input: CsmDashboardInput): CsmDashboardResult {
  const { accounts, projects, csmDirectory, csmNames, ticketsByAccountName } = input
  const unmanagedOwnerIds = new Set(input.unmanagedOwnerIds ?? UNMANAGED_OWNER_IDS)

  const projectsIndex = indexProjectsByAccount(accounts, projects)

  const childrenByParentId = new Map<string, CRMAccount[]>()
  for (const account of accounts) {
    if (!account.parentId) continue
    const siblings = childrenByParentId.get(account.parentId) ?? []
    siblings.push(account)
    childrenByParentId.set(account.parentId, siblings)
  }

  const global = emptyBucket()
  const unmanaged: CsmDashboardBucket & { ownerLabels: string[] } = { ...emptyBucket(), ownerLabels: [] }
  const unmanagedOwnerLabels = new Set<string>()
  const bucketsByCsm = new Map<string, CsmDashboardBucket>()

  let accountsWithoutCsm = 0
  const unresolvedCsm: CsmDashboardResult['diagnostics']['unresolvedCsm'] = []
  let accountsWithoutTicketMatch = 0

  const accountHealthCandidates: AccountHealthRow[] = []

  for (const account of accounts) {
    const isClient = (account.accountType ?? '').trim().toLowerCase() === 'client'
    if (!isClient) continue

    const shape = deriveAccountShape(account, childrenByParentId)
    const isLive = (projectsIndex.byAccountId.get(account.id) ?? []).some(project => project.status === 'live')

    const ticketKey = normalizeAccountName(account.name)
    const ticketCounts = ticketsByAccountName.get(ticketKey)
    if (!ticketCounts) accountsWithoutTicketMatch += 1
    const openTickets = ticketCounts?.open ?? 0
    const tickets6m = ticketCounts?.last6m ?? 0

    const rawCsm = account.csm
    const resolution = resolveCsmName(csmDirectory, { name: account.csm, userId: account.csmUserId })
    const resolvedCsm = resolution.csmName

    if ((!rawCsm || !rawCsm.trim()) && !account.csmUserId) {
      accountsWithoutCsm += 1
    } else if (!resolvedCsm && rawCsm && rawCsm.trim()) {
      unresolvedCsm.push({ accountId: account.id, accountName: account.name, rawCsm: rawCsm.trim() })
    }

    // --- Accumulation dans le bucket global (tous les comptes clients). ---
    global.accounts += 1
    if (isLive) global.liveAccounts += 1
    global.mrr += account.mrr
    if (shape.isGroup) global.groupAccounts += 1
    else global.individualAccounts += 1
    addChurnTags(global, account.tags, account.mrr)
    global.openTickets += openTickets
    global.tickets6m += tickets6m

    // --- Détermination du bucket de portefeuille : unmanaged, CSM résolu, ou aucun. ---
    let targetBucket: CsmDashboardBucket | null = null
    if (!resolvedCsm && account.csmUserId && unmanagedOwnerIds.has(account.csmUserId)) {
      targetBucket = unmanaged
      if (rawCsm && rawCsm.trim()) unmanagedOwnerLabels.add(rawCsm.trim())
      else unmanagedOwnerLabels.add(account.csmUserId)
    } else if (resolvedCsm) {
      let bucket = bucketsByCsm.get(resolvedCsm)
      if (!bucket) {
        bucket = emptyBucket()
        bucketsByCsm.set(resolvedCsm, bucket)
      }
      targetBucket = bucket
    }

    if (targetBucket) {
      targetBucket.accounts += 1
      if (isLive) targetBucket.liveAccounts += 1
      targetBucket.mrr += account.mrr
      if (shape.isGroup) targetBucket.groupAccounts += 1
      else targetBucket.individualAccounts += 1
      addChurnTags(targetBucket, account.tags, account.mrr)
      targetBucket.openTickets += openTickets
      targetBucket.tickets6m += tickets6m
    }

    if (openTickets > 0) {
      accountHealthCandidates.push({
        accountId: account.id,
        accountName: account.name,
        csmName: resolvedCsm,
        mrr: account.mrr,
        openTickets,
        tickets6m,
      })
    }
  }

  const allCsmNames = new Set<string>(csmNames)
  for (const name of bucketsByCsm.keys()) allCsmNames.add(name)

  const byCsm: CsmDashboardRow[] = Array.from(allCsmNames).map(csmName => ({
    csmName,
    ...(bucketsByCsm.get(csmName) ?? emptyBucket()),
  }))
  byCsm.sort((a, b) => (a.csmName < b.csmName ? -1 : a.csmName > b.csmName ? 1 : 0))

  accountHealthCandidates.sort((a, b) => {
    if (b.openTickets !== a.openTickets) return b.openTickets - a.openTickets
    if (b.mrr !== a.mrr) return b.mrr - a.mrr
    return a.accountName < b.accountName ? -1 : a.accountName > b.accountName ? 1 : 0
  })
  const accountHealth = accountHealthCandidates.slice(0, 20)

  return {
    global,
    byCsm,
    unmanaged: { ...unmanaged, ownerLabels: Array.from(unmanagedOwnerLabels).sort() },
    accountHealth,
    diagnostics: {
      accountsWithoutCsm,
      unresolvedCsm,
      accountsWithoutTicketMatch,
    },
  }
}
