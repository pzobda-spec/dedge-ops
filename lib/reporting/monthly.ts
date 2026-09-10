import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

export const TIME_ZONE = 'Europe/Paris'
// Au-delà de 90 jours calendaires, une clôture est exclue de la moyenne uniquement.
export const MAX_RESOLUTION_DAYS = 90
// Un appel génère en moyenne 2 tickets Phone (doublons de saisie).
// Ratio à réviser si l'hypothèse change. Hypothèse non validée, jamais une mesure.
// Les exports arbitraires sont interdits dans les route.ts de Next.js 14.
export const RATIO_APPELS_PAR_TICKET = 0.5
export const PHONE_BREAK_NOTE = 'À partir de mars–avril 2026, l’équipe a arrêté de répondre au téléphone. La baisse du canal Phone reflète cet arrêt de la prise d’appels, pas une baisse de la demande client. Aucune variation n’est calculée à travers cette rupture.'

export interface TicketRow {
  id?: string
  created_at: string | null
  resolved_at: string | null
  source: string | null
  product_area: string | null
  first_response_at: string | null
  first_response_time_ms: number | string | null
  first_contact_resolution: boolean | null
}

export function monthKey(value: string | Date): string {
  return formatInTimeZone(value, TIME_ZONE, 'yyyy-MM')
}

export function shiftMonth(key: string, offset: number): string {
  const [year, month] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7)
}

export function monthStart(key: string): Date {
  if (!/^(20\d{2})-(0[1-9]|1[0-2])$/.test(key)) throw new Error('Le mois doit utiliser le format AAAA-MM (2000–2099).')
  return fromZonedTime(`${key}-01T00:00:00`, TIME_ZONE)
}

export function parseDate(value: string): Date {
  // Date seule = minuit à Paris ; un horodatage doit porter son fuseau.
  if (/^20\d{2}-\d{2}-\d{2}$/.test(value)) {
    const date = fromZonedTime(`${value}T00:00:00`, TIME_ZONE)
    if (!Number.isFinite(date.getTime()) || formatInTimeZone(date, TIME_ZONE, 'yyyy-MM-dd') !== value) throw new Error('Date invalide.')
    return date
  }
  if (!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error('Utilisez une date ISO, avec fuseau pour un horodatage.')
  const date = new Date(value)
  const calendar = value.slice(0, 10)
  if (!Number.isFinite(date.getTime()) || new Date(`${calendar}T00:00:00Z`).toISOString().slice(0, 10) !== calendar) throw new Error('Date invalide.')
  return date
}

export function channelRange(params: URLSearchParams, now = new Date()) {
  const to = params.get('to') ? parseDate(params.get('to')!) : now
  const localTo = formatInTimeZone(to, TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ss.SSS")
  const shifted = shiftMonth(localTo.slice(0, 7), -24)
  const lastDay = new Date(Date.UTC(Number(shifted.slice(0, 4)), Number(shifted.slice(5)), 0)).getUTCDate()
  const day = Math.min(Number(localTo.slice(8, 10)), lastDay)
  const from = params.get('from') ? parseDate(params.get('from')!) : fromZonedTime(`${shifted}-${String(day).padStart(2, '0')}${localTo.slice(10)}`, TIME_ZONE)
  if (from >= to) throw new Error('La date de début doit précéder la date de fin (exclue).')
  if (to.getTime() - from.getTime() > 366 * 5 * 86_400_000) throw new Error('La période ne peut pas dépasser cinq ans.')
  return { from, to }
}

export const percent = (count: number, total: number): number | null => total ? count * 100 / total : null
const average = (values: number[]): number | null => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
function inRange(value: string | null, from: Date, to: Date): boolean {
  return !!value && Date.parse(value) >= from.getTime() && Date.parse(value) < to.getTime()
}
function duration(from: string | null, to: string | null): number | null {
  if (!from || !to) return null
  const hours = (Date.parse(to) - Date.parse(from)) / 3_600_000
  return Number.isFinite(hours) && hours >= 0 ? hours : null
}
export function resolutionMetrics(rows: TicketRow[]) {
  const documented = rows.map(row => duration(row.created_at, row.resolved_at)).filter((value): value is number => value !== null)
  const retained = documented.filter(hours => hours <= MAX_RESOLUTION_DAYS * 24)
  return {
    resolution_hours: average(retained), resolution_sample: retained.length,
    resolution_max_days: MAX_RESOLUTION_DAYS,
    resolution_excluded_count: documented.length - retained.length,
    resolution_missing_count: rows.length - documented.length,
  }
}
export function supportMetrics(rows: TicketRow[], from: Date, to: Date) {
  const created = rows.filter(row => inRange(row.created_at, from, to))
  const closed = rows.filter(row => inRange(row.resolved_at, from, to))
  const replies = created.map(row => {
    const ms = row.first_response_time_ms === null || row.first_response_time_ms === '' ? NaN : Number(row.first_response_time_ms)
    return Number.isFinite(ms) && ms >= 0 ? ms / 3_600_000 : duration(row.created_at, row.first_response_at)
  }).filter((value): value is number => value !== null)
  const fcr = closed.map(row => row.first_contact_resolution).filter((value): value is boolean => typeof value === 'boolean')
  function counts(selector: (row: TicketRow) => string) {
    const result = new Map<string, number>()
    created.forEach(row => { const key = selector(row); result.set(key, (result.get(key) ?? 0) + 1) })
    return [...result].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'))
  }
  return {
    opened: created.length, closed: closed.length, closed_opened_pct: percent(closed.length, created.length),
    first_response_hours: average(replies), first_response_sample: replies.length,
    ...resolutionMetrics(closed),
    fcr_estimate_pct: percent(fcr.filter(Boolean).length, fcr.length), fcr_sample: fcr.length,
    top_products: counts(row => row.product_area?.trim() || 'Autre').slice(0, 8),
    peak_days: counts(row => formatInTimeZone(row.created_at!, TIME_ZONE, 'yyyy-MM-dd')).slice(0, 5),
  }
}

export function channelMetrics(rows: Pick<TicketRow, 'created_at' | 'source'>[], from: Date, to: Date, now = new Date()) {
  const byMonth = new Map<string, { email: number; phone: number; web: number; chat: number; autre: number }>()
  for (const row of rows) {
    if (!inRange(row.created_at, from, to)) continue
    const key = monthKey(row.created_at!)
    const channels = byMonth.get(key) ?? { email: 0, phone: 0, web: 0, chat: 0, autre: 0 }
    const source = row.source?.trim().toLowerCase()
    const channel = source === 'email' || source === 'phone' || source === 'web' || source === 'chat' ? source : 'autre'
    channels[channel]++
    byMonth.set(key, channels)
  }
  const months = []
  for (let key = monthKey(from); monthStart(key) < to; key = shiftMonth(key, 1)) {
    const channels = byMonth.get(key) ?? { email: 0, phone: 0, web: 0, chat: 0, autre: 0 }
    const total = Object.values(channels).reduce((a, b) => a + b, 0)
    months.push({ key, ...channels, total, phone_share_pct: percent(channels.phone, total), estimated_calls: channels.phone * RATIO_APPELS_PAR_TICKET,
      partial_period: monthStart(key) < from || monthStart(shiftMonth(key, 1)) > to || monthStart(shiftMonth(key, 1)) > now,
      phone_regime: key < '2026-03' ? 'before' : key <= '2026-04' ? 'transition' : 'after' })
  }
  const total = months.reduce((sum, row) => sum + row.total, 0)
  const phone = months.reduce((sum, row) => sum + row.phone, 0)
  // Signal de qualité, pas une preuve d'absence ou une correction des volumes.
  const recent = months.filter(row => !row.partial_period).slice(-6).map(row => row.total).sort((a, b) => a - b)
  const baseline = recent.length >= 3 ? recent[Math.floor(recent.length / 2)] : 0
  return { months: months.map(row => ({ ...row, sparse_history: !row.partial_period && baseline >= 50 && row.total < baseline * 0.2 })), totals: { total, phone, phone_share_pct: percent(phone, total), estimated_calls: phone * RATIO_APPELS_PAR_TICKET,
    average_estimated_calls_per_month: months.length ? phone * RATIO_APPELS_PAR_TICKET / months.length : null }, ratio: RATIO_APPELS_PAR_TICKET }
}
