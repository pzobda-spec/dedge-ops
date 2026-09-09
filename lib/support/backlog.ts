export interface BacklogTicket {
  created_at: string | null
  last_synced_at: string | null
  product_area: string | null
  client_name: string | null
}

export function summarizeBacklog(rows: BacklogTicket[], now = Date.now()) {
  const products = new Map<string, { product: string; total: number; over30Days: number; clients: Set<string> }>()
  let over7Days = 0
  let over30Days = 0
  let unknownAge = 0
  let oldestDays: number | null = null
  let oldestSync: string | null = null
  let unknownSync = 0
  for (const row of rows) {
    const timestamp = row.created_at ? Date.parse(row.created_at) : NaN
    const age = Number.isFinite(timestamp) && timestamp <= now ? Math.floor((now - timestamp) / 86_400_000) : null
    if (age === null) unknownAge++
    else {
      oldestDays = Math.max(oldestDays ?? 0, age)
      if (age > 7) over7Days++
      if (age > 30) over30Days++
    }
    if (row.last_synced_at && Number.isFinite(Date.parse(row.last_synced_at))) {
      if (!oldestSync || Date.parse(row.last_synced_at) < Date.parse(oldestSync)) oldestSync = row.last_synced_at
    } else unknownSync++
    const product = row.product_area || 'Non renseigné'
    const aggregate = products.get(product) ?? { product, total: 0, over30Days: 0, clients: new Set<string>() }
    aggregate.total++
    if (age !== null && age > 30) aggregate.over30Days++
    if (row.client_name?.trim()) aggregate.clients.add(row.client_name.trim().toLocaleUpperCase('fr'))
    products.set(product, aggregate)
  }
  return {
    total: rows.length, over7Days, over30Days, unknownAge, oldestDays, oldestSync, unknownSync,
    products: [...products.values()].map(row => ({ ...row, clients: row.clients.size })).sort((a, b) => b.over30Days - a.over30Days || b.total - a.total || a.product.localeCompare(b.product)),
  }
}

export type BacklogSummary = ReturnType<typeof summarizeBacklog>
