import type { LinearIssue } from './client'

export const LINEAR_ANALYTICS_CACHE_SECONDS = 15 * 60

export const LINEAR_PRIORITIES = ['Urgent', 'High', 'Medium', 'Low', 'None'] as const
export const LINEAR_STATUSES = ['Backlog', 'Todo', 'In Progress', 'Done', 'Cancelled'] as const

export type LinearPriority = (typeof LINEAR_PRIORITIES)[number]
export type LinearStatus = (typeof LINEAR_STATUSES)[number]
export type TimeGranularity = 'day' | 'week' | 'month'

export interface LinearAnalyticsFilters {
  from: string
  to: string
  labels: string[]
  priorities: string[]
  statuses: string[]
  creators: string[]
  keyword: string
}

export interface CountDatum {
  name: string
  count: number
}

export interface LinearAnalyticsResponse {
  total: number
  created: number
  resolved: number
  open: number
  avg_resolution_days: number | null
  sla_rate: number | null
  by_label: CountDatum[]
  by_priority: CountDatum[]
  by_status: CountDatum[]
  by_creator: CountDatum[]
  by_date: Array<{ date: string; label: string; created: number; resolved: number }>
  keyword_frequency: CountDatum[]
  resolution_time_distribution: Array<{ name: string; count: number; breached: boolean }>
  filter_options: {
    labels: string[]
    creators: string[]
    priorities: string[]
    statuses: string[]
  }
  range: { from: string; to: string; granularity: TimeGranularity }
  generated_at: string
  source_count: number
  truncated: boolean
}

const NO_LABEL = 'Sans label'
const UNKNOWN_CREATOR = 'Créateur inconnu'
const DAY_MS = 86_400_000

const STOP_WORDS = new Set([
  // French
  'alors', 'au', 'aucun', 'aussi', 'autre', 'aux', 'avec', 'avoir', 'bon', 'car',
  'ce', 'ces', 'cet', 'cette', 'chez', 'comme', 'comment', 'dans', 'de', 'des', 'du',
  'elle', 'en', 'encore', 'est', 'et', 'etre', 'faire', 'fait', 'fois', 'il', 'ils',
  'je', 'la', 'le', 'les', 'leur', 'leurs', 'mais', 'mes', 'mettre', 'mon', 'ne',
  'nos', 'notre', 'nous', 'on', 'ou', 'pas', 'plus', 'pour', 'quand', 'que', 'quel',
  'quelle', 'qui', 'sans', 'se', 'ses', 'si', 'son', 'sur', 'tous', 'tout', 'tres',
  'tu', 'un', 'une', 'vos', 'votre', 'vous',
  // English and common ticket noise
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'bug', 'by', 'can', 'could',
  'does', 'error', 'for', 'from', 'has', 'have', 'how', 'in', 'is', 'issue', 'it',
  'not', 'of', 'on', 'or', 'please', 'the', 'this', 'to', 'with', 'when', 'where',
  'wrong', 'after', 'before', 'user', 'unable', 'problem', 'request',
])

const ACRONYMS = new Set(['api', 'crm', 'csv', 'id', 'ota', 'pms', 'sftp', 'sms', 'ui', 'url'])

export function normaliseLinearPriority(priority: number): LinearPriority {
  if (priority === 1) return 'Urgent'
  if (priority === 2) return 'High'
  if (priority === 3) return 'Medium'
  if (priority === 4) return 'Low'
  return 'None'
}

export function normaliseLinearStatus(issue: Pick<LinearIssue, 'stateType' | 'linearState'>): LinearStatus {
  const type = issue.stateType?.toLowerCase().trim()
  if (type === 'canceled' || type === 'cancelled') return 'Cancelled'
  if (type === 'completed') return 'Done'
  if (type === 'started') return 'In Progress'
  if (type === 'unstarted') return 'Todo'
  if (type === 'backlog' || type === 'triage') return 'Backlog'

  const name = normaliseText(issue.linearState)
  if (/cancel|duplicate|rejected/.test(name)) return 'Cancelled'
  if (/done|solved|resolved|fixed|closed/.test(name)) return 'Done'
  if (/progress|review|blocked|started/.test(name)) return 'In Progress'
  if (/todo|to do|unstarted/.test(name)) return 'Todo'
  return 'Backlog'
}

export function computeLinearAnalytics(
  issues: LinearIssue[],
  filters: LinearAnalyticsFilters,
  options: { truncated?: boolean } = {},
): LinearAnalyticsResponse {
  const from = parseBoundary(filters.from, false)
  const to = parseBoundary(filters.to, true)
  const granularity = chooseGranularity(from, to)
  const selectedLabels = new Set(filters.labels)
  const selectedPriorities = new Set(filters.priorities)
  const selectedStatuses = new Set(filters.statuses)
  const selectedCreators = new Set(filters.creators)
  const keyword = normaliseText(filters.keyword.trim())

  const keywordFiltered = issues.filter(issue => matchesKeyword(issue, keyword))
  const optionBase = keywordFiltered.filter(issue => isWithin(issue.createdAt, from, to))
  const attributeFiltered = keywordFiltered.filter(issue => {
    const labels = issue.labels.length > 0 ? issue.labels : [NO_LABEL]
    const creator = issue.creatorName?.trim() || UNKNOWN_CREATOR
    return (
      (selectedLabels.size === 0 || labels.some(label => selectedLabels.has(label))) &&
      (selectedPriorities.size === 0 || selectedPriorities.has(normaliseLinearPriority(issue.priority))) &&
      (selectedStatuses.size === 0 || selectedStatuses.has(normaliseLinearStatus(issue))) &&
      (selectedCreators.size === 0 || selectedCreators.has(creator))
    )
  })

  const createdIssues = attributeFiltered.filter(issue => isWithin(issue.createdAt, from, to))
  const resolvedIssues = attributeFiltered.filter(
    issue => normaliseLinearStatus(issue) === 'Done' && Boolean(issue.completedAt) && isWithin(issue.completedAt!, from, to),
  )
  const open = createdIssues.filter(issue => {
    const status = normaliseLinearStatus(issue)
    return status !== 'Done' && status !== 'Cancelled'
  }).length

  const resolutionDays = resolvedIssues
    .map(issue => Math.max(0, (new Date(issue.completedAt!).getTime() - new Date(issue.createdAt).getTime()) / DAY_MS))
    .filter(Number.isFinite)
  const withinSla = resolutionDays.filter(days => days < 7).length

  const byDate = buildTimeSeries(attributeFiltered, from, to, granularity)
  const allLabels = createdIssues.flatMap(issue => issue.labels.length > 0 ? issue.labels : [NO_LABEL])
  const creators = createdIssues.map(issue => issue.creatorName?.trim() || UNKNOWN_CREATOR)

  return {
    total: createdIssues.length,
    created: createdIssues.length,
    resolved: resolvedIssues.length,
    open,
    avg_resolution_days: resolutionDays.length > 0 ? round(average(resolutionDays), 1) : null,
    sla_rate: resolutionDays.length > 0 ? round((withinSla / resolutionDays.length) * 100, 1) : null,
    by_label: countValues(allLabels).slice(0, 10),
    by_priority: LINEAR_PRIORITIES.map(name => ({
      name,
      count: createdIssues.filter(issue => normaliseLinearPriority(issue.priority) === name).length,
    })),
    by_status: LINEAR_STATUSES.map(name => ({
      name,
      count: createdIssues.filter(issue => normaliseLinearStatus(issue) === name).length,
    })),
    by_creator: countValues(creators).slice(0, 10),
    by_date: byDate,
    keyword_frequency: extractKeywordFrequency(createdIssues),
    resolution_time_distribution: buildResolutionDistribution(resolutionDays),
    filter_options: {
      labels: uniqueSorted(optionBase.flatMap(issue => issue.labels.length > 0 ? issue.labels : [NO_LABEL])),
      creators: uniqueSorted(optionBase.map(issue => issue.creatorName?.trim() || UNKNOWN_CREATOR)),
      priorities: [...LINEAR_PRIORITIES],
      statuses: [...LINEAR_STATUSES],
    },
    range: { from: filters.from, to: filters.to, granularity },
    generated_at: new Date().toISOString(),
    source_count: issues.length,
    truncated: options.truncated ?? false,
  }
}

function buildTimeSeries(
  issues: LinearIssue[],
  from: Date,
  to: Date,
  granularity: TimeGranularity,
): LinearAnalyticsResponse['by_date'] {
  const start = bucketStart(from, granularity)
  const end = bucketStart(to, granularity)
  const buckets = new Map<string, { date: string; label: string; created: number; resolved: number }>()

  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = nextBucket(cursor, granularity)) {
    const key = isoDay(cursor)
    buckets.set(key, { date: key, label: formatBucketLabel(cursor, granularity), created: 0, resolved: 0 })
  }

  for (const issue of issues) {
    if (isWithin(issue.createdAt, from, to)) {
      const key = isoDay(bucketStart(new Date(issue.createdAt), granularity))
      const bucket = buckets.get(key)
      if (bucket) bucket.created += 1
    }
    if (
      normaliseLinearStatus(issue) === 'Done' &&
      issue.completedAt &&
      isWithin(issue.completedAt, from, to)
    ) {
      const key = isoDay(bucketStart(new Date(issue.completedAt), granularity))
      const bucket = buckets.get(key)
      if (bucket) bucket.resolved += 1
    }
  }

  return [...buckets.values()]
}

function buildResolutionDistribution(days: number[]): LinearAnalyticsResponse['resolution_time_distribution'] {
  const buckets = [
    { name: '< 1 j', breached: false, matches: (value: number) => value >= 0 && value < 1 },
    { name: '1–3 j', breached: false, matches: (value: number) => value >= 1 && value < 3 },
    { name: '3–7 j', breached: false, matches: (value: number) => value >= 3 && value < 7 },
    { name: '7–14 j', breached: true, matches: (value: number) => value >= 7 && value < 14 },
    { name: '14–30 j', breached: true, matches: (value: number) => value >= 14 && value <= 30 },
    { name: '> 30 j', breached: true, matches: (value: number) => value > 30 },
  ]
  return buckets.map(bucket => ({
    name: bucket.name,
    count: days.filter(bucket.matches).length,
    breached: bucket.breached,
  }))
}

function extractKeywordFrequency(issues: LinearIssue[]): CountDatum[] {
  const words = issues.flatMap(issue => normaliseText(issue.title).split(/[^a-z0-9]+/g))
    .filter(word => word.length >= 3 && !STOP_WORDS.has(word) && !/^\d+$/.test(word))
    .map(word => ACRONYMS.has(word) ? word.toUpperCase() : word)
  return countValues(words).slice(0, 15)
}

function matchesKeyword(issue: LinearIssue, keyword: string): boolean {
  if (!keyword) return true
  return normaliseText(`${issue.title} ${issue.description ?? ''}`).includes(keyword)
}

function countValues(values: string[]): CountDatum[] {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'))
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'fr'))
}

function normaliseText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
}

function parseBoundary(value: string, endOfDay: boolean): Date {
  const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'
  return new Date(`${value}${suffix}`)
}

function isWithin(value: string, from: Date, to: Date): boolean {
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) && timestamp >= from.getTime() && timestamp <= to.getTime()
}

function chooseGranularity(from: Date, to: Date): TimeGranularity {
  const days = Math.ceil((to.getTime() - from.getTime()) / DAY_MS) + 1
  if (days <= 45) return 'day'
  if (days <= 180) return 'week'
  return 'month'
}

function bucketStart(value: Date, granularity: TimeGranularity): Date {
  const date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
  if (granularity === 'week') {
    const day = date.getUTCDay() || 7
    date.setUTCDate(date.getUTCDate() - day + 1)
  }
  if (granularity === 'month') date.setUTCDate(1)
  return date
}

function nextBucket(value: Date, granularity: TimeGranularity): Date {
  const next = new Date(value)
  if (granularity === 'day') next.setUTCDate(next.getUTCDate() + 1)
  if (granularity === 'week') next.setUTCDate(next.getUTCDate() + 7)
  if (granularity === 'month') next.setUTCMonth(next.getUTCMonth() + 1)
  return next
}

function formatBucketLabel(value: Date, granularity: TimeGranularity): string {
  if (granularity === 'month') {
    return new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(value)
  }
  const date = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(value)
  return granularity === 'week' ? `Sem. ${date}` : date
}

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function round(value: number, decimals: number): number {
  const power = 10 ** decimals
  return Math.round(value * power) / power
}
