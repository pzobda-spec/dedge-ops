import { fetchTickets } from './client'
import { ZOHO_TICKET_PAGE_SIZE } from './constants'

export type ZohoTicketRecord = Awaited<ReturnType<typeof fetchTickets>>['data'][number]

export interface TicketRangeDebugInfo {
  fetchedCount: number
  firstCreatedTime: string | null
  lastCreatedTime: string | null
  withClosedTime: number
  closedInPeriodCount: number
}

export interface TicketPeriodComputation {
  fetched: ZohoTicketRecord[]
  createdInPeriod: ZohoTicketRecord[]
  closedInPeriod: ZohoTicketRecord[]
  opened: number
  closed: number
  fcr: number
  avgFirstReplyHours: number | null
  avgResolutionHours: number | null
  debug: TicketRangeDebugInfo
}

export async function fetchTicketsCreatedInRange(
  from: Date,
  to: Date,
): Promise<ZohoTicketRecord[]> {
  const fromMs = from.getTime()
  const toMs = to.getTime()
  const result: ZohoTicketRecord[] = []
  let offset = 0

  while (true) {
    let page: ZohoTicketRecord[]
    try {
      const res = await fetchTickets({
        limit: ZOHO_TICKET_PAGE_SIZE,
        from: offset,
        sortBy: 'createdTime',
      })
      page = res.data ?? []
    } catch (err) {
      if (offset === 0) throw err
      break
    }

    if (page.length === 0) break

    let pastWindow = false
    for (const ticket of page) {
      const ts = new Date(ticket.createdTime).getTime()
      if (ts > toMs) {
        pastWindow = true
        break
      }
      if (ts >= fromMs) result.push(ticket)
    }

    if (pastWindow || page.length < ZOHO_TICKET_PAGE_SIZE) break
    offset += ZOHO_TICKET_PAGE_SIZE
  }

  return result
}

export async function computeTicketPeriodMetrics(
  from: Date,
  to: Date,
  lookbackDays: number,
): Promise<TicketPeriodComputation> {
  const fromMs = from.getTime()
  const toMs = to.getTime()
  const extendedFrom = new Date(fromMs - lookbackDays * 24 * 3600 * 1000)
  const fetched = await fetchTicketsCreatedInRange(extendedFrom, to)

  const createdInPeriod: ZohoTicketRecord[] = []
  const closedInPeriod: ZohoTicketRecord[] = []
  const resolutionSamples: number[] = []
  const firstReplySamples: number[] = []
  let fcrCount = 0
  let withClosedTime = 0

  for (const ticket of fetched) {
    const createdAt = new Date(ticket.createdTime).getTime()

    if (createdAt >= fromMs && createdAt <= toMs) {
      createdInPeriod.push(ticket)
      const responseTime = (ticket as unknown as Record<string, unknown>).responseTime
      if (typeof responseTime === 'number' && responseTime > 0) {
        firstReplySamples.push(responseTime / 3_600_000)
      }
    }

    if (!ticket.closedTime) continue
    withClosedTime++

    const closedAt = new Date(ticket.closedTime).getTime()
    if (closedAt < fromMs || closedAt > toMs) continue

    closedInPeriod.push(ticket)
    if ((Number(ticket.threadCount) || 0) <= 2) fcrCount++

    const resolutionHours = (closedAt - createdAt) / 3_600_000
    if (resolutionHours > 0 && resolutionHours < 8_760) {
      resolutionSamples.push(resolutionHours)
    }
  }

  const closed = closedInPeriod.length

  return {
    fetched,
    createdInPeriod,
    closedInPeriod,
    opened: createdInPeriod.length,
    closed,
    fcr: closed > 0 ? Math.round((fcrCount / closed) * 100) : 0,
    avgResolutionHours: averageRounded(resolutionSamples),
    avgFirstReplyHours: averageRounded(firstReplySamples),
    debug: {
      fetchedCount: fetched.length,
      firstCreatedTime: fetched[0]?.createdTime ?? null,
      lastCreatedTime: fetched[fetched.length - 1]?.createdTime ?? null,
      withClosedTime,
      closedInPeriodCount: closed,
    },
  }
}

export function topCategories(
  tickets: ZohoTicketRecord[],
  limit: number,
): { name: string; count: number }[] {
  const counts: Record<string, number> = {}
  for (const ticket of tickets) {
    const category = ticket.category || 'Autre'
    counts[category] = (counts[category] ?? 0) + 1
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }))
}

export function isOtherCategory(category: string | null | undefined): boolean {
  const normalized = (category ?? '').trim().toLowerCase()
  return normalized === '' || normalized === 'autre' || normalized === 'other'
}

export function countOtherCategories(tickets: ZohoTicketRecord[]): number {
  return tickets.filter(ticket => isOtherCategory(ticket.category)).length
}

function averageRounded(samples: number[]): number | null {
  if (samples.length === 0) return null
  return Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 10) / 10
}
