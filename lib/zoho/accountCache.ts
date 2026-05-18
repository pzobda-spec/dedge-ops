import { fetchAllCRMAccounts, CRMAccount } from './crmClient'

let cache: CRMAccount[] | null = null
let cacheExpiresAt = 0

function normalizeAccountName(name: string): string {
  return name.toUpperCase().trim().replace(/\s+/g, ' ')
}

async function loadCache(): Promise<CRMAccount[]> {
  if (!cache || Date.now() > cacheExpiresAt) {
    cache = await fetchAllCRMAccounts()
    cacheExpiresAt = Date.now() + 60 * 60 * 1000
  }
  return cache
}

export async function getCRMAccountsMap(): Promise<Map<string, CRMAccount>> {
  const accounts = await loadCache()
  return new Map(accounts.map(a => [normalizeAccountName(a.name), a]))
}

export function matchAccountByName(name: string, map: Map<string, CRMAccount>): CRMAccount | null {
  if (!name) return null
  const normalized = normalizeAccountName(name)

  // Exact match
  const exact = map.get(normalized)
  if (exact) return exact

  // Partial match: map key starts with or includes normalized query
  for (const [key, account] of map) {
    if (key.startsWith(normalized) || key.includes(normalized) || normalized.startsWith(key) || normalized.includes(key)) {
      return account
    }
  }

  return null
}
