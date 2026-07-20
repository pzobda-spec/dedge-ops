import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

const PAGE_SIZE = 1_000
const DEFAULT_HISTORY_QUARTERS = 8
const MIN_HISTORY_QUARTERS = 4
const MAX_HISTORY_QUARTERS = 12
const DAY_MS = 86_400_000
const OTHER_LABELS = new Set(['autre', 'other', 'non classe', 'non classee', 'non renseigne'])
const UNKNOWN_CLIENTS = new Set(['client inconnu', 'inconnu', 'unknown', 'non renseigne'])
const TICKET_COLUMNS = [
  'id',
  'category',
  'product_area',
  'client_name',
  'client_id',
  'created_at',
  'resolved_at',
  'first_response_at',
  'first_response_time_ms',
  'first_contact_resolution',
].join(',')

interface TicketRow {
  id: string
  category: string | null
  product_area: string | null
  client_name: string | null
  client_id: string | null
  created_at: string | null
  resolved_at: string | null
  first_response_at: string | null
  first_response_time_ms: number | string | null
  first_contact_resolution: boolean | null
}

interface Ticket {
  id: string
  category: string
  product: string
  client: string
  clientKey: string
  createdAt: number | null
  resolvedAt: number | null
  firstResponseHours: number | null
  firstContactResolution: boolean | null
}

interface Quarter {
  key: string
  label: string
  year: number
  number: number
  start: Date
  end: Date
}

interface BreakdownItem {
  name: string
  count: number
  previous_count: number
  delta: number
  share_pct: number
}

interface QuarterMetrics {
  key: string
  label: string
  from: string
  to: string
  opened: number
  resolved: number
  fcr: number | null
  fcr_sample_size: number
  avg_first_response_hours: number | null
  has_data: boolean
  coverage_status: 'complete' | 'partial' | 'absent' | 'suspect'
  is_comparable: boolean
}

interface RecurringItem {
  name: string
  current_count: number
  previous_count: number
  total_count: number
  active_quarters: number
}

interface Insight {
  id: string
  title: string
  body: string
  recommendation: string
  tone: 'positive' | 'warning' | 'neutral' | 'info'
  confidence: 'forte' | 'moyenne' | 'faible'
}

export async function GET(request: NextRequest) {
  try {
    const quarterParam = request.nextUrl.searchParams.get('quarter')
    const parsedQuarter = parseQuarter(quarterParam)
    if (quarterParam && !parsedQuarter) {
      return NextResponse.json(
        { error: 'Le trimestre doit utiliser le format AAAA-Q1 à AAAA-Q4.' },
        { status: 400 },
      )
    }
    const selectedQuarter = parsedQuarter ?? lastCompletedQuarter()
    const latestAllowed = lastCompletedQuarter()
    if (selectedQuarter.start.getTime() > latestAllowed.start.getTime()) {
      return NextResponse.json(
        { error: 'Seuls les trimestres terminés peuvent être comparés.' },
        { status: 400 },
      )
    }

    const historyCount = clampInteger(
      request.nextUrl.searchParams.get('quarters'),
      MIN_HISTORY_QUARTERS,
      MAX_HISTORY_QUARTERS,
      DEFAULT_HISTORY_QUARTERS,
    )
    const quarters = Array.from({ length: historyCount }, (_, index) => (
      shiftQuarter(selectedQuarter, index - historyCount + 1)
    ))
    const historyStart = quarters[0].start

    const [rows, coverage] = await Promise.all([
      fetchRows(historyStart, selectedQuarter.end),
      fetchCoverage(),
    ])
    const tickets = rows.map(normalizeTicket)
    const ticketsByQuarter = new Map<string, Ticket[]>()
    const rawHistory = quarters.map(quarter => {
      const created = tickets.filter(ticket => inRange(ticket.createdAt, quarter.start, quarter.end))
      ticketsByQuarter.set(quarter.key, created)
      return computeMetrics(quarter, tickets, created, coverage.from, coverage.to)
    })
    const history = flagSuspectQuarters(rawHistory)

    const current = history[history.length - 1]
    const previous = history[history.length - 2]
    const yearAgo = history.find(point => point.key === shiftQuarter(selectedQuarter, -4).key) ?? null
    const currentTickets = ticketsByQuarter.get(current.key) ?? []
    const previousTickets = ticketsByQuarter.get(previous.key) ?? []
    const topTopics = buildBreakdown(currentTickets, previousTickets, ticket => ticket.product, true)
    const requestTypes = buildBreakdown(currentTickets, previousTickets, ticket => ticket.category, false)
    const topClients = buildBreakdown(currentTickets, previousTickets, ticket => ticket.client, false)
      .filter(item => !isUnknownClient(item.name))
      .slice(0, 10)
    const recurringTopics = buildRecurring(
      quarters,
      ticketsByQuarter,
      ticket => ticket.product,
      name => !isOther(name),
    )
    const recurringClients = buildRecurringClients(
      quarters,
      ticketsByQuarter,
    )
    const otherCount = currentTickets.filter(ticket => isOther(ticket.product)).length
    const previousOtherCount = previousTickets.filter(ticket => isOther(ticket.product)).length
    const otherShare = current.opened > 0 ? roundOne((otherCount / current.opened) * 100) : 0
    const observedQuarters = countObservedQuarters(coverage.from, coverage.to)
    const completeQuarters = countCompleteQuarters(coverage.from, coverage.to)
    const comparableQuarters = history.filter(point => point.is_comparable).length
    const seasonalityReady = comparableQuarters >= 8
    const insights = buildInsights({
      current,
      previous,
      yearAgo,
      history,
      topTopics,
      recurringTopics,
      recurringClients,
      topClients,
      otherShare,
      coverageQuarters: comparableQuarters,
      seasonalityReady,
      previousComparable: current.is_comparable && previous.is_comparable,
      yearAgoComparable: current.is_comparable && yearAgo?.is_comparable === true,
    })

    return NextResponse.json({
      current,
      previous,
      year_ago: yearAgo,
      history,
      top_topics: topTopics.slice(0, 8),
      request_types: requestTypes.slice(0, 6),
      top_clients: topClients,
      recurring_topics: recurringTopics.slice(0, 8),
      recurring_clients: recurringClients.slice(0, 10),
      insights,
      comparisons: {
        quarter_over_quarter: comparisonAvailability(current, previous),
        year_over_year: yearAgo
          ? comparisonAvailability(current, yearAgo)
          : {
              available: false,
              reference: shiftQuarter(selectedQuarter, -4).key,
              reason: 'Historique N-1 indisponible.',
            },
      },
      coverage: {
        ...coverage,
        quarters_with_data: observedQuarters,
        complete_quarters: completeQuarters,
        comparable_quarters: comparableQuarters,
        seasonality_ready: seasonalityReady,
        recommended_history_quarters: 12,
      },
      quality: {
        other_count: otherCount,
        previous_other_count: previousOtherCount,
        other_share_pct: otherShare,
        fcr_is_estimate: true,
      },
      meta: {
        selected_quarter: selectedQuarter.key,
        generated_at: new Date().toISOString(),
        source: 'Supabase · ticket_analytics',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[reporting/quarterly]', message)
    return NextResponse.json(
      {
        error: 'Le reporting trimestriel est temporairement indisponible.',
        code: 'QUARTERLY_REPORTING_UNAVAILABLE',
      },
      { status: 502 },
    )
  }
}

async function fetchRows(from: Date, to: Date): Promise<TicketRow[]> {
  const rows: TicketRow[] = []
  const sourceWindow = [
    `and(created_at.gte.${from.toISOString()},created_at.lt.${to.toISOString()})`,
    `and(resolved_at.gte.${from.toISOString()},resolved_at.lt.${to.toISOString()})`,
  ].join(',')

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('ticket_analytics')
      .select(TICKET_COLUMNS)
      .or(sourceWindow)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(`Supabase ticket_analytics: ${error.message}`)
    const page = (data ?? []) as unknown as TicketRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

async function fetchCoverage(): Promise<{
  ticket_count: number
  from: string | null
  to: string | null
  last_synced_at: string | null
}> {
  const [countResult, firstResult, lastResult, syncResult, coverageResult] = await Promise.all([
    supabaseAdmin.from('ticket_analytics').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('ticket_analytics').select('created_at').not('created_at', 'is', null)
      .order('created_at', { ascending: true }).limit(1),
    supabaseAdmin.from('ticket_analytics').select('created_at').not('created_at', 'is', null)
      .order('created_at', { ascending: false }).limit(1),
    supabaseAdmin.from('ticket_analytics').select('last_synced_at').not('last_synced_at', 'is', null)
      .order('last_synced_at', { ascending: false }).limit(1),
    supabaseAdmin.from('ticket_analytics_history_coverage').select('certified_from,certified_to,backfill_completed_at')
      .eq('id', 'ticket_history_backfill')
      .maybeSingle(),
  ])

  for (const result of [countResult, firstResult, lastResult, syncResult]) {
    if (result.error) throw new Error(`Supabase coverage: ${result.error.message}`)
  }

  const certifiedFrom = coverageResult.data?.backfill_completed_at ? coverageResult.data.certified_from : null
  const certifiedTo = coverageResult.data?.backfill_completed_at ? coverageResult.data.certified_to : null

  return {
    ticket_count: countResult.count ?? 0,
    from: certifiedFrom ?? firstResult.data?.[0]?.created_at ?? null,
    to: certifiedTo ?? lastResult.data?.[0]?.created_at ?? null,
    last_synced_at: syncResult.data?.[0]?.last_synced_at ?? null,
  }
}

function computeMetrics(
  quarter: Quarter,
  allTickets: Ticket[],
  created: Ticket[],
  coverageFrom: string | null,
  coverageTo: string | null,
): QuarterMetrics {
  const resolved = allTickets.filter(ticket => inRange(ticket.resolvedAt, quarter.start, quarter.end))
  const responseSamples = created
    .map(ticket => ticket.firstResponseHours)
    .filter((value): value is number => value !== null)
  const fcrSamples = resolved
    .map(ticket => ticket.firstContactResolution)
    .filter((value): value is boolean => value !== null)
  const coverageStatus = quarterCoverageStatus(quarter, coverageFrom, coverageTo)

  return {
    key: quarter.key,
    label: quarter.label,
    from: isoDate(quarter.start),
    to: isoDate(new Date(quarter.end.getTime() - 1)),
    opened: created.length,
    resolved: resolved.length,
    fcr: fcrSamples.length > 0
      ? roundOne((fcrSamples.filter(Boolean).length / fcrSamples.length) * 100)
      : null,
    fcr_sample_size: fcrSamples.length,
    avg_first_response_hours: responseSamples.length > 0
      ? roundOne(responseSamples.reduce((sum, value) => sum + value, 0) / responseSamples.length)
      : null,
    has_data: created.length > 0 || resolved.length > 0,
    coverage_status: coverageStatus,
    is_comparable: coverageStatus === 'complete',
  }
}

function flagSuspectQuarters(history: QuarterMetrics[]): QuarterMetrics[] {
  const complete = history.filter(point => point.coverage_status === 'complete' && point.opened > 0)
  if (complete.length < 3) return history
  const median = medianValue(complete.map(point => point.opened))
  if (median < 50) return history

  return history.map(point => {
    const suspect = point.coverage_status === 'complete'
      && point.opened > 0
      && point.opened < median * 0.2
    return suspect
      ? { ...point, coverage_status: 'suspect' as const, is_comparable: false }
      : point
  })
}

function quarterCoverageStatus(
  quarter: Quarter,
  coverageFrom: string | null,
  coverageTo: string | null,
): QuarterMetrics['coverage_status'] {
  const from = timestamp(coverageFrom)
  const to = timestamp(coverageTo)
  if (from === null || to === null || to < quarter.start.getTime() || from >= quarter.end.getTime()) {
    return 'absent'
  }
  const coversStart = from <= quarter.start.getTime() + DAY_MS
  const coversEnd = to >= quarter.end.getTime() - DAY_MS
  return coversStart && coversEnd ? 'complete' : 'partial'
}

function comparisonAvailability(current: QuarterMetrics, reference: QuarterMetrics): {
  available: boolean
  reference: string
  reason: string | null
} {
  const available = current.is_comparable && reference.is_comparable
  return {
    available,
    reference: reference.key,
    reason: available
      ? null
      : current.coverage_status === 'suspect' || reference.coverage_status === 'suspect'
        ? 'Couverture historique à valider avant comparaison.'
        : 'Un des deux trimestres ne dispose pas de données complètes.',
  }
}

function buildBreakdown(
  current: Ticket[],
  previous: Ticket[],
  selector: (ticket: Ticket) => string,
  otherLast: boolean,
): BreakdownItem[] {
  const currentCounts = countValues(current, selector)
  const previousCounts = countValues(previous, selector)
  const items = [...currentCounts.entries()].map(([name, count]) => ({
    name,
    count,
    previous_count: previousCounts.get(name) ?? 0,
    delta: count - (previousCounts.get(name) ?? 0),
    share_pct: current.length > 0 ? roundOne((count / current.length) * 100) : 0,
  }))

  return items.sort((left, right) => {
    if (otherLast && isOther(left.name) !== isOther(right.name)) return isOther(left.name) ? 1 : -1
    return right.count - left.count || left.name.localeCompare(right.name, 'fr')
  })
}

function buildRecurring(
  quarters: Quarter[],
  ticketsByQuarter: Map<string, Ticket[]>,
  selector: (ticket: Ticket) => string,
  include: (name: string) => boolean,
): RecurringItem[] {
  const aggregate = new Map<string, { counts: Map<string, number>; total: number }>()
  for (const quarter of quarters) {
    const counts = countValues(ticketsByQuarter.get(quarter.key) ?? [], selector)
    for (const [name, count] of counts) {
      if (!include(name)) continue
      const item = aggregate.get(name) ?? { counts: new Map<string, number>(), total: 0 }
      item.counts.set(quarter.key, count)
      item.total += count
      aggregate.set(name, item)
    }
  }

  const currentKey = quarters[quarters.length - 1].key
  const previousKey = quarters[quarters.length - 2].key
  return [...aggregate.entries()]
    .filter(([, item]) => item.counts.size >= 2 && (item.counts.get(currentKey) ?? 0) > 0)
    .map(([name, item]) => ({
      name,
      current_count: item.counts.get(currentKey) ?? 0,
      previous_count: item.counts.get(previousKey) ?? 0,
      total_count: item.total,
      active_quarters: item.counts.size,
    }))
    .sort((left, right) => (
      right.current_count - left.current_count
      || right.active_quarters - left.active_quarters
      || right.total_count - left.total_count
      || left.name.localeCompare(right.name, 'fr')
    ))
}

function buildRecurringClients(
  quarters: Quarter[],
  ticketsByQuarter: Map<string, Ticket[]>,
): RecurringItem[] {
  const aggregate = new Map<string, {
    name: string
    counts: Map<string, number>
    total: number
  }>()

  for (const quarter of quarters) {
    const quarterCounts = new Map<string, { name: string; count: number }>()
    for (const ticket of ticketsByQuarter.get(quarter.key) ?? []) {
      if (isUnknownClient(ticket.client)) continue
      const item = quarterCounts.get(ticket.clientKey) ?? { name: ticket.client, count: 0 }
      item.name = ticket.client
      item.count++
      quarterCounts.set(ticket.clientKey, item)
    }
    for (const [key, count] of quarterCounts) {
      const item = aggregate.get(key) ?? { name: count.name, counts: new Map<string, number>(), total: 0 }
      item.name = count.name
      item.counts.set(quarter.key, count.count)
      item.total += count.count
      aggregate.set(key, item)
    }
  }

  const currentKey = quarters[quarters.length - 1].key
  const previousKey = quarters[quarters.length - 2].key
  return [...aggregate.values()]
    .filter(item => item.counts.size >= 2 && (item.counts.get(currentKey) ?? 0) > 0)
    .map(item => ({
      name: item.name,
      current_count: item.counts.get(currentKey) ?? 0,
      previous_count: item.counts.get(previousKey) ?? 0,
      total_count: item.total,
      active_quarters: item.counts.size,
    }))
    .sort((left, right) => (
      right.current_count - left.current_count
      || right.active_quarters - left.active_quarters
      || right.total_count - left.total_count
      || left.name.localeCompare(right.name, 'fr')
    ))
}

function buildInsights(input: {
  current: QuarterMetrics
  previous: QuarterMetrics
  yearAgo: QuarterMetrics | null
  history: QuarterMetrics[]
  topTopics: BreakdownItem[]
  recurringTopics: RecurringItem[]
  recurringClients: RecurringItem[]
  topClients: BreakdownItem[]
  otherShare: number
  coverageQuarters: number
  seasonalityReady: boolean
  previousComparable: boolean
  yearAgoComparable: boolean
}): Insight[] {
  const insights: Insight[] = []
  if (!input.previousComparable) {
    insights.push({
      id: 'comparison-quality',
      title: 'Comparaison trimestrielle suspendue',
      body: `${input.current.label} ou ${input.previous.label} ne dispose pas d’une couverture suffisamment fiable pour calculer un écart.`,
      recommendation: 'Valider ou backfiller la période de référence avant d’interpréter une hausse ou une baisse.',
      tone: 'neutral',
      confidence: 'forte',
    })
  }
  const volumeChange = input.previousComparable
    ? percentageChange(input.current.opened, input.previous.opened)
    : null
  if (volumeChange !== null) {
    const rising = volumeChange > 0
    insights.push({
      id: 'volume-change',
      title: `${rising ? 'Hausse' : volumeChange < 0 ? 'Baisse' : 'Stabilité'} du volume trimestriel`,
      body: `${input.current.opened} tickets créés sur ${input.current.label}, soit ${signedPercent(volumeChange)} par rapport à ${input.previous.label}.`,
      recommendation: Math.abs(volumeChange) >= 20
        ? 'Croiser cet écart avec les produits et clients ci-dessous pour identifier les principaux contributeurs.'
        : 'Surveiller le trimestre suivant avant de conclure à un changement structurel.',
      tone: Math.abs(volumeChange) >= 20 ? 'warning' : 'neutral',
      confidence: 'forte',
    })
  }

  const observed = input.history.filter(point => point.opened > 0 && point.is_comparable)
  const peak = [...observed].sort((left, right) => right.opened - left.opened)[0]
  if (peak) {
    insights.push({
      id: 'activity-peak',
      title: peak.key === input.current.key ? 'Nouveau pic d’activité' : `Pic observé sur ${peak.label}`,
      body: `${peak.opened} tickets ont été créés sur ${peak.label}, le maximum de l’historique actuellement disponible.`,
      recommendation: 'Comparer les sujets récurrents et la concentration clients de ce trimestre avec les périodes voisines.',
      tone: peak.key === input.current.key ? 'warning' : 'info',
      confidence: input.coverageQuarters >= 4 ? 'moyenne' : 'faible',
    })
  }

  const topic = input.topTopics.find(item => !isOther(item.name))
  const recurringTopic = topic
    ? input.recurringTopics.find(item => item.name === topic.name)
    : input.recurringTopics[0]
  if (topic) {
    insights.push({
      id: 'recurring-topic',
      title: `${topic.name} domine les sujets structurés`,
      body: `${topic.count} tickets (${formatNumber(topic.share_pct)} %) sur ${input.current.label}${recurringTopic ? `, présent sur ${recurringTopic.active_quarters} trimestres de l’historique` : ''}.`,
      recommendation: input.previousComparable && topic.delta > 0
        ? `Analyser les ${topic.delta} tickets supplémentaires par rapport au trimestre précédent et chercher une cause produit commune.`
        : 'Vérifier si les mêmes sous-problèmes reviennent malgré la stabilité ou la baisse du volume.',
      tone: input.previousComparable && topic.delta > 0 ? 'warning' : 'info',
      confidence: 'moyenne',
    })
  }

  const topFiveClients = input.topClients.slice(0, 5).reduce((sum, item) => sum + item.count, 0)
  const concentration = input.current.opened > 0
    ? roundOne((topFiveClients / input.current.opened) * 100)
    : 0
  insights.push({
    id: 'client-concentration',
    title: `${input.recurringClients.length} clients récurrents identifiés`,
    body: `Les 5 premiers clients représentent ${formatNumber(concentration)} % des tickets du trimestre sélectionné.`,
    recommendation: concentration >= 25
      ? 'Créer une revue dédiée aux principaux clients : une faible poignée concentre une part significative de la charge.'
      : 'Suivre les clients présents sur plusieurs trimestres pour distinguer incidents ponctuels et irritants durables.',
    tone: concentration >= 25 ? 'warning' : 'neutral',
    confidence: 'forte',
  })

  if (input.otherShare >= 20) {
    insights.push({
      id: 'taxonomy-quality',
      title: `« Autre » représente ${formatNumber(input.otherShare)} % du volume`,
      body: 'Ces tickets restent comptabilisés mais sont volontairement placés à la fin et exclus des suggestions de sujets.',
      recommendation: 'Reclasser progressivement les sujets les plus fréquents de « Autre » afin d’améliorer la qualité des tendances.',
      tone: 'warning',
      confidence: 'forte',
    })
  }

  if (input.seasonalityReady && input.yearAgoComparable && input.yearAgo && input.yearAgo.opened > 0) {
    const yearChange = percentageChange(input.current.opened, input.yearAgo.opened) ?? 0
    insights.push({
      id: 'seasonality',
      title: 'Premier signal de saisonnalité disponible',
      body: `${input.current.label} affiche ${signedPercent(yearChange)} face au même trimestre de l’année précédente.`,
      recommendation: input.coverageQuarters >= 12
        ? 'Comparer ce signal aux deux cycles précédents pour confirmer ou invalider la saisonnalité.'
        : 'Ce premier écart annuel doit encore être confirmé avec un troisième cycle.',
      tone: 'info',
      confidence: input.coverageQuarters >= 12 ? 'moyenne' : 'faible',
    })
  } else {
    insights.push({
      id: 'seasonality',
      title: 'Historique insuffisant pour conclure sur la saisonnalité',
      body: `${input.coverageQuarters} trimestre${input.coverageQuarters > 1 ? 's' : ''} de données sont actuellement disponibles ; il en faut au moins 8, idéalement 12.`,
      recommendation: 'Effectuer un backfill ponctuel de 24 à 36 mois, puis conserver la synchronisation quotidienne incrémentale.',
      tone: 'neutral',
      confidence: 'forte',
    })
  }

  return insights
}

function normalizeTicket(row: TicketRow): Ticket {
  const createdAt = timestamp(row.created_at)
  const resolvedAt = timestamp(row.resolved_at)
  const firstResponseAt = timestamp(row.first_response_at)
  const officialResponseMs = finiteNumber(row.first_response_time_ms)
  const responseHours = officialResponseMs !== null && officialResponseMs >= 0
    ? officialResponseMs / 3_600_000
    : createdAt !== null && firstResponseAt !== null && firstResponseAt >= createdAt
    ? (firstResponseAt - createdAt) / 3_600_000
    : null

  return {
    id: row.id,
    category: cleanLabel(row.category, 'Non classé'),
    product: cleanLabel(row.product_area, 'Autre'),
    client: cleanLabel(row.client_name, 'Client inconnu'),
    clientKey: row.client_id?.trim() || normalized(cleanLabel(row.client_name, 'Client inconnu')),
    createdAt,
    resolvedAt,
    firstResponseHours: responseHours !== null && responseHours <= 8_760 ? responseHours : null,
    firstContactResolution: row.first_contact_resolution,
  }
}

function countValues(tickets: Ticket[], selector: (ticket: Ticket) => string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const ticket of tickets) {
    const name = selector(ticket)
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return counts
}

function parseQuarter(value: string | null): Quarter | null {
  const match = /^(\d{4})-Q([1-4])$/.exec(value ?? '')
  if (!match) return null
  const year = Number(match[1])
  const number = Number(match[2])
  if (year < 2020 || year > 2100) return null
  return makeQuarter(year, number)
}

function lastCompletedQuarter(): Quarter {
  const now = new Date()
  const currentNumber = Math.floor(now.getUTCMonth() / 3) + 1
  return shiftQuarter(makeQuarter(now.getUTCFullYear(), currentNumber), -1)
}

function makeQuarter(year: number, number: number): Quarter {
  const start = new Date(Date.UTC(year, (number - 1) * 3, 1))
  const end = new Date(Date.UTC(year, number * 3, 1))
  return { key: `${year}-Q${number}`, label: `T${number} ${year}`, year, number, start, end }
}

function shiftQuarter(quarter: Quarter, offset: number): Quarter {
  const date = new Date(Date.UTC(quarter.year, (quarter.number - 1 + offset) * 3, 1))
  return makeQuarter(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) + 1)
}

function inRange(value: number | null, start: Date, end: Date): boolean {
  return value !== null && value >= start.getTime() && value < end.getTime()
}

function timestamp(value: string | null): number | null {
  const parsed = Date.parse(value ?? '')
  return Number.isFinite(parsed) ? parsed : null
}

function finiteNumber(value: number | string | null): number | null {
  if (value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function cleanLabel(value: string | null, fallback: string): string {
  return value?.trim().replace(/\s+/g, ' ') || fallback
}

function normalized(value: string): string {
  return value.toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function isOther(value: string): boolean {
  return OTHER_LABELS.has(normalized(value))
}

function isUnknownClient(value: string): boolean {
  return UNKNOWN_CLIENTS.has(normalized(value))
}

function percentageChange(current: number, previous: number): number | null {
  return previous > 0 ? roundOne(((current - previous) / previous) * 100) : null
}

function signedPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${formatNumber(value)} %`
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value)
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10
}

function medianValue(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function clampInteger(value: string | null, min: number, max: number, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

function countObservedQuarters(from: string | null, to: string | null): number {
  if (!from || !to) return 0
  const start = new Date(from)
  const end = new Date(to)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
  return Math.max(1, quarterIndex(end) - quarterIndex(start) + 1)
}

function countCompleteQuarters(from: string | null, to: string | null): number {
  if (!from || !to) return 0
  const start = new Date(from)
  const end = new Date(to)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0

  const startQuarter = makeQuarter(start.getUTCFullYear(), Math.floor(start.getUTCMonth() / 3) + 1)
  const endQuarter = makeQuarter(end.getUTCFullYear(), Math.floor(end.getUTCMonth() / 3) + 1)
  const firstComplete = start.getTime() <= startQuarter.start.getTime() + DAY_MS
    ? startQuarter
    : shiftQuarter(startQuarter, 1)
  const lastComplete = end.getTime() >= endQuarter.end.getTime() - DAY_MS
    ? endQuarter
    : shiftQuarter(endQuarter, -1)
  return Math.max(0, quarterIndex(lastComplete.start) - quarterIndex(firstComplete.start) + 1)
}

function quarterIndex(value: Date): number {
  return value.getUTCFullYear() * 4 + Math.floor(value.getUTCMonth() / 3)
}
