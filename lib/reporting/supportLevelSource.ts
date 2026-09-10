import { fetchTicket } from '@/lib/zoho/client'
import { classifyLinearLink, type SupportLevel } from './supportLevels'

const CACHE_MS = 15 * 60 * 1000
const CONCURRENCY = 8
const START_BUDGET_MS = 30_000
// Cache compact côté serveur : aucun contenu de ticket, URL ou nom client conservé.
const cache = new Map<string, { level: SupportLevel; checkedAt: number }>()
const pending = new Map<string, Promise<SupportLevel>>()

async function readLevel(id: string): Promise<SupportLevel> {
  const existing = cache.get(id)
  if (existing && Date.now() - existing.checkedAt < CACHE_MS) return existing.level
  const running = pending.get(id)
  if (running) return running
  const promise = fetchTicket(id).then(ticket => {
    const level = classifyLinearLink(ticket.cf)
    cache.set(id, { level, checkedAt: Date.now() })
    return level
  }).catch(() => 'unknown' as const).finally(() => pending.delete(id))
  pending.set(id, promise)
  return promise
}

export async function readSupportLevels(ids: string[]) {
  const started = Date.now()
  for (const [id, item] of cache) if (started - item.checkedAt >= CACHE_MS) cache.delete(id)
  const unique = [...new Set(ids)]
  const levels = new Map<string, SupportLevel>()
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unique.length) }, async () => {
    while (cursor < unique.length && Date.now() - started < START_BUDGET_MS) {
      const id = unique[cursor++]
      levels.set(id, await readLevel(id))
    }
  }))
  const checked = unique.map(id => cache.get(id)?.checkedAt).filter((value): value is number => value !== undefined)
  return { levels, queried: levels.size, oldest_checked_at: checked.length ? new Date(Math.min(...checked)).toISOString() : null }
}
