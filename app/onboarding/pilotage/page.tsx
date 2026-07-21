'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertCircle, Check, Clipboard, RefreshCw, RotateCcw, Search, TriangleAlert } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { OnboardingProject, ProjectStatus } from '@/lib/zoho/projectsClient'
import { formatDate } from '@/lib/utils/dates'
import { IMPLEMENTATION_GROUP, isExcludedOnboardingOwner, resolveOwnerName } from '@/lib/onboarding/constants'
import { CAPACITY_THRESHOLD, isActiveProject } from '@/lib/onboarding/workload'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useLocale } from '@/lib/i18n/LocaleContext'
import { translate } from '@/lib/i18n/translate'
import type { Locale } from '@/lib/i18n/locale'

const DAY_MS = 86_400_000
const BRAND = '#59319f'
const SUCCESS = '#1D9E75'
const MUTED = '#696969'
const GRID = '#e2e2e2'
const TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: `1px solid ${GRID}`,
  borderRadius: 10,
  boxShadow: '0 8px 24px rgba(36,25,55,0.12)',
  fontSize: 12,
}

const STATUS_CONFIG: Array<{ status: ProjectStatus; label: string; color: string }> = [
  { status: 'not_started', label: 'Non démarré', color: '#8a8a8a' },
  { status: 'in_progress', label: 'En cours', color: '#3b72d1' },
  { status: 'pending_client', label: 'En attente client', color: '#d58b28' },
  { status: 'live', label: 'Live', color: '#1D9E75' },
  { status: 'blocked', label: 'Bloqué', color: '#d64545' },
  { status: 'standby', label: 'Standby', color: '#8B5DB3' },
  { status: 'other', label: 'Autre', color: '#b9b9b9' },
]

const PRODUCT_COLORS = ['#59319f', '#3b72d1', '#1D9E75', '#d58b28', '#8c5bdb', '#447a76']
const OWNER_COLORS = ['#59319f', '#3b72d1', '#1D9E75', '#d58b28', '#c2410c', '#8c5bdb', '#447a76', '#b7221b']

function plural(value: number, singular: string, pluralForm = `${singular}s`): string {
  return value === 1 ? singular : pluralForm
}

function countLabel(value: number, locale: Locale, fr: string, en: string): string {
  return `${value} ${locale === 'en' ? plural(value, en) : plural(value, fr)}`
}

type DatePreset = 'all' | 'prev_month' | 'curr_month' | 'rolling_3m' | 'last_6m' | 'custom'
type AttentionFilter = 'all' | 'attention' | 'blocked' | 'overdue' | 'high_risk'
type ComparisonTone = 'positive' | 'negative' | 'neutral' | 'muted'

interface DateRange {
  from: string
  to: string
}

interface SatisfactionRow {
  zoho_id: string
  establishment: string
  respondent_name: string
  owner: string
  score_global: number
  score_onboarding: number
  score_simplicity: number
  score_tool: number
  score_training: number
  comment: string | null
  submitted_at: string
}

interface ComparisonDisplay {
  text: string
  tone: ComparisonTone
}

interface MonthlyDatum {
  month: string
  label: string
  starts: number
  goLives: number
}

const DATE_PRESETS: Array<{ value: Exclude<DatePreset, 'custom'>; label: string }> = [
  { value: 'all', label: 'Tous les projets' },
  { value: 'curr_month', label: 'Mois en cours' },
  { value: 'prev_month', label: 'Mois précédent' },
  { value: 'rolling_3m', label: '3 mois glissants' },
  { value: 'last_6m', label: '6 derniers mois' },
]

const ATTENTION_OPTIONS: Array<{ value: AttentionFilter; label: string }> = [
  { value: 'all', label: 'Tous les niveaux' },
  { value: 'attention', label: 'À surveiller' },
  { value: 'blocked', label: 'Bloqués' },
  { value: 'overdue', label: 'En retard' },
  { value: 'high_risk', label: 'Risque élevé' },
]

export default function OnboardingPilotagePage() {
  const { locale, t } = useLocale()
  const today = useMemo(() => isoDay(new Date()), [])
  const { user: currentUser, loading: currentUserLoading } = useCurrentUser()
  const [projects, setProjects] = useState<OnboardingProject[]>([])
  const [satisfaction, setSatisfaction] = useState<SatisfactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [satisfactionLoading, setSatisfactionLoading] = useState(true)
  const [satisfactionError, setSatisfactionError] = useState<string | null>(null)
  const [satisfactionConfigured, setSatisfactionConfigured] = useState<boolean | null>(null)
  const [satisfactionTableAvailable, setSatisfactionTableAvailable] = useState<boolean | null>(null)
  const [satisfactionSyncing, setSatisfactionSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const [activeOwner, setActiveOwner] = useState('Tous')
  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch('/api/zoho/projects', { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<{ projects?: OnboardingProject[] }>
      })
      .then(data => setProjects(data.projects ?? []))
      .catch(fetchError => {
        if (isAbortError(fetchError)) return
        console.error(fetchError)
        setError(t('Impossible de charger les projets Zoho.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [retryKey, t])

  useEffect(() => {
    const controller = new AbortController()
    setSatisfactionLoading(true)
    setSatisfactionError(null)

    fetch('/api/onboarding/satisfaction', { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<{ data?: SatisfactionRow[]; configured?: boolean; tableAvailable?: boolean }>
      })
      .then(({ data, configured, tableAvailable }) => {
        setSatisfaction(data ?? [])
        setSatisfactionConfigured(configured ?? null)
        setSatisfactionTableAvailable(tableAvailable ?? null)
      })
      .catch(fetchError => {
        if (isAbortError(fetchError)) return
        setSatisfactionError(t('Les réponses de satisfaction sont indisponibles.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setSatisfactionLoading(false)
      })

    return () => controller.abort()
  }, [t])

  const baseProjects = useMemo(
    () => projects.filter(project => !isExcludedOnboardingOwner(project.ownerShort)),
    [projects],
  )
  const availableOwners = useMemo(
    () => [...new Set(baseProjects.map(project => project.ownerShort).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')),
    [baseProjects],
  )
  const availableProducts = useMemo(
    () => [...new Set(baseProjects.map(project => project.product || 'Autre'))].sort((a, b) => a.localeCompare(b, 'fr')),
    [baseProjects],
  )
  const dateRange = useMemo(
    () => computeDateRange(datePreset, customFrom, customTo),
    [customFrom, customTo, datePreset],
  )
  const eventRange = useMemo(() => {
    if (!dateRange || dateRange.from > today) return null
    return { from: dateRange.from, to: dateRange.to > today ? today : dateRange.to }
  }, [dateRange, today])
  const rangeError = datePreset === 'custom' ? validateRange(dateRange, customFrom, customTo, t) : null
  const resolvedOwners = useMemo(
    () => resolveOwnerFilter(activeOwner, availableOwners),
    [activeOwner, availableOwners],
  )
  const dimensionFilteredProjects = useMemo(
    () => baseProjects.filter(project => projectMatchesFilters(project, {
      activeOwner,
      resolvedOwners,
      productFilter,
      statusFilter,
      attentionFilter,
      search,
    })),
    [activeOwner, attentionFilter, baseProjects, productFilter, resolvedOwners, search, statusFilter],
  )
  const filteredProjects = useMemo(
    () => filterByDateRange(dimensionFilteredProjects, dateRange),
    [dateRange, dimensionFilteredProjects],
  )
  const filteredSatisfaction = useMemo(
    () => filterSatisfaction(satisfaction, { activeOwner, resolvedOwners, dateRange, search }),
    [activeOwner, dateRange, resolvedOwners, satisfaction, search],
  )

  const activeProjects = useMemo(() => filteredProjects.filter(isActiveProject), [filteredProjects])
  const attentionProjects = useMemo(() => filteredProjects.filter(isAttentionProject), [filteredProjects])
  const blockedCount = useMemo(() => filteredProjects.filter(project => project.isBlocked).length, [filteredProjects])
  const overdueCount = useMemo(() => filteredProjects.filter(project => project.isOverdue).length, [filteredProjects])
  const highRiskCount = useMemo(
    () => filteredProjects.filter(project => project.riskLevel === 'high' || project.riskLevel === 'critical').length,
    [filteredProjects],
  )
  const uniqueAccounts = useMemo(
    () => new Set(filteredProjects.map(project => project.hotelName.trim()).filter(Boolean)).size,
    [filteredProjects],
  )

  const currentLiveCohort = useMemo(
    () => dateRange && !eventRange ? [] : getLiveCohort(dimensionFilteredProjects, eventRange),
    [dateRange, dimensionFilteredProjects, eventRange],
  )
  const currentTtvSamples = useMemo(() => getTtvSamples(currentLiveCohort), [currentLiveCohort])
  const averageTtv = average(currentTtvSamples)
  const previousRange = useMemo(() => eventRange ? previousPeriod(eventRange) : null, [eventRange])
  const previousLiveCohort = useMemo(
    () => getLiveCohort(dimensionFilteredProjects, previousRange),
    [dimensionFilteredProjects, previousRange],
  )
  const previousAverageTtv = average(getTtvSamples(previousLiveCohort))
  const goLiveComparison = compareCount(currentLiveCohort.length, previousLiveCohort.length, Boolean(previousRange), locale)
  const ttvComparison = compareDuration(averageTtv, previousAverageTtv, Boolean(previousRange), locale)

  const perPerson = useMemo(
    () => buildPerPerson(filteredProjects, dimensionFilteredProjects, filteredSatisfaction, dateRange, eventRange),
    [dateRange, dimensionFilteredProjects, eventRange, filteredProjects, filteredSatisfaction],
  )
  const overloaded = perPerson.filter(person => person.chargePct > 100).length
  const perStatus = useMemo(() => buildStatusData(filteredProjects), [filteredProjects])
  const perProduct = useMemo(() => buildBreakdown(filteredProjects.map(project => project.product || 'Autre')), [filteredProjects])
  const perTypology = useMemo(() => buildBreakdown(filteredProjects.map(project => project.clientType || 'Non renseigné')), [filteredProjects])
  const typologyCoverage = useMemo(
    () => filteredProjects.filter(project => Boolean(project.clientType?.trim())).length,
    [filteredProjects],
  )
  const perLanguage = useMemo(() => buildBreakdown(filteredProjects.map(project => project.implementationLanguage || 'Non renseignée')), [filteredProjects])
  const chartRange = useMemo(() => dateRange ?? rollingMonthRange(12), [dateRange])
  const monthly = useMemo(() => buildMonthlyData(dimensionFilteredProjects, chartRange, locale), [chartRange, dimensionFilteredProjects, locale])
  const workloadTrend = useMemo(() => buildWorkloadTrend(dimensionFilteredProjects, chartRange, locale), [chartRange, dimensionFilteredProjects, locale])
  const hasActiveFilters = activeOwner !== 'Tous' || datePreset !== 'all' || Boolean(productFilter || statusFilter || search) || attentionFilter !== 'all'
  const nonSatisfactionFiltersActive = Boolean(productFilter || statusFilter) || attentionFilter !== 'all'
  const canSyncSatisfaction = currentUser?.role === 'admin' || currentUser?.role === 'onboarder'

  async function handleSync() {
    if (!canSyncSatisfaction || satisfactionConfigured === false || satisfactionTableAvailable === false) return
    setSatisfactionSyncing(true)
    setSatisfactionError(null)
    setSyncMessage(null)
    try {
      const response = await fetch('/api/integrations/zoho/satisfaction-sync', { method: 'POST' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const refreshed = await fetch('/api/onboarding/satisfaction')
      if (!refreshed.ok) throw new Error(`HTTP ${refreshed.status}`)
      const { data, configured, tableAvailable } = await refreshed.json() as { data?: SatisfactionRow[]; configured?: boolean; tableAvailable?: boolean }
      setSatisfaction(data ?? [])
      setSatisfactionConfigured(configured ?? null)
      setSatisfactionTableAvailable(tableAvailable ?? null)
      setSyncMessage(t('Satisfaction mise à jour.'))
    } catch {
      setSatisfactionError(t('La synchronisation de satisfaction a échoué. Réessayez.'))
    } finally {
      setSatisfactionSyncing(false)
    }
  }

  function resetFilters() {
    setActiveOwner('Tous')
    setDatePreset('all')
    setCustomFrom('')
    setCustomTo('')
    setProductFilter('')
    setStatusFilter('')
    setAttentionFilter('all')
    setSearch('')
  }

  function enableCustomRange() {
    const fallback = rollingMonthRange(3)
    setCustomFrom(dateRange?.from ?? fallback.from)
    setCustomTo(dateRange?.to ?? fallback.to)
    setDatePreset('custom')
  }

  async function copyReport() {
    try {
      const report = buildReport({
        locale,
        range: dateRange,
        projects: filteredProjects,
        activeProjects: activeProjects.length,
        accounts: uniqueAccounts,
        blocked: blockedCount,
        overdue: overdueCount,
        highRisk: highRiskCount,
        goLives: currentLiveCohort.length,
        averageTtv,
        perPerson,
        satisfaction: averageScore(filteredSatisfaction, 'score_global'),
        satisfactionResponses: filteredSatisfaction.length,
      })
      await navigator.clipboard.writeText(report)
      setCopyStatus('success')
    } catch {
      setCopyStatus('error')
    }
    window.setTimeout(() => setCopyStatus('idle'), 2_000)
  }

  return (
    <main className="min-h-screen" style={{ backgroundColor: 'var(--bg-canvas)', color: 'var(--fg1)' }} aria-busy={loading}>
      <header className="border-b border-[#e2e2e2] bg-white px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-[#1a1a1a]">{t('Pilotage onboarding')}</h1>
            <p className="mt-1 text-sm text-[#696969]">
              {dateRange ? `${formatRange(dateRange, locale)} · ${t('projets dont le planning chevauche la période')}` : t('Vue opérationnelle de tous les projets')}
            </p>
          </div>
          <button
            type="button"
            onClick={copyReport}
            disabled={loading || Boolean(error)}
            className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-[#59319f] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#3f2175] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8064b3] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copyStatus === 'success' ? <Check aria-hidden="true" size={16} /> : <Clipboard aria-hidden="true" size={16} />}
            {copyStatus === 'success' ? t('Rapport copié') : copyStatus === 'error' ? t('Copie impossible') : t('Copier le rapport')}
          </button>
        </div>
        <p className="sr-only" aria-live="polite">
          {copyStatus === 'success' ? t('Le rapport a été copié.') : copyStatus === 'error' ? t('Le rapport n’a pas pu être copié.') : ''}
        </p>
      </header>

      <section className="sticky top-0 z-20 border-b border-[#e2e2e2] bg-white/95 px-4 py-4 shadow-[0_2px_4px_rgba(0,0,0,0.05)] backdrop-blur sm:px-6 lg:px-8" aria-label={t('Filtres du pilotage onboarding')}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <FilterLabel>{t('Périmètre planning')}</FilterLabel>
              <div className="flex flex-wrap gap-1 rounded-lg bg-[#f7f7f7] p-1" role="group" aria-label={t('Choisir la période')}>
                {DATE_PRESETS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={datePreset === option.value}
                    onClick={() => setDatePreset(option.value)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8064b3] ${datePreset === option.value ? 'bg-white text-[#59319f] shadow-sm' : 'text-[#696969] hover:text-[#1a1a1a]'}`}
                  >
                    {t(option.label)}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={datePreset === 'custom'}
                  onClick={enableCustomRange}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8064b3] ${datePreset === 'custom' ? 'bg-white text-[#59319f] shadow-sm' : 'text-[#696969] hover:text-[#1a1a1a]'}`}
                >
                  {t('Plage personnalisée')}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <SelectFilter id="onboarding-owner" label={t('Chargé de projet')} value={activeOwner} onChange={setActiveOwner} options={['Tous', 'Implémentation', ...availableOwners]} optionLabel={value => t(value)} />
              <SelectFilter id="onboarding-product" label={t('Produit')} value={productFilter} onChange={setProductFilter} options={availableProducts} allLabel={t('Tous les produits')} />
              <SelectFilter id="onboarding-status" label={t('Statut')} value={statusFilter} onChange={setStatusFilter} options={STATUS_CONFIG.map(status => status.status)} optionLabel={value => t(statusLabel(value))} allLabel={t('Tous les statuts')} />
              <SelectFilter id="onboarding-attention" label={t('Signal')} value={attentionFilter} onChange={value => setAttentionFilter(value as AttentionFilter)} options={ATTENTION_OPTIONS.map(option => option.value)} optionLabel={value => t(ATTENTION_OPTIONS.find(option => option.value === value)?.label ?? value)} />
            </div>
          </div>

          {datePreset === 'custom' && (
            <div className="grid max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="text-xs font-medium text-[#696969]" htmlFor="onboarding-range-from">
                {t('Du')}
                <input id="onboarding-range-from" type="date" value={customFrom} max={customTo || undefined} onChange={event => setCustomFrom(event.target.value)} className="mt-1 block w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-xs text-[#1a1a1a] outline-none focus:border-[#8064b3] focus:ring-1 focus:ring-[#8064b3]" />
              </label>
              <label className="text-xs font-medium text-[#696969]" htmlFor="onboarding-range-to">
                {t('Au')}
                <input id="onboarding-range-to" type="date" value={customTo} min={customFrom || undefined} onChange={event => setCustomTo(event.target.value)} className="mt-1 block w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-xs text-[#1a1a1a] outline-none focus:border-[#8064b3] focus:ring-1 focus:ring-[#8064b3]" />
              </label>
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-[#eeeeee] pt-3 sm:flex-row sm:items-center">
            <label className="relative block min-w-0 flex-1 sm:max-w-md" htmlFor="onboarding-search">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8a8a8a]" size={15} />
              <span className="sr-only">{t('Rechercher un projet')}</span>
              <input id="onboarding-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={t('Hôtel, projet, PMS, CSM…')} className="w-full rounded-lg border border-[#d8d8d8] bg-white py-2 pl-9 pr-3 text-sm text-[#1a1a1a] outline-none placeholder:text-[#9a9a9a] focus:border-[#8064b3] focus:ring-1 focus:ring-[#8064b3]" />
            </label>
            {hasActiveFilters && (
              <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1.5 self-start px-1 py-2 text-xs font-semibold text-[#59319f] hover:text-[#3f2175] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8064b3] sm:ml-auto">
                <RotateCcw aria-hidden="true" size={13} /> {t('Réinitialiser les filtres')}
              </button>
            )}
          </div>
          {rangeError && <p role="alert" className="text-xs font-medium text-[#b7221b]">{rangeError}</p>}
        </div>
      </section>

      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {loading ? (
          <DashboardSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={() => setRetryKey(value => value + 1)} />
        ) : rangeError ? (
          <ErrorState message={rangeError} />
        ) : (
          <>
            <section aria-label={t('Indicateurs clés')} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <KpiCard label={t('Projets actifs')} value={formatNumber(activeProjects.length, locale)} subtitle={t('Hors Live et Autre · Standby reste distinct')} />
              <KpiCard label={t('Comptes uniques')} value={formatNumber(uniqueAccounts, locale)} subtitle={countLabel(filteredProjects.length, locale, 'projet', 'project') + ' ' + t('dans le périmètre')} />
              <KpiCard label={t('À surveiller')} value={formatNumber(attentionProjects.length, locale)} subtitle={`${countLabel(blockedCount, locale, 'bloqué', 'blocked')} · ${overdueCount} ${t('en retard')} · ${highRiskCount} ${t('risque élevé')}`} accent={attentionProjects.length > 0 ? 'text-[#b7221b]' : undefined} />
              <KpiCard label={t('TTV moyen réel')} value={formatDuration(averageTtv, locale)} subtitle={`${t('Sur')} ${countLabel(currentTtvSamples.length, locale, 'projet', 'project')} ${t('avec démarrage et live réels')}`} comparison={ttvComparison} />
              <KpiCard label={t(dateRange ? 'Go-lives période' : 'Go-lives renseignés')} value={formatNumber(currentLiveCohort.length, locale)} subtitle={t(dateRange ? 'Champ Live date dans la période' : 'Projets avec une Live date Zoho')} comparison={goLiveComparison} accent="text-[#1c6437]" />
            </section>

            {attentionProjects.length > 0 && (
              <aside className="flex flex-col gap-3 rounded-xl border border-[#ead7a6] bg-[#fff9e8] p-4 sm:flex-row sm:items-center sm:justify-between" aria-label={t('Points d’attention')}>
                <div className="flex items-start gap-3">
                  <TriangleAlert aria-hidden="true" className="mt-0.5 shrink-0 text-[#9a6710]" size={18} />
                  <div>
                    <p className="text-sm font-semibold text-[#754b08]">
                      {locale === 'en'
                        ? `${attentionProjects.length} project${attentionProjects.length !== 1 ? 's' : ''} need${attentionProjects.length === 1 ? 's' : ''} attention`
                        : `${attentionProjects.length} projet${attentionProjects.length !== 1 ? 's' : ''} demande${attentionProjects.length === 1 ? '' : 'nt'} une attention`}
                    </p>
                    <p className="mt-0.5 text-xs text-[#8b6a24]">{t('Un projet n’est compté qu’une fois, même s’il cumule blocage, retard et risque élevé.')}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setAttentionFilter('attention')} className="self-start rounded-lg border border-[#d7b76d] bg-white px-3 py-2 text-xs font-semibold text-[#754b08] hover:bg-[#fffdf7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d7b76d]">
                  {t('Afficher uniquement ces projets')}
                </button>
              </aside>
            )}

            {filteredProjects.length === 0 ? (
              <EmptyDashboard onReset={resetFilters} />
            ) : (
              <>
                <section className="grid grid-cols-1 gap-5 xl:grid-cols-2" aria-label={t('Visualisations onboarding')}>
                  <ChartCard title={t('Cadence onboarding')} subtitle={`${t('Démarrages planifiés et go-lives réels (Live date)')} · ${formatRange(chartRange, locale)}`} wide>
                    {monthly.every(month => month.starts === 0 && month.goLives === 0) ? <EmptyChart /> : (
                      <div className="h-full overflow-x-auto" role="img" aria-label={t('Évolution mensuelle des démarrages et go-lives')}>
                        <div className="h-full" style={{ minWidth: Math.max(620, monthly.length * 72) }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={monthly} margin={{ top: 16, right: 16, left: -8, bottom: 12 }}>
                              <CartesianGrid stroke="#ece8f0" strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value, name) => [formatNumber(Number(value), locale), t(String(name))]} />
                              <Legend wrapperStyle={{ fontSize: 11 }} />
                              <Bar dataKey="starts" name={t('Démarrages')} fill={BRAND} radius={[5, 5, 0, 0]} maxBarSize={38} />
                              <Line type="monotone" dataKey="goLives" name="Go-lives" stroke={SUCCESS} strokeWidth={2.5} dot={{ r: 3, fill: SUCCESS }} activeDot={{ r: 5 }} />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </ChartCard>

                  <ChartCard title={t('Répartition par statut')} subtitle={t('Statuts Zoho conservés séparément')}>
                    <StatusChart data={perStatus} />
                  </ChartCard>

                  <ChartCard title={t('Répartition par produit')} subtitle={t('Nombre de projets dans le périmètre')}>
                    <ProductChart data={perProduct} />
                  </ChartCard>
                </section>

                <WorkloadSection rows={perPerson} overloaded={overloaded} />

                <ChartCard title={t('Évolution de la charge')} subtitle={`${t('Estimation à partir des dates Zoho (démarrage / mise en ligne), pas un relevé quotidien exact.')} · ${formatRange(chartRange, locale)}`} wide>
                  {workloadTrend.data.length === 0 || workloadTrend.owners.length === 0 ? <EmptyChart /> : (
                    <div className="h-full overflow-x-auto" role="img" aria-label={t('Évolution de la charge par chargé de projet')}>
                      <div className="h-full" style={{ minWidth: Math.max(620, workloadTrend.data.length * 72) }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={workloadTrend.data} margin={{ top: 16, right: 16, left: -8, bottom: 12 }}>
                            <CartesianGrid stroke="#ece8f0" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                            <YAxis domain={[0, 200]} tickFormatter={value => `${value}%`} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value, name) => [`${value}%`, name]} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <ReferenceLine y={80} stroke="#d58b28" strokeDasharray="4 4" label={{ value: '80%', fontSize: 10, fill: '#84550e', position: 'insideTopRight' }} />
                            <ReferenceLine y={100} stroke="#b7221b" strokeDasharray="4 4" label={{ value: '100%', fontSize: 10, fill: '#b7221b', position: 'insideTopRight' }} />
                            {workloadTrend.owners.map((owner, index) => (
                              <Line key={owner} type="monotone" dataKey={owner} name={owner} stroke={OWNER_COLORS[index % OWNER_COLORS.length]} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </ChartCard>

                <section className="grid grid-cols-1 gap-5 lg:grid-cols-2" aria-label={t('Caractéristiques des projets')}>
                  {typologyCoverage > 0
                    ? <BreakdownCard title={t('Typologie client')} data={perTypology} />
                    : <UnavailableDimensionCard title={t('Typologie client')} message={t('Le champ de typologie n’est renseigné sur aucun projet Zoho de ce périmètre. Ce graphique sera disponible dès que la source sera configurée.')} />}
                  <BreakdownCard title={t('Langue d’implémentation')} data={perLanguage} />
                </section>
              </>
            )}

            <SatisfactionSection
              data={filteredSatisfaction}
              loading={satisfactionLoading}
              error={satisfactionError}
              configured={satisfactionConfigured}
              tableAvailable={satisfactionTableAvailable}
              syncing={satisfactionSyncing}
              syncMessage={syncMessage}
              filterLabel={satisfactionFilterLabel(activeOwner, dateRange, search, locale)}
              partialFilters={nonSatisfactionFiltersActive}
              canSync={canSyncSatisfaction}
              authLoading={currentUserLoading}
              onSync={handleSync}
            />
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
  accent,
}: {
  label: string
  value: string
  subtitle: string
  comparison?: ComparisonDisplay
  accent?: string
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
      <p className={`mt-2 truncate text-3xl font-bold tracking-tight ${accent ?? 'text-[#1a1a1a]'}`}>{value}</p>
      <p className="mt-2 min-h-8 text-xs leading-4 text-[#8a8a8a]">{subtitle}</p>
      {comparison && <p className={`mt-2 text-[11px] font-semibold ${toneClass[comparison.tone]}`}>{comparison.text}</p>}
    </article>
  )
}

function ChartCard({ title, subtitle, wide = false, children }: { title: string; subtitle: string; wide?: boolean; children: ReactNode }) {
  return (
    <article className={`rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-[0_4px_10px_rgba(36,25,55,0.05)] sm:p-5 ${wide ? 'xl:col-span-2' : ''}`}>
      <div className="mb-4 min-h-11">
        <h2 className="text-sm font-bold text-[#1a1a1a]">{title}</h2>
        <p className="mt-0.5 text-xs text-[#8a8a8a]">{subtitle}</p>
      </div>
      <div className="h-[320px] w-full">{children}</div>
    </article>
  )
}

function StatusChart({ data }: { data: Array<{ status: ProjectStatus; label: string; value: number; color: string }> }) {
  const { locale, t } = useLocale()
  const nonEmpty = data.filter(item => item.value > 0)
  const total = nonEmpty.reduce((sum, item) => sum + item.value, 0)
  if (nonEmpty.length === 0) return <EmptyChart />

  return (
    <div className="grid h-full grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
      <div className="h-[210px] sm:h-full" role="img" aria-label={t('Diagramme circulaire des projets par statut')}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={nonEmpty} dataKey="value" nameKey="label" innerRadius="45%" outerRadius="72%" paddingAngle={2} stroke="#fff" strokeWidth={2}>
              {nonEmpty.map(item => <Cell key={item.status} fill={item.color} />)}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value, name) => [`${formatNumber(Number(value), locale)} · ${total > 0 ? Math.round((Number(value) / total) * 100) : 0} %`, t(String(name))]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2" role="list" aria-label={t('Détail par statut')}>
        {data.map(item => (
          <div key={item.status} className="flex items-center justify-between gap-3 text-xs" role="listitem">
            <span className="flex min-w-0 items-center gap-2 text-[#4a4a4a]"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /><span className="truncate">{t(item.label)}</span></span>
            <span className="font-bold tabular-nums text-[#1a1a1a]">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProductChart({ data }: { data: Array<{ name: string; value: number }> }) {
  const { locale, t } = useLocale()
  if (data.length === 0) return <EmptyChart />
  const shown = data.slice(0, 8)

  return (
    <div className="h-full overflow-x-auto" role="img" aria-label={t('Barres des projets par produit')}>
      <div className="h-full min-w-[520px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={shown} layout="vertical" margin={{ top: 4, right: 20, left: 12, bottom: 4 }} barCategoryGap="28%">
            <CartesianGrid stroke="#ece8f0" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" width={130} tickFormatter={value => truncateLabel(String(value), 20)} tick={{ fontSize: 11, fill: '#4a4a4a' }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={value => [formatNumber(Number(value), locale), t('Projets')]} />
            <Bar dataKey="value" name={t('Projets')} radius={[0, 5, 5, 0]} maxBarSize={24}>
              {shown.map((item, index) => <Cell key={item.name} fill={PRODUCT_COLORS[index % PRODUCT_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

interface PersonRow {
  owner: string
  active: number
  accounts: number
  attention: number
  goLives: number
  averageTtv: number | null
  chargePct: number
  satisfaction: number | null
  satisfactionResponses: number
}

function WorkloadSection({ rows, overloaded }: { rows: PersonRow[]; overloaded: number }) {
  const { locale, t } = useLocale()
  const headings = locale === 'en'
    ? ['Person', 'Active', 'Accounts', 'To watch', 'Go-lives', 'Avg TTV', 'Satisfaction', 'Workload']
    : ['Personne', 'Actifs', 'Comptes', 'À surveiller', 'Go-lives', 'TTV moyen', 'Satisfaction', 'Charge']
  return (
    <section className="overflow-hidden rounded-xl border border-[#e2e2e2] bg-white shadow-[0_4px_10px_rgba(36,25,55,0.05)]" aria-labelledby="workload-title">
      <div className="flex flex-col gap-1 border-b border-[#e2e2e2] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 id="workload-title" className="text-sm font-bold text-[#1a1a1a]">{t('Charge par chargé de projet')}</h2>
          <p className="mt-0.5 text-xs text-[#8a8a8a]">{CAPACITY_THRESHOLD} {t('projets actifs = 100 % de capacité indicative')}</p>
        </div>
        {overloaded > 0 && <span className="mt-2 self-start rounded-full bg-[#fee3e2] px-2.5 py-1 text-xs font-semibold text-[#b7221b] sm:mt-0">{overloaded} {t('en surcharge')}</span>}
      </div>

      {rows.length === 0 ? <div className="p-8 text-center text-sm text-[#696969]">{t('Aucun chargé de projet dans ce périmètre.')}</div> : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="border-b border-[#e2e2e2] bg-[#f7f7f7]">
                <tr>
                  {headings.map((heading, index) => (
                    <th
                      key={heading}
                      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#696969] ${index === 0 ? 'text-left' : 'text-center'}`}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e2e2]">
                {rows.map(row => (
                  <tr key={row.owner} className="hover:bg-[#faf9f5]">
                    <td className="px-4 py-3 font-semibold text-[#1a1a1a]">{row.owner}</td>
                    <td className="px-4 py-3 text-center font-semibold tabular-nums text-[#2b5bb7]">{row.active}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-[#4a4a4a]">{row.accounts}</td>
                    <td className={`px-4 py-3 text-center font-semibold tabular-nums ${row.attention > 0 ? 'text-[#b7221b]' : 'text-[#878787]'}`}>{row.attention}</td>
                    <td className="px-4 py-3 text-center font-semibold tabular-nums text-[#1c6437]">{row.goLives}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-[#4a4a4a]">{formatDuration(row.averageTtv, locale)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={row.satisfaction === null ? 'text-[#878787]' : scoreTextColor(row.satisfaction)}>{row.satisfaction === null ? '—' : `${row.satisfaction.toFixed(1)} / 5`}</span>
                      {row.satisfactionResponses > 0 && <span className="block text-[10px] text-[#8a8a8a]">{row.satisfactionResponses} {t('rép.')}</span>}
                    </td>
                    <td className="min-w-[170px] px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e2e2e2]"><div className={`h-full rounded-full ${chargeBarColor(row.chargePct)}`} style={{ width: `${Math.min(row.chargePct, 100)}%` }} /></div>
                        <span className={`w-10 text-right text-xs font-bold tabular-nums ${chargeTextColor(row.chargePct)}`}>{row.chargePct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-[#e2e2e2] md:hidden">
            {rows.map(row => (
              <article key={row.owner} className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-[#1a1a1a]">{row.owner}</h3>
                  <span className={`text-sm font-bold tabular-nums ${chargeTextColor(row.chargePct)}`}>{row.chargePct} %</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#e2e2e2]"><div className={`h-full rounded-full ${chargeBarColor(row.chargePct)}`} style={{ width: `${Math.min(row.chargePct, 100)}%` }} /></div>
                <dl className="grid grid-cols-3 gap-3 text-center">
                  <PersonMetric label={t('Actifs')} value={row.active} />
                  <PersonMetric label={t('À surveiller')} value={row.attention} alert={row.attention > 0} />
                  <PersonMetric label="Go-lives" value={row.goLives} success />
                  <PersonMetric label={t('Comptes')} value={row.accounts} />
                  <PersonMetric label="TTV" value={formatDuration(row.averageTtv, locale)} />
                  <PersonMetric label={t('Satisfaction')} value={row.satisfaction === null ? '—' : row.satisfaction.toFixed(1)} />
                </dl>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function PersonMetric({ label, value, alert = false, success = false }: { label: string; value: string | number; alert?: boolean; success?: boolean }) {
  return (
    <div className="rounded-lg bg-[#f7f7f7] p-2">
      <dt className="text-[10px] uppercase tracking-wide text-[#8a8a8a]">{label}</dt>
      <dd className={`mt-1 text-sm font-bold tabular-nums ${alert ? 'text-[#b7221b]' : success ? 'text-[#1c6437]' : 'text-[#1a1a1a]'}`}>{value}</dd>
    </div>
  )
}

function BreakdownCard({ title, data }: { title: string; data: Array<{ name: string; value: number }> }) {
  const { t } = useLocale()
  const max = Math.max(...data.map(item => item.value), 1)
  const total = data.reduce((sum, item) => sum + item.value, 0)
  return (
    <article className="rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-[0_4px_10px_rgba(36,25,55,0.05)] sm:p-5">
      <h2 className="text-sm font-bold text-[#1a1a1a]">{title}</h2>
      {data.length === 0 ? <div className="py-10 text-center text-sm text-[#8a8a8a]">{t('Aucune donnée')}</div> : (
        <div className="mt-4 space-y-3">
          {data.slice(0, 8).map(item => (
            <div key={item.name} className="grid grid-cols-[minmax(100px,150px)_minmax(0,1fr)_44px] items-center gap-3">
              <span className="truncate text-xs font-medium text-[#4a4a4a]" title={item.name}>{item.name}</span>
              <div className="h-2 overflow-hidden rounded-full bg-[#e8e8e8]"><div className="h-full rounded-full bg-[#8c5bdb]" style={{ width: `${(item.value / max) * 100}%` }} /></div>
              <span className="text-right text-xs tabular-nums text-[#696969]">{item.value} <span className="text-[#9a9a9a]">· {total > 0 ? Math.round((item.value / total) * 100) : 0}%</span></span>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

function UnavailableDimensionCard({ title, message }: { title: string; message: string }) {
  const { t } = useLocale()
  return (
    <article className="rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-[0_4px_10px_rgba(36,25,55,0.05)] sm:p-5">
      <h2 className="text-sm font-bold text-[#1a1a1a]">{title}</h2>
      <div className="mt-4 flex items-start gap-3 rounded-lg border border-[#ead7a6] bg-[#fff9e8] p-4">
        <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0 text-[#84550e]" size={18} />
        <div>
          <p className="text-sm font-semibold text-[#754b08]">{t('Donnée Zoho à configurer')}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b6a24]">{message}</p>
        </div>
      </div>
    </article>
  )
}

function SatisfactionSection({
  data,
  loading,
  error,
  configured,
  tableAvailable,
  syncing,
  syncMessage,
  filterLabel,
  partialFilters,
  canSync,
  authLoading,
  onSync,
}: {
  data: SatisfactionRow[]
  loading: boolean
  error: string | null
  configured: boolean | null
  tableAvailable: boolean | null
  syncing: boolean
  syncMessage: string | null
  filterLabel: string
  partialFilters: boolean
  canSync: boolean
  authLoading: boolean
  onSync: () => void
}) {
  const { locale, t } = useLocale()
  const [page, setPage] = useState(0)
  const pageSize = 10
  const scores = [
    { label: t('Global'), key: 'score_global' as const },
    { label: 'Onboarding', key: 'score_onboarding' as const },
    { label: t('Simplicité'), key: 'score_simplicity' as const },
    { label: t('Outil'), key: 'score_tool' as const },
    { label: t('Formation'), key: 'score_training' as const },
  ]
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = data.slice(safePage * pageSize, (safePage + 1) * pageSize)
  const lowScores = data.filter(row => row.score_global > 0 && row.score_global < 3.5).length

  useEffect(() => setPage(0), [data])

  return (
    <section className="overflow-hidden rounded-xl border border-[#e2e2e2] bg-white shadow-[0_4px_10px_rgba(36,25,55,0.05)]" aria-labelledby="satisfaction-title">
      <div className="flex flex-col gap-3 border-b border-[#e2e2e2] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 id="satisfaction-title" className="text-sm font-bold text-[#1a1a1a]">{t('Satisfaction client')}</h2>
          <p className="mt-0.5 text-xs text-[#8a8a8a]">
            {configured === false
              ? t('Source Zoho Forms non configurée')
              : tableAvailable === false
                ? t('Table Supabase non disponible')
                : <>{filterLabel} · {countLabel(data.length, locale, 'réponse', 'response')}{lowScores > 0 ? (locale === 'en' ? ` · ${lowScores} score${lowScores !== 1 ? 's' : ''} below 3.5 overall` : ` · ${lowScores} score${lowScores !== 1 ? 's' : ''} global${lowScores !== 1 ? 'aux' : ''} sous 3,5`) : ''}</>}
          </p>
        </div>
        <button type="button" onClick={onSync} disabled={authLoading || !canSync || syncing || configured === false || tableAvailable === false} title={!authLoading && !canSync ? t('La synchronisation est réservée aux administrateurs et onboarders.') : configured === false ? t('Zoho Forms doit être configuré avant la synchronisation.') : tableAvailable === false ? t('La table de satisfaction doit être installée avant la synchronisation.') : undefined} className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-xs font-semibold text-[#4a4a4a] hover:bg-[#f7f7f7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8064b3] disabled:cursor-not-allowed disabled:opacity-50">
          <RefreshCw aria-hidden="true" size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? t('Synchronisation…') : t('Synchroniser Zoho Forms')}
        </button>
      </div>

      {partialFilters && configured !== false && tableAvailable !== false && <div className="border-b border-[#e8dff2] bg-[#faf8fc] px-4 py-2.5 text-xs text-[#6d5684] sm:px-5">{t('Les réponses peuvent être filtrées par chargé de projet, période et recherche. Produit, statut et signal ne sont pas disponibles dans Zoho Forms.')}</div>}
      {syncMessage && <p className="border-b border-[#ccebdd] bg-[#f0fbf6] px-4 py-2.5 text-xs font-medium text-[#1c6437] sm:px-5" role="status">{syncMessage}</p>}
      {error && <p className="border-b border-[#f1b4b0] bg-[#fff1f0] px-4 py-2.5 text-xs font-medium text-[#b7221b] sm:px-5" role="alert">{error}</p>}

      {loading ? (
        <div className="space-y-4 p-5"><div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-lg bg-[#f0eef2]" />)}</div><div className="h-44 animate-pulse rounded-lg bg-[#f0eef2]" /></div>
      ) : configured === false ? (
        <div className="flex items-start gap-3 px-5 py-8" role="status">
          <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0 text-[#84550e]" size={18} />
          <div><p className="text-sm font-semibold text-[#754b08]">{t('Zoho Forms non configuré')}</p><p className="mt-1 max-w-2xl text-xs leading-5 text-[#8b6a24]">{t('Ajoutez le formulaire et le rapport Satisfaction dans la configuration Zoho pour importer les réponses. Aucune note n’est affichée tant que la source n’est pas disponible.')}</p></div>
        </div>
      ) : tableAvailable === false ? (
        <div className="flex items-start gap-3 px-5 py-8" role="status">
          <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0 text-[#84550e]" size={18} />
          <div><p className="text-sm font-semibold text-[#754b08]">{t('Stockage de satisfaction non initialisé')}</p><p className="mt-1 max-w-2xl text-xs leading-5 text-[#8b6a24]">{t('La table Supabase dédiée doit être installée avant la première synchronisation.')}</p></div>
        </div>
      ) : data.length === 0 ? (
        <div className="px-5 py-10 text-center"><p className="text-sm font-medium text-[#4a4a4a]">{t('Aucune réponse dans ce périmètre')}</p><p className="mt-1 text-xs text-[#8a8a8a]">{t('Synchronisez Zoho Forms ou élargissez les filtres.')}</p></div>
      ) : (
        <div className="space-y-5 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {scores.map(score => {
              const value = averageScore(data, score.key)
              return (
                <article key={score.key} className="rounded-lg border border-[#e6e2e9] bg-[#faf9fb] p-3 text-center sm:p-4">
                  <p className={`text-2xl font-bold tabular-nums ${value === null ? 'text-[#878787]' : scoreTextColor(value)}`}>{value === null ? '—' : value.toFixed(1)}</p>
                  <p className="mt-1 text-xs font-medium text-[#696969]">{score.label}</p>
                  <p className="mt-0.5 text-[10px] text-[#9a9a9a]">sur 5</p>
                </article>
              )
            })}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[920px] text-xs">
              <thead className="border-b border-[#e2e2e2] bg-[#f7f7f7]">
                <tr>
                  {(locale === 'en'
                    ? ['Property', 'Respondent', 'Owner', 'Global', 'Onboarding', 'Simplicity', 'Tool', 'Training', 'Comment', 'Date']
                    : ['Établissement', 'Répondant', 'Owner', 'Global', 'Onboarding', 'Simplicité', 'Outil', 'Formation', 'Commentaire', 'Date']
                  ).map(heading => <th key={heading} className="whitespace-nowrap px-3 py-2 text-left font-semibold uppercase tracking-wide text-[#696969]">{heading}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e2e2]">
                {pageRows.map(row => (
                  <tr key={row.zoho_id} className="hover:bg-[#faf9f5]">
                    <td className="max-w-[160px] truncate px-3 py-2.5 font-medium text-[#1f1f1f]" title={row.establishment}>{row.establishment || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[#4a4a4a]">{row.respondent_name || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[#4a4a4a]">{row.owner || '—'}</td>
                    {[row.score_global, row.score_onboarding, row.score_simplicity, row.score_tool, row.score_training].map((score, index) => <td key={index} className={`px-3 py-2.5 font-semibold tabular-nums ${score > 0 ? scoreTextColor(score) : 'text-[#878787]'}`}>{score > 0 ? score.toFixed(1) : '—'}</td>)}
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-[#696969]" title={row.comment ?? ''}>{row.comment || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[#696969]">{row.submitted_at ? formatDate(row.submitted_at.slice(0, 10)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-[#e2e2e2] rounded-lg border border-[#e2e2e2] md:hidden">
            {pageRows.map(row => (
              <article key={row.zoho_id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-[#1a1a1a]">{row.establishment || t('Établissement non renseigné')}</h3><p className="mt-0.5 text-xs text-[#8a8a8a]">{row.respondent_name || t('Répondant inconnu')} · {row.owner || t('Owner inconnu')}</p></div>
                  <span className={`shrink-0 text-lg font-bold tabular-nums ${row.score_global > 0 ? scoreTextColor(row.score_global) : 'text-[#878787]'}`}>{row.score_global > 0 ? row.score_global.toFixed(1) : '—'}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 text-center">{(locale === 'en'
                  ? [['Onb.', row.score_onboarding], ['Simpl.', row.score_simplicity], ['Tool', row.score_tool], ['Train.', row.score_training]]
                  : [['Onb.', row.score_onboarding], ['Simpl.', row.score_simplicity], ['Outil', row.score_tool], ['Form.', row.score_training]]
                ).map(([label, value]) => <div key={String(label)} className="rounded bg-[#f7f7f7] p-1.5"><p className="text-[9px] uppercase text-[#8a8a8a]">{label}</p><p className="mt-0.5 text-xs font-semibold text-[#4a4a4a]">{Number(value) > 0 ? Number(value).toFixed(1) : '—'}</p></div>)}</div>
                {row.comment && <p className="rounded-lg bg-[#faf8fc] p-2.5 text-xs leading-5 text-[#5f5269]">“{row.comment}”</p>}
                <p className="text-[10px] text-[#9a9a9a]">{row.submitted_at ? formatDate(row.submitted_at.slice(0, 10)) : t('Date inconnue')}</p>
              </article>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-[#696969]">{t('Page')} {safePage + 1} / {totalPages}</span>
              <div className="flex gap-1">
                <button type="button" onClick={() => setPage(value => Math.max(0, value - 1))} disabled={safePage === 0} className="rounded-lg border border-[#e2e2e2] px-2.5 py-1.5 text-xs text-[#4a4a4a] hover:bg-[#f7f7f7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8064b3] disabled:opacity-40">‹ {t('Préc.')}</button>
                <button type="button" onClick={() => setPage(value => Math.min(totalPages - 1, value + 1))} disabled={safePage >= totalPages - 1} className="rounded-lg border border-[#e2e2e2] px-2.5 py-1.5 text-xs text-[#4a4a4a] hover:bg-[#f7f7f7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8064b3] disabled:opacity-40">{t('Suiv.')} ›</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function SelectFilter({ id, label, value, onChange, options, allLabel, optionLabel = value => value }: { id: string; label: string; value: string; onChange: (value: string) => void; options: string[]; allLabel?: string; optionLabel?: (value: string) => string }) {
  const uniqueOptions = [...new Set(options)]
  return (
    <label className="text-xs font-medium text-[#696969]" htmlFor={id}>
      {label}
      <select id={id} value={value} onChange={event => onChange(event.target.value)} className="mt-1 block w-full min-w-[150px] rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-xs text-[#1a1a1a] outline-none focus:border-[#8064b3] focus:ring-1 focus:ring-[#8064b3]">
        {allLabel && <option value="">{allLabel}</option>}
        {uniqueOptions.map(option => <option key={option} value={option}>{optionLabel(option)}</option>)}
      </select>
    </label>
  )
}

function FilterLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1 text-xs font-medium text-[#696969]">{children}</p>
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useLocale()
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-xl border border-[#f1b4b0] bg-[#fff1f0] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3"><AlertCircle aria-hidden="true" className="mt-0.5 shrink-0 text-[#b7221b]" size={18} /><div><p className="text-sm font-semibold text-[#8f211d]">{t('Données indisponibles')}</p><p className="mt-0.5 text-sm text-[#a33b36]">{message}</p></div></div>
      {onRetry && <button type="button" onClick={onRetry} className="self-start rounded-lg border border-[#d98984] bg-white px-3 py-2 text-xs font-semibold text-[#8f211d] hover:bg-[#fff8f7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d98984]">{t('Réessayer')}</button>}
    </div>
  )
}

function EmptyDashboard({ onReset }: { onReset: () => void }) {
  const { t } = useLocale()
  return (
    <div className="rounded-xl border border-[#ded8e8] bg-[#f8f5fc] px-5 py-10 text-center">
      <p className="text-sm font-semibold text-[#59319f]">{t('Aucun projet ne correspond à ces filtres.')}</p>
      <button type="button" onClick={onReset} className="mt-3 rounded-lg border border-[#cbbcdf] bg-white px-3 py-2 text-xs font-semibold text-[#59319f] hover:bg-[#fbf9fd] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8064b3]">{t('Réinitialiser les filtres')}</button>
    </div>
  )
}

function EmptyChart() {
  const { t } = useLocale()
  return <div className="flex h-full items-center justify-center text-sm text-[#8a8a8a]">{t('Aucune donnée pour ce périmètre')}</div>
}

function DashboardSkeleton() {
  const { t } = useLocale()
  return (
    <div className="space-y-6" aria-label={t('Chargement du dashboard')}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-40 animate-pulse rounded-xl bg-[#ece9ef]" />)}</div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2"><div className="h-[390px] animate-pulse rounded-xl bg-[#ece9ef] xl:col-span-2" /><div className="h-[390px] animate-pulse rounded-xl bg-[#ece9ef]" /><div className="h-[390px] animate-pulse rounded-xl bg-[#ece9ef]" /></div>
      <div className="h-72 animate-pulse rounded-xl bg-[#ece9ef]" />
    </div>
  )
}

function computeDateRange(preset: DatePreset, customFrom: string, customTo: string): DateRange | null {
  if (preset === 'all') return null
  if (preset === 'custom') return customFrom && customTo ? { from: customFrom, to: customTo } : null
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  if (preset === 'curr_month') return { from: isoDay(new Date(year, month, 1)), to: isoDay(new Date(year, month + 1, 0)) }
  if (preset === 'prev_month') return { from: isoDay(new Date(year, month - 1, 1)), to: isoDay(new Date(year, month, 0)) }
  if (preset === 'rolling_3m') return { from: isoDay(new Date(year, month - 2, 1)), to: isoDay(today) }
  return { from: isoDay(new Date(year, month - 5, 1)), to: isoDay(today) }
}

function validateRange(range: DateRange | null, customFrom: string, customTo: string, t: (text: string) => string): string | null {
  if (!customFrom || !customTo) return t('Renseignez une date de début et une date de fin.')
  if (!range || range.from > range.to) return t('La date de début doit précéder la date de fin.')
  return null
}

function previousPeriod(range: DateRange): DateRange {
  const from = parseIsoDay(range.from)
  const to = parseIsoDay(range.to)
  const duration = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1
  const previousTo = new Date(from)
  previousTo.setDate(previousTo.getDate() - 1)
  const previousFrom = new Date(previousTo)
  previousFrom.setDate(previousFrom.getDate() - duration + 1)
  return { from: isoDay(previousFrom), to: isoDay(previousTo) }
}

function rollingMonthRange(months: number): DateRange {
  const today = new Date()
  return { from: isoDay(new Date(today.getFullYear(), today.getMonth() - months + 1, 1)), to: isoDay(new Date(today.getFullYear(), today.getMonth() + 1, 0)) }
}

function filterByDateRange(projects: OnboardingProject[], range: DateRange | null): OnboardingProject[] {
  if (!range) return projects
  return projects.filter(project => {
    const start = project.startDate ?? ''
    const end = project.endDate ?? ''
    if (!start && !end) return false
    return (!start || start <= range.to) && (!end || end >= range.from)
  })
}

function projectMatchesFilters(project: OnboardingProject, filters: { activeOwner: string; resolvedOwners: string[]; productFilter: string; statusFilter: string; attentionFilter: AttentionFilter; search: string }): boolean {
  if (filters.activeOwner !== 'Tous' && !filters.resolvedOwners.includes(project.ownerShort)) return false
  if (filters.productFilter && (project.product || 'Autre') !== filters.productFilter) return false
  if (filters.statusFilter && project.status !== filters.statusFilter) return false
  if (filters.attentionFilter === 'attention' && !isAttentionProject(project)) return false
  if (filters.attentionFilter === 'blocked' && !project.isBlocked) return false
  if (filters.attentionFilter === 'overdue' && !project.isOverdue) return false
  if (filters.attentionFilter === 'high_risk' && project.riskLevel !== 'high' && project.riskLevel !== 'critical') return false
  if (filters.search) {
    const haystack = [project.name, project.hotelName, project.ownerName, project.product, project.pms, project.csmName, project.accountCRMName, project.statusLabel].filter(Boolean).join(' ').toLocaleLowerCase('fr-FR')
    if (!haystack.includes(filters.search.trim().toLocaleLowerCase('fr-FR'))) return false
  }
  return true
}

function filterSatisfaction(rows: SatisfactionRow[], filters: { activeOwner: string; resolvedOwners: string[]; dateRange: DateRange | null; search: string }): SatisfactionRow[] {
  return rows.filter(row => {
    if (filters.activeOwner !== 'Tous' && !filters.resolvedOwners.includes(row.owner)) return false
    const submittedDay = row.submitted_at?.slice(0, 10)
    if (filters.dateRange && (!submittedDay || submittedDay < filters.dateRange.from || submittedDay > filters.dateRange.to)) return false
    if (filters.search) {
      const haystack = [row.establishment, row.respondent_name, row.owner, row.comment].filter(Boolean).join(' ').toLocaleLowerCase('fr-FR')
      if (!haystack.includes(filters.search.trim().toLocaleLowerCase('fr-FR'))) return false
    }
    return true
  })
}

function resolveOwnerFilter(filter: string, availableOwners: string[]): string[] {
  if (filter === 'Tous') return availableOwners
  if (filter === 'Implémentation') return [...IMPLEMENTATION_GROUP]
  return [filter]
}

function isAttentionProject(project: OnboardingProject): boolean {
  return project.isBlocked || project.isOverdue || project.riskLevel === 'high' || project.riskLevel === 'critical'
}

function getLiveCohort(projects: OnboardingProject[], range: DateRange | null): OnboardingProject[] {
  return projects.filter(project => {
    const liveDate = getActualGoLiveDate(project)
    return Boolean(liveDate && (!range || (liveDate >= range.from && liveDate <= range.to)))
  })
}

function getTtvSamples(projects: OnboardingProject[]): number[] {
  return projects.flatMap(project => {
    const liveDate = getActualGoLiveDate(project)
    if (!project.startDate || !liveDate) return []
    const duration = daysBetween(project.startDate, liveDate)
    return duration >= 0 ? [duration] : []
  })
}

function buildPerPerson(
  planningProjects: OnboardingProject[],
  eventProjects: OnboardingProject[],
  satisfaction: SatisfactionRow[],
  planningRange: DateRange | null,
  eventRange: DateRange | null,
): PersonRow[] {
  const implementationTeam: readonly string[] = IMPLEMENTATION_GROUP
  const grouped = new Map<string, { planning: OnboardingProject[]; events: OnboardingProject[] }>()
  for (const project of planningProjects) {
    const owner = resolveOwnerName(project.ownerShort || project.ownerName)
    if (!implementationTeam.includes(owner)) continue
    const current = grouped.get(owner) ?? { planning: [], events: [] }
    current.planning.push(project)
    grouped.set(owner, current)
  }
  for (const project of eventProjects) {
    const owner = resolveOwnerName(project.ownerShort || project.ownerName)
    if (!implementationTeam.includes(owner)) continue
    const current = grouped.get(owner) ?? { planning: [], events: [] }
    current.events.push(project)
    grouped.set(owner, current)
  }
  return [...grouped.entries()].map(([owner, ownerProjects]) => {
    const active = ownerProjects.planning.filter(isActiveProject).length
    const liveCohort = planningRange && !eventRange ? [] : getLiveCohort(ownerProjects.events, eventRange)
    const ownerSatisfaction = satisfaction.filter(row => resolveOwnerName(row.owner) === owner)
    return {
      owner,
      active,
      accounts: new Set(ownerProjects.planning.map(project => project.hotelName.trim()).filter(Boolean)).size,
      attention: ownerProjects.planning.filter(isAttentionProject).length,
      goLives: liveCohort.length,
      averageTtv: average(getTtvSamples(liveCohort)),
      chargePct: Math.round((active / CAPACITY_THRESHOLD) * 100),
      satisfaction: averageScore(ownerSatisfaction, 'score_global'),
      satisfactionResponses: ownerSatisfaction.length,
    }
  }).sort((a, b) => b.active - a.active || b.attention - a.attention || a.owner.localeCompare(b.owner, 'fr'))
}

function buildStatusData(projects: OnboardingProject[]) {
  return STATUS_CONFIG.map(config => ({
    status: config.status,
    label: config.label,
    color: config.color,
    value: projects.filter(project => project.status === config.status).length,
  }))
}

function buildBreakdown(values: string[]): Array<{ name: string; value: number }> {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'fr'))
}

function buildMonthlyData(projects: OnboardingProject[], range: DateRange, locale: Locale): MonthlyDatum[] {
  return monthKeys(range).map(month => ({
    month,
    label: formatMonth(month, locale),
    starts: projects.filter(project => project.startDate?.startsWith(month) && isWithinRange(project.startDate, range)).length,
    goLives: projects.filter(project => {
      const liveDate = getActualGoLiveDate(project)
      return liveDate?.startsWith(month) && isWithinRange(liveDate, range)
    }).length,
  }))
}

interface WorkloadTrend {
  owners: string[]
  data: Array<Record<string, string | number>>
}

// Reconstructs an approximate historical charge per project owner from Zoho's
// start/live dates (a project counts as active for a month once it started
// and until it went live). This is an estimate, not an exact daily snapshot:
// there is no historical record of when a project's status actually changed.
function buildWorkloadTrend(projects: OnboardingProject[], range: DateRange, locale: Locale): WorkloadTrend {
  const implementationTeam: readonly string[] = IMPLEMENTATION_GROUP
  const scoped = projects
    .filter(project => !isExcludedOnboardingOwner(project.ownerShort) && project.status !== 'other')
    .filter(project => implementationTeam.includes(resolveOwnerName(project.ownerShort || project.ownerName)))
  const owners = [...new Set(scoped.map(project => resolveOwnerName(project.ownerShort || project.ownerName)))].sort((a, b) => a.localeCompare(b, 'fr'))
  const data = monthKeys(range).map(month => {
    const [year, monthNumber] = month.split('-').map(Number)
    const monthStart = `${month}-01`
    const monthEnd = isoDay(new Date(year, monthNumber, 0))
    const row: Record<string, string | number> = { month, label: formatMonth(month, locale) }
    for (const owner of owners) {
      const active = scoped.filter(project => {
        if (resolveOwnerName(project.ownerShort || project.ownerName) !== owner) return false
        if (!project.startDate || project.startDate > monthEnd) return false
        const liveDate = getActualGoLiveDate(project)
        if (liveDate && liveDate < monthStart) return false
        return true
      }).length
      row[owner] = Math.round((active / CAPACITY_THRESHOLD) * 100)
    }
    return row
  })
  return { owners, data }
}

function isWithinRange(value: string, range: DateRange): boolean {
  return value >= range.from && value <= range.to
}

function getActualGoLiveDate(project: OnboardingProject): string | null {
  return project.actualGoLiveDate
}

function monthKeys(range: DateRange): string[] {
  const from = parseIsoDay(`${range.from.slice(0, 7)}-01`)
  const to = parseIsoDay(`${range.to.slice(0, 7)}-01`)
  const result: string[] = []
  const cursor = new Date(from)
  while (cursor <= to) {
    result.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`)
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return result
}

function compareCount(current: number, previous: number, enabled: boolean, locale: Locale): ComparisonDisplay | undefined {
  if (!enabled) return undefined
  const vsPrevious = translate(locale, 'vs période précédente')
  if (previous === 0) return current === 0 ? { text: translate(locale, 'Aucun sur la période précédente'), tone: 'muted' } : { text: `+${current} ${vsPrevious}`, tone: 'positive' }
  const delta = Math.round(((current - previous) / previous) * 100)
  if (delta === 0) return { text: translate(locale, 'Stable vs période précédente'), tone: 'neutral' }
  return { text: `${delta > 0 ? '+' : ''}${delta} % ${vsPrevious}`, tone: delta > 0 ? 'positive' : 'negative' }
}

function compareDuration(current: number | null, previous: number | null, enabled: boolean, locale: Locale): ComparisonDisplay | undefined {
  if (!enabled) return undefined
  if (current === null || previous === null) return { text: translate(locale, 'Base comparable insuffisante'), tone: 'muted' }
  const delta = Math.round(current - previous)
  const vsPrevious = translate(locale, 'vs période précédente')
  if (delta === 0) return { text: translate(locale, 'Stable vs période précédente'), tone: 'neutral' }
  const unit = locale === 'en' ? 'd' : 'j'
  return { text: `${delta > 0 ? '+' : ''}${delta} ${unit} ${vsPrevious}`, tone: delta < 0 ? 'positive' : 'negative' }
}

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function averageScore(rows: SatisfactionRow[], key: keyof SatisfactionRow): number | null {
  const values = rows.map(row => row[key]).filter((value): value is number => typeof value === 'number' && value > 0)
  return average(values)
}

function daysBetween(from: string, to: string): number {
  return Math.round((parseIsoDay(to).getTime() - parseIsoDay(from).getTime()) / DAY_MS)
}

function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parseIsoDay(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatRange(range: DateRange, locale: Locale): string {
  const formatter = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${formatter.format(parseIsoDay(range.from))} – ${formatter.format(parseIsoDay(range.to))}`
}

function formatMonth(month: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { month: 'short', year: '2-digit' }).format(parseIsoDay(`${month}-01`)).replace('.', '')
}

function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR').format(value)
}

function formatDuration(value: number | null, locale: Locale): string {
  if (value === null) return '—'
  const rounded = Math.round(value)
  if (locale === 'en') return rounded < 30 ? `${rounded}d` : `${(value / 30.44).toFixed(1)} months`
  return rounded < 30 ? `${rounded} j` : `${(value / 30.44).toFixed(1)} mois`
}

function statusLabel(status: string): string {
  return STATUS_CONFIG.find(config => config.status === status)?.label ?? status
}

function scoreTextColor(score: number): string {
  if (score >= 4.5) return 'text-[#1c6437]'
  if (score >= 3.5) return 'text-[#903b07]'
  return 'text-[#b7221b]'
}

function chargeBarColor(percent: number): string {
  if (percent > 100) return 'bg-[#ed524e]'
  if (percent >= 70) return 'bg-[#f7d878]'
  return 'bg-[#5ec281]'
}

function chargeTextColor(percent: number): string {
  if (percent > 100) return 'text-[#b7221b]'
  if (percent >= 70) return 'text-[#84550e]'
  return 'text-[#1c6437]'
}

function truncateLabel(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value
}

function satisfactionFilterLabel(owner: string, range: DateRange | null, search: string, locale: Locale): string {
  const parts = [owner === 'Tous' ? translate(locale, 'Tous les chargés de projet') : owner]
  if (range) parts.push(formatRange(range, locale))
  if (search) parts.push(locale === 'en' ? `search "${search}"` : `recherche « ${search} »`)
  return parts.join(' · ')
}

function buildReport(input: { locale: Locale; range: DateRange | null; projects: OnboardingProject[]; activeProjects: number; accounts: number; blocked: number; overdue: number; highRisk: number; goLives: number; averageTtv: number | null; perPerson: PersonRow[]; satisfaction: number | null; satisfactionResponses: number }) {
  const { locale } = input
  if (locale === 'en') {
    const lines = [
      `Onboarding pilotage — ${input.range ? formatRange(input.range, locale) : 'all projects'}`,
      `${input.projects.length} projects · ${input.activeProjects} active · ${input.accounts} accounts`,
      `${input.blocked} blocked · ${input.overdue} overdue · ${input.highRisk} high risk`,
      `${input.goLives} go-lives · average TTV ${formatDuration(input.averageTtv, locale)}`,
      `Overall satisfaction: ${input.satisfaction === null ? 'not available' : `${input.satisfaction.toFixed(1)} / 5`} (${input.satisfactionResponses} responses)`,
      '',
      'Workload per project owner:',
      ...input.perPerson.map(person => `- ${person.owner}: ${person.active} active, ${person.attention} to watch, ${person.chargePct}% workload`),
    ]
    return lines.join('\n')
  }
  const lines = [
    `Pilotage onboarding — ${input.range ? formatRange(input.range, locale) : 'tous les projets'}`,
    `${input.projects.length} projets · ${input.activeProjects} actifs · ${input.accounts} comptes`,
    `${input.blocked} bloqués · ${input.overdue} en retard · ${input.highRisk} à risque élevé`,
    `${input.goLives} go-lives · TTV moyen ${formatDuration(input.averageTtv, locale)}`,
    `Satisfaction globale : ${input.satisfaction === null ? 'non disponible' : `${input.satisfaction.toFixed(1)} / 5`} (${input.satisfactionResponses} réponses)`,
    '',
    'Charge par chargé de projet :',
    ...input.perPerson.map(person => `- ${person.owner} : ${person.active} actifs, ${person.attention} à surveiller, charge ${person.chargePct} %`),
  ]
  return lines.join('\n')
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
