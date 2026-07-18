'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertCircle, Check, Clipboard, RotateCcw } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AcuitySession } from '@/lib/acuity/client'

type AnalyticsSession = AcuitySession
type Preset = '3m' | '6m' | '12m' | 'custom'
type LanguageMetric = 'sessions' | 'registrations'
type ComparisonTone = 'positive' | 'negative' | 'neutral' | 'muted'

interface DateRange {
  from: string
  to: string
}

interface SessionsPayload {
  sessions?: AnalyticsSession[]
  error?: string
  meta?: { truncated?: boolean }
}

interface LoadedSessions {
  sessions: AnalyticsSession[]
  truncated: boolean
}

interface FormationDatum {
  name: string
  registrations: number
  sessions: number
}

interface LanguageDatum {
  name: string
  sessions: number
  registrations: number
}

interface TrainerDatum {
  name: string
  sessions: number
  registrations: number
  durationHours: number
}

interface HotelDatum {
  name: string
  registrations: number
  sessions: number
}

interface MonthlyDatum {
  month: string
  label: string
  sessions: number
  registrations: number
}

interface PeriodAnalytics {
  sessions: number
  registrations: number
  hotels: number
  registrationsPerSession: number
  cancellations: number
  cancellationRate: number
  noShows: number
  formations: FormationDatum[]
  languages: LanguageDatum[]
  trainers: TrainerDatum[]
  hotelsRanking: HotelDatum[]
  monthly: MonthlyDatum[]
}

interface ComparisonDisplay {
  text: string
  tone: ComparisonTone
}

const DAY_MS = 86_400_000
const BRAND = '#59319f'
const BRAND_DARK = '#3f2175'
const SUCCESS = '#1D9E75'
const CRITICAL = '#d64545'
const WARNING = '#d58b28'
const GRID = '#e2e2e2'
const MUTED = '#696969'
const LANGUAGE_COLORS: Record<string, string> = {
  FR: '#59319f',
  EN: '#248f83',
  ES: '#d58b28',
}
const FALLBACK_COLORS = ['#3b72d1', '#8c5bdb', '#447a76', '#b47939']
const TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: `1px solid ${GRID}`,
  borderRadius: 10,
  boxShadow: '0 8px 24px rgba(36,25,55,0.12)',
  fontSize: 12,
}
const PRESETS: Array<{ value: Exclude<Preset, 'custom'>; label: string; months: number }> = [
  { value: '3m', label: '3 mois', months: 3 },
  { value: '6m', label: '6 mois', months: 6 },
  { value: '12m', label: '12 mois', months: 12 },
]

export default function TrainingsAnalyticsPage() {
  const today = useMemo(() => localIsoDay(new Date()), [])
  const initialRange = useMemo(() => rangeForMonths(3, today), [today])
  const [period, setPeriod] = useState<Preset>('3m')
  const [customFrom, setCustomFrom] = useState(initialRange.from)
  const [customTo, setCustomTo] = useState(initialRange.to)
  const [currentSessions, setCurrentSessions] = useState<AnalyticsSession[]>([])
  const [previousSessions, setPreviousSessions] = useState<AnalyticsSession[]>([])
  const [sourceTruncated, setSourceTruncated] = useState(false)
  const [language, setLanguage] = useState('')
  const [theme, setTheme] = useState('')
  const [trainer, setTrainer] = useState('')
  const [languageMetric, setLanguageMetric] = useState<LanguageMetric>('sessions')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const range = useMemo<DateRange>(() => {
    if (period === 'custom') return { from: customFrom, to: customTo }
    const preset = PRESETS.find(option => option.value === period) ?? PRESETS[0]
    return rangeForMonths(preset.months, today)
  }, [customFrom, customTo, period, today])
  const rangeError = validateRange(range, today)
  const previousRange = useMemo(() => previousPeriod(range), [range])

  useEffect(() => {
    if (rangeError) {
      setError(rangeError)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    Promise.all([
      fetchSessions(range, controller.signal),
      fetchSessions(previousRange, controller.signal),
    ])
      .then(([current, previous]) => {
        setCurrentSessions(current.sessions)
        setPreviousSessions(previous.sessions)
        setSourceTruncated(current.truncated || previous.truncated)
      })
      .catch(fetchError => {
        if (isAbortError(fetchError)) return
        setError(fetchError instanceof Error ? fetchError.message : 'Impossible de charger les formations.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [previousRange, range, rangeError, retryKey])

  const options = useMemo(
    () => buildFilterOptions([...currentSessions, ...previousSessions]),
    [currentSessions, previousSessions],
  )
  const filteredCurrent = useMemo(
    () => filterSessions(currentSessions, { language, theme, trainer }),
    [currentSessions, language, theme, trainer],
  )
  const filteredPrevious = useMemo(
    () => filterSessions(previousSessions, { language, theme, trainer }),
    [previousSessions, language, theme, trainer],
  )
  const analytics = useMemo(
    () => computeAnalytics(filteredCurrent, range),
    [filteredCurrent, range],
  )
  const previousAnalytics = useMemo(
    () => computeAnalytics(filteredPrevious, previousRange),
    [filteredPrevious, previousRange],
  )
  const comparisons = useMemo(() => buildKpiComparisons(analytics, previousAnalytics), [analytics, previousAnalytics])
  const hasFilters = Boolean(language || theme || trainer)
  const languageChartData = analytics.languages
    .map(item => ({ ...item, value: item[languageMetric] }))
    .filter(item => item.value > 0)
  const languageTotal = languageChartData.reduce((sum, item) => sum + item.value, 0)

  function selectPreset(value: Exclude<Preset, 'custom'>) {
    setPeriod(value)
  }

  function enableCustomRange() {
    setCustomFrom(range.from)
    setCustomTo(range.to)
    setPeriod('custom')
  }

  function resetFilters() {
    setLanguage('')
    setTheme('')
    setTrainer('')
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(buildReport({
        analytics,
        previous: previousAnalytics,
        comparisons,
        range,
        previousRange,
        filters: { language, theme, trainer },
        sourceTruncated,
      }))
      setCopyStatus('success')
    } catch {
      setCopyStatus('error')
    }
    window.setTimeout(() => setCopyStatus('idle'), 2_000)
  }

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: 'var(--bg-canvas)', color: 'var(--fg1)' }}
      aria-busy={loading}
    >
      <header className="border-b border-[#e2e2e2] bg-white px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-[#1a1a1a]">Formations</h1>
            <p className="mt-1 text-sm text-[#696969]">
              {formatRange(range)} · comparaison avec {formatRange(previousRange).toLocaleLowerCase('fr-FR')}
            </p>
          </div>
          <button
            type="button"
            onClick={copyReport}
            disabled={loading || Boolean(error)}
            className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-[#59319f] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#3f2175] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8064b3] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copyStatus === 'success' ? <Check aria-hidden="true" size={16} /> : <Clipboard aria-hidden="true" size={16} />}
            {copyStatus === 'success' ? 'Rapport copié' : copyStatus === 'error' ? 'Copie impossible' : 'Copier le rapport'}
          </button>
        </div>
        <p className="sr-only" aria-live="polite">
          {copyStatus === 'success' ? 'Le rapport a été copié dans le presse-papiers.' : copyStatus === 'error' ? 'Le rapport n’a pas pu être copié.' : ''}
        </p>
      </header>

      <section
        className="sticky top-0 z-20 border-b border-[#e2e2e2] bg-white/95 px-4 py-4 shadow-[0_2px_4px_rgba(0,0,0,0.05)] backdrop-blur sm:px-6 lg:px-8"
        aria-label="Filtres du dashboard Formations"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div>
                <FilterLabel>Période</FilterLabel>
                <div className="flex flex-wrap gap-1 rounded-lg bg-[#f7f7f7] p-1" role="group" aria-label="Choisir la période">
                  {PRESETS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={period === option.value}
                      onClick={() => selectPreset(option.value)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8064b3] ${period === option.value ? 'bg-white text-[#59319f] shadow-sm' : 'text-[#696969] hover:text-[#1a1a1a]'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-pressed={period === 'custom'}
                    onClick={enableCustomRange}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8064b3] ${period === 'custom' ? 'bg-white text-[#59319f] shadow-sm' : 'text-[#696969] hover:text-[#1a1a1a]'}`}
                  >
                    Plage personnalisée
                  </button>
                </div>
              </div>

              {period === 'custom' && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="text-xs font-medium text-[#696969]" htmlFor="training-range-from">
                    Du
                    <input
                      id="training-range-from"
                      type="date"
                      value={customFrom}
                      max={customTo || today}
                      onChange={event => setCustomFrom(event.target.value)}
                      className="mt-1 block w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-xs text-[#1a1a1a] outline-none focus:border-[#8064b3] focus:ring-1 focus:ring-[#8064b3]"
                    />
                  </label>
                  <label className="text-xs font-medium text-[#696969]" htmlFor="training-range-to">
                    Au
                    <input
                      id="training-range-to"
                      type="date"
                      value={customTo}
                      min={customFrom}
                      max={today}
                      onChange={event => setCustomTo(event.target.value)}
                      className="mt-1 block w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-xs text-[#1a1a1a] outline-none focus:border-[#8064b3] focus:ring-1 focus:ring-[#8064b3]"
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <SelectFilter id="training-language" label="Langue" value={language} onChange={setLanguage} options={options.languages} allLabel="Toutes les langues" />
              <SelectFilter id="training-theme" label="Thème" value={theme} onChange={setTheme} options={options.themes} allLabel="Tous les thèmes" />
              <SelectFilter id="training-trainer" label="Animateur" value={trainer} onChange={setTrainer} options={options.trainers} allLabel="Tous les animateurs" />
            </div>
          </div>

          {hasFilters && (
            <div className="flex flex-wrap items-center gap-2 border-t border-[#eeeeee] pt-3">
              <span className="text-xs font-medium text-[#696969]">Filtres actifs :</span>
              {language && <FilterPill label={language} onRemove={() => setLanguage('')} />}
              {theme && <FilterPill label={theme} onRemove={() => setTheme('')} />}
              {trainer && <FilterPill label={trainer} onRemove={() => setTrainer('')} />}
              <button type="button" onClick={resetFilters} className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-[#59319f] hover:text-[#3f2175] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8064b3]">
                <RotateCcw aria-hidden="true" size={13} /> Réinitialiser
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {loading ? (
          <DashboardSkeleton />
        ) : error ? (
          <div role="alert" className="flex flex-col gap-3 rounded-xl border border-[#f1b4b0] bg-[#fff1f0] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0 text-[#b7221b]" size={18} />
              <div>
                <p className="text-sm font-semibold text-[#8f211d]">Données indisponibles</p>
                <p className="mt-0.5 text-sm text-[#a33b36]">{error}</p>
              </div>
            </div>
            <button type="button" onClick={() => setRetryKey(value => value + 1)} className="self-start rounded-lg border border-[#d98984] bg-white px-3 py-2 text-xs font-semibold text-[#8f211d] hover:bg-[#fff8f7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d98984]">
              Réessayer
            </button>
          </div>
        ) : (
          <>
            <section aria-label="Indicateurs clés" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <KpiCard label="Sessions passées" value={formatNumber(analytics.sessions)} subtitle="Sessions dont la date est passée" comparison={comparisons.sessions} />
              <KpiCard label="Inscriptions actives" value={formatNumber(analytics.registrations)} subtitle={`${formatNumber(analytics.cancellations)} annulation${analytics.cancellations !== 1 ? 's' : ''} exclue${analytics.cancellations !== 1 ? 's' : ''}`} comparison={comparisons.registrations} />
              <KpiCard label="Hôtels représentés" value={formatNumber(analytics.hotels)} subtitle="Hôtels avec au moins un inscrit actif" comparison={comparisons.hotels} />
              <KpiCard label="Moyenne / session" value={formatNumber(analytics.registrationsPerSession, 1)} subtitle="Inscriptions actives par session" comparison={comparisons.average} />
              <KpiCard label="Taux d’annulation" value={formatPercent(analytics.cancellationRate)} subtitle={`${formatNumber(analytics.cancellations)} sur ${formatNumber(analytics.registrations + analytics.cancellations + analytics.noShows)} demandes`} comparison={comparisons.cancellationRate} />
            </section>

            {analytics.noShows > 0 && (
              <aside className="flex flex-col gap-1 rounded-xl border border-[#ead7a6] bg-[#fff9e8] px-4 py-3 sm:flex-row sm:items-center sm:justify-between" aria-label="No-show">
                <p className="text-sm font-semibold text-[#84550e]">
                  {formatNumber(analytics.noShows)} no-show{analytics.noShows > 1 ? 's' : ''} signalé{analytics.noShows > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-[#8b6a24]">Indicateur suivi séparément des annulations et des inscriptions actives.</p>
              </aside>
            )}

            {sourceTruncated && (
              <aside role="alert" className="rounded-xl border border-[#e8c8a8] bg-[#fff5ec] px-4 py-3 text-sm text-[#903b07]">
                Une plage source Acuity a atteint sa limite de résultats. Les indicateurs peuvent être partiels ; réduisez la période ou vérifiez la source.
              </aside>
            )}

            {analytics.sessions === 0 && (
              <div className="rounded-xl border border-[#ded8e8] bg-[#f8f5fc] px-4 py-3 text-sm text-[#59319f]">
                Aucune session passée ne correspond à cette période et à ces filtres.
              </div>
            )}

            <section className="grid grid-cols-1 gap-5 xl:grid-cols-2" aria-label="Visualisations analytiques">
              <ChartCard title="Tendance mensuelle" subtitle="Sessions passées et inscriptions actives" wide>
                {analytics.monthly.every(item => item.sessions === 0 && item.registrations === 0) ? <EmptyChart /> : (
                  <div className="h-full overflow-x-auto" role="img" aria-label="Évolution mensuelle du nombre de sessions et d’inscriptions">
                    <div className="h-full" style={{ minWidth: Math.max(620, analytics.monthly.length * 76) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={analytics.monthly} margin={{ top: 16, right: 12, left: -8, bottom: 12 }}>
                          <CartesianGrid stroke="#ece8f0" strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                          <YAxis yAxisId="sessions" allowDecimals={false} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                          <YAxis yAxisId="registrations" orientation="right" allowDecimals={false} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value, name) => [formatNumber(Number(value)), String(name)]} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar yAxisId="sessions" dataKey="sessions" name="Sessions" fill={BRAND} radius={[5, 5, 0, 0]} maxBarSize={42} />
                          <Line yAxisId="registrations" type="monotone" dataKey="registrations" name="Inscriptions" stroke={SUCCESS} strokeWidth={2.5} dot={{ r: 3, fill: SUCCESS }} activeDot={{ r: 5 }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </ChartCard>

              <ChartCard title="Formations par inscriptions actives" subtitle="Classement avec volume de sessions" wide>
                {analytics.formations.length === 0 ? <EmptyChart /> : (
                  <div className="h-full overflow-x-auto" role="img" aria-label="Barres horizontales des formations les plus suivies">
                    <div className="h-full min-w-[640px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.formations.slice(0, 8)} layout="vertical" margin={{ top: 8, right: 22, left: 18, bottom: 8 }} barCategoryGap="24%">
                          <CartesianGrid stroke="#ece8f0" strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                          <YAxis type="category" dataKey="name" width={175} tickFormatter={value => truncateLabel(String(value), 25)} tick={{ fontSize: 11, fill: '#4a4a4a' }} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value, name) => [formatNumber(Number(value)), String(name)]} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="registrations" name="Inscrits" fill={BRAND} radius={[0, 5, 5, 0]} maxBarSize={16} />
                          <Bar dataKey="sessions" name="Sessions" fill="#b9a3dc" radius={[0, 5, 5, 0]} maxBarSize={16} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </ChartCard>

              <ChartCard
                title="Répartition par langue"
                subtitle={languageMetric === 'sessions' ? 'Part des sessions passées' : 'Part des inscriptions actives'}
                action={<MetricToggle value={languageMetric} onChange={setLanguageMetric} />}
              >
                {languageChartData.length === 0 ? <EmptyChart /> : (
                  <div className="h-full" role="img" aria-label={`Répartition des ${languageMetric === 'sessions' ? 'sessions' : 'inscriptions'} par langue`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={languageChartData} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="72%" paddingAngle={3} stroke="#fff" strokeWidth={2}>
                          {languageChartData.map((item, index) => (
                            <Cell key={item.name} fill={LANGUAGE_COLORS[item.name] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(value, name) => {
                            const count = Number(value)
                            const percent = languageTotal > 0 ? Math.round((count / languageTotal) * 100) : 0
                            return [`${formatNumber(count)} · ${percent} %`, String(name)]
                          }}
                        />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </ChartCard>

              <ChartCard title="Charge des animateurs" subtitle="Sessions, heures planifiées sur sessions passées et inscriptions">
                {analytics.trainers.length === 0 ? <EmptyChart /> : (
                  <TrainerWorkload trainers={analytics.trainers.slice(0, 8)} />
                )}
              </ChartCard>

              <ChartCard title="Hôtels les plus représentés" subtitle="Top 8 par inscriptions actives, avec le nombre de sessions" wide>
                {analytics.hotelsRanking.length === 0 ? <EmptyChart /> : (
                  <div className="h-full overflow-x-auto" role="img" aria-label="Barres horizontales des hôtels les plus représentés">
                    <div className="h-full min-w-[640px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.hotelsRanking.slice(0, 8)} layout="vertical" margin={{ top: 8, right: 22, left: 18, bottom: 8 }} barCategoryGap="24%">
                          <CartesianGrid stroke="#ece8f0" strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                          <YAxis type="category" dataKey="name" width={175} tickFormatter={value => truncateLabel(String(value), 25)} tick={{ fontSize: 11, fill: '#4a4a4a' }} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value, name) => [formatNumber(Number(value)), String(name)]} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="registrations" name="Inscrits" fill={BRAND} radius={[0, 5, 5, 0]} maxBarSize={16} />
                          <Bar dataKey="sessions" name="Sessions" fill="#b9a3dc" radius={[0, 5, 5, 0]} maxBarSize={16} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </ChartCard>
            </section>
          </>
        )}
      </div>
    </main>
  )
}

function KpiCard({
  label,
  value,
  subtitle,
  comparison,
}: {
  label: string
  value: string
  subtitle: string
  comparison: ComparisonDisplay
}) {
  const toneClass: Record<ComparisonTone, string> = {
    positive: 'text-[#1D7D60]',
    negative: 'text-[#b7221b]',
    neutral: 'text-[#59319f]',
    muted: 'text-[#8a8a8a]',
  }

  return (
    <article className="min-w-0 rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-[0_4px_10px_rgba(36,25,55,0.05)] sm:p-5">
      <p className="min-h-8 text-xs font-semibold uppercase tracking-wide text-[#696969]">{label}</p>
      <p className="mt-2 truncate text-3xl font-bold tracking-tight text-[#1a1a1a]">{value}</p>
      <p className="mt-2 min-h-8 text-xs leading-4 text-[#8a8a8a]">{subtitle}</p>
      <p className={`mt-2 text-[11px] font-semibold ${toneClass[comparison.tone]}`}>{comparison.text}</p>
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
  subtitle: string
  wide?: boolean
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <article className={`rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-[0_4px_10px_rgba(36,25,55,0.05)] sm:p-5 ${wide ? 'xl:col-span-2' : ''}`}>
      <div className="mb-4 flex min-h-11 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[#1a1a1a]">{title}</h2>
          <p className="mt-0.5 text-xs text-[#8a8a8a]">{subtitle}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="h-[320px] w-full">{children}</div>
    </article>
  )
}

function TrainerWorkload({ trainers }: { trainers: TrainerDatum[] }) {
  const maxSessions = Math.max(...trainers.map(item => item.sessions), 1)
  return (
    <div className="h-full space-y-4 overflow-y-auto pr-1" role="list" aria-label="Charge par animateur">
      {trainers.map(item => (
        <div key={item.name} role="listitem">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <p className="truncate text-sm font-semibold text-[#1a1a1a]" title={item.name}>{item.name}</p>
            <p className="text-xs text-[#696969] sm:shrink-0">
              {formatNumber(item.sessions)} session{item.sessions !== 1 ? 's' : ''} · {formatNumber(item.durationHours, 1)} h · {formatNumber(item.registrations)} inscrit{item.registrations !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-[#eeeaf3]" aria-hidden="true">
            <div className="h-full rounded-full bg-[#59319f]" style={{ width: `${Math.max(5, (item.sessions / maxSessions) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function MetricToggle({ value, onChange }: { value: LanguageMetric; onChange: (value: LanguageMetric) => void }) {
  return (
    <div role="group" aria-label="Mesure de la répartition par langue" className="inline-flex rounded-lg border border-[#ded8e8] bg-[#f7f7f7] p-0.5">
      {([
        { value: 'sessions', label: 'Sessions' },
        { value: 'registrations', label: 'Inscriptions' },
      ] as const).map(option => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8064b3] ${value === option.value ? 'bg-white text-[#59319f] shadow-sm' : 'text-[#696969] hover:text-[#3f2175]'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function SelectFilter({
  id,
  label,
  value,
  options,
  allLabel,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: string[]
  allLabel: string
  onChange: (value: string) => void
}) {
  const safeOptions = value && !options.includes(value) ? [value, ...options] : options
  return (
    <label htmlFor={id} className="text-xs font-medium text-[#696969]">
      {label}
      <select
        id={id}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="mt-1 block w-full min-w-0 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-xs text-[#1a1a1a] outline-none focus:border-[#8064b3] focus:ring-1 focus:ring-[#8064b3] sm:min-w-[170px]"
      >
        <option value="">{allLabel}</option>
        {safeOptions.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  )
}

function FilterLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1 text-xs font-medium text-[#696969]">{children}</p>
}

function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button type="button" onClick={onRemove} aria-label={`Retirer le filtre ${label}`} className="rounded-full bg-[#eee7f8] px-2.5 py-1 text-xs font-medium text-[#59319f] hover:bg-[#e1d5f2] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8064b3]">
      {label} ×
    </button>
  )
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Chargement des données analytiques">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-36 rounded-xl border border-[#e2e2e2] bg-white" />)}
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="h-[390px] rounded-xl border border-[#e2e2e2] bg-white xl:col-span-2" />
        <div className="h-[390px] rounded-xl border border-[#e2e2e2] bg-white xl:col-span-2" />
        <div className="h-[390px] rounded-xl border border-[#e2e2e2] bg-white" />
        <div className="h-[390px] rounded-xl border border-[#e2e2e2] bg-white" />
      </div>
    </div>
  )
}

function EmptyChart() {
  return <div className="grid h-full place-items-center text-sm text-[#8a8a8a]">Aucune donnée pour cette sélection.</div>
}

async function fetchSessions(range: DateRange, signal: AbortSignal): Promise<LoadedSessions> {
  const params = new URLSearchParams({ minDate: range.from, maxDate: range.to })
  const response = await fetch(`/api/acuity/sessions?${params.toString()}`, { signal })
  const body = await response.json().catch(() => ({})) as SessionsPayload
  if (!response.ok) throw new Error(body.error || `Erreur HTTP ${response.status}`)
  if (!Array.isArray(body.sessions)) throw new Error('La réponse Acuity ne contient aucune liste de sessions.')
  return {
    sessions: deduplicateSessions(body.sessions),
    truncated: body.meta?.truncated === true,
  }
}

function deduplicateSessions(sessions: AnalyticsSession[]): AnalyticsSession[] {
  const byId = new Map<string, AnalyticsSession>()
  for (const session of sessions) {
    const id = cleanText(session.id) || String(session.classID)
    byId.set(id, { ...session, id, totalNoShow: safeCount(session.totalNoShow) })
  }
  return [...byId.values()]
}

function filterSessions(
  sessions: AnalyticsSession[],
  filters: { language: string; theme: string; trainer: string },
): AnalyticsSession[] {
  return sessions.filter(session => (
    (!filters.language || session.language === filters.language)
    && (!filters.theme || sessionTheme(session) === filters.theme)
    && (!filters.trainer || sessionTrainer(session) === filters.trainer)
  ))
}

function buildFilterOptions(sessions: AnalyticsSession[]) {
  return {
    languages: uniqueSorted(sessions.map(session => session.language).filter(Boolean)),
    themes: uniqueSorted(sessions.map(sessionTheme)),
    trainers: uniqueSorted(sessions.map(sessionTrainer)),
  }
}

function computeAnalytics(sessions: AnalyticsSession[], range: DateRange): PeriodAnalytics {
  const now = Date.now()
  const pastCohort = sessions.filter(session => (
    isWithinRange(session, range)
    && isPastSession(session, now)
    && !session.isDraft
  ))
  const eligible = pastCohort.filter(session => session.status !== 'cancelled')
  const hotelKeys = new Set<string>()
  const formationMap = new Map<string, { registrations: number; sessions: number }>()
  const languageMap = new Map<string, { sessions: number; registrations: number }>()
  const trainerMap = new Map<string, TrainerDatum>()
  const hotelMap = new Map<string, { name: string; registrations: number; sessionIds: Set<string> }>()
  let registrations = 0
  const cancellations = pastCohort.reduce((sum, session) => sum + safeCount(session.totalCancelled), 0)
  const noShows = pastCohort.reduce((sum, session) => sum + safeCount(session.totalNoShow), 0)

  for (const session of eligible) {
    const sessionRegistrations = safeCount(session.totalRegistered)
    registrations += sessionRegistrations

    const formationName = sessionTheme(session)
    const formation = formationMap.get(formationName) ?? { registrations: 0, sessions: 0 }
    formation.registrations += sessionRegistrations
    formation.sessions += 1
    formationMap.set(formationName, formation)

    const languageName = cleanText(session.language) || 'Non renseignée'
    const language = languageMap.get(languageName) ?? { sessions: 0, registrations: 0 }
    language.sessions += 1
    language.registrations += sessionRegistrations
    languageMap.set(languageName, language)

    const trainerName = sessionTrainer(session)
    const trainer = trainerMap.get(trainerName) ?? { name: trainerName, sessions: 0, registrations: 0, durationHours: 0 }
    trainer.sessions += 1
    trainer.registrations += sessionRegistrations
    trainer.durationHours += Math.max(0, Number(session.duration) || 0) / 60
    trainerMap.set(trainerName, trainer)

    const registeredParticipants = session.participants.filter(participant => participant.status === 'registered')
    const hotels = registeredParticipants.length > 0
      ? registeredParticipants.map(participant => participant.hotelName)
      : sessionRegistrations > 0 ? session.uniqueHotels : []
    for (const rawHotel of hotels) {
      const hotelName = cleanText(rawHotel)
      if (!hotelName) continue
      const hotelKey = normalizeKey(hotelName)
      hotelKeys.add(hotelKey)
      const hotel = hotelMap.get(hotelKey) ?? { name: hotelName, registrations: 0, sessionIds: new Set<string>() }
      hotel.registrations += 1
      hotel.sessionIds.add(session.id)
      hotelMap.set(hotelKey, hotel)
    }
  }

  const denominator = registrations + cancellations + noShows
  return {
    sessions: eligible.length,
    registrations,
    hotels: hotelKeys.size,
    registrationsPerSession: eligible.length > 0 ? registrations / eligible.length : 0,
    cancellations,
    cancellationRate: denominator > 0 ? (cancellations / denominator) * 100 : 0,
    noShows,
    formations: [...formationMap.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.registrations - a.registrations || b.sessions - a.sessions || localeSort(a.name, b.name)),
    languages: [...languageMap.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.sessions - a.sessions || localeSort(a.name, b.name)),
    trainers: [...trainerMap.values()]
      .sort((a, b) => b.sessions - a.sessions || b.registrations - a.registrations || localeSort(a.name, b.name)),
    hotelsRanking: [...hotelMap.values()]
      .map(value => ({ name: value.name, registrations: value.registrations, sessions: value.sessionIds.size }))
      .sort((a, b) => b.registrations - a.registrations || b.sessions - a.sessions || localeSort(a.name, b.name)),
    monthly: buildMonthlyTrend(eligible, range),
  }
}

function buildMonthlyTrend(sessions: AnalyticsSession[], range: DateRange): MonthlyDatum[] {
  const from = parseIsoDay(range.from)
  const to = parseIsoDay(range.to)
  if (!from || !to) return []

  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1))
  const finalMonth = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1)
  const byMonth = new Map<string, MonthlyDatum>()
  while (cursor.getTime() <= finalMonth) {
    const month = cursor.toISOString().slice(0, 7)
    byMonth.set(month, {
      month,
      label: new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(cursor),
      sessions: 0,
      registrations: 0,
    })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  for (const session of sessions) {
    const month = sessionDay(session).slice(0, 7)
    const point = byMonth.get(month)
    if (!point) continue
    point.sessions += 1
    point.registrations += safeCount(session.totalRegistered)
  }
  return [...byMonth.values()]
}

function buildKpiComparisons(current: PeriodAnalytics, previous: PeriodAnalytics) {
  return {
    sessions: compareMetric(current.sessions, previous.sessions),
    registrations: compareMetric(current.registrations, previous.registrations),
    hotels: compareMetric(current.hotels, previous.hotels),
    average: compareMetric(current.registrationsPerSession, previous.registrationsPerSession),
    cancellationRate: compareMetric(
      current.cancellationRate,
      previous.cancellationRate,
      { points: true, lowerIsBetter: true, available: previous.registrations + previous.cancellations + previous.noShows > 0 },
    ),
  }
}

function compareMetric(
  current: number,
  previous: number,
  options: { points?: boolean; lowerIsBetter?: boolean; available?: boolean } = {},
): ComparisonDisplay {
  const available = options.available ?? previous > 0
  if (!available) {
    if (current === 0 && previous === 0) return { text: 'Stable vs période précédente', tone: 'muted' }
    return { text: 'Pas de base précédente', tone: 'muted' }
  }

  const delta = options.points ? current - previous : ((current - previous) / previous) * 100
  if (Math.abs(delta) < 0.05) return { text: 'Stable vs période précédente', tone: 'muted' }
  const tone: ComparisonTone = options.lowerIsBetter
    ? delta < 0 ? 'positive' : 'negative'
    : 'neutral'
  return {
    text: `${delta > 0 ? '+' : ''}${formatNumber(delta, 1)} ${options.points ? 'pt' : '%'} vs période précédente`,
    tone,
  }
}

function buildReport({
  analytics,
  previous,
  comparisons,
  range,
  previousRange,
  filters,
  sourceTruncated,
}: {
  analytics: PeriodAnalytics
  previous: PeriodAnalytics
  comparisons: ReturnType<typeof buildKpiComparisons>
  range: DateRange
  previousRange: DateRange
  filters: { language: string; theme: string; trainer: string }
  sourceTruncated: boolean
}): string {
  const activeFilters = [
    filters.language && `Langue : ${filters.language}`,
    filters.theme && `Thème : ${filters.theme}`,
    filters.trainer && `Animateur : ${filters.trainer}`,
  ].filter(Boolean)
  const lines = [
    'RAPPORT FORMATIONS D-EDGE',
    `Période : ${formatRange(range)}`,
    `Comparaison : ${formatRange(previousRange)}`,
    `Filtres : ${activeFilters.length > 0 ? activeFilters.join(' · ') : 'Aucun'}`,
    `Source complète : ${sourceTruncated ? 'Non — limite Acuity atteinte' : 'Oui'}`,
    '',
    'INDICATEURS',
    `Sessions passées : ${formatNumber(analytics.sessions)} (${comparisons.sessions.text})`,
    `Inscriptions actives : ${formatNumber(analytics.registrations)} (${comparisons.registrations.text})`,
    `Hôtels représentés : ${formatNumber(analytics.hotels)} (${comparisons.hotels.text})`,
    `Moyenne par session : ${formatNumber(analytics.registrationsPerSession, 1)} (${comparisons.average.text})`,
    `Annulations : ${formatNumber(analytics.cancellations)} · ${formatPercent(analytics.cancellationRate)} (${comparisons.cancellationRate.text})`,
  ]
  if (analytics.noShows > 0) lines.push(`No-shows : ${formatNumber(analytics.noShows)} (suivis séparément)`)

  lines.push(
    '',
    'PÉRIODE PRÉCÉDENTE',
    `${formatNumber(previous.sessions)} sessions · ${formatNumber(previous.registrations)} inscriptions · ${formatNumber(previous.hotels)} hôtels · ${formatPercent(previous.cancellationRate)} d’annulation`,
  )

  if (analytics.formations.length > 0) {
    lines.push('', 'FORMATIONS PAR INSCRIPTIONS ACTIVES')
    analytics.formations.slice(0, 5).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.name} — ${formatNumber(item.registrations)} inscrits · ${formatNumber(item.sessions)} session${item.sessions !== 1 ? 's' : ''}`)
    })
  }
  if (analytics.languages.length > 0) {
    lines.push('', 'LANGUES')
    analytics.languages.forEach(item => lines.push(`${item.name} — ${formatNumber(item.sessions)} sessions · ${formatNumber(item.registrations)} inscrits`))
  }
  if (analytics.trainers.length > 0) {
    lines.push('', 'CHARGE ANIMATEURS')
    analytics.trainers.slice(0, 5).forEach(item => {
      lines.push(`${item.name} — ${formatNumber(item.sessions)} sessions · ${formatNumber(item.durationHours, 1)} h · ${formatNumber(item.registrations)} inscrits`)
    })
  }
  if (analytics.hotelsRanking.length > 0) {
    lines.push('', 'HÔTELS LES PLUS REPRÉSENTÉS')
    analytics.hotelsRanking.slice(0, 5).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.name} — ${formatNumber(item.registrations)} inscrits · ${formatNumber(item.sessions)} session${item.sessions !== 1 ? 's' : ''}`)
    })
  }
  if (analytics.monthly.length > 0) {
    lines.push('', 'TENDANCE MENSUELLE')
    analytics.monthly.forEach(item => lines.push(`${item.label} — ${formatNumber(item.sessions)} sessions · ${formatNumber(item.registrations)} inscrits`))
  }
  return lines.join('\n')
}

function rangeForMonths(months: number, toIso: string): DateRange {
  const to = parseIsoDay(toIso) ?? new Date()
  const targetMonth = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - months, 1))
  const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate()
  const from = new Date(Date.UTC(
    targetMonth.getUTCFullYear(),
    targetMonth.getUTCMonth(),
    Math.min(to.getUTCDate(), lastDay),
  ))
  return { from: isoDay(from), to: isoDay(to) }
}

function previousPeriod(range: DateRange): DateRange {
  const from = parseIsoDay(range.from)
  const to = parseIsoDay(range.to)
  if (!from || !to || from > to) return range
  const days = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1
  const previousTo = new Date(from.getTime() - DAY_MS)
  const previousFrom = new Date(previousTo.getTime() - (days - 1) * DAY_MS)
  return { from: isoDay(previousFrom), to: isoDay(previousTo) }
}

function validateRange(range: DateRange, today: string): string | null {
  if (!parseIsoDay(range.from) || !parseIsoDay(range.to)) return 'Sélectionnez une date de début et une date de fin valides.'
  if (range.from > range.to) return 'La date de début doit précéder la date de fin.'
  if (range.to > today) return 'La période analytique ne peut pas se terminer dans le futur.'
  return null
}

function isWithinRange(session: AnalyticsSession, range: DateRange): boolean {
  const day = sessionDay(session)
  return day >= range.from && day <= range.to
}

function isPastSession(session: AnalyticsSession, now: number): boolean {
  if (session.status === 'completed') return true
  const timestamp = Date.parse(session.datetime)
  return Number.isFinite(timestamp) && timestamp <= now
}

function sessionDay(session: AnalyticsSession): string {
  const prefix = session.datetime.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  if (prefix) return prefix
  const timestamp = Date.parse(session.datetime)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : ''
}

function sessionTheme(session: AnalyticsSession): string {
  return cleanText(session.theme) || cleanText(session.title) || 'Sans thème'
}

function sessionTrainer(session: AnalyticsSession): string {
  return cleanText(session.calendar) || 'Non attribué'
}

function cleanText(value: string | null | undefined): string {
  return value?.replace(/\u0000/g, '').trim().replace(/\s+/g, ' ') ?? ''
}

function normalizeKey(value: string): string {
  return value.toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function safeCount(value: number | null | undefined): number {
  const count = Number(value)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort(localeSort)
}

function localeSort(a: string, b: string): number {
  return a.localeCompare(b, 'fr', { sensitivity: 'base' })
}

function parseIsoDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function localIsoDay(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatRange(range: DateRange): string {
  const from = parseIsoDay(range.from)
  const to = parseIsoDay(range.to)
  if (!from || !to) return 'Période invalide'
  const formatter = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
  return `${formatter.format(from)} – ${formatter.format(to)}`
}

function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits }).format(value)
}

function formatPercent(value: number): string {
  return `${formatNumber(value, 1)} %`
}

function truncateLabel(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
