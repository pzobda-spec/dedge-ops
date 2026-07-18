import { unstable_cache } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { fetchSessionsWithMeta } from '@/lib/acuity/client'
import { ACUITY_SESSIONS_CACHE_SECONDS } from '@/lib/zoho/constants'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Period = 'recent' | 'upcoming' | 'all'

const VALID_PERIODS = new Set<Period>(['recent', 'upcoming', 'all'])
const MAX_RECENT_MONTHS = 120
const MAX_EXPLICIT_RANGE_DAYS = 366 * 5

const getSessionsData = unstable_cache(
  async (minDate: string, maxDate: string) =>
    fetchSessionsWithMeta({
      minDate: minDate || undefined,
      maxDate: maxDate || undefined,
    }),
  ['acuity-sessions-v3'],
  { revalidate: ACUITY_SESSIONS_CACHE_SECONDS, tags: ['acuity-sessions'] }
)

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function subtractMonths(value: string, months: number): string {
  const [year, month, day] = value.split('-').map(Number)
  const targetMonth = new Date(Date.UTC(year, month - 1 - months, 1))
  const lastDay = new Date(
    Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)
  ).getUTCDate()
  targetMonth.setUTCDate(Math.min(day, lastDay))
  return targetMonth.toISOString().slice(0, 10)
}

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 })
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const periodParam = searchParams.get('period') ?? 'recent'
    if (!VALID_PERIODS.has(periodParam as Period)) {
      return badRequest('period must be one of: recent, upcoming, all')
    }
    const period = periodParam as Period

    const monthsParam = searchParams.get('months') ?? '3'
    if (!/^\d+$/.test(monthsParam)) {
      return badRequest('months must be an integer between 1 and 120')
    }
    const months = Number(monthsParam)
    if (!Number.isSafeInteger(months) || months < 1 || months > MAX_RECENT_MONTHS) {
      return badRequest('months must be an integer between 1 and 120')
    }

    const requestedMinDate = searchParams.get('minDate') ?? ''
    const requestedMaxDate = searchParams.get('maxDate') ?? ''
    if (Boolean(requestedMinDate) !== Boolean(requestedMaxDate)) {
      return badRequest('minDate and maxDate must be provided together')
    }
    if (requestedMinDate && !isValidDate(requestedMinDate)) {
      return badRequest('minDate must be a valid date in YYYY-MM-DD format')
    }
    if (requestedMaxDate && !isValidDate(requestedMaxDate)) {
      return badRequest('maxDate must be a valid date in YYYY-MM-DD format')
    }
    if (requestedMinDate && requestedMaxDate && requestedMinDate > requestedMaxDate) {
      return badRequest('minDate must be before or equal to maxDate')
    }
    if (requestedMinDate && requestedMaxDate) {
      const rangeDays = (
        Date.parse(`${requestedMaxDate}T00:00:00.000Z`)
        - Date.parse(`${requestedMinDate}T00:00:00.000Z`)
      ) / (24 * 60 * 60 * 1000)
      if (rangeDays > MAX_EXPLICIT_RANGE_DAYS) {
        return badRequest('The requested date range cannot exceed 5 years')
      }
    }

    let minDate = requestedMinDate
    let maxDate = requestedMaxDate

    if (!minDate && !maxDate) {
      const today = new Date().toISOString().slice(0, 10)
      if (period === 'upcoming') minDate = today
      if (period === 'recent') minDate = subtractMonths(today, months)
    }

    const result = await getSessionsData(minDate, maxDate)
    return NextResponse.json(result, {
      headers: result.meta.truncated ? { 'X-Acuity-Truncated': 'true' } : undefined,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
