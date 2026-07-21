import type { CRMAccount } from '@/lib/zoho/crmClient'
import { matchAccountByName } from '@/lib/zoho/accountCache'
import type { OnboardingProject } from '@/lib/zoho/projectsClient'

const MAX_PARENT_DEPTH = 5

export interface ClientLinkageMeta {
  matched: number
  unlinked: number
  byId: number
  byName: number
}

export interface EnrichedProjectsResult {
  projects: OnboardingProject[]
  meta: ClientLinkageMeta
}

export function buildCRMAccountsById(accounts: Iterable<CRMAccount>): Map<string, CRMAccount> {
  return new Map(Array.from(accounts, account => [account.id, account]))
}

export function resolveClientRoot(
  account: CRMAccount,
  accountsById: Map<string, CRMAccount>,
): CRMAccount {
  let current = account
  const visited = new Set<string>([current.id])

  for (let depth = 0; depth < MAX_PARENT_DEPTH; depth += 1) {
    if (!current.parentId) break
    if (visited.has(current.parentId)) break

    const parent = accountsById.get(current.parentId)
    if (!parent) break

    visited.add(parent.id)
    current = parent
  }

  return current
}

export function enrichProjectsWithClients(
  projects: OnboardingProject[],
  accountsByName: Map<string, CRMAccount>,
): EnrichedProjectsResult {
  const accountsById = buildCRMAccountsById(accountsByName.values())
  const meta: ClientLinkageMeta = { matched: 0, unlinked: 0, byId: 0, byName: 0 }

  const enriched: OnboardingProject[] = projects.map(project => {
    let account: CRMAccount | null = null

    if (project.accountCRMId) {
      account = accountsById.get(project.accountCRMId) ?? null
      if (account) meta.byId += 1
    }

    if (!account && project.accountCRMName) {
      account = matchAccountByName(project.accountCRMName, accountsByName)
      if (account) meta.byName += 1
    }

    if (!account) {
      meta.unlinked += 1
      return {
        ...project,
        clientPropertyId: null,
        clientPropertyName: null,
        clientId: null,
        clientName: null,
        clientIsGroup: false,
        clientTypology: 'unlinked' as const,
      }
    }

    meta.matched += 1
    const root = resolveClientRoot(account, accountsById)
    return {
      ...project,
      clientPropertyId: account.id,
      clientPropertyName: account.name,
      clientId: root.id,
      clientName: root.name,
    }
  })

  const propertiesByClient = new Map<string, Set<string>>()
  for (const project of enriched) {
    if (!project.clientId) continue
    const properties = propertiesByClient.get(project.clientId) ?? new Set<string>()
    properties.add(
      project.clientPropertyId ?? `hotel:${project.hotelName.trim().toLocaleLowerCase('fr-FR')}`,
    )
    propertiesByClient.set(project.clientId, properties)
  }

  return {
    projects: enriched.map(project => {
      if (!project.clientId) return project
      const clientIsGroup = (propertiesByClient.get(project.clientId)?.size ?? 0) >= 2
      return {
        ...project,
        clientIsGroup,
        clientTypology: clientIsGroup ? 'group' : 'individual',
      }
    }),
    meta,
  }
}
