import { monthKey } from './monthly'

export type CaseType = 'welcome' | 'setup'
export interface CaseMonthlyRow {
  case_type: CaseType
  product: string
  opened: number
  closed: number
  open_stock: number | null
  avg_age_days: number | null
}
export interface StoredCaseMonthlyRow extends CaseMonthlyRow {
  synced_at: string
}

const monthPattern = /^20\d{2}-(0[1-9]|1[0-2])-01$/
const nonnegativeInteger = (value: unknown) => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 2_147_483_647
const nullableNonnegative = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 100_000_000)

export function parseCaseBatch(input: unknown): { month: string; rows: CaseMonthlyRow[] } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Lot invalide.')
  const batch = input as Record<string, unknown>
  if (typeof batch.month !== 'string' || !monthPattern.test(batch.month)
      || !Array.isArray(batch.rows) || batch.rows.length < 2 || batch.rows.length > 200) throw new Error('Mois ou lignes invalides.')
  const keys = new Set<string>()
  const rows: CaseMonthlyRow[] = batch.rows.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ligne invalide.')
    const row = value as Record<string, unknown>
    if ((row.case_type !== 'welcome' && row.case_type !== 'setup')
      || typeof row.product !== 'string' || !row.product.trim() || row.product.length > 160
      || row.product !== row.product.trim()
      || !nonnegativeInteger(row.opened) || !nonnegativeInteger(row.closed)
      || !nullableNonnegative(row.open_stock ?? null)
      || (row.open_stock != null && !nonnegativeInteger(row.open_stock))
      || !nullableNonnegative(row.avg_age_days ?? null)
      || (row.closed === 0 && row.avg_age_days != null)) throw new Error('Indicateurs invalides.')
    const key = `${row.case_type}\0${row.product}`
    if (keys.has(key)) throw new Error('Ligne en double.')
    keys.add(key)
    return {
      case_type: row.case_type, product: row.product,
      opened: row.opened as number, closed: row.closed as number,
      open_stock: row.open_stock == null ? null : row.open_stock as number,
      avg_age_days: row.avg_age_days == null ? null : row.avg_age_days as number,
    }
  })
  if (!keys.has('welcome\0__TOTAL__') || !keys.has('setup\0__TOTAL__')) throw new Error('Totaux Welcome et Setup requis.')
  return { month: batch.month, rows }
}

export function caseSlideMetrics(rows: StoredCaseMonthlyRow[], month: string, now = new Date()) {
  const current = month === monthKey(now)
  const result = {} as Record<CaseType, { opened: number | null; closed: number | null; closed_opened_pct: number | null; avg_age_days: number | null; synced_at: string | null; warning: string | null }>
  for (const type of ['welcome', 'setup'] as const) {
    const row = rows.find(item => item.case_type === type && item.product === '__TOTAL__')
    const stale = !!row && (!Number.isFinite(Date.parse(row.synced_at)) || (current && now.getTime() - Date.parse(row.synced_at) > 48 * 3_600_000))
    const warning = !row ? 'Ligne totale absente : données Salesforce indisponibles.' : stale ? 'Synchronisation Salesforce trop ancienne : données indisponibles.' : null
    result[type] = {
      opened: warning ? null : row!.opened,
      closed: warning ? null : row!.closed,
      closed_opened_pct: warning || row!.opened === 0 ? null : row!.closed / row!.opened * 100,
      avg_age_days: warning || row!.closed === 0 ? null : row!.avg_age_days,
      synced_at: row?.synced_at ?? null,
      warning,
    }
  }
  return result
}
