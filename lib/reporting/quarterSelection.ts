import { monthKey } from './monthly'

export function currentQuarter(now: Date = new Date()) {
  const [year, month] = monthKey(now).split('-').map(Number)
  const number = Math.floor((month - 1) / 3) + 1
  return { year, number, key: `${year}-Q${number}` }
}

export function quarterCoverageStatus(
  quarter: { start: Date; end: Date },
  coverageFrom: string | null,
  coverageTo: string | null,
  now: Date,
): 'complete' | 'partial' | 'absent' {
  const parsedFrom = Date.parse(coverageFrom ?? '')
  const parsedTo = Date.parse(coverageTo ?? '')
  if (!Number.isFinite(parsedFrom) || !Number.isFinite(parsedTo)
      || parsedTo < quarter.start.getTime() || parsedFrom >= quarter.end.getTime()) return 'absent'

  const dayMs = 86_400_000
  const coversStart = parsedFrom <= quarter.start.getTime() + dayMs
  const coversEnd = quarter.end.getTime() <= now.getTime()
    && parsedTo >= quarter.end.getTime() - dayMs
  return coversStart && coversEnd ? 'complete' : 'partial'
}
