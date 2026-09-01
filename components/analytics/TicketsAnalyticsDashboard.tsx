'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
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
import type {
  AnalyticsBreakdown,
  TicketAggregateRow,
  TicketAnalyticsResponse,
} from '@/lib/zoho/ticketAnalyticsTypes'
import type { SupportCockpitResponse } from '@/lib/support/cockpitTypes'
import { ZOHO_DESK_AGENT_TICKET_BASE_URL } from '@/lib/zoho/constants'

const PRIMARY = '#59319f'
const SUCCESS = '#1D9E75'
const PRODUCT_COLORS = [
  '#59319f', '#3b72d1', '#db8b2c', '#8064b3', '#348494', '#c0699c',
  '#66758e', '#a78132', '#6c4a9b', '#477fa8', '#9c6c43', '#775ea7',
]
const STATUS_COLORS: Record<string, string> = {
  Open: '#db8b2c',
  Pending: '#3b72d1',
  Resolved: '#1D9E75',
  Closed: '#8a8a8a',
}
const CATEGORY_COLORS = ['#59319f', '#d27738', '#3b72d1', '#8b62aa', '#7b8494']
const DEFAULT_CATEGORIES = ['Question', 'Problem', 'Task', 'Feature Request']
const DEFAULT_STATUSES = ['Open', 'Pending', 'Resolved', 'Closed']
const DEFAULT_PRIORITIES = ['Urgent', 'High', 'Medium', 'Low']

type QueryUpdate = string | string[] | null
type SortKey = keyof Pick<TicketAggregateRow, 'client' | 'product' | 'category' | 'volume' | 'avg_first_response_hours' | 'open' | 'resolved'>
type BreakdownView = 'donut' | 'columns'

export default function TicketsAnalyticsDashboard() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isRouting, startTransition] = useTransition()
  const defaultRange = useMemo(() => presetRange('30d'), [])

  const requestedRange = readPreset(searchParams.get('range'))
  const presetFallback = requestedRange ? presetRange(requestedRange) : defaultRange
  const explicitFrom = validDate(searchParams.get('from'))
  const explicitTo = validDate(searchParams.get('to'))
  const from = explicitFrom ?? presetFallback.from
  const to = explicitTo ?? presetFallback.to
  const range = requestedRange
    ?? (searchParams.get('range') === 'custom' || explicitFrom || explicitTo ? 'custom' : '30d')
  const products = readMany(searchParams, 'product')
  const categories = readMany(searchParams, 'category')
  const classifications = readMany(searchParams, 'classification')
  const statuses = readMany(searchParams, 'status')
  const priorities = readMany(searchParams, 'priority')
  const client = searchParams.get('client')?.trim() ?? ''

  const [data, setData] = useState<TicketAnalyticsResponse | null>(null)
  const [cockpit, setCockpit] = useState<SupportCockpitResponse | null>(null)
  const [cockpitRefreshKey, setCockpitRefreshKey] = useState(0)
  const seenNotificationTickets = useRef<Set<string> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openFilter, setOpenFilter] = useState<string | null>(null)
  const [viewMessage, setViewMessage] = useState('')

  const apiQuery = useMemo(() => {
    const params = new URLSearchParams({ from, to })
    for (const value of products) params.append('product', value)
    for (const value of categories) params.append('category', value)
    for (const value of classifications) params.append('classification', value)
    for (const value of statuses) params.append('status', value)
    for (const value of priorities) params.append('priority', value)
    if (client) params.set('client', client)
    return params.toString()
  }, [categories, classifications, client, from, priorities, products, statuses, to])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch(`/api/analytics/tickets?${apiQuery}`, { signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error || `Erreur HTTP ${response.status}`)
        return payload as TicketAnalyticsResponse
      })
      .then(setData)
      .catch(fetchError => {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return
        setData(null)
        setError(fetchError instanceof Error ? fetchError.message : 'Impossible de charger les analytiques Zoho.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [apiQuery])

  useEffect(() => {
    let stopped = false
    const loadCockpit = async () => {
      try {
        const response = await fetch(`/api/support/cockpit?from=${from}&to=${to}`, { cache: 'no-store' })
        if (!response.ok) return
        const payload = await response.json() as SupportCockpitResponse
        if (stopped) return
        setCockpit(payload)
        const candidates = payload.tickets.filter(ticket => ticket.state === 'probable' || isHighZohoPriority(ticket.zoho_priority))
        const currentIds = new Set(candidates.map(ticket => ticket.ticket_id))
        const previousIds = seenNotificationTickets.current
        seenNotificationTickets.current = currentIds
        if (!previousIds || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
        candidates.filter(ticket => !previousIds.has(ticket.ticket_id)).forEach(ticket => {
          const label = ticket.state === 'probable' ? 'urgence douteuse' : 'niveau High'
          new Notification(`Nouveau ticket — ${label}`, {
            body: `#${ticket.zoho_ticket_number ?? ticket.ticket_id} · ${ticket.subject ?? 'Sans objet'}`,
            tag: `support-urgency-${ticket.ticket_id}`,
          })
        })
      } catch {
        if (!stopped) setCockpit(null)
      }
    }
    void loadCockpit()
    const interval = window.setInterval(loadCockpit, 60_000)
    return () => { stopped = true; window.clearInterval(interval) }
  }, [cockpitRefreshKey, from, to])

  useEffect(() => {
    if (searchParams.toString()) return
    fetch('/api/settings/me/ticket-filters', { cache: 'no-store' })
      .then(async response => response.ok ? response.json() : null)
      .then(payload => {
        const saved = payload?.filters as Record<string, string | string[]> | undefined
        if (!saved || Object.keys(saved).length === 0) return
        const next = new URLSearchParams()
        for (const [key, value] of Object.entries(saved)) {
          if (Array.isArray(value)) value.forEach(item => next.append(key, item))
          else if (value) next.set(key, value)
        }
        startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }))
      })
      .catch(() => undefined)
  }, [pathname, router, searchParams, startTransition])

  function updateQuery(updates: Record<string, QueryUpdate>) {
    const next = new URLSearchParams(searchParams.toString())
    next.set('from', from)
    next.set('to', to)
    next.set('range', range)
    for (const [key, value] of Object.entries(updates)) {
      next.delete(key)
      if (Array.isArray(value)) value.forEach(item => next.append(key, item))
      else if (value) next.set(key, value)
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }))
  }

  function applyPreset(value: '7d' | '30d' | '90d' | '12m') {
    const dates = presetRange(value)
    updateQuery({ range: value, from: dates.from, to: dates.to })
  }

  function toggle(key: string, selected: string[], value: string) {
    updateQuery({
      [key]: selected.includes(value)
        ? selected.filter(item => item !== value)
        : [...selected, value],
    })
  }

  function setFilterOpen(key: string, open: boolean) {
    setOpenFilter(current => open ? key : current === key ? null : current)
  }

  function resetFilters() {
    const dates = presetRange('30d')
    startTransition(() => router.replace(
      `${pathname}?range=30d&from=${dates.from}&to=${dates.to}`,
      { scroll: false },
    ))
  }

  async function savePersonalView() {
    setViewMessage('')
    const filters: Record<string, string | string[]> = { range, from, to }
    if (products.length) filters.product = products
    if (categories.length) filters.category = categories
    if (classifications.length) filters.classification = classifications
    if (statuses.length) filters.status = statuses
    if (priorities.length) filters.priority = priorities
    if (client) filters.client = client
    const response = await fetch('/api/settings/me/ticket-filters', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filters }) })
    setViewMessage(response.ok ? 'Vue personnelle enregistrée.' : 'Impossible d’enregistrer votre vue.')
  }

  const hasActiveFilters = range !== '30d'
    || from !== defaultRange.from
    || to !== defaultRange.to
    || products.length > 0
    || categories.length > 0
    || classifications.length > 0
    || statuses.length > 0
    || priorities.length > 0
    || Boolean(client)
  const hasFacetFilters = products.length > 0
    || categories.length > 0
    || classifications.length > 0
    || statuses.length > 0
    || priorities.length > 0
    || Boolean(client)

  const productOptions = data?.filter_options.products ?? []
  const classificationOptions = data?.filter_options.classifications ?? []
  const clientOptions = data?.filter_options.clients ?? []
  const categoryOptions = mergeOptions(DEFAULT_CATEGORIES, data?.filter_options.categories)
  const statusOptions = mergeOptions(DEFAULT_STATUSES, data?.filter_options.statuses)
  const priorityOptions = mergeOptions(DEFAULT_PRIORITIES, data?.filter_options.priorities)
  const productEvolution = useMemo(() => {
    const rankedProducts = data?.by_product.map(item => item.name) ?? []
    const topProducts = rankedProducts.slice(0, 8)
    const remainingProducts = rankedProducts.slice(8)
    const otherLabel = 'Autres produits'
    const series = data?.by_product_date.map(point => {
      const row: Record<string, string | number> = { period: point.period, label: point.label }
      for (const product of topProducts) row[product] = point.values[product] ?? 0
      if (remainingProducts.length > 0) {
        row[otherLabel] = remainingProducts.reduce((sum, product) => sum + (point.values[product] ?? 0), 0)
      }
      return row
    }) ?? []
    return {
      series,
      products: remainingProducts.length > 0 ? [...topProducts, otherLabel] : topProducts,
    }
  }, [data])

  return (
    <main className="min-h-full bg-[#f7f7f7] pb-10 text-[#1a1a1a]">
      <header className="border-b border-[#e2e2e2] bg-white px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1600px] items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#8064b3]">Support</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Tickets</h1>
            <p className="mt-1 text-sm text-[#696969]">Tendances et performance de l’activité support Zoho Desk.</p>
          </div>
          <a
            href="https://support.loungeup.com"
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-lg px-2 py-2 text-sm font-semibold text-[#59319f] transition-colors hover:bg-[#f2ecfb] focus:outline-none focus:ring-2 focus:ring-[#8064b3]"
          >
            Ouvrir Zoho Desk ↗
          </a>
        </div>
      </header>

      <section className="sticky top-0 z-20 border-b border-[#ded8e8] bg-white/95 shadow-[0_5px_16px_rgba(36,25,55,0.06)] backdrop-blur">
        <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-[#696969]">Période</span>
            {(['7d', '30d', '90d', '12m'] as const).map(value => (
              <button
                key={value}
                type="button"
                onClick={() => applyPreset(value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${range === value ? 'border-[#59319f] bg-[#59319f] text-white' : 'border-[#d8d8d8] bg-white text-[#4a4a4a] hover:border-[#8064b3] hover:text-[#59319f]'}`}
              >
                {value === '12m' ? '12 mois' : value.replace('d', 'j')}
              </button>
            ))}
            <div className={`ml-1 flex max-w-full flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1 ${range === 'custom' ? 'border-[#8064b3] bg-[#f7f3fc]' : 'border-[#d8d8d8] bg-white'}`}>
              <span className="text-xs text-[#696969]">Du</span>
              <input
                aria-label="Date de début"
                type="date"
                value={from}
                max={to}
                onChange={event => updateQuery({ range: 'custom', from: event.target.value })}
                className="w-[104px] bg-transparent text-xs text-[#1a1a1a] outline-none sm:w-[116px]"
              />
              <span className="text-xs text-[#696969]">au</span>
              <input
                aria-label="Date de fin"
                type="date"
                value={to}
                min={from}
                onChange={event => updateQuery({ range: 'custom', to: event.target.value })}
                className="w-[104px] bg-transparent text-xs text-[#1a1a1a] outline-none sm:w-[116px]"
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-start gap-2">
            <FilterMenu label="Catégorie" options={categoryOptions} selected={categories} open={openFilter === 'category'} onOpenChange={open => setFilterOpen('category', open)} onToggle={value => toggle('category', categories, value)} />
            <FilterMenu label="Classification" options={classificationOptions} selected={classifications} open={openFilter === 'classification'} onOpenChange={open => setFilterOpen('classification', open)} onToggle={value => toggle('classification', classifications, value)} />
            <FilterMenu label="Produit" options={productOptions} selected={products} open={openFilter === 'product'} onOpenChange={open => setFilterOpen('product', open)} onToggle={value => toggle('product', products, value)} />
            <SearchSelect label="Client" options={clientOptions} selected={client} open={openFilter === 'client'} onOpenChange={open => setFilterOpen('client', open)} onSelect={value => updateQuery({ client: value || null })} />
            <FilterMenu label="Statut" options={statusOptions} selected={statuses} open={openFilter === 'status'} onOpenChange={open => setFilterOpen('status', open)} onToggle={value => toggle('status', statuses, value)} />
            <FilterMenu label="Priorité" options={priorityOptions} selected={priorities} open={openFilter === 'priority'} onOpenChange={open => setFilterOpen('priority', open)} onToggle={value => toggle('priority', priorities, value)} />
          </div>

          <div className="mt-3 flex min-h-7 flex-wrap items-center justify-between gap-2 border-t border-[#efebf3] pt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-sm font-semibold text-[#1a1a1a]">
                {error
                  ? 'Données indisponibles pour ces filtres'
                  : loading
                    ? 'Calcul en cours…'
                    : `${formatNumber(data?.total ?? 0)} tickets correspondent`}
              </span>
              <SelectedPills
                values={[
                  ...categories.map(value => ({ key: 'category', value, selected: categories })),
                  ...classifications.map(value => ({ key: 'classification', value, selected: classifications })),
                  ...products.map(value => ({ key: 'product', value, selected: products })),
                  ...statuses.map(value => ({ key: 'status', value, selected: statuses })),
                  ...priorities.map(value => ({ key: 'priority', value, selected: priorities })),
                ]}
                onRemove={(key, value, selected) => toggle(key, selected, value)}
              />
              {client && (
                <button type="button" onClick={() => updateQuery({ client: null })} className="rounded-full bg-[#eee7f8] px-2.5 py-1 text-xs font-medium text-[#59319f] hover:bg-[#e1d5f2]">
                  Client · {client} ×
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              {viewMessage && <span className="text-xs text-[#696969]">{viewMessage}</span>}
              <button type="button" onClick={() => void savePersonalView()} className="text-xs font-semibold text-[#59319f] hover:underline">Enregistrer ma vue</button>
              {hasActiveFilters && <button type="button" onClick={resetFilters} className="text-xs font-semibold text-[#59319f] hover:underline">Réinitialiser les filtres</button>}
            </div>
          </div>
        </div>
      </section>

      <div className="relative mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        {(loading || isRouting) && data && (
          <div className="pointer-events-none absolute inset-x-4 top-0 z-10 h-0.5 overflow-hidden rounded-full bg-[#ded3ef] sm:inset-x-6 lg:inset-x-8">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-[#59319f]" />
          </div>
        )}

        {error && (
          <div role="alert" className="mb-6 rounded-xl border border-[#efc5c2] bg-[#fff8f8] p-4 text-sm text-[#8f2822]">
            <p className="font-semibold">Les données Zoho ne sont pas disponibles.</p>
            <p className="mt-1 text-xs text-[#a14a45]">{error}</p>
          </div>
        )}

        {!data && loading ? <DashboardSkeleton /> : data && (
          <>
            <section aria-label="Indicateurs clés" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <KpiCard label="Tickets ouverts" value={formatNumber(data.open)} subtitle="Open + Pending" />
              <KpiCard
                label={hasFacetFilters ? 'Volume filtré' : 'Volume période'}
                value={formatNumber(data.total)}
                subtitle={hasFacetFilters
                  ? `${formatNumber(data.total)} sur ${formatNumber(data.meta.unfiltered_total)} tickets · ${formatDate(from)} – ${formatDate(to)}`
                  : `${formatDate(from)} – ${formatDate(to)}`}
              />
              <KpiCard
                label="Réponses dans le délai"
                value={cockpit?.first_response_within_target_pct == null ? '—' : `${formatNumber(cockpit.first_response_within_target_pct, 1)} %`}
                subtitle="SLA interne · heures ouvrées Zoho"
              />
              <KpiCard
                label={`Résolution au 1er contact${data.meta.fcr_is_estimate ? ' (estim.)' : ''}`}
                value={`${formatNumber(data.fcr_rate, 1)} %`}
                subtitle={data.meta.fcr_is_estimate ? 'Estimation · historique de réouverture indisponible' : 'FCR sur les résolutions'}
              />
              <KpiCard
                label="Évolution vs période précédente"
                value={formatDelta(data.volume_change_pct)}
                subtitle={`${formatNumber(data.previous_total)} tickets auparavant`}
                delta={data.volume_change_pct}
              />
            </section>

            <ShadowUrgencyPanel cockpit={cockpit} onRefresh={() => setCockpitRefreshKey(value => value + 1)} />

            {data.meta.source_truncated && (
              <p className="mt-3 rounded-lg bg-[#fff8e8] px-3 py-2 text-xs text-[#84550e]">
                La fenêtre Zoho dépasse 10 000 tickets : les indicateurs affichés sont partiels.
              </p>
            )}

            <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCard title="Volume de tickets dans le temps" subtitle="Tickets créés et résolus">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.by_date} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="#ece8f0" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#696969' }} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#696969' }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={{ fontWeight: 600, color: '#1a1a1a' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" name="Créés" dataKey="created" stroke={PRIMARY} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                    <Line type="monotone" name="Résolus" dataKey="resolved" stroke={SUCCESS} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <BreakdownChart title="Répartition par produit" data={data.by_product} colors={PRODUCT_COLORS} />
              <BreakdownChart title="Répartition par catégorie" data={data.by_category} colors={CATEGORY_COLORS} />

              <ChartCard title="Répartition par statut" subtitle="État actuel des tickets de la période">
                {data.by_status.length === 0 ? <EmptyChart /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.by_status} layout="vertical" margin={{ top: 4, right: 26, left: 14, bottom: 0 }}>
                      <CartesianGrid stroke="#ece8f0" strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#696969' }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" width={78} tick={{ fontSize: 11, fill: '#4a4a4a' }} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: '#f7f3fc' }} contentStyle={tooltipStyle} />
                      <Bar dataKey="count" name="Tickets" radius={[0, 5, 5, 0]}>
                        {data.by_status.map(item => <Cell key={item.name} fill={STATUS_COLORS[item.name] ?? '#8a8a8a'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Évolution par produit" subtitle="Volume empilé par période" wide>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={productEvolution.series} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="#ece8f0" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#696969' }} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#696969' }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    {productEvolution.products.map((product, index) => (
                      <Area key={product} type="monotone" dataKey={product} name={product} stackId="products" stroke={PRODUCT_COLORS[index % PRODUCT_COLORS.length]} fill={PRODUCT_COLORS[index % PRODUCT_COLORS.length]} fillOpacity={0.82} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              {!client && (
                <ChartCard title="Top 10 clients par volume" subtitle="Cliquez sur une barre pour filtrer" wide>
                  {data.top_clients.length === 0 ? <EmptyChart /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.top_clients} layout="vertical" margin={{ top: 4, right: 28, left: 48, bottom: 0 }}>
                        <CartesianGrid stroke="#ece8f0" strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#696969' }} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="name" width={145} tick={{ fontSize: 10, fill: '#4a4a4a' }} tickLine={false} axisLine={false} />
                        <Tooltip cursor={{ fill: '#f7f3fc' }} contentStyle={tooltipStyle} />
                        <Bar
                          dataKey="count"
                          name="Tickets"
                          fill={PRIMARY}
                          radius={[0, 5, 5, 0]}
                          className="cursor-pointer"
                          onClick={(entry: unknown) => {
                            const selected = (entry as { payload?: AnalyticsBreakdown })?.payload?.name
                            if (selected) updateQuery({ client: selected })
                          }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              )}
            </section>

            <AggregateTable rows={data.aggregates} truncated={data.meta.aggregates_truncated} />
          </>
        )}
      </div>
    </main>
  )
}

function ShadowUrgencyPanel({ cockpit, onRefresh }: { cockpit: SupportCockpitResponse | null; onRefresh: () => void }) {
  const [notifications, setNotifications] = useState<NotificationPermission | 'unsupported'>('default')
  const stateLabels = {
    probable: 'Urgence probable',
    confirmed: 'Urgence confirmée',
    non_urgent: 'Non urgente',
    to_qualify: 'À qualifier',
  } as const
  const levelLabels = { urgent: 'Urgence', high: 'High', medium: 'Medium', low: 'Low' } as const

  useEffect(() => {
    setNotifications(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  }, [])

  async function enableNotifications() {
    if (typeof Notification === 'undefined') return
    setNotifications(await Notification.requestPermission())
  }

  return (
    <section className="mt-4 rounded-xl border border-[#ded8e8] bg-white p-4 shadow-[0_4px_10px_rgba(36,25,55,0.05)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-[#1a1a1a]">Préqualification urgence</h2>
            <span className="rounded-full bg-[#eee7f8] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#59319f]">Shadow mode</span>
          </div>
            <p className="mt-1 text-xs text-[#696969]">Lecture et mesure uniquement — aucune écriture Zoho, Linear ou Slack.</p>
        </div>
        <div className="flex items-center gap-3">
          {notifications === 'default' && <button type="button" onClick={enableNotifications} className="rounded-md border border-[#cfc2e5] px-2.5 py-1.5 text-[11px] font-semibold text-[#59319f] hover:bg-[#f7f2fc]">Activer les notifications</button>}
          {notifications === 'granted' && <span className="text-[11px] font-semibold text-[#1D9E75]">Notifications activées</span>}
          <p className="text-[11px] text-[#696969]">Urgence 6h · High 24h · Medium 24h · Low 48h · heures ouvrées</p>
        </div>
      </div>

      {!cockpit ? (
        <div className="mt-5 h-36 animate-pulse rounded-lg bg-[#f3f1f5]" />
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-5">
            {cockpit.by_state.map(item => (
              <div key={item.state} className={`rounded-lg border p-3 ${item.state === 'confirmed' ? 'border-[#efc5c2] bg-[#fff8f8]' : item.state === 'probable' ? 'border-[#f4d6a8] bg-[#fffaf1]' : 'border-[#e2e2e2] bg-[#fafafa]'}`}>
                <p className="text-[11px] font-medium text-[#696969]">{stateLabels[item.state]}</p>
                <p className={`mt-1 text-xl font-bold tabular-nums ${item.state === 'confirmed' ? 'text-[#b7221b]' : item.state === 'probable' ? 'text-[#9a5b08]' : 'text-[#1a1a1a]'}`}>{item.count}</p>
              </div>
            ))}
            <div className="rounded-lg border border-[#e2e2e2] bg-[#fafafa] p-3">
              <p className="text-[11px] font-medium text-[#696969]">Faux positifs validés</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-[#1a1a1a]">
                {cockpit.false_positives.false_positive_rate_pct == null ? '—' : `${cockpit.false_positives.false_positive_rate_pct} %`}
              </p>
              <p className="mt-0.5 text-[10px] text-[#8a8a8a]">{cockpit.false_positives.validated_probable_total} cas jugés</p>
            </div>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#696969]">Respect du délai par niveau</h3>
              <div className="mt-3 space-y-3">
                {cockpit.by_level.map(bucket => {
                  const total = bucket.within_target + bucket.outside_target + bucket.no_data
                  return (
                    <div key={bucket.level} className="grid grid-cols-[80px_minmax(0,1fr)_38px] items-center gap-2 text-xs">
                      <span className={bucket.level === 'urgent' ? 'font-bold text-[#b7221b]' : 'font-semibold text-[#4a4a4a]'}>{levelLabels[bucket.level]} · {bucket.target_business_hours}h</span>
                      <div className="flex h-3 overflow-hidden rounded-full bg-[#eeeeee]" aria-label={`${levelLabels[bucket.level]} : ${bucket.within_target} dans le délai, ${bucket.outside_target} hors délai, ${bucket.no_data} sans donnée`}>
                        {total > 0 && <>
                          <span className="bg-[#1D9E75]" style={{ width: `${(bucket.within_target / total) * 100}%` }} />
                          <span className="bg-[#b7221b]" style={{ width: `${(bucket.outside_target / total) * 100}%` }} />
                          <span className="bg-[#c9c9c9]" style={{ width: `${(bucket.no_data / total) * 100}%` }} />
                        </>}
                      </div>
                      <span className="text-right tabular-nums text-[#696969]">{total}</span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-[#696969]">
                <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#1D9E75]" />Dans le délai</span>
                <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#b7221b]" />Hors délai</span>
                <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#c9c9c9]" />Sans donnée</span>
              </div>
            </div>

            <div className="min-w-0">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#696969]">Séparation des priorités</h3>
              <div className="mt-3 overflow-x-auto rounded-lg border border-[#ececec]">
                <table className="w-full min-w-[960px] text-left text-[11px]">
                  <thead className="bg-[#f7f7f7] text-[#696969]"><tr><th className="px-3 py-2">Ticket</th><th className="px-3 py-2">Urgence préqualifiée</th><th className="px-3 py-2">Niveau Zoho</th><th className="px-3 py-2">Priorité Linear</th><th className="px-3 py-2">Validation humaine</th></tr></thead>
                  <tbody className="divide-y divide-[#eeeeee]">
                    {cockpit.tickets.slice(0, 8).map(ticket => (
                      <tr key={ticket.ticket_id}>
                        <td className="max-w-[230px] truncate px-3 py-2.5 font-medium text-[#1a1a1a]">
                          <a
                            href={`${ZOHO_DESK_AGENT_TICKET_BASE_URL}/details/${encodeURIComponent(ticket.ticket_id)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#59319f] underline decoration-[#cfc2e5] underline-offset-2 hover:text-[#3f2178]"
                            title="Ouvrir dans Zoho Desk"
                          >
                            #{ticket.zoho_ticket_number ?? ticket.ticket_id} · {ticket.subject ?? 'Sans objet'}
                          </a>
                        </td>
                        <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-1 font-semibold ${ticket.state === 'confirmed' ? 'bg-[#fee3e2] text-[#b7221b]' : ticket.state === 'probable' ? 'bg-[#fff0d6] text-[#8a560a]' : 'bg-[#eeeeee] text-[#4a4a4a]'}`}>{stateLabels[ticket.state]}</span></td>
                        <td className="px-3 py-2.5 text-[#4a4a4a]">{ticket.zoho_priority || 'À qualifier'}</td>
                        <td className="px-3 py-2.5 text-[#4a4a4a]">{ticket.linear_priority_label || 'Non liée / sans donnée'}</td>
                        <td className="px-3 py-2.5"><UrgencyValidationControls ticketId={ticket.ticket_id} state={ticket.state} onValidated={onRefresh} /></td>
                      </tr>
                    ))}
                    {cockpit.tickets.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-[#8a8a8a]">Le shadow worker n’a pas encore produit d’évaluation.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function isHighZohoPriority(priority: string | null): boolean {
  return priority?.trim().toLocaleLowerCase('fr-FR') === 'high'
    || priority?.trim().toLocaleLowerCase('fr-FR') === 'haute'
}

function UrgencyValidationControls({
  ticketId,
  state,
  onValidated,
}: {
  ticketId: string
  state: 'probable' | 'confirmed' | 'non_urgent' | 'to_qualify'
  onValidated: () => void
}) {
  const [level, setLevel] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  if (state === 'confirmed' || state === 'non_urgent') return <span className="text-[#8a8a8a]">Validée</span>

  async function validate(nextState: 'confirmed' | 'non_urgent') {
    setPending(true)
    setMessage('')
    try {
      const response = await fetch(`/api/support/urgency/${encodeURIComponent(ticketId)}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: nextState, ...(nextState === 'non_urgent' ? { level } : {}) }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Validation impossible')
      onValidated()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Validation impossible')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="min-w-[260px]">
      <div className="flex items-center gap-1.5">
        <button type="button" disabled={pending} onClick={() => void validate('confirmed')} className="rounded-md bg-[#b7221b] px-2 py-1 font-semibold text-white disabled:opacity-50">Confirmer urgence</button>
        <select aria-label="Niveau interne non urgent" disabled={pending} value={level} onChange={event => setLevel(event.target.value)} className="rounded-md border border-[#d8d8d8] bg-white px-1.5 py-1 text-[#4a4a4a]">
          <option value="">Niveau…</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button type="button" disabled={pending || !level} onClick={() => void validate('non_urgent')} className="rounded-md border border-[#c8c8c8] px-2 py-1 font-semibold text-[#4a4a4a] disabled:opacity-40">Écarter</button>
      </div>
      {message && <p role="alert" className="mt-1 text-[10px] text-[#b7221b]">{message}</p>}
    </div>
  )
}

function KpiCard({ label, value, subtitle, delta }: { label: string; value: string; subtitle: string; delta?: number | null }) {
  const deltaClass = delta == null || delta === 0 ? 'text-[#1a1a1a]' : delta < 0 ? 'text-[#1D7D60]' : 'text-[#b7221b]'
  return (
    <article className="min-w-0 rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-[0_4px_10px_rgba(36,25,55,0.05)] sm:p-5">
      <p className="body-2 min-h-8 font-medium text-[#696969]">{label}</p>
      <p className={`hl-1-stronger mt-2 truncate tracking-tight ${deltaClass}`}>{value}</p>
      <p className="mt-2 truncate text-[11px] text-[#8a8a8a]">{subtitle}</p>
    </article>
  )
}

function ChartCard({
  title,
  subtitle,
  wide = false,
  action,
  children,
}: {
  title: string
  subtitle?: string
  wide?: boolean
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <article className={`rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-[0_4px_10px_rgba(36,25,55,0.05)] sm:p-5 ${wide ? 'lg:col-span-2' : ''}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[#1a1a1a]">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-[#8a8a8a]">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="h-[300px] w-full">{children}</div>
    </article>
  )
}

function BreakdownChart({ title, data, colors }: { title: string; data: AnalyticsBreakdown[]; colors: string[] }) {
  const [view, setView] = useState<BreakdownView>('donut')
  const orderedData = moveOtherLast(data)
  const total = orderedData.reduce((sum, item) => sum + item.count, 0)
  const viewToggle = (
    <div role="group" aria-label={`Mode d'affichage pour ${title}`} className="inline-flex rounded-lg border border-[#ded8e8] bg-[#f7f7f7] p-0.5">
      {([
        { value: 'donut', label: 'Anneau' },
        { value: 'columns', label: 'Colonnes' },
      ] as const).map(option => (
        <button
          key={option.value}
          type="button"
          aria-pressed={view === option.value}
          onClick={() => setView(option.value)}
          className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${view === option.value ? 'bg-white text-[#59319f] shadow-sm' : 'text-[#696969] hover:text-[#3f2175]'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )

  return (
    <ChartCard title={title} action={viewToggle}>
      {orderedData.length === 0 ? <EmptyChart /> : view === 'donut' ? (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={orderedData} dataKey="count" nameKey="name" innerRadius="48%" outerRadius="72%" paddingAngle={2} stroke="#ffffff" strokeWidth={2}>
              {orderedData.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) => {
                const count = Number(value)
                const percent = total > 0 ? Math.round((count / total) * 100) : 0
                return [`${formatNumber(count)} · ${percent} %`, String(name)]
              }}
            />
            <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" wrapperStyle={{ maxWidth: '45%', fontSize: 11, lineHeight: '20px' }} />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-full overflow-x-auto pb-1">
          <div className="h-full" style={{ minWidth: Math.max(360, orderedData.length * 64) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={orderedData} margin={{ top: 24, right: 8, left: -18, bottom: 62 }}>
                <CartesianGrid stroke="#ece8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  interval={0}
                  angle={-32}
                  textAnchor="end"
                  height={70}
                  tickMargin={8}
                  tick={{ fontSize: 10, fill: '#4a4a4a' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#696969' }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: '#f7f3fc' }}
                  contentStyle={tooltipStyle}
                  formatter={value => {
                    const count = Number(value)
                    const percent = total > 0 ? Math.round((count / total) * 100) : 0
                    return [`${formatNumber(count)} · ${percent} %`, 'Tickets']
                  }}
                />
                <Bar dataKey="count" name="Tickets" radius={[5, 5, 0, 0]} maxBarSize={46}>
                  {orderedData.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}
                  <LabelList dataKey="count" position="top" fill="#4a4a4a" fontSize={10} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </ChartCard>
  )
}

function moveOtherLast(data: AnalyticsBreakdown[]): AnalyticsBreakdown[] {
  const regular = data.filter(item => item.name !== 'Autre' && item.name !== 'Other')
  const other = data.filter(item => item.name === 'Autre' || item.name === 'Other')
  return [...regular, ...other]
}

function FilterMenu({ label, options, selected, open, onOpenChange, onToggle }: { label: string; options: string[]; selected: string[]; open: boolean; onOpenChange: (open: boolean) => void; onToggle: (value: string) => void }) {
  return (
    <details open={open} onToggle={event => onOpenChange(event.currentTarget.open)} className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-xs font-semibold text-[#4a4a4a] hover:border-[#8064b3] [&::-webkit-details-marker]:hidden">
        {label}
        {selected.length > 0 && <span className="rounded-full bg-[#59319f] px-1.5 py-0.5 text-[10px] text-white">{selected.length}</span>}
        <span className="text-[10px] text-[#8a8a8a] transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="absolute left-0 z-30 mt-1 max-h-64 min-w-[210px] overflow-y-auto rounded-xl border border-[#ded8e8] bg-white p-2 shadow-[0_10px_28px_rgba(36,25,55,0.16)]">
        {options.length === 0 ? (
          <p className="px-2 py-3 text-xs text-[#8a8a8a]">Aucune valeur disponible</p>
        ) : options.map(option => {
          const active = selected.includes(option)
          return (
            <button key={option} type="button" onClick={() => onToggle(option)} className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors last:mb-0 ${active ? 'bg-[#eee7f8] font-semibold text-[#59319f]' : 'text-[#4a4a4a] hover:bg-[#f7f7f7]'}`}>
              <span className={`grid h-4 w-4 place-items-center rounded border text-[10px] ${active ? 'border-[#59319f] bg-[#59319f] text-white' : 'border-[#c8c8c8] bg-white'}`}>{active ? '✓' : ''}</span>
              {option}
            </button>
          )
        })}
      </div>
    </details>
  )
}

function SearchSelect({ label, options, selected, open, onOpenChange, onSelect }: { label: string; options: string[]; selected: string; open: boolean; onOpenChange: (open: boolean) => void; onSelect: (value: string) => void }) {
  const [query, setQuery] = useState('')
  const matches = options.filter(option => option.toLocaleLowerCase('fr-FR').includes(query.toLocaleLowerCase('fr-FR'))).slice(0, 50)
  return (
    <details open={open} onToggle={event => onOpenChange(event.currentTarget.open)} className="group relative">
      <summary className="flex max-w-[230px] cursor-pointer list-none items-center gap-2 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-xs font-semibold text-[#4a4a4a] hover:border-[#8064b3] [&::-webkit-details-marker]:hidden">
        <span className="truncate">{selected || label}</span>
        {selected && <span className="rounded-full bg-[#59319f] px-1.5 py-0.5 text-[10px] text-white">1</span>}
        <span className="text-[10px] text-[#8a8a8a] transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="absolute left-0 z-30 mt-1 w-[290px] rounded-xl border border-[#ded8e8] bg-white p-2 shadow-[0_10px_28px_rgba(36,25,55,0.16)]">
        <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher un hôtel ou compte…" className="mb-2 w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-xs outline-none focus:border-[#8064b3] focus:ring-1 focus:ring-[#8064b3]" />
        <div className="max-h-52 overflow-y-auto">
          {selected && <button type="button" onClick={() => onSelect('')} className="mb-1 w-full rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-[#59319f] hover:bg-[#f7f3fc]">Tous les clients</button>}
          {matches.length === 0 ? <p className="px-2 py-3 text-xs text-[#8a8a8a]">Aucun client trouvé</p> : matches.map(option => (
            <button key={option} type="button" onClick={() => onSelect(option)} className={`mb-1 w-full rounded-lg px-2.5 py-2 text-left text-xs last:mb-0 ${selected === option ? 'bg-[#eee7f8] font-semibold text-[#59319f]' : 'text-[#4a4a4a] hover:bg-[#f7f7f7]'}`}>
              {option}
            </button>
          ))}
        </div>
      </div>
    </details>
  )
}

function SelectedPills({ values, onRemove }: { values: Array<{ key: string; value: string; selected: string[] }>; onRemove: (key: string, value: string, selected: string[]) => void }) {
  return <>{values.map(item => (
    <button key={`${item.key}-${item.value}`} type="button" onClick={() => onRemove(item.key, item.value, item.selected)} className="rounded-full bg-[#eee7f8] px-2.5 py-1 text-xs font-medium text-[#59319f] hover:bg-[#e1d5f2]">
      {item.value} ×
    </button>
  ))}</>
}

function AggregateTable({ rows, truncated }: { rows: TicketAggregateRow[]; truncated: boolean }) {
  const [sortKey, setSortKey] = useState<SortKey>('volume')
  const [ascending, setAscending] = useState(false)
  const [page, setPage] = useState(0)
  const pageSize = 20
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    const direction = ascending ? 1 : -1
    if (typeof av === 'number' || typeof bv === 'number') return ((Number(av ?? -1) - Number(bv ?? -1)) * direction)
    return String(av).localeCompare(String(bv), 'fr', { sensitivity: 'base' }) * direction
  }), [ascending, rows, sortKey])
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const visibleRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize)

  useEffect(() => setPage(0), [rows])

  function sortBy(key: SortKey) {
    if (sortKey === key) setAscending(value => !value)
    else {
      setSortKey(key)
      setAscending(key === 'client' || key === 'product' || key === 'category')
    }
    setPage(0)
  }

  return (
    <details className="mt-6 overflow-hidden rounded-xl border border-[#e2e2e2] bg-white shadow-[0_4px_10px_rgba(36,25,55,0.05)]">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 sm:px-5 [&::-webkit-details-marker]:hidden">
        <div>
          <h2 className="text-sm font-bold text-[#1a1a1a]">Détail agrégé client × produit</h2>
          <p className="mt-0.5 text-xs text-[#8a8a8a]">{formatNumber(rows.length)} groupes · aucune donnée ticket individuelle</p>
        </div>
        <span className="text-xs font-semibold text-[#59319f]">Afficher le tableau ⌄</span>
      </summary>
      <div className="overflow-x-auto border-t border-[#ece8f0]">
        {truncated && <p className="bg-[#fff8e8] px-5 py-2 text-xs text-[#84550e]">Le tableau est limité aux 1 000 agrégats les plus volumineux.</p>}
        <table className="w-full min-w-[850px] text-left text-xs">
          <thead className="bg-[#f7f7f7] text-[#696969]">
            <tr>
              <SortHeader label="Client" sortKey="client" current={sortKey} ascending={ascending} onSort={sortBy} />
              <SortHeader label="Produit" sortKey="product" current={sortKey} ascending={ascending} onSort={sortBy} />
              <SortHeader label="Catégorie" sortKey="category" current={sortKey} ascending={ascending} onSort={sortBy} />
              <SortHeader label="Volume" sortKey="volume" current={sortKey} ascending={ascending} onSort={sortBy} />
              <SortHeader label="Réponse moy." sortKey="avg_first_response_hours" current={sortKey} ascending={ascending} onSort={sortBy} />
              <SortHeader label="Ouverts" sortKey="open" current={sortKey} ascending={ascending} onSort={sortBy} />
              <SortHeader label="Résolus" sortKey="resolved" current={sortKey} ascending={ascending} onSort={sortBy} />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eeeeee]">
            {visibleRows.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-[#8a8a8a]">Aucun agrégat pour ces filtres.</td></tr>
            ) : visibleRows.map((row, index) => (
              <tr key={`${row.client}-${row.product}-${row.category}-${index}`} className="hover:bg-[#faf8fd]">
                <td className="max-w-[230px] truncate px-5 py-3 font-semibold text-[#1a1a1a]">{row.client}</td>
                <td className="px-5 py-3 text-[#4a4a4a]">{row.product}</td>
                <td className="px-5 py-3 text-[#4a4a4a]">{row.category}</td>
                <td className="px-5 py-3 font-semibold tabular-nums">{formatNumber(row.volume)}</td>
                <td className="px-5 py-3 tabular-nums text-[#4a4a4a]">{formatDuration(row.avg_first_response_hours)}</td>
                <td className="px-5 py-3 tabular-nums text-[#b26d18]">{formatNumber(row.open)}</td>
                <td className="px-5 py-3 tabular-nums text-[#1D7D60]">{formatNumber(row.resolved)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-[#ece8f0] px-5 py-3 text-xs text-[#696969]">
          <span>Page {safePage + 1} sur {pageCount}</span>
          <div className="flex gap-2">
            <button type="button" disabled={safePage === 0} onClick={() => setPage(value => Math.max(0, value - 1))} className="rounded-lg border border-[#d8d8d8] px-3 py-1.5 font-semibold text-[#4a4a4a] disabled:cursor-not-allowed disabled:opacity-40">Précédent</button>
            <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(value => Math.min(pageCount - 1, value + 1))} className="rounded-lg border border-[#d8d8d8] px-3 py-1.5 font-semibold text-[#4a4a4a] disabled:cursor-not-allowed disabled:opacity-40">Suivant</button>
          </div>
        </div>
      </div>
    </details>
  )
}

function SortHeader({ label, sortKey, current, ascending, onSort }: { label: string; sortKey: SortKey; current: SortKey; ascending: boolean; onSort: (key: SortKey) => void }) {
  return (
    <th className="px-5 py-3 font-semibold uppercase tracking-wide">
      <button type="button" onClick={() => onSort(sortKey)} className="whitespace-nowrap hover:text-[#59319f]">
        {label} {current === sortKey ? (ascending ? '↑' : '↓') : ''}
      </button>
    </th>
  )
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-32 rounded-xl border border-[#e2e2e2] bg-white" />)}</div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-[370px] rounded-xl border border-[#e2e2e2] bg-white" />)}</div>
    </div>
  )
}

function EmptyChart() {
  return <div className="grid h-full place-items-center text-sm text-[#8a8a8a]">Aucune donnée pour ces filtres.</div>
}

const tooltipStyle = {
  border: '1px solid #ded8e8',
  borderRadius: 10,
  boxShadow: '0 8px 24px rgba(36,25,55,0.12)',
  fontSize: 12,
}

function presetRange(preset: '7d' | '30d' | '90d' | '12m'): { from: string; to: string } {
  const to = new Date()
  to.setHours(0, 0, 0, 0)
  const from = new Date(to)
  if (preset === '12m') from.setFullYear(from.getFullYear() - 1)
  else from.setDate(from.getDate() - (Number(preset.replace('d', '')) - 1))
  return { from: localIsoDate(from), to: localIsoDate(to) }
}

function localIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function validDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null
}

function readPreset(value: string | null): '7d' | '30d' | '90d' | '12m' | null {
  return value === '7d' || value === '30d' || value === '90d' || value === '12m' ? value : null
}

function readMany(params: URLSearchParams | ReadonlyURLSearchParamsLike, key: string): string[] {
  return params.getAll(key).flatMap(value => value.split(',')).map(value => value.trim()).filter(Boolean)
}

interface ReadonlyURLSearchParamsLike {
  getAll(name: string): string[]
}

function mergeOptions(preferred: string[], dynamic: string[] | undefined): string[] {
  return [...new Set([...preferred, ...(dynamic ?? [])])]
}

function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits }).format(value)
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
}

function formatDuration(hours: number | null): string {
  if (hours === null) return '—'
  if (hours < 1) return `${Math.round(hours * 60)} min`
  if (hours < 48) return `${formatNumber(hours, 1)} h`
  return `${formatNumber(hours / 24, 1)} j`
}

function formatDelta(value: number | null): string {
  if (value === null) return '—'
  if (value === 0) return '0 %'
  return `${value > 0 ? '+' : ''}${formatNumber(value, 1)} %`
}
