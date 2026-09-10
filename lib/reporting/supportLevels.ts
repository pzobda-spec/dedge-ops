import { resolutionMetrics, type TicketRow } from './monthly'

export type SupportLevel = 'l1' | 'l2' | 'unknown'

export function classifyLinearLink(cf: Record<string, unknown> | null | undefined): SupportLevel {
  if (!cf || !Object.prototype.hasOwnProperty.call(cf, 'cf_linear_issue_url')) return 'unknown'
  const value = cf.cf_linear_issue_url
  if (value === null || typeof value === 'string' && value.trim() === '') return 'l1'
  if (typeof value !== 'string') return 'unknown'
  try {
    const url = new URL(value.trim())
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname === 'linear.app' && /\/issue\/[^/]+/.test(url.pathname) ? 'l2' : 'unknown'
  } catch { return 'unknown' }
}

export function supportLevelMetrics(rows: TicketRow[], levels: Map<string, SupportLevel>) {
  const groups: Record<SupportLevel, TicketRow[]> = { l1: [], l2: [], unknown: [] }
  rows.forEach(row => groups[row.id ? levels.get(row.id) ?? 'unknown' : 'unknown'].push(row))
  const summarize = (items: TicketRow[]) => ({ closed: items.length, ...resolutionMetrics(items) })
  return { l1: summarize(groups.l1), l2: summarize(groups.l2), unknown: summarize(groups.unknown), total_closed: rows.length }
}
