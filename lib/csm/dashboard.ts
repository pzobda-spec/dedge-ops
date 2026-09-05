/**
 * Lignes de compte du portefeuille CSM : une ligne par compte, dérivée des
 * comptes CRM, des projets Zoho et des tickets Desk déjà chargés. La page
 * agrège ensuite selon ses filtres — même contrat que
 * `app/onboarding/pilotage/page.tsx`, qui agrège des projets côté client.
 * Module pur, aucun appel réseau, aucune mutation de ses entrées.
 *
 * N'invente aucun seuil de « bonne » ou « mauvaise » santé ni de score
 * composite : ce module expose des lignes brutes, la qualification vient du
 * métier.
 */

import type { CRMAccount } from '@/lib/zoho/crmClient'
import type { OnboardingProject } from '@/lib/zoho/projectsClient'
import type { AccountTier } from '@/lib/onboarding/capacityModel'
import { deriveAccountShape, indexProjectsByAccount } from '@/lib/onboarding/pipeline'
import { resolveCsmName, type CsmDirectoryEntry } from '@/lib/onboarding/csmDirectory'

/** Anciens CSM qui portent encore des comptes, à réattribuer. Grégoire Tiers, ancien Head of CSM. */
export const UNMANAGED_OWNER_IDS = ['93025000000092011'] as const

/** Motif de millésime de churn : `churn` suivi de chiffres (churn25, churn26, churn27...).
 * Le tag générique `churn`, sans chiffres, est comptabilisé à part sous la clé `churn`. */
export const CHURN_VINTAGE_PATTERN = /^churn(\d+)$/

/** Statut commercial d'un compte, dérivé d'Account_Type. */
export type CsmAccountStatus = 'client' | 'former_client'

/** Une ligne de compte, unité d'agrégation du dashboard CSM. */
export interface CsmAccountRow {
  accountId: string
  accountName: string
  /** Nom canonique du CSM, null si non résolu. */
  csmName: string | null
  /** Libellé brut renvoyé par Zoho, pour diagnostic. */
  rawCsm: string | null
  /** Vrai si le porteur est un ancien CSM, compte à réattribuer. */
  unmanagedOwner: boolean
  status: CsmAccountStatus
  mrr: number
  tier: AccountTier
  isGroup: boolean
  hotels: number
  /** Au moins un projet Zoho en statut live. */
  live: boolean
  /** Millésimes de churn portés par le compte, ex ['churn26']. Vide si aucun. */
  churnVintages: string[]
  openTickets: number
  tickets6m: number
  /** Faux si aucun compte Desk ne correspond exactement au nom. */
  ticketMatched: boolean
}

export interface CsmAccountRowsResult {
  rows: CsmAccountRow[]
  diagnostics: {
    accountsWithoutCsm: number
    unresolvedCsm: { accountId: string; accountName: string; rawCsm: string }[]
    accountsWithoutTicketMatch: number
    /** Comptes ignorés car ni client ni ancien client. */
    ignoredAccounts: number
  }
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

/** Normalisation stricte de nom de compte pour comparaison (majuscules, trim, espaces réduits).
 * Même règle que `normalizeAccountName` de `lib/onboarding/pipeline.ts`, dupliquée ici car non exportée. */
function normalizeAccountName(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ')
}

/** Millésimes de churn portés par un compte, tags normalisés en minuscules sans espaces. */
function churnVintagesForTags(tags: readonly string[]): string[] {
  const vintages: string[] = []
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase().replace(/\s+/g, '')
    if (!normalized) continue
    if (normalized === 'churn') {
      vintages.push('churn')
    } else if (CHURN_VINTAGE_PATTERN.test(normalized)) {
      vintages.push(normalized)
    }
  }
  return vintages
}

export function buildCsmAccountRows(input: CsmDashboardInput): CsmAccountRowsResult {
  const { accounts, projects, csmDirectory, ticketsByAccountName } = input
  const unmanagedOwnerIds = new Set(input.unmanagedOwnerIds ?? UNMANAGED_OWNER_IDS)

  const projectsIndex = indexProjectsByAccount(accounts, projects)

  const childrenByParentId = new Map<string, CRMAccount[]>()
  for (const account of accounts) {
    if (!account.parentId) continue
    const siblings = childrenByParentId.get(account.parentId) ?? []
    siblings.push(account)
    childrenByParentId.set(account.parentId, siblings)
  }

  let accountsWithoutCsm = 0
  const unresolvedCsm: CsmAccountRowsResult['diagnostics']['unresolvedCsm'] = []
  let accountsWithoutTicketMatch = 0
  let ignoredAccounts = 0

  const rows: CsmAccountRow[] = []

  for (const account of accounts) {
    const normalizedType = (account.accountType ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
    if (normalizedType !== 'client' && normalizedType !== 'former client') {
      ignoredAccounts += 1
      continue
    }
    const status: CsmAccountStatus = normalizedType === 'former client' ? 'former_client' : 'client'

    const shape = deriveAccountShape(account, childrenByParentId)
    const isLive = (projectsIndex.byAccountId.get(account.id) ?? []).some(project => project.status === 'live')

    const ticketKey = normalizeAccountName(account.name)
    const ticketCounts = ticketsByAccountName.get(ticketKey)
    const ticketMatched = Boolean(ticketCounts)
    if (!ticketMatched) accountsWithoutTicketMatch += 1
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

    const unmanagedOwner = !resolvedCsm && Boolean(account.csmUserId) && unmanagedOwnerIds.has(account.csmUserId!)

    rows.push({
      accountId: account.id,
      accountName: account.name,
      csmName: unmanagedOwner ? null : resolvedCsm,
      rawCsm,
      unmanagedOwner,
      status,
      mrr: account.mrr,
      tier: shape.tier,
      isGroup: shape.isGroup,
      hotels: shape.hotels,
      live: isLive,
      churnVintages: churnVintagesForTags(account.tags),
      openTickets,
      tickets6m,
      ticketMatched,
    })
  }

  rows.sort((a, b) => {
    if (b.mrr !== a.mrr) return b.mrr - a.mrr
    return a.accountName < b.accountName ? -1 : a.accountName > b.accountName ? 1 : 0
  })

  return {
    rows,
    diagnostics: {
      accountsWithoutCsm,
      unresolvedCsm,
      accountsWithoutTicketMatch,
      ignoredAccounts,
    },
  }
}
