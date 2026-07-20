'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

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

interface BreakdownItem {
  name: string
  count: number
  previous_count: number
  delta: number
  share_pct: number
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

interface QuarterlyStats {
  current: QuarterMetrics
  previous: QuarterMetrics
  year_ago: QuarterMetrics | null
  history: QuarterMetrics[]
  top_topics: BreakdownItem[]
  request_types: BreakdownItem[]
  top_clients: BreakdownItem[]
  recurring_topics: RecurringItem[]
  recurring_clients: RecurringItem[]
  insights: Insight[]
  comparisons: {
    quarter_over_quarter: ComparisonAvailability
    year_over_year: ComparisonAvailability
  }
  coverage: {
    ticket_count: number
    from: string | null
    to: string | null
    last_synced_at: string | null
    quarters_with_data: number
    complete_quarters: number
    comparable_quarters: number
    seasonality_ready: boolean
    recommended_history_quarters: number
  }
  quality: {
    other_count: number
    previous_other_count: number
    other_share_pct: number
    fcr_is_estimate: boolean
  }
  meta: {
    selected_quarter: string
    generated_at: string
    source: string
  }
}

interface ComparisonAvailability {
  available: boolean
  reference: string
  reason: string | null
}

interface QuarterOption {
  key: string
  label: string
  year: number
  number: number
}

const integerFormatter = new Intl.NumberFormat('fr-FR')
const decimalFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

function makeQuarter(year: number, number: number): QuarterOption {
  return { key: `${year}-Q${number}`, label: `T${number} ${year}`, year, number }
}

function shiftQuarter(quarter: QuarterOption, offset: number): QuarterOption {
  const date = new Date(Date.UTC(quarter.year, (quarter.number - 1 + offset) * 3, 1))
  return makeQuarter(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) + 1)
}

function lastCompletedQuarter(): QuarterOption {
  const now = new Date()
  const current = makeQuarter(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) + 1)
  return shiftQuarter(current, -1)
}

function quarterOptions(): QuarterOption[] {
  const latest = lastCompletedQuarter()
  return Array.from({ length: 12 }, (_, index) => shiftQuarter(latest, index - 11))
}

function quarterForDate(value: string | null): QuarterOption | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return makeQuarter(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) + 1)
}

function quarterIndex(quarter: QuarterOption): number {
  return quarter.year * 4 + quarter.number - 1
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function percentageChange(current: number, previous: number): number | null {
  return previous > 0 ? Math.round(((current - previous) / previous) * 1_000) / 10 : null
}

function signed(value: number, suffix = ''): string {
  return `${value > 0 ? '+' : ''}${decimalFormatter.format(value)}${suffix}`
}

function comparisonTone(value: number | null, lowerIsBetter = false): string {
  if (value === null || value === 0) return 'text-[#696969]'
  const positive = lowerIsBetter ? value < 0 : value > 0
  return positive ? 'text-[#1c6437]' : 'text-[#b7221b]'
}

function isOther(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase('fr-FR')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return ['autre', 'other', 'non classe', 'non renseigne'].includes(normalized)
}

function buildCopiedReport(stats: QuarterlyStats): string {
  const volumeChange = stats.comparisons.quarter_over_quarter.available
    ? percentageChange(stats.current.opened, stats.previous.opened)
    : null
  const lines = [
    `Reporting support — ${stats.current.label}`,
    '',
    `Tickets créés : ${integerFormatter.format(stats.current.opened)}${volumeChange === null ? '' : ` (${signed(volumeChange, ' %')} vs ${stats.previous.label})`}`,
    `Tickets résolus : ${integerFormatter.format(stats.current.resolved)}`,
    `FCR : ${stats.current.fcr === null ? 'non disponible' : `${decimalFormatter.format(stats.current.fcr)} %`}`,
    `Première réponse : ${stats.current.avg_first_response_hours === null ? 'non disponible' : `${decimalFormatter.format(stats.current.avg_first_response_hours)} h`}`,
  ]

  if (stats.comparisons.year_over_year.available && stats.year_ago) {
    const yearChange = percentageChange(stats.current.opened, stats.year_ago.opened)
    lines.push(`Même trimestre N-1 : ${yearChange === null ? 'non comparable' : signed(yearChange, ' %')}`)
  } else {
    lines.push('Même trimestre N-1 : historique indisponible')
  }

  const topics = stats.top_topics.filter(item => !isOther(item.name)).slice(0, 5)
  if (topics.length > 0) {
    lines.push('', 'Sujets principaux')
    topics.forEach((topic, index) => {
      lines.push(`${index + 1}. ${topic.name} — ${topic.count} tickets (${decimalFormatter.format(topic.share_pct)} %)`)
    })
  }

  if (stats.insights.length > 0) {
    lines.push('', "Pistes d'analyse")
    stats.insights.forEach(insight => lines.push(`• ${insight.title} — ${insight.body} ${insight.recommendation}`))
  }

  return lines.join('\n')
}

function MetricCard({
  label,
  value,
  comparison,
  comparisonLabel,
  lowerIsBetter = false,
}: {
  label: string
  value: string
  comparison: number | null
  comparisonLabel: string
  lowerIsBetter?: boolean
}) {
  return (
    <div className="rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-[0_4px_8px_rgba(0,0,0,0.06)]">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#696969]">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-[#1a1a1a]">{value}</p>
      <p className={`mt-1 text-xs font-medium tabular-nums ${comparisonTone(comparison, lowerIsBetter)}`}>
        {comparison === null ? 'Référence indisponible' : `${signed(comparison, ' %')} vs ${comparisonLabel}`}
      </p>
    </div>
  )
}

function FcrCard({
  current,
  previous,
  comparisonAvailable,
  sampleSize,
}: {
  current: number | null
  previous: number | null
  comparisonAvailable: boolean
  sampleSize: number
}) {
  const change = comparisonAvailable && current !== null && previous !== null
    ? Math.round((current - previous) * 10) / 10
    : null
  return (
    <div className="rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-[0_4px_8px_rgba(0,0,0,0.06)]">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#696969]">FCR estimé</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-[#1a1a1a]">{current === null ? '—' : `${decimalFormatter.format(current)} %`}</p>
      <p className={`mt-1 text-xs font-medium tabular-nums ${comparisonTone(change)}`}>
        {change === null ? 'Comparaison indisponible' : `${signed(change, ' pt')} vs trimestre précédent`}
      </p>
      <p className="mt-1 text-[10px] text-[#878787]">Échantillon : {integerFormatter.format(sampleSize)} résolutions</p>
    </div>
  )
}

function InsightCard({ insight }: { insight: Insight }) {
  const styles = {
    positive: 'border-[#b7dfc5] bg-[#f2fbf5]',
    warning: 'border-[#edc86b] bg-[#fffaf0]',
    info: 'border-[#cbd8f3] bg-[#f5f8ff]',
    neutral: 'border-[#ded8e8] bg-[#faf8fc]',
  }
  const dots = {
    positive: 'bg-[#1c6437]',
    warning: 'bg-[#b97812]',
    info: 'bg-[#3b72d1]',
    neutral: 'bg-[#8064b3]',
  }

  return (
    <article className={`rounded-xl border p-4 ${styles[insight.tone]}`}>
      <div className="flex items-start gap-2.5">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dots[insight.tone]}`} aria-hidden="true" />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-[#1a1a1a]">{insight.title}</h3>
            <span className="rounded-full border border-black/10 bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#696969]">
              Confiance {insight.confidence}
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-5 text-[#4a4a4a]">{insight.body}</p>
          <p className="mt-2 text-xs font-medium leading-5 text-[#6d5684]">À analyser : {insight.recommendation}</p>
        </div>
      </div>
    </article>
  )
}

export default function ReportingPage() {
  const options = useMemo(quarterOptions, [])
  const [selectedQuarter, setSelectedQuarter] = useState(options[options.length - 1].key)
  const [stats, setStats] = useState<QuarterlyStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const availableOptions = useMemo(() => {
    const earliest = quarterForDate(stats?.coverage.from ?? null)
    if (!earliest) return options
    return options.filter(option => quarterIndex(option) >= quarterIndex(earliest))
  }, [options, stats?.coverage.from])
  const selectedIndex = availableOptions.findIndex(option => option.key === selectedQuarter)

  const loadStats = useCallback(async (quarter: string, signal: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/reporting/quarterly?quarter=${quarter}&quarters=12`, { signal })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
      if (!signal.aborted) setStats(body as QuarterlyStats)
    } catch (loadError) {
      if (signal.aborted) return
      setStats(null)
      setError(loadError instanceof Error ? loadError.message : 'Erreur inconnue')
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void loadStats(selectedQuarter, controller.signal)
    return () => controller.abort()
  }, [loadStats, selectedQuarter])

  function handleCopy() {
    if (!stats) return
    navigator.clipboard.writeText(buildCopiedReport(stats)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2_000)
    })
  }

  const visibleTopics = stats?.top_topics.filter(item => !isOther(item.name)).slice(0, 7) ?? []
  const topicMax = Math.max(1, ...visibleTopics.map(item => item.count), stats?.quality.other_count ?? 0)
  const qoqAvailable = stats?.comparisons.quarter_over_quarter.available ?? false
  const openedChange = stats && qoqAvailable ? percentageChange(stats.current.opened, stats.previous.opened) : null
  const resolvedChange = stats && qoqAvailable ? percentageChange(stats.current.resolved, stats.previous.resolved) : null
  const responseChange = qoqAvailable && stats?.current.avg_first_response_hours != null && stats.previous.avg_first_response_hours != null
    ? percentageChange(stats.current.avg_first_response_hours, stats.previous.avg_first_response_hours)
    : null
  const yearChange = stats?.comparisons.year_over_year.available && stats.year_ago
    ? percentageChange(stats.current.opened, stats.year_ago.opened)
    : null
  const chartData = stats?.history
    .filter(point => point.coverage_status !== 'absent')
    .map(point => ({
      ...point,
      display_label: point.is_comparable ? point.label : `${point.label}*`,
    })) ?? []
  const chartHasUnreliableQuarter = chartData.some(point => !point.is_comparable)
  const navButton = 'rounded-lg p-2 text-[#696969] transition-colors hover:bg-[#f7f7f7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8064b3] disabled:cursor-not-allowed disabled:opacity-30'

  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] text-[#1a1a1a]" style={{ fontFamily: 'var(--font-sans)' }}>
      <header className="border-b border-[#e2e2e2] bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8064b3]">Analyse support</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Reporting trimestriel</h1>
            <p className="mt-1 text-sm text-[#696969]">Supabase · comparaison T-1 et même trimestre N-1 · détection de patterns</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => selectedIndex > 0 && setSelectedQuarter(availableOptions[selectedIndex - 1].key)}
              disabled={selectedIndex <= 0}
              className={navButton}
              aria-label="Trimestre précédent"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <select
              value={selectedQuarter}
              onChange={event => setSelectedQuarter(event.target.value)}
              className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-sm font-semibold text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#8064b3]"
              aria-label="Trimestre analysé"
            >
              {availableOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
            <button
              type="button"
              onClick={() => selectedIndex < availableOptions.length - 1 && setSelectedQuarter(availableOptions[selectedIndex + 1].key)}
              disabled={selectedIndex < 0 || selectedIndex >= availableOptions.length - 1}
              className={navButton}
              aria-label="Trimestre suivant"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {loading && (
          <div className="flex items-center gap-2 py-16 text-sm text-[#696969]">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#e2e2e2] border-t-[#59319f]" />
            Calcul des tendances trimestrielles…
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-[#fca5a5] bg-[#fee3e2] px-4 py-3 text-sm text-[#b7221b]">
            {error}
          </div>
        )}

        {!loading && !error && stats && (
          <>
            <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#1a1a1a]">{stats.current.label}</h2>
                <p className="mt-0.5 text-xs text-[#696969]">
                  Du {formatDate(stats.current.from)} au {formatDate(stats.current.to)} · dernière synchronisation {formatDateTime(stats.coverage.last_synced_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-[#59319f] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#3f2175] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8064b3] focus-visible:ring-offset-2"
              >
                {copied ? 'Rapport copié !' : 'Copier la synthèse'}
              </button>
            </section>

            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Comparaisons trimestrielles">
              <div className="rounded-xl border border-[#ded8e8] bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#696969]">Trimestre précédent</p>
                <p className="mt-1 text-sm font-bold text-[#1a1a1a]">
                  {qoqAvailable && openedChange !== null
                    ? `${signed(openedChange, ' %')} de tickets créés vs ${stats.previous.label}`
                    : `Comparaison avec ${stats.previous.label} indisponible`}
                </p>
                {!qoqAvailable && (
                  <p className="mt-1 text-xs text-[#878787]">{stats.comparisons.quarter_over_quarter.reason}</p>
                )}
              </div>
              <div className="rounded-xl border border-[#ded8e8] bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#696969]">Même trimestre N-1</p>
                <p className="mt-1 text-sm font-bold text-[#1a1a1a]">
                  {stats.comparisons.year_over_year.available && stats.year_ago && yearChange !== null
                    ? `${signed(yearChange, ' %')} de tickets créés vs ${stats.year_ago.label}`
                    : `Comparaison avec ${stats.year_ago?.label ?? stats.comparisons.year_over_year.reference.replace(/^(\d{4})-Q([1-4])$/, 'T$2 $1')} indisponible`}
                </p>
                {!stats.comparisons.year_over_year.available && (
                  <p className="mt-1 text-xs text-[#878787]">{stats.comparisons.year_over_year.reason}</p>
                )}
              </div>
            </section>

            {!stats.coverage.seasonality_ready && (
              <section className="rounded-xl border border-[#edc86b] bg-[#fff8e8] px-4 py-3 text-sm text-[#84550e]" role="status">
                <p className="font-bold">La saisonnalité n’est pas encore interprétable</p>
                <p className="mt-1 text-xs leading-5">
                  Historique disponible : {formatDate(stats.coverage.from)} → {formatDate(stats.coverage.to)} ({integerFormatter.format(stats.coverage.ticket_count)} tickets), dont {stats.coverage.comparable_quarters} trimestre{stats.coverage.comparable_quarters > 1 ? 's' : ''} comparable{stats.coverage.comparable_quarters > 1 ? 's' : ''}. Il en faut au moins 8, idéalement 12, pour distinguer une saisonnalité d’un événement ponctuel.
                </p>
              </section>
            )}

            {!stats.current.is_comparable && (
              <section className="rounded-xl border border-[#edc86b] bg-[#fff8e8] px-4 py-3 text-sm text-[#84550e]" role="status">
                <p className="font-bold">Le trimestre sélectionné est incomplet ou à valider</p>
                <p className="mt-1 text-xs leading-5">Les volumes restent visibles, mais les écarts et les suggestions qui nécessitent une référence fiable sont volontairement désactivés.</p>
              </section>
            )}

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicateurs du trimestre">
              <MetricCard
                label="Tickets créés"
                value={integerFormatter.format(stats.current.opened)}
                comparison={openedChange}
                comparisonLabel={stats.previous.label}
                lowerIsBetter
              />
              <MetricCard
                label="Tickets résolus"
                value={integerFormatter.format(stats.current.resolved)}
                comparison={resolvedChange}
                comparisonLabel={stats.previous.label}
              />
              <FcrCard
                current={stats.current.fcr}
                previous={stats.previous.fcr}
                comparisonAvailable={qoqAvailable}
                sampleSize={stats.current.fcr_sample_size}
              />
              <MetricCard
                label="Première réponse"
                value={stats.current.avg_first_response_hours === null ? '—' : `${decimalFormatter.format(stats.current.avg_first_response_hours)} h`}
                comparison={responseChange}
                comparisonLabel={stats.previous.label}
                lowerIsBetter
              />
            </section>

            <section className="rounded-xl border border-[#ded8e8] bg-white p-4 shadow-[0_4px_10px_rgba(36,25,55,0.05)] sm:p-5">
              <div className="mb-5">
                <h2 className="text-sm font-bold text-[#1a1a1a]">Volumes trimestre par trimestre</h2>
                <p className="mt-1 text-xs text-[#696969]">Les colonnes font ressortir les pics d’activité et l’écart entre créations et résolutions.</p>
              </div>
              <div className="h-[300px] w-full" role="img" aria-label="Tickets créés et résolus par trimestre">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: -14, bottom: 4 }}>
                    <CartesianGrid stroke="#ece8f1" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="display_label" tick={{ fill: '#696969', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#d8d8d8' }} />
                    <YAxis allowDecimals={false} tick={{ fill: '#696969', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: '#f6f3f9' }}
                      contentStyle={{ border: '1px solid #ded8e8', borderRadius: 10, boxShadow: '0 8px 24px rgba(36,25,55,0.1)' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#4a4a4a' }} />
                    <Bar dataKey="opened" name="Créés" fill="#59319f" radius={[4, 4, 0, 0]} maxBarSize={38} />
                    <Bar dataKey="resolved" name="Résolus" fill="#8fb8e8" radius={[4, 4, 0, 0]} maxBarSize={38} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {chartHasUnreliableQuarter && (
                <p className="mt-2 text-[11px] text-[#878787]">* période partielle ou couverture historique à valider ; elle est exclue des comparaisons automatiques.</p>
              )}
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="rounded-xl border border-[#ded8e8] bg-white p-4 shadow-[0_4px_10px_rgba(36,25,55,0.05)] sm:p-5">
                <div className="mb-4">
                  <h2 className="text-sm font-bold text-[#1a1a1a]">Sujets structurés du trimestre</h2>
                  <p className="mt-1 text-xs text-[#696969]">Domaines produit comparés à {stats.previous.label}. « Autre » reste comptabilisé mais apparaît en dernier.</p>
                </div>
                <div className="space-y-3">
                  {visibleTopics.map(topic => (
                    <div key={topic.name}>
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-medium text-[#4a4a4a]">{topic.name}</span>
                        <div className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
                          <span className="font-bold text-[#1a1a1a]">{topic.count}</span>
                          <span className={comparisonTone(topic.delta, true)}>{signed(topic.delta)}</span>
                        </div>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[#eeeaf3]">
                        <div className="h-full rounded-full bg-[#8064b3]" style={{ width: `${Math.max(2, (topic.count / topicMax) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                  {stats.quality.other_count > 0 && (
                    <div className="border-t border-[#ece8f1] pt-3">
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-[#878787]">Autre</span>
                        <div className="flex items-center gap-2 text-xs tabular-nums text-[#878787]">
                          <span className="font-bold">{stats.quality.other_count}</span>
                          <span>{signed(stats.quality.other_count - stats.quality.previous_other_count)}</span>
                        </div>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[#eeeeee]">
                        <div className="h-full rounded-full bg-[#b8b8b8]" style={{ width: `${Math.max(2, (stats.quality.other_count / topicMax) * 100)}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-[#ded8e8] bg-white p-4 shadow-[0_4px_10px_rgba(36,25,55,0.05)] sm:p-5">
                <div className="mb-4">
                  <h2 className="text-sm font-bold text-[#1a1a1a]">Clients récurrents</h2>
                  <p className="mt-1 text-xs text-[#696969]">Clients actifs sur au moins deux trimestres et présents sur {stats.current.label}.</p>
                </div>
                {stats.recurring_clients.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[#d8d8d8] px-4 py-8 text-center text-sm text-[#696969]">Aucun client récurrent sur la période disponible.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-[#e2e2e2] text-[11px] uppercase tracking-wide text-[#878787]">
                          <th className="pb-2 font-semibold">Client</th>
                          <th className="pb-2 text-right font-semibold">{stats.current.label}</th>
                          <th className="pb-2 text-right font-semibold">{stats.previous.label}</th>
                          <th className="pb-2 text-right font-semibold">Présence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.recurring_clients.map(client => (
                          <tr key={client.name} className="border-b border-[#f0edf3] last:border-0">
                            <td className="max-w-[260px] truncate py-2.5 font-medium text-[#4a4a4a]">{client.name}</td>
                            <td className="py-2.5 text-right font-bold tabular-nums text-[#1a1a1a]">{client.current_count}</td>
                            <td className="py-2.5 text-right tabular-nums text-[#696969]">{client.previous_count}</td>
                            <td className="py-2.5 text-right tabular-nums text-[#696969]">{client.active_quarters} trim.</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="mb-3">
                <h2 className="text-base font-bold text-[#1a1a1a]">Pistes d’analyse suggérées</h2>
                <p className="mt-1 text-xs text-[#696969]">Signaux calculés sur les agrégats Supabase, sans envoyer les sujets ni les noms clients à un modèle externe.</p>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {stats.insights.map(insight => <InsightCard key={insight.id} insight={insight} />)}
              </div>
            </section>

            <footer className="flex flex-col gap-1 border-t border-[#e2e2e2] pt-4 text-xs text-[#878787] sm:flex-row sm:items-center sm:justify-between">
              <p>{stats.meta.source} · {integerFormatter.format(stats.coverage.ticket_count)} tickets synchronisés</p>
              <p>FCR estimé à partir des réouvertures/échanges disponibles.</p>
            </footer>
          </>
        )}
      </div>
    </main>
  )
}
