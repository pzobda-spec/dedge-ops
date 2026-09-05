'use client'

import { Suspense, useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle, Link2, Lock } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useLocale } from '@/lib/i18n/LocaleContext'
import type { Locale } from '@/lib/i18n/locale'

const MUTED = '#696969'
const OWNER_COLORS = ['#59319f', '#3b72d1', '#1D9E75', '#d58b28', '#c2410c', '#8c5bdb', '#447a76', '#b7221b']
const TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: '1px solid #e2e2e2',
  borderRadius: 10,
  boxShadow: '0 8px 24px rgba(36,25,55,0.12)',
  fontSize: 12,
}

const AVAILABILITY_LABEL: Record<Availability, string> = {
  full: 'Dispo',
  relache: 'Relâche',
  absent: 'Absent',
  stop: 'STOP',
}

const STATUT_LABEL: Record<CsmAccountStatus, string> = {
  client: 'Client',
  former_client: 'Ancien client',
}

const TYPOLOGIE_LABEL: Record<Typologie, string> = {
  groupe: 'Groupe',
  individuel: 'Individuel',
}

type Tier = 'Bronze' | 'Silver' | 'Gold' | 'Key'
type Availability = 'full' | 'relache' | 'absent' | 'stop'
type ObSource = 'override' | 'auto' | null
type CsmSource = 'override' | 'continuity' | 'auto' | null
type CsmAccountStatus = 'client' | 'former_client'
type Typologie = 'groupe' | 'individuel'
type QueryUpdate = string | string[] | null

interface AccountRow {
  accountId: string
  accountName: string
  groupId: string | null
  tier: Tier
  isGroup: boolean
  hotels: number
  hotelsSource: 'zoho_field' | 'sibling_count' | 'children_count' | 'default'
  dmbookOnly: boolean
  weight: number
  signedDate: string
  signedDateSource: 'deal' | 'account_created' | 'unknown'
  goLiveMonth: string
  obOwner: string | null
  obSource: ObSource
  obEligibleCount: number
  obLocked: boolean
  csmName: string | null
  csmSource: CsmSource
  csmEligibleCount: number
  csmLocked: boolean
  rawCsm: string | null
  resolvedCsm: string | null
}

interface CsmRosterMember {
  name: string
  monthlyCapacityPoints: number
  availability: Availability
  effectiveCapacity: number
  currentMonthBasePoints: number
}

interface OverloadEntry {
  name: string
  month: string
  load: number
  capacity: number
}

interface WeightRule {
  tier: string
  customerType: string
  dmbookOnly: boolean | null
  points: number
}

interface CsmPortfolioRow {
  csmName: string
  liveAccounts: number
  totalAccounts: number
  attentionProjects: number
  goLivesThisMonth: number
}

interface CsmAccountRow {
  accountId: string
  accountName: string
  csmName: string | null
  rawCsm: string | null
  unmanagedOwner: boolean
  status: CsmAccountStatus
  mrr: number
  tier: Tier
  isGroup: boolean
  hotels: number
  live: boolean
  churnVintages: string[]
  openTickets: number
  tickets6m: number
  ticketMatched: boolean
}

interface CsmAccountsDiagnostics {
  accountsWithoutCsm: number
  unresolvedCsm: Array<{ accountId: string; accountName: string; rawCsm: string }>
  accountsWithoutTicketMatch: number
  ignoredAccounts: number
}

interface CsmAccountsPayload {
  rows: CsmAccountRow[]
  diagnostics: CsmAccountsDiagnostics
}

interface PlanChargeResponse {
  referenceDate: string
  currentMonth: string
  months: string[]
  accounts: AccountRow[]
  obRoster: unknown[]
  csmRoster: CsmRosterMember[]
  csmPortfolios?: CsmPortfolioRow[]
  obLoadByMonth: Record<string, Record<string, number>>
  csmLoadByMonth: Record<string, Record<string, number>>
  obOverloads: OverloadEntry[]
  csmOverloads: OverloadEntry[]
  groupContinuity: Record<string, string>
  weightRules: WeightRule[]
  unassigned: string[]
  diagnostics: Record<string, unknown>
  dealsTruncated: boolean
  warnings: string[]
  csmAccounts?: CsmAccountsPayload
}

const EUR_FORMATTER = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

function formatEuros(value: number): string {
  return EUR_FORMATTER.format(value)
}

function currentChurnVintageKey(currentMonth: string): string | null {
  const match = /^(\d{4})-\d{2}$/.exec(currentMonth)
  if (!match) return null
  return `churn${match[1].slice(2)}`
}

function formatPercent(value: number | null, locale: Locale): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value * 100)} %`
}

export default function CsmPage() {
  return (
    <Suspense fallback={<CsmPageFallback />}>
      <CsmPageContent />
    </Suspense>
  )
}

function CsmPageFallback() {
  return (
    <main className="min-h-screen" style={{ backgroundColor: 'var(--bg-canvas)', color: 'var(--fg1)' }}>
      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <CsmSkeleton />
      </div>
    </main>
  )
}

function CsmPageContent() {
  const { locale, t } = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [data, setData] = useState<PlanChargeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [actionError, setActionError] = useState<string | null>(null)
  const [openFilter, setOpenFilter] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch('/api/csm/plan-charge', { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<PlanChargeResponse>
      })
      .then(payload => setData(payload))
      .catch(fetchError => {
        if (isAbortError(fetchError)) return
        console.error(fetchError)
        setError(t('Impossible de charger le plan de charge.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [retryKey, t])

  async function reload() {
    try {
      const response = await fetch('/api/csm/plan-charge')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setData(await response.json())
    } catch {
      setActionError(t('Le rechargement des données a échoué. Réessayez.'))
    }
  }

  /** Extrait le message d'erreur français renvoyé par la route, sinon un repli générique. */
  async function readApiError(response: Response): Promise<string> {
    try {
      const payload = await response.json() as { error?: unknown }
      if (typeof payload.error === 'string' && payload.error.trim()) return payload.error
    } catch {
      // corps non JSON, on retombe sur le code HTTP
    }
    return `HTTP ${response.status}`
  }

  async function postAssignment(body: Record<string, unknown>) {
    setActionError(null)
    try {
      const response = await fetch('/api/csm/plan-charge/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(await readApiError(response))
      await reload()
    } catch (mutationError) {
      setActionError(
        mutationError instanceof Error && mutationError.message
          ? mutationError.message
          : t('L’attribution n’a pas pu être enregistrée. Réessayez.'),
      )
    }
  }

  async function postRoster(body: Record<string, unknown>) {
    setActionError(null)
    try {
      const response = await fetch('/api/csm/plan-charge/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(await readApiError(response))
      await reload()
    } catch (mutationError) {
      setActionError(
        mutationError instanceof Error && mutationError.message
          ? mutationError.message
          : t('La mise à jour de l’équipe n’a pas pu être enregistrée. Réessayez.'),
      )
    }
  }

  const availableCsmCount = useMemo(
    () => data?.csmRoster.filter(member => member.availability === 'full' || member.availability === 'relache').length ?? 0,
    [data],
  )
  const csmPortfolios = useMemo(() => data?.csmPortfolios ?? [], [data])
  const attentionProjectsTotal = useMemo(
    () => csmPortfolios.reduce((sum, row) => sum + row.attentionProjects, 0),
    [csmPortfolios],
  )
  const goLivesThisMonthTotal = useMemo(
    () => csmPortfolios.reduce((sum, row) => sum + row.goLivesThisMonth, 0),
    [csmPortfolios],
  )

  // --- Partie analytique filtrée -------------------------------------------------

  const allAccountRows = useMemo(() => data?.csmAccounts?.rows ?? [], [data])
  const diagnostics = data?.csmAccounts?.diagnostics ?? null
  const vintageKey = data ? currentChurnVintageKey(data.currentMonth) : null

  const csmSelected = readMany(searchParams, 'csm')
  const statutSelected = readMany(searchParams, 'statut') as CsmAccountStatus[]
  const typologieSelected = readMany(searchParams, 'typologie') as Typologie[]
  const tierSelected = readMany(searchParams, 'tier')
  const churnSelected = readMany(searchParams, 'churn')
  const compteSelected = searchParams.get('compte')?.trim() ?? ''
  const reattribuerActive = searchParams.get('reattribuer') === '1'

  function updateQuery(updates: Record<string, QueryUpdate>) {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      next.delete(key)
      if (Array.isArray(value)) value.forEach(item => next.append(key, item))
      else if (value) next.set(key, value)
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }))
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
    startTransition(() => router.replace(pathname, { scroll: false }))
  }

  const hasActiveFilters = csmSelected.length > 0
    || statutSelected.length > 0
    || typologieSelected.length > 0
    || tierSelected.length > 0
    || churnSelected.length > 0
    || Boolean(compteSelected)
    || reattribuerActive

  const csmOptions = useMemo(() => {
    const named = Array.from(
      new Set(allAccountRows.map(row => row.csmName).filter((name): name is string => Boolean(name))),
    ).sort((a, b) => a.localeCompare(b, 'fr'))
    // Les comptes sans CSM résolu doivent être isolables au filtre, pas
    // seulement visibles dans un indicateur.
    return allAccountRows.some(row => !row.csmName) ? [...named, UNASSIGNED_CSM_LABEL] : named
  }, [allAccountRows])
  const tierOptions = useMemo(
    () => Array.from(new Set(allAccountRows.map(row => row.tier))).sort((a, b) => a.localeCompare(b, 'fr')),
    [allAccountRows],
  )
  const churnOptions = useMemo(
    () => Array.from(new Set(allAccountRows.flatMap(row => row.churnVintages))).sort((a, b) => a.localeCompare(b, 'fr')),
    [allAccountRows],
  )
  const accountOptions = useMemo(
    () => Array.from(new Set(allAccountRows.map(row => row.accountName))).sort((a, b) => a.localeCompare(b, 'fr')),
    [allAccountRows],
  )

  const filteredAccountRows = useMemo(() => allAccountRows.filter(row => {
    if (csmSelected.length > 0 && !csmSelected.includes(row.csmName ?? UNASSIGNED_CSM_LABEL)) return false
    if (statutSelected.length > 0 && !statutSelected.includes(row.status)) return false
    if (typologieSelected.length > 0) {
      const matchesGroupe = typologieSelected.includes('groupe') && row.isGroup
      const matchesIndividuel = typologieSelected.includes('individuel') && !row.isGroup
      if (!matchesGroupe && !matchesIndividuel) return false
    }
    if (tierSelected.length > 0 && !tierSelected.includes(row.tier)) return false
    if (churnSelected.length > 0 && !row.churnVintages.some(vintage => churnSelected.includes(vintage))) return false
    if (compteSelected && row.accountName !== compteSelected) return false
    if (reattribuerActive && !row.unmanagedOwner) return false
    return true
  }), [allAccountRows, csmSelected, statutSelected, typologieSelected, tierSelected, churnSelected, compteSelected, reattribuerActive])

  const unmanagedAll = useMemo(() => allAccountRows.filter(row => row.unmanagedOwner), [allAccountRows])
  const unmanagedMrr = useMemo(() => unmanagedAll.reduce((sum, row) => sum + row.mrr, 0), [unmanagedAll])

  const kpi = useMemo(() => {
    const clientRows = filteredAccountRows.filter(row => row.status === 'client')
    const formerRows = filteredAccountRows.filter(row => row.status === 'former_client')
    const mrrClients = clientRows.reduce((sum, row) => sum + row.mrr, 0)
    const liveCount = clientRows.filter(row => row.live).length
    const formerMrr = formerRows.reduce((sum, row) => sum + row.mrr, 0)
    const churnConstatesCount = vintageKey ? formerRows.filter(row => row.churnVintages.includes(vintageKey)).length : 0
    const churnAnnonceCount = vintageKey ? clientRows.filter(row => row.churnVintages.includes(vintageKey)).length : 0
    const denominator = clientRows.length + churnConstatesCount
    const tauxChurn = vintageKey && denominator > 0 ? churnConstatesCount / denominator : null
    const openTicketsSum = filteredAccountRows.reduce((sum, row) => sum + row.openTickets, 0)
    const tickets6mSum = filteredAccountRows.reduce((sum, row) => sum + row.tickets6m, 0)
    const accountsWithoutCsm = filteredAccountRows.filter(row => row.csmName === null).length
    return {
      mrrClients,
      clientCount: clientRows.length,
      liveCount,
      formerCount: formerRows.length,
      formerMrr,
      churnConstatesCount,
      churnAnnonceCount,
      tauxChurn,
      openTicketsSum,
      tickets6mSum,
      accountsWithoutCsm,
    }
  }, [filteredAccountRows, vintageKey])

  const csmGroups = useMemo(() => buildCsmGroups(filteredAccountRows, vintageKey), [filteredAccountRows, vintageKey])

  const churnVintagesInScope = useMemo(
    () => Array.from(new Set(filteredAccountRows.flatMap(row => row.churnVintages))).sort((a, b) => a.localeCompare(b, 'fr')),
    [filteredAccountRows],
  )
  const churnByVintageData = useMemo(
    () => churnVintagesInScope.map(vintage => ({
      vintage,
      constate: filteredAccountRows.filter(row => row.status === 'former_client' && row.churnVintages.includes(vintage)).length,
      annonce: filteredAccountRows.filter(row => row.status === 'client' && row.churnVintages.includes(vintage)).length,
    })),
    [churnVintagesInScope, filteredAccountRows],
  )
  const groupeIndivDonut = useMemo(() => ([
    { name: t('Groupe'), count: filteredAccountRows.filter(row => row.isGroup).length },
    { name: t('Individuel'), count: filteredAccountRows.filter(row => !row.isGroup).length },
  ]), [filteredAccountRows, t])
  const mrrByCsmData = useMemo(() => [...csmGroups].sort((a, b) => b.mrr - a.mrr), [csmGroups])
  const openTicketsByCsmData = useMemo(() => [...csmGroups].sort((a, b) => b.openTickets - a.openTickets).slice(0, 10), [csmGroups])

  const showAnalytics = Boolean(data?.csmAccounts)

  return (
    <main className="min-h-screen" style={{ backgroundColor: 'var(--bg-canvas)', color: 'var(--fg1)' }} aria-busy={loading}>
      <header className="border-b border-[#e2e2e2] bg-white px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-[#1a1a1a]">{t('Pilotage CSM')}</h1>
            <p className="mt-1 text-sm text-[#696969]">
              {t('Suit le portefeuille, le MRR, le churn, la santé de compte, la charge et la montée en charge de l’équipe CSM.')}
            </p>
          </div>
          <nav className="inline-flex max-w-full overflow-x-auto rounded-lg border border-[#ded8e8] bg-[#f7f5fa] p-1" aria-label={t('Vues CSM')}>
            <span aria-current="page" className="flex-none shrink-0 whitespace-nowrap rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-[#59319f] shadow-sm">{t('Pilotage')}</span>
            <Link href="/csm/plan-charge" className="flex-none shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold text-[#696969] hover:text-[#59319f]">{t('Plan de charge')}</Link>
          </nav>
        </div>
      </header>

      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {loading ? (
          <CsmSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={() => setRetryKey(value => value + 1)} />
        ) : !data ? null : (
          <>
            {data.warnings.length > 0 && (
              <div role="alert" className="rounded-lg border border-[#f0c756] bg-[#fbf1ca] px-4 py-3 text-xs text-[#84550e]">
                <ul className="list-disc space-y-1 pl-4">
                  {data.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
                </ul>
              </div>
            )}
            {data.dealsTruncated && (
              <div role="alert" className="rounded-lg border border-[#f0c756] bg-[#fbf1ca] px-4 py-3 text-xs text-[#84550e]">
                {t('La liste des opportunités gagnées est partielle : au-delà de la limite de récupération, certaines signatures peuvent manquer au pipeline.')}
              </div>
            )}
            {actionError && <p role="alert" className="rounded-lg border border-[#f1b4b0] bg-[#fff1f0] px-4 py-3 text-xs font-medium text-[#b7221b]">{actionError}</p>}

            {showAnalytics && unmanagedAll.length > 0 && (
              <div role="alert" className="rounded-lg border border-[#f0c756] bg-[#fbf1ca] px-4 py-3 text-sm text-[#84550e]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {t('{count} comptes à réattribuer ({mrr} de MRR)')
                        .replace('{count}', formatNumber(unmanagedAll.length, locale))
                        .replace('{mrr}', formatEuros(unmanagedMrr))}
                    </p>
                    <p className="mt-1 text-xs leading-5">
                      {t('Ces comptes restent rattachés à un ancien CSM et n’ont donc pas de suivi réel : à réattribuer dans Zoho.')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateQuery({ reattribuer: '1' })}
                    className="shrink-0 rounded-lg border border-[#e0ac3a] bg-white px-3 py-2 text-xs font-semibold text-[#84550e] hover:bg-[#fff8e8]"
                  >
                    {t('Filtrer sur ces comptes')}
                  </button>
                </div>
              </div>
            )}

            {showAnalytics && (
              <>
                <CsmFiltersBar
                  csmOptions={csmOptions}
                  tierOptions={tierOptions}
                  churnOptions={churnOptions}
                  accountOptions={accountOptions}
                  csmSelected={csmSelected}
                  statutSelected={statutSelected}
                  typologieSelected={typologieSelected}
                  tierSelected={tierSelected}
                  churnSelected={churnSelected}
                  compteSelected={compteSelected}
                  reattribuerActive={reattribuerActive}
                  matchCount={filteredAccountRows.length}
                  hasActiveFilters={hasActiveFilters}
                  openFilter={openFilter}
                  setFilterOpen={setFilterOpen}
                  toggle={toggle}
                  updateQuery={updateQuery}
                  resetFilters={resetFilters}
                  locale={locale}
                />

                <section aria-label={t('Indicateurs portefeuille CSM')} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <KpiCard label={t('MRR')} value={formatEuros(kpi.mrrClients)} subtitle={t('Comptes au statut client, périmètre filtré')} />
                  <KpiCard label={t('Comptes clients')} value={formatNumber(kpi.clientCount, locale)} subtitle={`${formatNumber(kpi.liveCount, locale)} ${t('live')}`} />
                  <KpiCard label={t('Anciens clients')} value={formatNumber(kpi.formerCount, locale)} subtitle={formatEuros(kpi.formerMrr)} />
                  <KpiCard
                    label={t('Churn constaté {year}').replace('{year}', vintageKey ? vintageKey.replace('churn', '20') : '—')}
                    value={vintageKey ? formatNumber(kpi.churnConstatesCount, locale) : '—'}
                    subtitle={`${t('Taux')} ${formatPercent(kpi.tauxChurn, locale)} · ${t('périmètre filtré, dénominateur reconstitué faute d’historique de portefeuille')}`}
                    accent={kpi.churnConstatesCount > 0 ? 'text-[#b7221b]' : undefined}
                  />
                  <KpiCard
                    label={t('Churn annoncé {year}').replace('{year}', vintageKey ? vintageKey.replace('churn', '20') : '—')}
                    value={vintageKey ? formatNumber(kpi.churnAnnonceCount, locale) : '—'}
                    subtitle={t('Encore client, pas encore constaté')}
                    accent={kpi.churnAnnonceCount > 0 ? 'text-[#84550e]' : undefined}
                  />
                  <KpiCard label={t('Tickets ouverts')} value={formatNumber(kpi.openTicketsSum, locale)} subtitle={`${formatNumber(kpi.tickets6mSum, locale)} ${t('sur 6 mois')}`} />
                  <KpiCard
                    label={t('Comptes sans CSM')}
                    value={formatNumber(kpi.accountsWithoutCsm, locale)}
                    subtitle={t('Diagnostic de rattachement')}
                    accent={kpi.accountsWithoutCsm > 0 ? 'text-[#b7221b]' : undefined}
                  />
                </section>

                <CsmChartsSection
                  mrrByCsmData={mrrByCsmData}
                  groupeIndivDonut={groupeIndivDonut}
                  churnByVintageData={churnByVintageData}
                  openTicketsByCsmData={openTicketsByCsmData}
                  locale={locale}
                />

                <CsmByCsmTable groups={csmGroups} locale={locale} />

                <CsmAccountsTable rows={filteredAccountRows} diagnostics={diagnostics} locale={locale} />
              </>
            )}

            <div className="border-t border-[#e2e2e2] pt-6">
              <h2 className="text-sm font-bold uppercase tracking-wide text-[#59319f]">{t('Pilotage de la charge')}</h2>
              <p className="mt-1 text-xs text-[#8a8a8a]">{t('Les sections ci-dessous ne suivent pas les filtres analytiques ci-dessus : elles gardent leur périmètre habituel.')}</p>
            </div>

            {/* Indicateurs de charge d'équipe, placés au contact du bloc de charge
                qu'ils qualifient. « Comptes en portefeuille » a été retiré : la carte
                « Comptes clients » de la vue d'ensemble porte déjà cette information. */}
            <section aria-label={t('Charge de l’équipe')} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label={t('CSM disponibles')} value={formatNumber(availableCsmCount, locale)} subtitle={t('Dispo ou relâche')} />
              <KpiCard label={t('À surveiller')} value={formatNumber(attentionProjectsTotal, locale)} subtitle={t('Bloqués, en retard ou risque élevé/critique')} accent={attentionProjectsTotal > 0 ? 'text-[#b7221b]' : undefined} />
              <KpiCard label={t('Reprises du mois')} value={formatNumber(goLivesThisMonthTotal, locale)} subtitle={t('Passation ou go-live sur le mois courant')} />
              <KpiCard label={t('Mois au-dessus du plafond')} value={formatNumber(data.csmOverloads.length, locale)} subtitle={t('Occurrences mois × CSM')} accent={data.csmOverloads.length > 0 ? 'text-[#b7221b]' : undefined} />
            </section>

            <CsmPortfolioSection roster={data.csmRoster} portfolios={csmPortfolios} />

            <CsmProjectionSection data={data} />

            <CsmRosterSection roster={data.csmRoster} onUpdate={postRoster} />

            <UpcomingTakeoversSection data={data} onAssign={postAssignment} />

            <WeightRulesSection rules={data.weightRules} />
          </>
        )}
      </div>
    </main>
  )
}

// --- Groupement par CSM (tableau + graphiques) ---------------------------------

interface CsmGroupRow {
  csmName: string
  mrr: number
  /** MRR des anciens clients, revenu perdu, distinct du portefeuille. */
  formerMrr: number
  clientCount: number
  formerCount: number
  groupCount: number
  indivCount: number
  churnConstates: number
  tauxChurn: number | null
  openTickets: number
  tickets6m: number
}

/** Libellé du regroupement des comptes sans CSM résolu, utilisé au filtre et à l'agrégation. */
const UNASSIGNED_CSM_LABEL = 'Non attribué'

function buildCsmGroups(rows: CsmAccountRow[], vintageKey: string | null): CsmGroupRow[] {
  const map = new Map<string, CsmGroupRow>()
  for (const row of rows) {
    const key = row.csmName ?? UNASSIGNED_CSM_LABEL
    let group = map.get(key)
    if (!group) {
      group = { csmName: key, mrr: 0, formerMrr: 0, clientCount: 0, formerCount: 0, groupCount: 0, indivCount: 0, churnConstates: 0, tauxChurn: null, openTickets: 0, tickets6m: 0 }
      map.set(key, group)
    }
    // Seuls les clients actifs alimentent le MRR de portefeuille. Le MRR d'un
    // ancien client est du revenu perdu : l'agréger ici gonflerait le
    // portefeuille et contredirait l'indicateur MRR, calculé sur les clients.
    if (row.status === 'client') {
      group.mrr += row.mrr
      group.clientCount += 1
    }
    if (row.status === 'former_client') {
      group.formerMrr += row.mrr
      group.formerCount += 1
    }
    if (row.isGroup) group.groupCount += 1
    else group.indivCount += 1
    if (vintageKey && row.status === 'former_client' && row.churnVintages.includes(vintageKey)) group.churnConstates += 1
    group.openTickets += row.openTickets
    group.tickets6m += row.tickets6m
  }
  for (const group of map.values()) {
    const denominator = group.clientCount + group.churnConstates
    group.tauxChurn = denominator > 0 ? group.churnConstates / denominator : null
  }
  return Array.from(map.values())
}

// --- Barre de filtres -----------------------------------------------------------

function CsmFiltersBar({
  csmOptions,
  tierOptions,
  churnOptions,
  accountOptions,
  csmSelected,
  statutSelected,
  typologieSelected,
  tierSelected,
  churnSelected,
  compteSelected,
  reattribuerActive,
  matchCount,
  hasActiveFilters,
  openFilter,
  setFilterOpen,
  toggle,
  updateQuery,
  resetFilters,
  locale,
}: {
  csmOptions: string[]
  tierOptions: string[]
  churnOptions: string[]
  accountOptions: string[]
  csmSelected: string[]
  statutSelected: CsmAccountStatus[]
  typologieSelected: Typologie[]
  tierSelected: string[]
  churnSelected: string[]
  compteSelected: string
  reattribuerActive: boolean
  matchCount: number
  hasActiveFilters: boolean
  openFilter: string | null
  setFilterOpen: (key: string, open: boolean) => void
  toggle: (key: string, selected: string[], value: string) => void
  updateQuery: (updates: Record<string, QueryUpdate>) => void
  resetFilters: () => void
  locale: Locale
}) {
  const { t } = useLocale()

  return (
    <section className="sticky top-0 z-20 -mx-4 border-b border-[#ded8e8] bg-white/95 px-4 py-4 shadow-[0_5px_16px_rgba(36,25,55,0.06)] backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex flex-wrap items-start gap-2">
        <FilterMenu
          label={t('CSM')}
          options={csmOptions}
          selected={csmSelected}
          open={openFilter === 'csm'}
          onOpenChange={open => setFilterOpen('csm', open)}
          onToggle={value => toggle('csm', csmSelected, value)}
        />
        <FilterMenu
          label={t('Statut')}
          options={['client', 'former_client']}
          renderOption={value => t(STATUT_LABEL[value as CsmAccountStatus])}
          selected={statutSelected}
          open={openFilter === 'statut'}
          onOpenChange={open => setFilterOpen('statut', open)}
          onToggle={value => toggle('statut', statutSelected, value)}
        />
        <FilterMenu
          label={t('Typologie')}
          options={['groupe', 'individuel']}
          renderOption={value => t(TYPOLOGIE_LABEL[value as Typologie])}
          selected={typologieSelected}
          open={openFilter === 'typologie'}
          onOpenChange={open => setFilterOpen('typologie', open)}
          onToggle={value => toggle('typologie', typologieSelected, value)}
        />
        <FilterMenu
          label={t('Tier')}
          options={tierOptions}
          selected={tierSelected}
          open={openFilter === 'tier'}
          onOpenChange={open => setFilterOpen('tier', open)}
          onToggle={value => toggle('tier', tierSelected, value)}
        />
        <FilterMenu
          label={t('Millésime de churn')}
          options={churnOptions}
          selected={churnSelected}
          open={openFilter === 'churn'}
          onOpenChange={open => setFilterOpen('churn', open)}
          onToggle={value => toggle('churn', churnSelected, value)}
        />
        <SearchSelect
          label={t('Compte')}
          options={accountOptions}
          selected={compteSelected}
          open={openFilter === 'compte'}
          onOpenChange={open => setFilterOpen('compte', open)}
          onSelect={value => updateQuery({ compte: value || null })}
        />
        <button
          type="button"
          onClick={() => updateQuery({ reattribuer: reattribuerActive ? null : '1' })}
          aria-pressed={reattribuerActive}
          className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${reattribuerActive ? 'border-[#59319f] bg-[#59319f] text-white' : 'border-[#d8d8d8] bg-white text-[#4a4a4a] hover:border-[#8064b3] hover:text-[#59319f]'}`}
        >
          {t('À réattribuer')}
        </button>
      </div>

      <div className="mt-3 flex min-h-7 flex-wrap items-center justify-between gap-2 border-t border-[#efebf3] pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm font-semibold text-[#1a1a1a]">
            {t('{count} comptes correspondent').replace('{count}', formatNumber(matchCount, locale))}
          </span>
          <SelectedPills
            values={[
              ...csmSelected.map(value => ({ key: 'csm', value, selected: csmSelected })),
              ...statutSelected.map(value => ({ key: 'statut', value: t(STATUT_LABEL[value]), raw: value, selected: statutSelected })),
              ...typologieSelected.map(value => ({ key: 'typologie', value: t(TYPOLOGIE_LABEL[value]), raw: value, selected: typologieSelected })),
              ...tierSelected.map(value => ({ key: 'tier', value, selected: tierSelected })),
              ...churnSelected.map(value => ({ key: 'churn', value, selected: churnSelected })),
            ]}
            onRemove={(key, value, selected, raw) => toggle(key, selected, raw ?? value)}
          />
          {compteSelected && (
            <button type="button" onClick={() => updateQuery({ compte: null })} className="rounded-full bg-[#eee7f8] px-2.5 py-1 text-xs font-medium text-[#59319f] hover:bg-[#e1d5f2]">
              {t('Compte')} · {compteSelected} ×
            </button>
          )}
          {reattribuerActive && (
            <button type="button" onClick={() => updateQuery({ reattribuer: null })} className="rounded-full bg-[#eee7f8] px-2.5 py-1 text-xs font-medium text-[#59319f] hover:bg-[#e1d5f2]">
              {t('À réattribuer')} ×
            </button>
          )}
        </div>
        {hasActiveFilters && <button type="button" onClick={resetFilters} className="text-xs font-semibold text-[#59319f] hover:underline">{t('Réinitialiser les filtres')}</button>}
      </div>
    </section>
  )
}

function FilterMenu({
  label,
  options,
  renderOption,
  selected,
  open,
  onOpenChange,
  onToggle,
}: {
  label: string
  options: string[]
  renderOption?: (value: string) => string
  selected: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onToggle: (value: string) => void
}) {
  const { t } = useLocale()
  return (
    <details open={open} onToggle={event => onOpenChange(event.currentTarget.open)} className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-xs font-semibold text-[#4a4a4a] hover:border-[#8064b3] [&::-webkit-details-marker]:hidden">
        {label}
        {selected.length > 0 && <span className="rounded-full bg-[#59319f] px-1.5 py-0.5 text-[10px] text-white">{selected.length}</span>}
        <span className="text-[10px] text-[#8a8a8a] transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="absolute left-0 z-30 mt-1 max-h-64 min-w-[210px] overflow-y-auto rounded-xl border border-[#ded8e8] bg-white p-2 shadow-[0_10px_28px_rgba(36,25,55,0.16)]">
        {options.length === 0 ? (
          <p className="px-2 py-3 text-xs text-[#8a8a8a]">{t('Aucune valeur disponible')}</p>
        ) : options.map(option => {
          const active = selected.includes(option)
          return (
            <button key={option} type="button" onClick={() => onToggle(option)} className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors last:mb-0 ${active ? 'bg-[#eee7f8] font-semibold text-[#59319f]' : 'text-[#4a4a4a] hover:bg-[#f7f7f7]'}`}>
              <span className={`grid h-4 w-4 place-items-center rounded border text-[10px] ${active ? 'border-[#59319f] bg-[#59319f] text-white' : 'border-[#c8c8c8] bg-white'}`}>{active ? '✓' : ''}</span>
              {renderOption ? renderOption(option) : option}
            </button>
          )
        })}
      </div>
    </details>
  )
}

function SearchSelect({ label, options, selected, open, onOpenChange, onSelect }: { label: string; options: string[]; selected: string; open: boolean; onOpenChange: (open: boolean) => void; onSelect: (value: string) => void }) {
  const { t } = useLocale()
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
        <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Rechercher un compte…')} className="mb-2 w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-xs outline-none focus:border-[#8064b3] focus:ring-1 focus:ring-[#8064b3]" />
        <div className="max-h-52 overflow-y-auto">
          {selected && <button type="button" onClick={() => onSelect('')} className="mb-1 w-full rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-[#59319f] hover:bg-[#f7f3fc]">{t('Tous les comptes')}</button>}
          {matches.length === 0 ? <p className="px-2 py-3 text-xs text-[#8a8a8a]">{t('Aucun compte trouvé')}</p> : matches.map(option => (
            <button key={option} type="button" onClick={() => onSelect(option)} className={`mb-1 w-full rounded-lg px-2.5 py-2 text-left text-xs last:mb-0 ${selected === option ? 'bg-[#eee7f8] font-semibold text-[#59319f]' : 'text-[#4a4a4a] hover:bg-[#f7f7f7]'}`}>
              {option}
            </button>
          ))}
        </div>
      </div>
    </details>
  )
}

function SelectedPills({ values, onRemove }: { values: Array<{ key: string; value: string; raw?: string; selected: string[] }>; onRemove: (key: string, value: string, selected: string[], raw?: string) => void }) {
  return <>{values.map(item => (
    <button key={`${item.key}-${item.raw ?? item.value}`} type="button" onClick={() => onRemove(item.key, item.value, item.selected, item.raw)} className="rounded-full bg-[#eee7f8] px-2.5 py-1 text-xs font-medium text-[#59319f] hover:bg-[#e1d5f2]">
      {item.value} ×
    </button>
  ))}</>
}

// --- Graphiques -------------------------------------------------------------

function CsmChartsSection({
  mrrByCsmData,
  groupeIndivDonut,
  churnByVintageData,
  openTicketsByCsmData,
  locale,
}: {
  mrrByCsmData: CsmGroupRow[]
  groupeIndivDonut: Array<{ name: string; count: number }>
  churnByVintageData: Array<{ vintage: string; constate: number; annonce: number }>
  openTicketsByCsmData: CsmGroupRow[]
  locale: Locale
}) {
  const { t } = useLocale()
  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <article className="rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-[0_4px_10px_rgba(36,25,55,0.05)] sm:p-5">
        <h2 className="text-sm font-bold text-[#1a1a1a]">{t('MRR par CSM')}</h2>
        <div className="mt-3 h-[300px] w-full" role="img" aria-label={t('Graphique du MRR par CSM')}>
          {mrrByCsmData.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mrrByCsmData} layout="vertical" margin={{ top: 4, right: 26, left: 14, bottom: 0 }}>
                <CartesianGrid stroke="#ece8f0" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="csmName" width={110} tick={{ fontSize: 11, fill: '#4a4a4a' }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: '#f7f3fc' }} contentStyle={TOOLTIP_STYLE} formatter={value => [formatEuros(Number(value)), t('MRR')]} />
                <Bar dataKey="mrr" name={t('MRR')} fill={OWNER_COLORS[0]} radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </article>

      <article className="rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-[0_4px_10px_rgba(36,25,55,0.05)] sm:p-5">
        <h2 className="text-sm font-bold text-[#1a1a1a]">{t('Répartition groupe / individuel')}</h2>
        <div className="mt-3 h-[300px] w-full" role="img" aria-label={t('Graphique de la répartition groupe / individuel')}>
          {groupeIndivDonut.every(item => item.count === 0) ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={groupeIndivDonut} dataKey="count" nameKey="name" innerRadius="48%" outerRadius="72%" paddingAngle={2} stroke="#ffffff" strokeWidth={2}>
                  {groupeIndivDonut.map((item, index) => <Cell key={item.name} fill={OWNER_COLORS[index % OWNER_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value, name) => [formatNumber(Number(value), locale), String(name)]} />
                <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </article>

      <article className="rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-[0_4px_10px_rgba(36,25,55,0.05)] sm:p-5">
        <h2 className="text-sm font-bold text-[#1a1a1a]">{t('Churn par millésime')}</h2>
        <div className="mt-3 h-[300px] w-full" role="img" aria-label={t('Graphique du churn par millésime')}>
          {churnByVintageData.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={churnByVintageData} margin={{ top: 16, right: 16, left: -8, bottom: 12 }}>
                <CartesianGrid stroke="#ece8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="vintage" tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="constate" name={t('Constaté')} stackId="churn" fill="#b7221b" radius={[0, 0, 0, 0]} />
                <Bar dataKey="annonce" name={t('Annoncé')} stackId="churn" fill="#e8b84b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </article>

      <article className="rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-[0_4px_10px_rgba(36,25,55,0.05)] sm:p-5">
        <h2 className="text-sm font-bold text-[#1a1a1a]">{t('Tickets ouverts par CSM')}</h2>
        <p className="mt-0.5 text-xs text-[#8a8a8a]">{t('Top 10')}</p>
        <div className="mt-3 h-[300px] w-full" role="img" aria-label={t('Graphique des tickets ouverts par CSM')}>
          {openTicketsByCsmData.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={openTicketsByCsmData} layout="vertical" margin={{ top: 4, right: 26, left: 14, bottom: 0 }}>
                <CartesianGrid stroke="#ece8f0" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="csmName" width={110} tick={{ fontSize: 11, fill: '#4a4a4a' }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: '#f7f3fc' }} contentStyle={TOOLTIP_STYLE} formatter={value => [formatNumber(Number(value), locale), t('Tickets ouverts')]} />
                <Bar dataKey="openTickets" name={t('Tickets ouverts')} fill="#b7221b" radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </article>
    </section>
  )
}

// --- Tableau « Par CSM » --------------------------------------------------------

type CsmSortKey = 'csmName' | 'mrr' | 'clientCount' | 'formerCount' | 'groupCount' | 'churnConstates' | 'tauxChurn' | 'openTickets' | 'tickets6m'

function CsmByCsmTable({ groups, locale }: { groups: CsmGroupRow[]; locale: Locale }) {
  const { t } = useLocale()
  const [sortKey, setSortKey] = useState<CsmSortKey>('mrr')
  const [ascending, setAscending] = useState(false)
  const [page, setPage] = useState(0)
  const pageSize = 20

  const sorted = useMemo(() => [...groups].sort((a, b) => {
    const direction = ascending ? 1 : -1
    if (sortKey === 'csmName') return a.csmName.localeCompare(b.csmName, 'fr') * direction
    const av = a[sortKey]
    const bv = b[sortKey]
    return ((Number(av ?? -1)) - (Number(bv ?? -1))) * direction
  }), [ascending, groups, sortKey])
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const visibleRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize)

  useEffect(() => setPage(0), [groups])

  function sortBy(key: CsmSortKey) {
    if (sortKey === key) setAscending(value => !value)
    else {
      setSortKey(key)
      setAscending(key === 'csmName')
    }
    setPage(0)
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[#e2e2e2] bg-white shadow-[0_4px_10px_rgba(36,25,55,0.05)]" aria-labelledby="csm-by-csm-title">
      <div className="border-b border-[#e2e2e2] px-4 py-4 sm:px-5">
        <h2 id="csm-by-csm-title" className="text-sm font-bold text-[#1a1a1a]">{t('Par CSM')}</h2>
      </div>
      {visibleRows.length === 0 ? (
        <div className="p-8 text-center text-sm text-[#696969]">{t('Aucune donnée pour ces filtres.')}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="border-b border-[#e2e2e2] bg-[#f7f7f7]">
                <tr>
                  <SortHeader<CsmSortKey> label={t('CSM')} sortKey="csmName" current={sortKey} ascending={ascending} onSort={sortBy} />
                  <SortHeader<CsmSortKey> label={t('MRR')} sortKey="mrr" current={sortKey} ascending={ascending} onSort={sortBy} />
                  <SortHeader<CsmSortKey> label={t('Comptes clients')} sortKey="clientCount" current={sortKey} ascending={ascending} onSort={sortBy} />
                  <SortHeader<CsmSortKey> label={t('Anciens clients')} sortKey="formerCount" current={sortKey} ascending={ascending} onSort={sortBy} />
                  <SortHeader<CsmSortKey> label={t('Groupe / Indiv')} sortKey="groupCount" current={sortKey} ascending={ascending} onSort={sortBy} />
                  <SortHeader<CsmSortKey> label={t('Churn constaté')} sortKey="churnConstates" current={sortKey} ascending={ascending} onSort={sortBy} />
                  <SortHeader<CsmSortKey> label={t('Taux de churn')} sortKey="tauxChurn" current={sortKey} ascending={ascending} onSort={sortBy} />
                  <SortHeader<CsmSortKey> label={t('Tickets ouverts')} sortKey="openTickets" current={sortKey} ascending={ascending} onSort={sortBy} />
                  <SortHeader<CsmSortKey> label={t('Tickets 6 mois')} sortKey="tickets6m" current={sortKey} ascending={ascending} onSort={sortBy} />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e2e2]">
                {visibleRows.map(row => (
                  <tr key={row.csmName} className="hover:bg-[#faf9f5]">
                    <td className="px-4 py-3 font-semibold text-[#1a1a1a]">{row.csmName === 'Non attribué' ? t('Non attribué') : row.csmName}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-[#4a4a4a]">{formatEuros(row.mrr)}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-[#4a4a4a]">{formatNumber(row.clientCount, locale)}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-[#4a4a4a]">{formatNumber(row.formerCount, locale)}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-[#4a4a4a]">{row.groupCount} / {row.indivCount}</td>
                    <td className={`px-4 py-3 text-center font-semibold tabular-nums ${row.churnConstates > 0 ? 'text-[#b7221b]' : 'text-[#878787]'}`}>{formatNumber(row.churnConstates, locale)}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-[#4a4a4a]">{formatPercent(row.tauxChurn, locale)}</td>
                    <td className={`px-4 py-3 text-center font-semibold tabular-nums ${row.openTickets > 0 ? 'text-[#b7221b]' : 'text-[#878787]'}`}>{formatNumber(row.openTickets, locale)}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-[#4a4a4a]">{formatNumber(row.tickets6m, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination page={safePage} pageCount={pageCount} onPage={setPage} />
        </>
      )}
    </section>
  )
}

// --- Tableau « Comptes » ---------------------------------------------------------

type AccountSortKey = 'accountName' | 'csmName' | 'status' | 'tier' | 'isGroup' | 'mrr' | 'openTickets' | 'tickets6m'

function CsmAccountsTable({ rows, diagnostics, locale }: { rows: CsmAccountRow[]; diagnostics: CsmAccountsDiagnostics | null; locale: Locale }) {
  const { t } = useLocale()
  const [sortKey, setSortKey] = useState<AccountSortKey>('openTickets')
  const [ascending, setAscending] = useState(false)
  const [page, setPage] = useState(0)
  const pageSize = 20

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const direction = ascending ? 1 : -1
    if (sortKey === 'accountName' || sortKey === 'status') return String(a[sortKey]).localeCompare(String(b[sortKey]), 'fr') * direction
    if (sortKey === 'csmName') return (a.csmName ?? '').localeCompare(b.csmName ?? '', 'fr') * direction
    if (sortKey === 'tier') return a.tier.localeCompare(b.tier, 'fr') * direction
    if (sortKey === 'isGroup') return ((a.isGroup ? 1 : 0) - (b.isGroup ? 1 : 0)) * direction
    return ((a[sortKey] as number) - (b[sortKey] as number)) * direction
  }), [ascending, rows, sortKey])
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const visibleRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize)

  useEffect(() => setPage(0), [rows])

  function sortBy(key: AccountSortKey) {
    if (sortKey === key) setAscending(value => !value)
    else {
      setSortKey(key)
      setAscending(key === 'accountName' || key === 'csmName' || key === 'status' || key === 'tier')
    }
    setPage(0)
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[#e2e2e2] bg-white shadow-[0_4px_10px_rgba(36,25,55,0.05)]" aria-labelledby="csm-accounts-title">
      <div className="border-b border-[#e2e2e2] px-4 py-4 sm:px-5">
        <h2 id="csm-accounts-title" className="text-sm font-bold text-[#1a1a1a]">{t('Comptes')}</h2>
      </div>
      {visibleRows.length === 0 ? (
        <div className="p-8 text-center text-sm text-[#696969]">{t('Aucun compte pour ces filtres.')}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="border-b border-[#e2e2e2] bg-[#f7f7f7]">
                <tr>
                  <SortHeader<AccountSortKey> label={t('Compte')} sortKey="accountName" current={sortKey} ascending={ascending} onSort={sortBy} />
                  <SortHeader<AccountSortKey> label={t('CSM')} sortKey="csmName" current={sortKey} ascending={ascending} onSort={sortBy} />
                  <SortHeader<AccountSortKey> label={t('Statut')} sortKey="status" current={sortKey} ascending={ascending} onSort={sortBy} />
                  <SortHeader<AccountSortKey> label={t('Tier')} sortKey="tier" current={sortKey} ascending={ascending} onSort={sortBy} />
                  <SortHeader<AccountSortKey> label={t('Groupe / Indiv')} sortKey="isGroup" current={sortKey} ascending={ascending} onSort={sortBy} />
                  <SortHeader<AccountSortKey> label={t('MRR')} sortKey="mrr" current={sortKey} ascending={ascending} onSort={sortBy} />
                  <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-[#696969]">{t('Millésimes de churn')}</th>
                  <SortHeader<AccountSortKey> label={t('Tickets ouverts')} sortKey="openTickets" current={sortKey} ascending={ascending} onSort={sortBy} />
                  <SortHeader<AccountSortKey> label={t('Tickets 6 mois')} sortKey="tickets6m" current={sortKey} ascending={ascending} onSort={sortBy} />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e2e2]">
                {visibleRows.map(row => (
                  <tr key={row.accountId} className={row.unmanagedOwner ? 'bg-[#fbf1ca] hover:bg-[#f7ebc0]' : 'hover:bg-[#faf9f5]'}>
                    <td className="px-4 py-3 font-semibold text-[#1a1a1a]">
                      {row.accountName}
                      {row.unmanagedOwner && <span className="ml-1 text-[10px] font-semibold text-[#84550e]">({t('à réattribuer')})</span>}
                      {!row.ticketMatched && <span className="mt-0.5 block text-[10px] font-normal text-[#8a8a8a]">{t('nom Desk non rattaché')}</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-[#4a4a4a]">{row.csmName ?? '—'}</td>
                    <td className="px-4 py-3 text-center text-[#4a4a4a]">{t(STATUT_LABEL[row.status])}</td>
                    <td className="px-4 py-3 text-center text-[#4a4a4a]">{row.tier}</td>
                    <td className="px-4 py-3 text-center text-[#4a4a4a]">{row.isGroup ? t('Groupe') : t('Indiv')}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-[#4a4a4a]">{formatEuros(row.mrr)}</td>
                    <td className="px-4 py-3 text-center text-[#4a4a4a]">{row.churnVintages.length > 0 ? row.churnVintages.join(', ') : '—'}</td>
                    <td className={`px-4 py-3 text-center font-semibold tabular-nums ${row.openTickets > 0 ? 'text-[#b7221b]' : 'text-[#878787]'}`}>{formatNumber(row.openTickets, locale)}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-[#4a4a4a]">{formatNumber(row.tickets6m, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination page={safePage} pageCount={pageCount} onPage={setPage} />
        </>
      )}
      <p className="border-t border-[#eeeeee] px-4 py-3 text-[11px] leading-4 text-[#8a8a8a] sm:px-5">
        {t('{count} comptes dont le nom Desk ne correspond pas exactement à un compte CRM ne sont pas rattachés à un historique de tickets. Aucun seuil de santé n’est défini à ce stade.')
          .replace('{count}', diagnostics ? formatNumber(diagnostics.accountsWithoutTicketMatch, locale) : '—')}
      </p>
    </section>
  )
}

function SortHeader<K extends string>({ label, sortKey, current, ascending, onSort }: { label: string; sortKey: K; current: K; ascending: boolean; onSort: (key: K) => void }) {
  return (
    <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-[#696969]">
      <button type="button" onClick={() => onSort(sortKey)} className="whitespace-nowrap hover:text-[#59319f]">
        {label} {current === sortKey ? (ascending ? '↑' : '↓') : ''}
      </button>
    </th>
  )
}

function TablePagination({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (updater: (value: number) => number) => void }) {
  const { t } = useLocale()
  return (
    <div className="flex items-center justify-between border-t border-[#ece8f0] px-4 py-3 text-xs text-[#696969] sm:px-5">
      <span>{t('Page {page} sur {count}').replace('{page}', String(page + 1)).replace('{count}', String(pageCount))}</span>
      <div className="flex gap-2">
        <button type="button" disabled={page === 0} onClick={() => onPage(value => Math.max(0, value - 1))} className="rounded-lg border border-[#d8d8d8] px-3 py-1.5 font-semibold text-[#4a4a4a] disabled:cursor-not-allowed disabled:opacity-40">{t('Précédent')}</button>
        <button type="button" disabled={page >= pageCount - 1} onClick={() => onPage(value => Math.min(pageCount - 1, value + 1))} className="rounded-lg border border-[#d8d8d8] px-3 py-1.5 font-semibold text-[#4a4a4a] disabled:cursor-not-allowed disabled:opacity-40">{t('Suivant')}</button>
      </div>
    </div>
  )
}

function KpiCard({ label, value, subtitle, accent }: { label: string; value: string; subtitle: string; accent?: string }) {
  return (
    <article className="min-w-0 rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-[0_4px_10px_rgba(36,25,55,0.05)] sm:p-5">
      <p className="min-h-8 text-xs font-semibold uppercase tracking-wide text-[#696969]">{label}</p>
      <p className={`mt-2 truncate text-3xl font-bold tracking-tight ${accent ?? 'text-[#1a1a1a]'}`}>{value}</p>
      <p className="mt-2 min-h-8 text-xs leading-4 text-[#8a8a8a]">{subtitle}</p>
    </article>
  )
}

function CsmPortfolioSection({ roster, portfolios }: { roster: CsmRosterMember[]; portfolios: CsmPortfolioRow[] }) {
  const { t } = useLocale()
  const byName = useMemo(() => new Map(portfolios.map(row => [row.csmName, row])), [portfolios])
  const rows = roster.map(member => ({ member, portfolio: byName.get(member.name) ?? null }))
  const headings = [t('CSM'), t('Portefeuille'), t('À surveiller'), t('Reprises du mois'), t('Charge'), t('Satisfaction'), t('TTV moyen')]

  return (
    <section className="overflow-hidden rounded-xl border border-[#e2e2e2] bg-white shadow-[0_4px_10px_rgba(36,25,55,0.05)]" aria-labelledby="csm-portfolio-title">
      <div className="border-b border-[#e2e2e2] px-4 py-4 sm:px-5">
        <h2 id="csm-portfolio-title" className="text-sm font-bold text-[#1a1a1a]">{t('Charge par CSM')}</h2>
      </div>

      {rows.length === 0 ? <div className="p-8 text-center text-sm text-[#696969]">{t('Aucun CSM dans ce périmètre.')}</div> : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="border-b border-[#e2e2e2] bg-[#f7f7f7]">
                <tr>
                  {headings.map((heading, index) => (
                    <th key={heading} className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#696969] ${index === 0 ? 'text-left' : 'text-center'}`}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e2e2]">
                {rows.map(({ member, portfolio }) => (
                  <tr key={member.name} className="hover:bg-[#faf9f5]">
                    <td className="px-4 py-3 font-semibold text-[#1a1a1a]">{member.name}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-[#4a4a4a]">
                      {portfolio ? portfolio.liveAccounts : '—'}
                      {portfolio && <span className="ml-1 text-[10px] font-normal text-[#8a8a8a]">/ {portfolio.totalAccounts}</span>}
                    </td>
                    <td className={`px-4 py-3 text-center font-semibold tabular-nums ${portfolio && portfolio.attentionProjects > 0 ? 'text-[#b7221b]' : 'text-[#878787]'}`}>
                      {portfolio ? portfolio.attentionProjects : '—'}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold tabular-nums text-[#1c6437]">{portfolio ? portfolio.goLivesThisMonth : '—'}</td>
                    <td className="min-w-[170px] px-4 py-3">
                      <ChargeBar load={member.currentMonthBasePoints} capacity={member.effectiveCapacity} />
                    </td>
                    <td className="px-4 py-3 text-center text-[#878787]">—</td>
                    <td className="px-4 py-3 text-center text-[#878787]">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-[#e2e2e2] md:hidden">
            {rows.map(({ member, portfolio }) => (
              <article key={member.name} className="space-y-3 p-4">
                <h3 className="font-semibold text-[#1a1a1a]">{member.name}</h3>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8a8a8a]">{t('Charge')}</p>
                  <ChargeBar load={member.currentMonthBasePoints} capacity={member.effectiveCapacity} />
                </div>
                <dl className="grid grid-cols-3 gap-3 text-center">
                  <PortfolioMetric label={t('Portefeuille')} value={portfolio ? `${portfolio.liveAccounts}/${portfolio.totalAccounts}` : '—'} />
                  <PortfolioMetric label={t('À surveiller')} value={portfolio ? portfolio.attentionProjects : '—'} alert={Boolean(portfolio && portfolio.attentionProjects > 0)} />
                  <PortfolioMetric label={t('Reprises du mois')} value={portfolio ? portfolio.goLivesThisMonth : '—'} success />
                  <PortfolioMetric label={t('Satisfaction')} value="—" />
                  <PortfolioMetric label="TTV" value="—" />
                </dl>
              </article>
            ))}
          </div>

          <p className="border-t border-[#eeeeee] px-4 py-3 text-[11px] leading-4 text-[#8a8a8a] sm:px-5">
            {t('La satisfaction n’est pas rattachée au CSM dans la source actuelle et le TTV mesure l’implémentation, pas la reprise : ces colonnes affichent « — » plutôt qu’un chiffre trompeur.')}
          </p>
        </>
      )}
    </section>
  )
}

function PortfolioMetric({ label, value, alert = false, success = false }: { label: string; value: string | number; alert?: boolean; success?: boolean }) {
  return (
    <div className="rounded-lg bg-[#f7f7f7] p-2">
      <dt className="text-[10px] uppercase tracking-wide text-[#8a8a8a]">{label}</dt>
      <dd className={`mt-1 text-sm font-bold tabular-nums ${alert ? 'text-[#b7221b]' : success ? 'text-[#1c6437]' : 'text-[#1a1a1a]'}`}>{value}</dd>
    </div>
  )
}

function CsmRosterSection({ roster, onUpdate }: { roster: CsmRosterMember[]; onUpdate: (body: Record<string, unknown>) => Promise<void> }) {
  const { t } = useLocale()
  return (
    <article className="overflow-hidden rounded-xl border border-[#e2e2e2] bg-white shadow-[0_4px_10px_rgba(36,25,55,0.05)]">
      <div className="border-b border-[#e2e2e2] px-4 py-4 sm:px-5">
        <h2 className="text-sm font-bold text-[#1a1a1a]">{t('Équipe CSM')}</h2>
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-[#e2e2e2] bg-[#f7f7f7]">
            <tr>
              {[t('Nom'), t('Plafond mensuel'), t('Dispo'), t('Points ce mois'), t('Charge'), t('Statut')].map(heading => (
                <th key={heading} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[#696969]">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e2e2e2]">
            {roster.map(member => (
              <tr key={member.name}>
                <td className="px-3 py-3 font-semibold text-[#1a1a1a]">{member.name}</td>
                <td className="px-3 py-3">
                  <label className="sr-only" htmlFor={`csm-cap-${member.name}`}>{t('Plafond mensuel')}</label>
                  <input
                    id={`csm-cap-${member.name}`}
                    type="number"
                    min={0}
                    defaultValue={member.monthlyCapacityPoints}
                    onBlur={event => onUpdate({ kind: 'csm', name: member.name, monthly_capacity_points: Math.max(0, Number(event.target.value) || 0) })}
                    className="w-16 rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 text-right text-xs text-[#1a1a1a] outline-none focus:border-[#8064b3] focus:ring-1 focus:ring-[#8064b3]"
                  />
                </td>
                <td className="px-3 py-3">
                  <label className="sr-only" htmlFor={`csm-avail-${member.name}`}>{t('Dispo')}</label>
                  <select
                    id={`csm-avail-${member.name}`}
                    value={member.availability}
                    onChange={event => onUpdate({ kind: 'csm', name: member.name, availability: event.target.value })}
                    className="rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 text-xs text-[#1a1a1a] outline-none focus:border-[#8064b3] focus:ring-1 focus:ring-[#8064b3]"
                  >
                    {(['full', 'relache', 'absent', 'stop'] as Availability[]).map(availability => <option key={availability} value={availability}>{t(AVAILABILITY_LABEL[availability])}</option>)}
                  </select>
                </td>
                <td className="px-3 py-3 tabular-nums text-[#4a4a4a]">{member.currentMonthBasePoints}</td>
                <td className="px-3 py-3">
                  <ChargeBar load={member.currentMonthBasePoints} capacity={member.effectiveCapacity} />
                </td>
                <td className="px-3 py-3">
                  <StatusPill availability={member.availability} load={member.currentMonthBasePoints} capacity={member.effectiveCapacity} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-[#e2e2e2] md:hidden">
        {roster.map(member => (
          <article key={member.name} className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-[#1a1a1a]">{member.name}</h3>
              <StatusPill availability={member.availability} load={member.currentMonthBasePoints} capacity={member.effectiveCapacity} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-[#8a8a8a]" htmlFor={`csm-cap-m-${member.name}`}>{t('Plafond mensuel')}</label>
                <input
                  id={`csm-cap-m-${member.name}`}
                  type="number"
                  min={0}
                  defaultValue={member.monthlyCapacityPoints}
                  onBlur={event => onUpdate({ kind: 'csm', name: member.name, monthly_capacity_points: Math.max(0, Number(event.target.value) || 0) })}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 text-xs text-[#1a1a1a] outline-none focus:border-[#8064b3] focus:ring-1 focus:ring-[#8064b3]"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-[#8a8a8a]" htmlFor={`csm-avail-m-${member.name}`}>{t('Dispo')}</label>
                <select
                  id={`csm-avail-m-${member.name}`}
                  value={member.availability}
                  onChange={event => onUpdate({ kind: 'csm', name: member.name, availability: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 text-xs text-[#1a1a1a] outline-none focus:border-[#8064b3] focus:ring-1 focus:ring-[#8064b3]"
                >
                  {(['full', 'relache', 'absent', 'stop'] as Availability[]).map(availability => <option key={availability} value={availability}>{t(AVAILABILITY_LABEL[availability])}</option>)}
                </select>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8a8a8a]">{t('Points ce mois')}</p>
              <ChargeBar load={member.currentMonthBasePoints} capacity={member.effectiveCapacity} />
            </div>
          </article>
        ))}
      </div>
    </article>
  )
}

function UpcomingTakeoversSection({
  data,
  onAssign,
}: {
  data: PlanChargeResponse
  onAssign: (body: Record<string, unknown>) => Promise<void>
}) {
  const { locale, t } = useLocale()
  const { accounts, csmRoster } = data
  const sortedAccounts = useMemo(
    () => [...accounts].sort((a, b) => a.goLiveMonth.localeCompare(b.goLiveMonth)),
    [accounts],
  )

  function csmOptionEligible(member: CsmRosterMember): boolean {
    return member.availability !== 'absent' && member.availability !== 'stop'
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[#e2e2e2] bg-white shadow-[0_4px_10px_rgba(36,25,55,0.05)]" aria-labelledby="takeovers-title">
      <div className="border-b border-[#e2e2e2] px-4 py-4 sm:px-5">
        <h2 id="takeovers-title" className="text-sm font-bold text-[#1a1a1a]">{t('Reprises à venir')}</h2>
        <p className="mt-0.5 text-xs text-[#8a8a8a]">{t('Comptes signés pas encore live, triés par mois de go-live.')}</p>
      </div>

      {sortedAccounts.length === 0 ? (
        <div className="p-8 text-center text-sm text-[#696969]">{t('Aucun compte dans le pipeline.')}</div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="border-b border-[#e2e2e2] bg-[#f7f7f7]">
                <tr>
                  {[t('Compte'), t('Tier'), t('Type'), t('Hôtels'), t('Poids'), t('Go-live'), 'CSM', t('Implémenteur')].map((heading, index) => (
                    <th key={index} className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#696969] ${index === 0 ? 'text-left' : 'text-center'}`}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e2e2]">
                {sortedAccounts.map(account => (
                  <tr key={account.accountId} className="hover:bg-[#faf9f5]">
                    <td className="px-4 py-3 font-semibold text-[#1a1a1a]">
                      {account.accountName}
                      {account.signedDateSource !== 'deal' && (
                        <span className="ml-1 text-[10px] font-normal text-[#8a8a8a]" title={t('Date de signature reconstituée, pas issue d’un deal Zoho.')}>
                          ({t(signedDateSourceLabel(account.signedDateSource))})
                        </span>
                      )}
                      {account.rawCsm && !account.resolvedCsm && (
                        <span className="mt-0.5 block text-[10px] font-semibold text-[#b7221b]">{t('CSM Zoho non résolu')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-[#4a4a4a]">{account.tier}</td>
                    <td className="px-4 py-3 text-center text-[#4a4a4a]">{account.isGroup ? t('Groupe') : t('Indiv')}{account.dmbookOnly ? ' · DMB' : ''}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-[#4a4a4a]">
                      {account.hotels}
                      {account.hotelsSource !== 'zoho_field' && (
                        <span className="ml-1 text-[10px] font-normal text-[#8a8a8a]" title={t('Nombre d’hôtels reconstitué, pas issu du champ Zoho dédié.')}>
                          ({t(hotelsSourceLabel(account.hotelsSource))})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-[#4a4a4a]">{account.weight}</td>
                    <td className="px-4 py-3 text-center text-[#4a4a4a]">{formatMonth(account.goLiveMonth, locale)}</td>
                    <td className="px-4 py-3">
                      <CsmAssignmentCell
                        account={account}
                        csmRoster={csmRoster}
                        csmOptionEligible={csmOptionEligible}
                        onAssign={onAssign}
                      />
                    </td>
                    <td className="px-4 py-3 text-center text-[#4a4a4a]">{account.obOwner ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-[#e2e2e2] md:hidden">
            {sortedAccounts.map(account => (
              <article key={account.accountId} className="space-y-3 p-4">
                <div>
                  <h3 className="font-semibold text-[#1a1a1a]">{account.accountName}</h3>
                  <p className="mt-0.5 text-xs text-[#8a8a8a]">
                    {account.tier} · {account.isGroup ? t('Groupe') : t('Indiv')}{account.dmbookOnly ? ' · DMB' : ''} · {account.hotels} {t('hôtels')} · {t('poids')} {account.weight} · {formatMonth(account.goLiveMonth, locale)}
                  </p>
                  {account.rawCsm && !account.resolvedCsm && <p className="mt-0.5 text-xs font-semibold text-[#b7221b]">{t('CSM Zoho non résolu')}</p>}
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8a8a8a]">CSM</p>
                  <CsmAssignmentCell
                    account={account}
                    csmRoster={csmRoster}
                    csmOptionEligible={csmOptionEligible}
                    onAssign={onAssign}
                  />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8a8a8a]">{t('Implémenteur')}</p>
                  <p className="text-sm text-[#4a4a4a]">{account.obOwner ?? '—'}</p>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function CsmAssignmentCell({
  account,
  csmRoster,
  csmOptionEligible,
  onAssign,
}: {
  account: AccountRow
  csmRoster: CsmRosterMember[]
  csmOptionEligible: (member: CsmRosterMember) => boolean
  onAssign: (body: Record<string, unknown>) => Promise<void>
}) {
  const { t } = useLocale()

  if (!account.csmName) {
    return <span className="text-xs font-semibold text-[#b7221b]">{t('aucun dispo')}</span>
  }

  return (
    <div className="flex items-center gap-1.5">
      <label className="sr-only" htmlFor={`csm-assign-${account.accountId}`}>CSM</label>
      <select
        id={`csm-assign-${account.accountId}`}
        value={account.csmName}
        onChange={event => onAssign({
          account_id: account.accountId,
          account_name: account.accountName,
          group_id: account.groupId,
          ob_owner: account.obOwner,
          ob_locked: account.obLocked,
          csm_name: event.target.value,
          csm_locked: true,
        })}
        className="min-w-[130px] rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 text-xs text-[#1a1a1a] outline-none focus:border-[#8064b3] focus:ring-1 focus:ring-[#8064b3]"
      >
        {csmRoster.map(member => (
          <option key={member.name} value={member.name} disabled={!csmOptionEligible(member)}>
            {member.name}{csmOptionEligible(member) ? '' : ` (${t('indisponible')})`}
          </option>
        ))}
      </select>
      {account.csmSource === 'override' && <Lock aria-hidden="true" size={13} className="shrink-0 text-[#59319f]" />}
      {account.csmSource === 'continuity' && (
        <span className="shrink-0" title={t('continuité de groupe')}>
          <Link2 aria-hidden="true" size={13} className="text-[#3b72d1]" />
        </span>
      )}
      {account.csmLocked && (
        <button
          type="button"
          onClick={() => onAssign({
            account_id: account.accountId,
            account_name: account.accountName,
            group_id: account.groupId,
            ob_owner: account.obOwner,
            ob_locked: account.obLocked,
            csm_name: null,
            csm_locked: false,
          })}
          className="shrink-0 rounded-md border border-[#d8d8d8] px-1.5 py-1 text-[10px] font-semibold text-[#696969] hover:bg-[#f7f7f7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8064b3]"
        >
          {t('Lever')}
        </button>
      )}
    </div>
  )
}

function ChargeBar({ load, capacity }: { load: number; capacity: number }) {
  const { t } = useLocale()
  // Une capacité effective nulle qui porte de la charge (Absent/STOP avec une attribution
  // par override ou continuité) est une surcharge visible, jamais un "0 %" silencieux.
  const isOverload = capacity <= 0 ? load > 0 : load > capacity
  const ratio = capacity > 0 ? load / capacity : (load > 0 ? 1.5 : 0)
  const width = Math.min(100, Math.max(0, ratio * 100))
  const colorClass = isOverload ? 'bg-[#ed524e]' : ratio >= 0.85 ? 'bg-[#e8b84b]' : 'bg-[#1D9E75]'
  const textColorClass = isOverload ? 'text-[#b7221b]' : ratio >= 0.85 ? 'text-[#84550e]' : 'text-[#1c6437]'
  const label = capacity > 0 ? `${load} / ${capacity}` : (load > 0 ? `${load} / 0 (${t('surcharge')})` : `${load} / 0`)
  return (
    <div className="flex min-w-[140px] items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e2e2e2]"><div className={`h-full rounded-full ${colorClass}`} style={{ width: `${width}%` }} /></div>
      <span className={`whitespace-nowrap text-right text-xs font-bold tabular-nums ${textColorClass}`}>{label}</span>
    </div>
  )
}

function StatusPill({ availability, load, capacity }: { availability: Availability; load: number; capacity: number }) {
  const { t } = useLocale()
  if (availability === 'absent') return <span className="rounded-full bg-[#ececec] px-2.5 py-1 text-xs font-semibold text-[#696969]">{t('Absent')}</span>
  if (availability === 'stop') return <span className="rounded-full bg-[#fee3e2] px-2.5 py-1 text-xs font-semibold text-[#b7221b]">STOP</span>
  const isOverload = capacity <= 0 ? load > 0 : load > capacity
  const ratio = capacity > 0 ? load / capacity : 0
  if (isOverload) return <span className="rounded-full bg-[#fee3e2] px-2.5 py-1 text-xs font-semibold text-[#b7221b]">{t('Surcharge')}</span>
  if (ratio >= 0.85) return <span className="rounded-full bg-[#fbf1ca] px-2.5 py-1 text-xs font-semibold text-[#84550e]">{t('Limite')}</span>
  return <span className="rounded-full bg-[#e2f5ec] px-2.5 py-1 text-xs font-semibold text-[#1c6437]">OK</span>
}

function CsmProjectionSection({ data }: { data: PlanChargeResponse }) {
  const { locale, t } = useLocale()
  const csmNames = useMemo(() => data.csmRoster.filter(member => member.availability !== 'absent' && member.effectiveCapacity > 0).map(member => member.name), [data.csmRoster])
  const csmCapLine = useMemo(() => {
    const capacities = data.csmRoster.filter(member => member.availability !== 'absent' && member.effectiveCapacity > 0).map(member => member.monthlyCapacityPoints)
    return capacities.length > 0 ? Math.min(...capacities) : null
  }, [data.csmRoster])

  const csmChartData = useMemo(
    () => data.months.map(month => {
      const row: Record<string, string | number> = { month, label: formatMonth(month, locale) }
      for (const name of csmNames) row[name] = data.csmLoadByMonth[name]?.[month] ?? 0
      return row
    }),
    [data.months, data.csmLoadByMonth, locale, csmNames],
  )

  return (
    <section aria-label={t('Projection CSM')}>
      <article className="rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-[0_4px_10px_rgba(36,25,55,0.05)] sm:p-5">
        <h2 className="text-sm font-bold text-[#1a1a1a]">{t('Points CSM par mois')}</h2>
        <p className="mt-0.5 text-xs text-[#8a8a8a]">{t('Points repris par mois et par CSM, intake à la date de go-live.')}</p>
        <div className="mt-3 h-[300px] w-full" role="img" aria-label={t('Graphique des points CSM projetés par mois')}>
          {csmNames.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={csmChartData} margin={{ top: 16, right: 16, left: -8, bottom: 12 }}>
                <CartesianGrid stroke="#ece8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={value => [formatNumber(Number(value), locale), t('Points')]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {csmCapLine !== null && <ReferenceLine y={csmCapLine} stroke="#b7221b" strokeDasharray="4 4" label={{ value: `${t('plafond')} ${csmCapLine}`, fontSize: 10, fill: '#b7221b', position: 'insideTopRight' }} />}
                {csmNames.map((name, index) => <Bar key={name} dataKey={name} name={name} fill={OWNER_COLORS[index % OWNER_COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={28} />)}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <OverloadNote overloads={data.csmOverloads} emptyMessage={t('Montée en charge CSM absorbable avec l’effectif disponible actuel.')} locale={locale} />
      </article>
    </section>
  )
}

function OverloadNote({ overloads, emptyMessage, locale }: { overloads: OverloadEntry[]; emptyMessage: string; locale: Locale }) {
  const { t } = useLocale()
  if (overloads.length === 0) {
    return <p className="mt-3 rounded-lg border border-[#ccebdd] bg-[#f0fbf6] px-3 py-2.5 text-xs text-[#1c6437]">{emptyMessage}</p>
  }
  return (
    <div className="mt-3 rounded-lg border border-[#f1b4b0] bg-[#fff1f0] px-3 py-2.5 text-xs text-[#8f211d]">
      <ul className="list-disc space-y-1 pl-4">
        {overloads.map((entry, index) => (
          <li key={index}>
            {t('{name} au-dessus du plafond en {month} ({load} pts)')
              .replace('{name}', entry.name)
              .replace('{month}', formatMonth(entry.month, locale))
              .replace('{load}', formatNumber(entry.load, locale))}
          </li>
        ))}
      </ul>
    </div>
  )
}

function WeightRulesSection({ rules }: { rules: WeightRule[] }) {
  const { t } = useLocale()
  return (
    <section className="overflow-hidden rounded-xl border border-[#e2e2e2] bg-white shadow-[0_4px_10px_rgba(36,25,55,0.05)]">
      <div className="border-b border-[#e2e2e2] px-4 py-4 sm:px-5">
        <h2 className="text-sm font-bold text-[#1a1a1a]">{t('Barème')}</h2>
        <p className="mt-0.5 text-xs text-[#8a8a8a]">{t('Le barème vient de la table csm_assignment_rules et se modifie en base, pas depuis cette page.')}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="border-b border-[#e2e2e2] bg-[#f7f7f7]">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[#696969]">{t('Compte')}</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-[#696969]">{t('Points')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e2e2e2]">
            {rules.map((rule, index) => (
              <tr key={index}>
                <td className="px-4 py-3 text-[#4a4a4a]">{weightRuleLabel(rule, t)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-[#1a1a1a]">{rule.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
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

function EmptyChart() {
  const { t } = useLocale()
  return <div className="flex h-full items-center justify-center text-sm text-[#8a8a8a]">{t('Aucune donnée pour ce périmètre')}</div>
}

function CsmSkeleton() {
  const { t } = useLocale()
  return (
    <div className="space-y-6" aria-label={t('Chargement de la page CSM')}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-xl bg-[#ece9ef]" />)}</div>
      <div className="h-64 animate-pulse rounded-xl bg-[#ece9ef]" />
      <div className="h-72 animate-pulse rounded-xl bg-[#ece9ef]" />
      <div className="h-72 animate-pulse rounded-xl bg-[#ece9ef]" />
    </div>
  )
}

function signedDateSourceLabel(source: AccountRow['signedDateSource']): string {
  if (source === 'account_created') return 'date de création du compte'
  return 'source inconnue'
}

function hotelsSourceLabel(source: AccountRow['hotelsSource']): string {
  if (source === 'sibling_count') return 'comptes frères'
  if (source === 'children_count') return 'comptes enfants'
  return 'valeur par défaut'
}

function weightRuleLabel(rule: WeightRule, t: (text: string) => string): string {
  const parts = [rule.tier, rule.customerType]
  if (rule.dmbookOnly) parts.push(t('Dmbook seul'))
  return parts.join(' · ')
}

function formatMonth(month: string, locale: Locale): string {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return '—'
  const [year, monthNumber] = month.split('-').map(Number)
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { month: '2-digit', year: '2-digit' }).format(new Date(year, monthNumber - 1, 1))
}

function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR').format(value)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function readMany(params: URLSearchParams, key: string): string[] {
  return params.getAll(key).flatMap(value => value.split(',')).map(value => value.trim()).filter(Boolean)
}
