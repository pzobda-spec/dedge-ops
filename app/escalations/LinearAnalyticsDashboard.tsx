'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle, ExternalLink, RotateCcw, Search } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  LINEAR_PRIORITIES,
  type CountDatum,
  type LinearAnalyticsResponse,
} from '@/lib/linear/analytics'

type Preset = '7d' | '30d' | '90d' | '12m' | 'custom'
type MultiFilterKey = 'label' | 'priority' | 'status'

const DAY_MS = 86_400_000
const BRAND = '#59319f'
const SUCCESS = '#1D9E75'
const CRITICAL = '#ed524e'
const GRID = '#e2e2e2'
const TEXT_MUTED = '#696969'
const PIE_COLORS = ['#59319f', '#248f83', '#3b72d1', '#d58b28', '#8c5bdb', '#447a76', '#6a7fbb', '#b47939', '#9b6ad0', '#497a9f']
const PRIORITY_COLORS: Record<string, string> = {
  Urgent: '#ed524e',
  High: '#e88932',
  Medium: '#3b72d1',
  Low: '#8c5bdb',
  None: '#a1a1a1',
}
const STATUS_COLORS: Record<string, string> = {
  Backlog: '#878787',
  Todo: '#d58b28',
  'In Progress': '#3b72d1',
  Done: '#1D9E75',
  Cancelled: '#b6b6b6',
}

const PRESETS: Array<{ value: Exclude<Preset, 'custom'>; label: string }> = [
  { value: '7d', label: '7 j' },
  { value: '30d', label: '30 j' },
  { value: '90d', label: '90 j' },
  { value: '12m', label: '12 mois' },
]

const TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: `1px solid ${GRID}`,
  borderRadius: 8,
  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
  fontSize: 12,
}

export default function LinearAnalyticsDashboard() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryString = searchParams.toString()
  const defaultDates = useMemo(() => rangeForPreset('30d'), [])
  const requestedPeriod = searchParams.get('period')
  const period: Preset = isPreset(requestedPeriod) ? requestedPeriod : '30d'
  const periodDates = period === 'custom' ? defaultDates : rangeForPreset(period)
  const from = validIsoDay(searchParams.get('from')) ?? periodDates.from
  const to = validIsoDay(searchParams.get('to')) ?? periodDates.to
  const labels = useMemo(() => readMulti(searchParams, 'label'), [searchParams])
  const priorities = useMemo(() => readMulti(searchParams, 'priority'), [searchParams])
  const statuses = useMemo(() => readMulti(searchParams, 'status'), [searchParams])
  const creators = useMemo(() => readMulti(searchParams, 'creator'), [searchParams])
  const urlKeyword = searchParams.get('keyword') ?? ''

  const [data, setData] = useState<LinearAnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [keywordInput, setKeywordInput] = useState(urlKeyword)
  const [creatorInput, setCreatorInput] = useState(creators[0] ?? '')

  const replaceParams = useCallback((mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(queryString)
    mutate(params)
    const nextQuery = params.toString()
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false })
  }, [pathname, queryString, router])

  useEffect(() => {
    const validPeriod = isPreset(searchParams.get('period'))
    const validFrom = validIsoDay(searchParams.get('from'))
    const validTo = validIsoDay(searchParams.get('to'))
    if (validPeriod && validFrom && validTo) return
    replaceParams(params => {
      if (!validPeriod) params.set('period', period)
      if (!validFrom) params.set('from', periodDates.from)
      if (!validTo) params.set('to', periodDates.to)
    })
  }, [period, periodDates.from, periodDates.to, replaceParams, searchParams])

  useEffect(() => setKeywordInput(urlKeyword), [urlKeyword])
  useEffect(() => setCreatorInput(creators[0] ?? ''), [creators])

  useEffect(() => {
    if (keywordInput.trim() === urlKeyword) return
    const timeout = window.setTimeout(() => {
      replaceParams(params => setOrDelete(params, 'keyword', keywordInput.trim()))
    }, 400)
    return () => window.clearTimeout(timeout)
  }, [keywordInput, replaceParams, urlKeyword])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams()
    params.set('from', from)
    params.set('to', to)
    for (const label of labels) params.append('label', label)
    for (const priority of priorities) params.append('priority', priority)
    for (const status of statuses) params.append('status', status)
    for (const creator of creators) params.append('creator', creator)
    if (urlKeyword) params.set('keyword', urlKeyword)

    if (data) setRefreshing(true)
    else setLoading(true)
    setError(null)

    fetch(`/api/analytics/linear?${params.toString()}`, { signal: controller.signal })
      .then(async response => {
        const body = await response.json() as LinearAnalyticsResponse | { error?: string }
        if (!response.ok) {
          throw new Error('error' in body && body.error ? body.error : `Erreur HTTP ${response.status}`)
        }
        return body as LinearAnalyticsResponse
      })
      .then(setData)
      .catch(fetchError => {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return
        setError(fetchError instanceof Error ? fetchError.message : 'Impossible de charger les données Linear.')
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
          setRefreshing(false)
        }
      })

    return () => controller.abort()
    // `data` is intentionally excluded: it only controls the refresh treatment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, labels, priorities, statuses, creators, urlKeyword])

  const setPreset = (preset: Exclude<Preset, 'custom'>) => {
    const range = rangeForPreset(preset)
    replaceParams(params => {
      params.set('period', preset)
      params.set('from', range.from)
      params.set('to', range.to)
    })
  }

  const setCustomDate = (key: 'from' | 'to', value: string) => {
    replaceParams(params => {
      params.set('period', 'custom')
      if (value) params.set(key, value)
    })
  }

  const toggleMulti = (key: MultiFilterKey, value: string) => {
    const current = key === 'label' ? labels : key === 'priority' ? priorities : statuses
    const next = current.includes(value) ? current.filter(item => item !== value) : [...current, value]
    replaceParams(params => {
      params.delete(key)
      for (const item of next) params.append(key, item)
    })
  }

  const setCreator = (value: string) => {
    setCreatorInput(value)
    if (!value || data?.filter_options.creators.includes(value)) {
      replaceParams(params => {
        params.delete('creator')
        if (value) params.append('creator', value)
      })
    }
  }

  const resetFilters = () => {
    const range = rangeForPreset('30d')
    setKeywordInput('')
    setCreatorInput('')
    router.replace(`${pathname}?period=30d&from=${range.from}&to=${range.to}`, { scroll: false })
  }

  const hasActiveFilters = period !== '30d' || labels.length > 0 || priorities.length > 0 ||
    statuses.length > 0 || creators.length > 0 || Boolean(urlKeyword)
  const labelOptions = mergeOptions(data?.filter_options.labels ?? [], labels)
  const statusOptions = mergeOptions(data?.filter_options.statuses ?? [], statuses)
  const creatorOptions = mergeOptions(data?.filter_options.creators ?? [], creators)

  return (
    <main className="min-h-screen" style={{ backgroundColor: 'var(--bg-canvas)', color: 'var(--fg1)' }}>
      <header className="border-b border-[#e2e2e2] bg-white px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="h1">Bugs</h1>
            <p className="body mt-1 text-[#696969]">Tendances, charge et respect du SLA des issues Linear.</p>
          </div>
          <a
            href="https://linear.app/loungeup"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-[#59319f] hover:text-[#3f2175] hover:underline"
          >
            Ouvrir Linear <ExternalLink aria-hidden="true" size={15} />
          </a>
        </div>
      </header>

      <section className="sticky top-0 z-20 border-b border-[#e2e2e2] bg-white/95 px-4 py-4 shadow-[0_2px_4px_rgba(0,0,0,0.05)] backdrop-blur sm:px-6 lg:px-8" aria-label="Filtres du dashboard Bugs">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <FilterLabel>Période</FilterLabel>
              <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#f7f7f7] p-1">
                {PRESETS.map(preset => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setPreset(preset.value)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${period === preset.value ? 'bg-white text-[#59319f] shadow-sm' : 'text-[#696969] hover:text-[#1f1f1f]'}`}
                  >
                    {preset.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => replaceParams(params => params.set('period', 'custom'))}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${period === 'custom' ? 'bg-white text-[#59319f] shadow-sm' : 'text-[#696969] hover:text-[#1f1f1f]'}`}
                >
                  Personnalisé
                </button>
              </div>
            </div>

            {period === 'custom' && (
              <div className="flex flex-wrap items-center gap-2">
                <label className="body-2 text-[#696969]">
                  Du
                  <input type="date" value={from} max={to} onChange={event => setCustomDate('from', event.target.value)} className="ml-1.5 rounded-md border border-[#b6b6b6] bg-white px-2 py-1.5 text-xs text-[#1f1f1f] focus:border-[#3b72d1] focus:outline-none focus:ring-1 focus:ring-[#3b72d1]" />
                </label>
                <label className="body-2 text-[#696969]">
                  au
                  <input type="date" value={to} min={from} onChange={event => setCustomDate('to', event.target.value)} className="ml-1.5 rounded-md border border-[#b6b6b6] bg-white px-2 py-1.5 text-xs text-[#1f1f1f] focus:border-[#3b72d1] focus:outline-none focus:ring-1 focus:ring-[#3b72d1]" />
                </label>
              </div>
            )}

            <div className="min-w-[220px] flex-1 sm:max-w-xs">
              <FilterLabel>Mots-clés</FilterLabel>
              <div className="relative">
                <Search aria-hidden="true" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#878787]" />
                <input
                  value={keywordInput}
                  onChange={event => setKeywordInput(event.target.value)}
                  placeholder="Titre ou description…"
                  className="w-full rounded-md border border-[#b6b6b6] bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-[#a1a1a1] focus:border-[#3b72d1] focus:ring-1 focus:ring-[#3b72d1]"
                />
              </div>
            </div>

            <div className="min-w-[210px] sm:max-w-xs">
              <FilterLabel>Créateur</FilterLabel>
              <input
                list="linear-creators"
                value={creatorInput}
                onChange={event => setCreator(event.target.value)}
                onBlur={() => {
                  if (creatorInput && !creatorOptions.includes(creatorInput)) setCreator(creators[0] ?? '')
                }}
                placeholder="Rechercher un membre…"
                className="w-full rounded-md border border-[#b6b6b6] bg-white px-3 py-2 text-sm outline-none placeholder:text-[#a1a1a1] focus:border-[#3b72d1] focus:ring-1 focus:ring-[#3b72d1]"
              />
              <datalist id="linear-creators">
                {creatorOptions.map(creator => <option key={creator} value={creator} />)}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1.3fr)]">
            <MultiPillFilter label="Type de bug" options={labelOptions} selected={labels} onToggle={value => toggleMulti('label', value)} emptyLabel={loading ? 'Chargement des labels…' : 'Aucun label sur la période'} collapsible />
            <MultiPillFilter label="Priorité" options={[...LINEAR_PRIORITIES]} selected={priorities} onToggle={value => toggleMulti('priority', value)} colors={PRIORITY_COLORS} />
            <MultiPillFilter label="Statut" options={statusOptions} selected={statuses} onToggle={value => toggleMulti('status', value)} colors={STATUS_COLORS} emptyLabel={loading ? 'Chargement des statuts…' : 'Aucun statut sur la période'} collapsible />
          </div>

          <div className="flex min-h-6 flex-wrap items-center justify-between gap-2 border-t border-[#e2e2e2] pt-3">
            <p className="body-2-strong text-[#4a4a4a]" aria-live="polite">
              {error
                ? 'Données indisponibles pour ces filtres'
                : loading && !data
                ? 'Calcul des indicateurs…'
                : data
                  ? `${formatNumber(data.total)} issue${data.total === 1 ? '' : 's'} correspondent`
                  : 'Données indisponibles'}
              {refreshing && <span className="ml-2 font-normal text-[#878787]">Actualisation…</span>}
            </p>
            {hasActiveFilters && (
              <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#59319f] hover:text-[#3f2175] hover:underline">
                <RotateCcw aria-hidden="true" size={13} /> Réinitialiser les filtres
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-lg border border-[#ed524e] bg-[#fee3e2] p-4 text-sm text-[#b7221b]">
            <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
            <div>
              <p className="font-semibold">Données Linear indisponibles</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {!error && data?.truncated && (
          <div className="rounded-lg border border-[#f0c756] bg-[#fbf1ca] px-4 py-3 text-xs text-[#84550e]">
            Le volume Linear dépasse 5 000 issues. Les indicateurs portent sur les 5 000 issues les plus récemment mises à jour.
          </div>
        )}

        {!error && <KpiGrid data={data} loading={loading && !data} />}

        {!error && <div className={`grid grid-cols-1 gap-6 xl:grid-cols-2 ${refreshing ? 'opacity-70 transition-opacity' : ''}`} aria-busy={refreshing}>
          <ChartCard title="Volume dans le temps" description="Issues créées et résolues sur la période" className="xl:col-span-2">
            <VolumeChart data={data?.by_date ?? []} />
          </ChartCard>

          <ChartCard title="Répartition par type de bug" description="Labels Linear les plus fréquents">
            <DonutChart data={data?.by_label ?? []} colors={PIE_COLORS} />
          </ChartCard>

          <ChartCard title="Répartition par priorité" description="Priorité actuelle des issues créées">
            <DonutChart data={data?.by_priority ?? []} colorMap={PRIORITY_COLORS} />
          </ChartCard>

          <ChartCard title="Répartition par statut" description="État actuel du workflow Linear">
            <HorizontalBarChart data={data?.by_status ?? []} colorMap={STATUS_COLORS} colors={PIE_COLORS} yAxisWidth={135} />
          </ChartCard>

          <ChartCard title="Issues par créateur" description="Top 10 des personnes qui remontent des bugs">
            <HorizontalBarChart data={data?.by_creator ?? []} colors={PIE_COLORS} yAxisWidth={135} />
          </ChartCard>

          <ChartCard title="Mots-clés fréquents" description="Top 15 extrait des titres, hors mots courants">
            <HorizontalBarChart data={data?.keyword_frequency ?? []} colors={[BRAND]} yAxisWidth={120} />
          </ChartCard>

          <ChartCard title="Distribution du temps de résolution" description="Objectif SLA : résolution en moins de 7 jours">
            <ResolutionHistogram data={data?.resolution_time_distribution ?? []} />
          </ChartCard>
        </div>}
      </div>
    </main>
  )
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return <span className="body-2-strong mb-1.5 block text-[#4a4a4a]">{children}</span>
}

function MultiPillFilter({
  label,
  options,
  selected,
  onToggle,
  colors,
  emptyLabel = 'Aucune valeur',
  collapsible = false,
}: {
  label: string
  options: string[]
  selected: string[]
  onToggle: (value: string) => void
  colors?: Record<string, string>
  emptyLabel?: string
  collapsible?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const orderedOptions = [...selected, ...options.filter(option => !selected.includes(option))]
  const visibleOptions = collapsible && !expanded ? orderedOptions.slice(0, 8) : orderedOptions
  return (
    <fieldset className="min-w-0">
      <legend className="body-2-strong mb-1.5 text-[#4a4a4a]">{label}</legend>
      <div className="flex min-h-8 flex-wrap items-center gap-1.5">
        {visibleOptions.length === 0 && <span className="body-2 text-[#878787]">{emptyLabel}</span>}
        {visibleOptions.map(option => {
          const active = selected.includes(option)
          const color = colors?.[option] ?? BRAND
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(option)}
              className="rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors"
              style={active
                ? { borderColor: color, backgroundColor: `${color}18`, color }
                : { borderColor: '#e2e2e2', backgroundColor: '#fff', color: '#696969' }}
            >
              {option}
            </button>
          )
        })}
        {collapsible && orderedOptions.length > 8 && (
          <button type="button" onClick={() => setExpanded(value => !value)} className="px-1.5 py-1 text-xs font-semibold text-[#59319f] hover:underline">
            {expanded ? 'Réduire' : `+ ${orderedOptions.length - 8}`}
          </button>
        )}
      </div>
    </fieldset>
  )
}

function KpiGrid({ data, loading }: { data: LinearAnalyticsResponse | null; loading: boolean }) {
  const kpis = [
    { label: 'Issues ouvertes', value: data ? formatNumber(data.open) : '—', detail: 'hors Done et Cancelled' },
    { label: 'Créées sur la période', value: data ? formatNumber(data.created) : '—', detail: 'nouveaux bugs' },
    { label: 'Résolues sur la période', value: data ? formatNumber(data.resolved) : '—', detail: 'passées à Done' },
    { label: 'Temps moyen de résolution', value: data?.avg_resolution_days == null ? '—' : `${formatDecimal(data.avg_resolution_days)} j`, detail: 'création → résolution' },
    { label: 'SLA résolues en < 7 j', value: data?.sla_rate == null ? '—' : `${formatDecimal(data.sla_rate)} %`, detail: 'parmi les issues résolues' },
  ]

  return (
    <section aria-label="Indicateurs Linear" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {kpis.map(kpi => (
        <div key={kpi.label} className="min-h-[118px] rounded-lg border border-[#e2e2e2] bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.08)]">
          <p className="body-2 text-[#696969]">{kpi.label}</p>
          {loading ? (
            <div className="mt-3 h-7 w-20 animate-pulse rounded bg-[#e2e2e2]" />
          ) : (
            <p className="hl-1 mt-2 text-[#1f1f1f]">{kpi.value}</p>
          )}
          <p className="body-3 mt-2 text-[#878787]">{kpi.detail}</p>
        </div>
      ))}
    </section>
  )
}

function ChartCard({
  title,
  description,
  className = '',
  children,
}: {
  title: string
  description: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={`min-w-0 rounded-lg border border-[#e2e2e2] bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.06)] sm:p-5 ${className}`}>
      <div className="mb-4">
        <h2 className="h4 text-[#1f1f1f]">{title}</h2>
        <p className="body-2 mt-1 text-[#696969]">{description}</p>
      </div>
      {children}
    </section>
  )
}

function VolumeChart({ data }: { data: LinearAnalyticsResponse['by_date'] }) {
  if (data.length === 0) return <EmptyChart />
  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: TEXT_MUTED, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
          <YAxis allowDecimals={false} tick={{ fill: TEXT_MUTED, fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: '#1f1f1f', fontWeight: 600 }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
          <Line type="monotone" dataKey="created" name="Créées" stroke={BRAND} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="resolved" name="Résolues" stroke={SUCCESS} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function DonutChart({
  data,
  colors,
  colorMap,
}: {
  data: CountDatum[]
  colors?: string[]
  colorMap?: Record<string, string>
}) {
  const nonEmpty = data.filter(item => item.count > 0)
  const total = nonEmpty.reduce((sum, item) => sum + item.count, 0)
  if (nonEmpty.length === 0) return <EmptyChart />
  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={nonEmpty}
            dataKey="count"
            nameKey="name"
            cx="38%"
            cy="50%"
            innerRadius="46%"
            outerRadius="72%"
            paddingAngle={2}
            stroke="#fff"
            strokeWidth={2}
          >
            {nonEmpty.map((item, index) => (
              <Cell key={item.name} fill={colorMap?.[item.name] ?? colors?.[index % colors.length] ?? PIE_COLORS[index % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<DonutTooltip total={total} />} />
          <Legend layout="vertical" verticalAlign="middle" align="right" iconType="circle" wrapperStyle={{ fontSize: 11, lineHeight: '20px', maxWidth: '46%' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

function HorizontalBarChart({
  data,
  colors,
  colorMap,
  yAxisWidth = 105,
}: {
  data: CountDatum[]
  colors?: string[]
  colorMap?: Record<string, string>
  yAxisWidth?: number
}) {
  const nonEmpty = data.filter(item => item.count > 0)
  if (nonEmpty.length === 0) return <EmptyChart />
  const height = Math.max(300, nonEmpty.length * 34 + 40)
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={nonEmpty} layout="vertical" margin={{ top: 4, right: 18, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fill: TEXT_MUTED, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis type="category" dataKey="name" width={yAxisWidth} tick={{ fill: '#4a4a4a', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: '#f7f7f7' }} contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="count" name="Issues" radius={[0, 5, 5, 0]} maxBarSize={20}>
            {nonEmpty.map((item, index) => (
              <Cell key={item.name} fill={colorMap?.[item.name] ?? colors?.[index % colors.length] ?? BRAND} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function ResolutionHistogram({ data }: { data: LinearAnalyticsResponse['resolution_time_distribution'] }) {
  if (data.every(item => item.count === 0)) return <EmptyChart message="Aucune issue résolue sur cette période" />
  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: TEXT_MUTED, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis allowDecimals={false} tick={{ fill: TEXT_MUTED, fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: '#f7f7f7' }} contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="count" name="Issues résolues" radius={[5, 5, 0, 0]} maxBarSize={42}>
            {data.map(item => <Cell key={item.name} fill={item.breached ? CRITICAL : SUCCESS} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="-mt-1 flex items-center justify-center gap-5 text-[11px] text-[#696969]">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#1D9E75]" /> Dans le SLA</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#ed524e]" /> Hors SLA (≥ 7 j)</span>
      </div>
    </div>
  )
}

function DonutTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; payload?: CountDatum }>
  total: number
}) {
  if (!active || !payload?.[0]) return null
  const item = payload[0].payload
  const count = Number(payload[0].value ?? item?.count ?? 0)
  const name = item?.name ?? payload[0].name ?? ''
  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2">
      <p className="font-semibold text-[#1f1f1f]">{name}</p>
      <p className="mt-1 text-[#696969]">{formatNumber(count)} issue{count === 1 ? '' : 's'} · {total > 0 ? formatDecimal((count / total) * 100) : 0} %</p>
    </div>
  )
}

function EmptyChart({ message = 'Aucune donnée pour ces filtres' }: { message?: string }) {
  return (
    <div className="flex h-[300px] items-center justify-center rounded-md border border-dashed border-[#e2e2e2] bg-[#f7f7f7]/50 px-4 text-center text-sm text-[#878787]">
      {message}
    </div>
  )
}

function rangeForPreset(preset: Exclude<Preset, 'custom'>): { from: string; to: string } {
  const today = startOfLocalDay(new Date())
  const from = new Date(today)
  if (preset === '12m') {
    from.setFullYear(from.getFullYear() - 1)
    from.setDate(from.getDate() + 1)
  } else {
    const days = preset === '7d' ? 7 : preset === '90d' ? 90 : 30
    from.setTime(from.getTime() - (days - 1) * DAY_MS)
  }
  return { from: toLocalIsoDay(from), to: toLocalIsoDay(today) }
}

function isPreset(value: string | null): value is Preset {
  return value === '7d' || value === '30d' || value === '90d' || value === '12m' || value === 'custom'
}

function validIsoDay(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function toLocalIsoDay(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function readMulti(searchParams: Pick<URLSearchParams, 'getAll'>, key: string): string[] {
  return [...new Set(searchParams.getAll(key).flatMap(value => value.split(',')).map(value => value.trim()).filter(Boolean))]
}

function mergeOptions(options: string[], selected: string[]): string[] {
  return [...new Set([...selected, ...options])]
}

function setOrDelete(params: URLSearchParams, key: string, value: string) {
  if (value) params.set(key, value)
  else params.delete(key)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value)
}

function formatDecimal(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value)
}
