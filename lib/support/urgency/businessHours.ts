import { addDays } from 'date-fns'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import type { BusinessHoursConfig, BusinessHoursInterval, FirstResponseStatus } from './types'

const DAY_KEYS = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
] as const

export function addBusinessMinutes(
  receivedAt: Date,
  minutes: number,
  config: BusinessHoursConfig,
): Date {
  if (!Number.isFinite(receivedAt.getTime()) || minutes < 0) throw new Error('Invalid SLA input')
  if (minutes === 0) return new Date(receivedAt)

  let cursor = new Date(receivedAt)
  let remaining = minutes
  for (let dayOffset = 0; dayOffset < 370; dayOffset += 1) {
    const localDate = formatInTimeZone(cursor, config.timezone, 'yyyy-MM-dd')
    const intervals = utcIntervalsForLocalDate(localDate, config)
    for (const interval of intervals) {
      const start = new Date(Math.max(cursor.getTime(), interval.start.getTime()))
      if (start >= interval.end) continue
      const availableMinutes = (interval.end.getTime() - start.getTime()) / 60_000
      if (remaining <= availableMinutes) {
        return new Date(start.getTime() + remaining * 60_000)
      }
      remaining -= availableMinutes
    }
    cursor = fromZonedTime(`${nextDate(localDate)}T00:00:00`, config.timezone)
  }
  throw new Error('Unable to place SLA deadline within one year')
}

export function firstResponseStatus(input: {
  now: Date
  dueAt: Date | null
  firstResponseAt?: Date | null
  firstResponseBusinessDurationMs?: number | null
  targetBusinessMinutes: number
}): FirstResponseStatus {
  // Prefer the actual response timestamp against the business-calendar deadline.
  // Zoho's duration field is only a fallback because it can be elapsed time.
  if (input.firstResponseAt && input.dueAt) {
    return input.firstResponseAt <= input.dueAt ? 'within_target' : 'overdue'
  }
  if (input.firstResponseBusinessDurationMs !== null && input.firstResponseBusinessDurationMs !== undefined) {
    return input.firstResponseBusinessDurationMs <= input.targetBusinessMinutes * 60_000
      ? 'within_target'
      : 'overdue'
  }
  if (!input.dueAt) return 'no_data'
  return input.now > input.dueAt ? 'overdue' : 'pending'
}

function utcIntervalsForLocalDate(
  localDate: string,
  config: BusinessHoursConfig,
): Array<{ start: Date; end: Date }> {
  if (config.holidays.includes(localDate)) return []
  const localMidday = fromZonedTime(`${localDate}T12:00:00`, config.timezone)
  const dayKey = DAY_KEYS[Number(formatInTimeZone(localMidday, config.timezone, 'i')) % 7]
  return (config.weeklySchedule[dayKey] ?? [])
    .map((interval: BusinessHoursInterval) => ({
      start: fromZonedTime(`${localDate}T${interval.start}:00`, config.timezone),
      end: fromZonedTime(`${localDate}T${interval.end}:00`, config.timezone),
    }))
    .filter(interval => interval.end > interval.start)
}

function nextDate(localDate: string): string {
  return formatInTimeZone(addDays(new Date(`${localDate}T12:00:00Z`), 1), 'UTC', 'yyyy-MM-dd')
}
