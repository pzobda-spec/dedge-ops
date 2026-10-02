'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { OnboardingProject, ProjectStatus, RiskLevel } from '@/lib/zoho/projectsClient'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { IMPLEMENTATION_GROUP, normalizeOnboardingProjectOwner } from '@/lib/onboarding/constants'
import { getOnboardingOverviewMetrics } from '@/lib/onboarding/overviewMetrics'
import { formatDate } from '@/lib/utils/dates'
import { useLocale } from '@/lib/i18n/LocaleContext'
import type { Locale } from '@/lib/i18n/locale'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ProjectStatus, { bg: string; text: string }> = {
  not_started:    { bg: 'bg-[#f7f7f7]', text: 'text-[#696969]' },
  in_progress:    { bg: 'bg-[#d4e4f8]', text: 'text-[#2b5bb7]' },
  pending_client: { bg: 'bg-[#fbf1ca]', text: 'text-[#84550e]' },
  live:           { bg: 'bg-[#cff7dc]', text: 'text-[#1c6437]' },
  blocked:        { bg: 'bg-[#fee3e2]', text: 'text-[#b7221b]' },
  standby:        { bg: 'bg-[#f1e8fb]', text: 'text-[#6b3ba1]' },
  other:          { bg: 'bg-[#f7f7f7]', text: 'text-[#696969]' },
}

const STATUS_LABELS: Record<ProjectStatus, string> = {
  not_started:    'Non démarré',
  in_progress:    'En cours',
  pending_client: 'En attente client',
  live:           'Live',
  blocked:        'Bloqué',
  standby:        'Standby',
  other:          'Autre',
}

type DefinedRiskLevel = Exclude<RiskLevel, null>
type RiskFilter = 'all' | DefinedRiskLevel | 'high_or_critical'
type ClientTypologyFilter = 'all' | 'group' | 'individual' | 'unlinked'
type ReportScope = 'mine' | 'implementation' | 'global' | `owner:${string}`

function previousMonth(): string {
  const today = new Date()
  const previous = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${month}-01T00:00:00Z`))
}

function ttvLabel(days: number | null, locale: Locale): string {
  if (days === null) return '—'
  return `${new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 1 }).format(days)} ${locale === 'en' ? 'days' : 'jours'}`
}

function compactTtvLabel(days: number | null, locale: Locale): string {
  if (days === null) return '—'
  return `${new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 1 }).format(days)} ${locale === 'en' ? 'd' : 'j'}`
}

const RISK_LABELS: Record<DefinedRiskLevel, string> = {
  low: 'Faible',
  medium: 'Modéré',
  high: 'Élevé',
  critical: 'Critique',
}

const RISK_COLORS: Record<DefinedRiskLevel, string> = {
  low: 'bg-[#cff7dc] text-[#1c6437]',
  medium: 'bg-[#fbf1ca] text-[#84550e]',
  high: 'bg-[#ffe8cc] text-[#9a4b00]',
  critical: 'bg-[#fee3e2] text-[#b7221b]',
}

const PRODUCT_CONFIG: Record<string, { bg: string; text: string }> = {
  'LoungeUp':    { bg: 'bg-[#d4e4f8]', text: 'text-[#2b5bb7]' },
  'Dmbook Pro':  { bg: 'bg-[#e8dbfa]', text: 'text-[#59319f]' },
  'WhatsApp':    { bg: 'bg-[#cff7dc]', text: 'text-[#1c6437]' },
  'Mobile Keys': { bg: 'bg-[#f7f7f7]', text: 'text-[#696969]' },
}

function productBadge(product: string): string {
  const config = PRODUCT_CONFIG[product]
  return config ? `${config.bg} ${config.text}` : 'bg-[#f7f7f7] text-[#696969]'
}

function sortScore(project: OnboardingProject): number {
  if (project.isBlocked) return 0
  if (project.riskLevel === 'critical') return 1
  if (project.riskLevel === 'high') return 2
  if (project.isOverdue) return 3
  if (project.riskLevel === 'medium') return 4
  if (project.status === 'pending_client') return 5
  if (project.status === 'in_progress') return 6
  if (project.status === 'not_started') return 7
  if (project.status === 'standby') return 8
  if (project.status === 'live') return 9
  return 10
}

function sortProjects(a: OnboardingProject, b: OnboardingProject): number {
  const priorityDifference = sortScore(a) - sortScore(b)
  if (priorityDifference !== 0) return priorityDifference

  if (a.endDate && b.endDate && a.endDate !== b.endDate) {
    return a.endDate.localeCompare(b.endDate)
  }
  if (a.endDate && !b.endDate) return -1
  if (!a.endDate && b.endDate) return 1
  return a.hotelName.localeCompare(b.hotelName, 'fr')
}

function plural(value: number, singular: string, pluralForm = `${singular}s`): string {
  return value === 1 ? singular : pluralForm
}

function countLabel(value: number, locale: Locale, fr: string, en: string): string {
  return `${value} ${locale === 'en' ? plural(value, en) : plural(value, fr)}`
}

function normalizePerson(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR')
    .replace(/[^a-z0-9]+/g, '')
}

// ─── Small components ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ProjectStatus }) {
  const { t } = useLocale()
  const colors = STATUS_COLORS[status]
  return (
    <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${colors.bg} ${colors.text}`}>
      {t(STATUS_LABELS[status])}
    </span>
  )
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  const { t } = useLocale()
  if (!risk) return <span className="text-xs text-[#9a9a9a]">{t('Non renseigné')}</span>
  return (
    <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${RISK_COLORS[risk]}`}>
      {t(RISK_LABELS[risk])}
    </span>
  )
}

function ProgressBar({ value }: { value: number }) {
  const { t } = useLocale()
  const safeValue = Math.max(0, Math.min(value, 100))
  return (
    <div className="flex min-w-[120px] items-center gap-2.5">
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-[#e8e8e8]"
        role="progressbar"
        aria-label={t('Progression du projet')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safeValue}
      >
        <div className="h-full rounded-full bg-[#59319f]" style={{ width: `${safeValue}%` }} />
      </div>
      <span className="w-9 text-right text-xs font-medium tabular-nums text-[#4a4a4a]">{safeValue}%</span>
    </div>
  )
}

function OverviewStat({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[#e6e0eb] bg-white p-2 sm:p-3">
      <p className="text-[10px] font-medium leading-4 text-[#696969] sm:text-xs">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-[#1f1f1f] sm:text-2xl">{value}</p>
      {detail && <p className="mt-1 hidden text-[11px] leading-4 text-[#696969] sm:block">{detail}</p>}
    </div>
  )
}

type KpiTone = 'neutral' | 'danger' | 'warning' | 'amber' | 'client'

const KPI_TONES: Record<KpiTone, { value: string; icon: string; selected: string }> = {
  neutral: {
    value: 'text-[#1f1f1f]',
    icon: 'bg-[#f0eafb] text-[#59319f]',
    selected: 'border-[#8c5bdb] ring-2 ring-[#e8dbfa]',
  },
  danger: {
    value: 'text-[#b7221b]',
    icon: 'bg-[#fee3e2] text-[#b7221b]',
    selected: 'border-[#ed524e] ring-2 ring-[#fee3e2]',
  },
  warning: {
    value: 'text-[#9a4b00]',
    icon: 'bg-[#ffe8cc] text-[#9a4b00]',
    selected: 'border-[#e58a2b] ring-2 ring-[#ffe8cc]',
  },
  amber: {
    value: 'text-[#84550e]',
    icon: 'bg-[#fbf1ca] text-[#84550e]',
    selected: 'border-[#d4a72c] ring-2 ring-[#fbf1ca]',
  },
  client: {
    value: 'text-[#2b5bb7]',
    icon: 'bg-[#d4e4f8] text-[#2b5bb7]',
    selected: 'border-[#6b94df] ring-2 ring-[#d4e4f8]',
  },
}

function KpiCard({
  label,
  value,
  detail,
  tone,
  selected,
  onClick,
}: {
  label: string
  value: number
  detail: string
  tone: KpiTone
  selected: boolean
  onClick: () => void
}) {
  const colors = KPI_TONES[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`group min-h-[132px] rounded-xl border bg-white p-4 text-left shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(0,0,0,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#59319f] focus-visible:ring-offset-2 ${
        selected ? colors.selected : 'border-[#e2e2e2]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#696969]">{label}</p>
          <p className={`mt-2 text-3xl font-bold tabular-nums ${colors.value}`}>{value}</p>
        </div>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-base font-semibold ${colors.icon}`} aria-hidden="true">
          {tone === 'neutral' ? '↗' : '!'}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[#696969]">{detail}</p>
    </button>
  )
}

function LoadingState() {
  const { t } = useLocale()
  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8" aria-live="polite" aria-busy="true">
      <p className="sr-only">{t('Chargement des projets d’onboarding…')}</p>
      <div className="grid grid-cols-4 gap-2 xl:grid-cols-8">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-lg border border-[#e2e2e2] bg-white p-3">
            <div className="h-3 w-16 rounded bg-[#ededed]" />
            <div className="mt-4 h-7 w-12 rounded bg-[#ededed]" />
          </div>
        ))}
      </div>
      <div className="h-24 animate-pulse rounded-xl border border-[#e2e2e2] bg-white" />
      <div className="h-72 animate-pulse rounded-xl border border-[#e2e2e2] bg-white" />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MesProjetsPage() {
  const { locale, t } = useLocale()
  const router = useRouter()
  const { user, loading: userLoading } = useCurrentUser()
  const [projects, setProjects] = useState<OnboardingProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [requestKey, setRequestKey] = useState(0)

  const [reportScope, setReportScope] = useState<ReportScope>('implementation')
  const [reportMonth, setReportMonth] = useState(previousMonth)
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all')
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all')
  const [clientTypologyFilter, setClientTypologyFilter] = useState<ClientTypologyFilter>('all')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function loadProjects() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/zoho/projects', { signal: controller.signal })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json() as { projects?: OnboardingProject[] }
        if (!Array.isArray(data.projects)) throw new Error(t('Réponse invalide'))
        setProjects(data.projects.map(normalizeOnboardingProjectOwner))
      } catch (loadError) {
        if (controller.signal.aborted) return
        console.error(loadError)
        setError(t('Impossible de charger les projets d’onboarding.'))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void loadProjects()
    return () => controller.abort()
  }, [requestKey, t])

  const reportOwners = useMemo(() => [...new Set(projects.map(project => project.ownerShort))]
    .sort((a, b) => a.localeCompare(b, 'fr')), [projects])
  const reportProjects = useMemo(() => {
    if (reportScope === 'global') return projects
    if (reportScope === 'implementation') {
      return projects.filter(project => (IMPLEMENTATION_GROUP as readonly string[]).includes(project.ownerShort))
    }
    if (reportScope === 'mine') {
      if (!user?.email) return []
      const email = user.email.toLowerCase()
      const fullName = user.full_name?.trim() ?? ''
      const firstName = fullName.split(/\s+/)[0] ?? ''
      const emailName = user.email.split('@')[0]?.split('.')[0] ?? ''
      const identities = new Set([fullName, firstName, emailName].map(normalizePerson).filter(Boolean))
      return projects.filter(project =>
        project.ownerEmail?.toLowerCase() === email
        || identities.has(normalizePerson(project.ownerName))
        || identities.has(normalizePerson(project.ownerShort))
      )
    }
    return projects.filter(project => project.ownerShort === reportScope.slice('owner:'.length))
  }, [projects, reportScope, user])
  const reportMetrics = useMemo(
    () => getOnboardingOverviewMetrics(reportProjects, reportMonth),
    [reportProjects, reportMonth],
  )
  const implementationRows = useMemo(() => IMPLEMENTATION_GROUP.map(owner => ({
    owner,
    metrics: getOnboardingOverviewMetrics(projects.filter(project => project.ownerShort === owner), reportMonth),
  })), [projects, reportMonth])

  const portfolioProjects = reportProjects

  const metrics = useMemo(() => ({
    total: portfolioProjects.length,
    accounts: new Set(portfolioProjects.map(project => project.hotelName)).size,
    blocked: portfolioProjects.filter(project => project.isBlocked).length,
    highRisk: portfolioProjects.filter(project => project.riskLevel === 'high' || project.riskLevel === 'critical').length,
    overdue: portfolioProjects.filter(project => project.isOverdue).length,
    pendingClient: portfolioProjects.filter(project => project.status === 'pending_client').length,
  }), [portfolioProjects])

  const filteredProjects = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('fr')
    return portfolioProjects
      .filter(project => statusFilter === 'all' || project.status === statusFilter)
      .filter(project => clientTypologyFilter === 'all' || project.clientTypology === clientTypologyFilter)
      .filter(project => {
        if (riskFilter === 'all') return true
        if (riskFilter === 'high_or_critical') {
          return project.riskLevel === 'high' || project.riskLevel === 'critical'
        }
        return project.riskLevel === riskFilter
      })
      .filter(project => !overdueOnly || project.isOverdue)
      .filter(project => {
        if (!normalizedSearch) return true
        return [
          project.hotelName,
          project.name,
          project.product,
          project.ownerName,
          project.accountCRMName,
          project.clientName,
          project.pms,
        ].some(value => value?.toLocaleLowerCase('fr').includes(normalizedSearch))
      })
      .sort(sortProjects)
  }, [clientTypologyFilter, overdueOnly, portfolioProjects, riskFilter, search, statusFilter])

  const isLoading = loading || (reportScope === 'mine' && userLoading)
  const hasListFilters = statusFilter !== 'all' || riskFilter !== 'all' || clientTypologyFilter !== 'all' || overdueOnly || Boolean(search.trim())

  function resetListFilters() {
    setStatusFilter('all')
    setRiskFilter('all')
    setClientTypologyFilter('all')
    setOverdueOnly(false)
    setSearch('')
  }

  function showAllPortfolio() {
    setSearch('')
    setStatusFilter('all')
    setRiskFilter('all')
    setClientTypologyFilter('all')
    setOverdueOnly(false)
  }

  function showBlockedProjects() {
    setSearch('')
    setStatusFilter('blocked')
    setRiskFilter('all')
    setClientTypologyFilter('all')
    setOverdueOnly(false)
  }

  function showHighRiskProjects() {
    setSearch('')
    setStatusFilter('all')
    setRiskFilter('high_or_critical')
    setClientTypologyFilter('all')
    setOverdueOnly(false)
  }

  function showOverdueProjects() {
    setSearch('')
    setStatusFilter('all')
    setRiskFilter('all')
    setClientTypologyFilter('all')
    setOverdueOnly(true)
  }

  function showPendingClientProjects() {
    setSearch('')
    setStatusFilter('pending_client')
    setRiskFilter('all')
    setClientTypologyFilter('all')
    setOverdueOnly(false)
  }

  function openProject(project: OnboardingProject) {
    router.push(`/onboarding/${project.id}`)
  }

  return (
    <div style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'var(--bg-canvas)' }} className="min-h-screen">
      <header className="border-b border-[#e2e2e2] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div><h1 className="text-xl font-semibold text-[#1f1f1f]">{t('Projets d’implémentation')}</h1>
          <p className="mt-1 text-sm text-[#696969]">
            {isLoading
              ? t('Chargement du portefeuille…')
              : error
                ? t('Le portefeuille est momentanément indisponible.')
                : `${countLabel(projects.length, locale, 'projet', 'project')} ${t('dans Zoho Projects')}`}
          </p></div>
          <div className="inline-flex max-w-full self-start overflow-x-auto rounded-lg border border-[#ded8e8] bg-[#f7f5fa] p-1" aria-label={t('Affichage des projets')}>
            <button type="button" aria-pressed="true" className="flex-none shrink-0 whitespace-nowrap rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-[#59319f] shadow-sm">{t('Vue d’ensemble')}</button>
            <button type="button" onClick={() => router.push('/onboarding/board')} aria-pressed="false" className="flex-none shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold text-[#696969] hover:text-[#59319f]">Board</button>
            <button type="button" onClick={() => router.push('/onboarding/pilotage')} aria-pressed="false" className="flex-none shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold text-[#696969] hover:text-[#59319f]">{t('Pilotage')}</button>
            <button type="button" onClick={() => router.push('/onboarding/clients')} aria-pressed="false" className="flex-none shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold text-[#696969] hover:text-[#59319f]">{t('Clients')}</button>
          </div>
        </div>
      </header>

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-[#f3b9b7] bg-white px-6 py-12 text-center shadow-sm" role="alert">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#fee3e2] font-semibold text-[#b7221b]" aria-hidden="true">!</div>
            <h2 className="mt-4 text-base font-semibold text-[#1f1f1f]">{t('Chargement impossible')}</h2>
            <p className="mt-1 text-sm text-[#696969]">{error}</p>
            <button
              type="button"
              onClick={() => setRequestKey(key => key + 1)}
              className="mt-5 rounded-lg bg-[#59319f] px-4 py-2 text-sm font-medium text-white hover:bg-[#48277f] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#59319f] focus-visible:ring-offset-2"
            >
              {t('Réessayer')}
            </button>
          </div>
        </main>
      ) : (
        <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
          <section className="sticky top-0 z-20 rounded-xl border border-[#ded8e8] bg-[#faf8fc] p-3 shadow-[0_4px_16px_rgba(0,0,0,0.1)] sm:p-4" aria-labelledby="overview-heading">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 id="overview-heading" className="text-base font-semibold text-[#1f1f1f]">{t('Overview Onboarding')}</h2>
                <p className="mt-1 text-xs text-[#696969]">{t('Statuts actuels')} · {monthLabel(reportMonth, locale)} : {t('démarrages, go-live et TTV')} · {t('Zoho Projects, cache 5 min')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="text-xs font-medium text-[#4a4a4a]">
                  <span className="mb-1 block">{t('Périmètre')}</span>
                  <select value={reportScope} onChange={event => setReportScope(event.target.value as ReportScope)} className="h-10 min-w-[190px] rounded-lg border border-[#d8d8d8] bg-white px-3 text-sm text-[#1a1a1a] focus:border-[#8c5bdb] focus:outline-none focus:ring-2 focus:ring-[#e8dbfa]">
                    <option value="implementation">{t('Implémentation · Thuy, Dalia, Winli')}</option>
                    <option value="global">{t('Global · tous les projets Zoho')}</option>
                    <option value="mine">{t('Mes projets')}</option>
                    {reportOwners.map(owner => <option key={owner} value={`owner:${owner}`}>{owner}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-[#4a4a4a]">
                  <span className="mb-1 block">{t('Mois des démarrages et go-live')}</span>
                  <input type="month" value={reportMonth} onChange={event => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) setReportMonth(event.target.value) }} className="h-10 rounded-lg border border-[#d8d8d8] bg-white px-3 text-sm text-[#1a1a1a] focus:border-[#8c5bdb] focus:outline-none focus:ring-2 focus:ring-[#e8dbfa]" />
                </label>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-1.5 sm:gap-2 xl:grid-cols-8">
              <OverviewStat label={t('Actifs')} value={reportMetrics.active} detail={t('In Progress + Pending')} />
              <OverviewStat label={t('In Progress')} value={reportMetrics.inProgress} />
              <OverviewStat label={t('Pending')} value={reportMetrics.pending} />
              <OverviewStat label={t('Bloqués')} value={reportMetrics.blocked} />
              <OverviewStat label="Standby" value={reportMetrics.standby} />
              <OverviewStat label={t('Démarrages')} value={reportMetrics.starts} />
              <OverviewStat label={t('Go-live')} value={reportMetrics.goLives} />
              <OverviewStat label={t('TTV moyen')} value={compactTtvLabel(reportMetrics.averageTtvDays, locale)} detail={`${reportMetrics.ttvSamples}/${reportMetrics.goLives} ≤ 6 ${t('mois')}`} />
            </div>
          </section>

          <section className="space-y-2" aria-label={t('Équipe implémentation · détail par onboarder')}>
            <div className="overflow-x-auto rounded-xl border border-[#e6e0eb] bg-white">
              <table className="w-full min-w-[840px] text-sm">
                <caption className="px-4 py-3 text-left text-sm font-semibold text-[#1f1f1f]">{t('Équipe implémentation · détail par onboarder')}</caption>
                <thead className="border-y border-[#ededed] bg-[#f7f7f7] text-xs text-[#696969]"><tr>
                  <th className="px-3 py-2 text-left font-medium">{t('Onboarder')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('Actifs')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('In Progress')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('Pending')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('Bloqués')}</th>
                  <th className="px-3 py-2 text-right font-medium">Standby</th>
                  <th className="px-3 py-2 text-right font-medium">{t('Démarrages')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('Go-live')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('TTV moyen')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('Échantillon TTV')}</th>
                </tr></thead>
                <tbody className="divide-y divide-[#ededed]">
                  {implementationRows.map(({ owner, metrics: row }) => <tr key={owner} className={reportScope === `owner:${owner}` ? 'bg-[#f7f3fc]' : ''}>
                    <td className="px-3 py-2.5 font-medium text-[#1f1f1f]"><button type="button" aria-pressed={reportScope === `owner:${owner}`} onClick={() => setReportScope(`owner:${owner}`)} className="text-[#59319f] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#59319f]">{owner}</button></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.active}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.inProgress}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.pending}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.blocked}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.standby}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.starts}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.goLives}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{ttvLabel(row.averageTtvDays, locale)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.ttvSamples}/{row.goLives}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            <p className="text-xs leading-5 text-[#696969]">{t('Périmètre commun aux indicateurs et à la liste. Statuts et responsables actuels ; démarrages = start_date Zoho ; go-live = Live date dans le mois. TTV = start_date → Live date, projets de plus de six mois exclus de la moyenne. Un projet Zoho par produit, même pour un hôtel commun.')}</p>
          </section>

          <section aria-labelledby="kpi-heading">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 id="kpi-heading" className="text-base font-semibold text-[#1f1f1f]">{t('Priorités du portefeuille')}</h2>
                <p className="mt-0.5 text-xs text-[#696969]">{t('Cliquez sur un indicateur pour afficher les projets concernés.')}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <KpiCard
                label={t('Projets du périmètre')}
                value={metrics.total}
                detail={countLabel(metrics.accounts, locale, 'compte', 'account')}
                tone="neutral"
                selected={statusFilter === 'all' && riskFilter === 'all' && !overdueOnly}
                onClick={showAllPortfolio}
              />
              <KpiCard
                label={t('Bloqués')}
                value={metrics.blocked}
                detail={t('À débloquer en priorité')}
                tone="danger"
                selected={statusFilter === 'blocked' && riskFilter === 'all' && !overdueOnly}
                onClick={showBlockedProjects}
              />
              <KpiCard
                label={t('Risque élevé')}
                value={metrics.highRisk}
                detail={t('Niveau élevé ou critique')}
                tone="warning"
                selected={statusFilter === 'all' && riskFilter === 'high_or_critical' && !overdueOnly}
                onClick={showHighRiskProjects}
              />
              <KpiCard
                label={t('Date cible dépassée')}
                value={metrics.overdue}
                detail={t('Hors projets déjà live')}
                tone="amber"
                selected={statusFilter === 'all' && riskFilter === 'all' && overdueOnly}
                onClick={showOverdueProjects}
              />
              <KpiCard
                label={t('En attente client')}
                value={metrics.pendingClient}
                detail={t('Dépendance côté client')}
                tone="client"
                selected={statusFilter === 'pending_client' && riskFilter === 'all' && !overdueOnly}
                onClick={showPendingClientProjects}
              />
            </div>
          </section>

          <section className="rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]" aria-labelledby="filters-heading">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 id="filters-heading" className="text-sm font-semibold text-[#1f1f1f]">{t('Affiner la liste')}</h2>
                <p className="mt-0.5 text-xs text-[#696969]">
                  {locale === 'en'
                    ? `${countLabel(filteredProjects.length, locale, 'project', 'project')} shown`
                    : `${filteredProjects.length} ${plural(filteredProjects.length, 'projet')} affiché${filteredProjects.length === 1 ? '' : 's'}`}
                </p>
              </div>
              {hasListFilters && (
                <button
                  type="button"
                  onClick={resetListFilters}
                  className="self-start text-xs font-medium text-[#59319f] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#59319f] sm:self-auto"
                >
                  {t('Effacer les filtres')}
                </button>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.5fr)_repeat(3,minmax(140px,1fr))]">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#4a4a4a]">{t('Recherche')}</span>
                <div className="relative">
                  <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a8a8a]" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <input
                    type="search"
                    placeholder={t('Hôtel, produit, responsable, PMS…')}
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    className="h-10 w-full rounded-lg border border-[#d8d8d8] bg-white pl-9 pr-3 text-sm text-[#1a1a1a] placeholder:text-[#9a9a9a] focus:border-[#8c5bdb] focus:outline-none focus:ring-2 focus:ring-[#e8dbfa]"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#4a4a4a]">{t('Statut Zoho')}</span>
                <select
                  value={statusFilter}
                  onChange={event => setStatusFilter(event.target.value as ProjectStatus | 'all')}
                  className="h-10 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 text-sm text-[#1a1a1a] focus:border-[#8c5bdb] focus:outline-none focus:ring-2 focus:ring-[#e8dbfa]"
                >
                  <option value="all">{t('Tous les statuts')}</option>
                  {(Object.entries(STATUS_LABELS) as [ProjectStatus, string][]).map(([value, label]) => (
                    <option key={value} value={value}>{t(label)}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#4a4a4a]">{t('Niveau de risque')}</span>
                <select
                  value={riskFilter}
                  onChange={event => setRiskFilter(event.target.value as RiskFilter)}
                  className="h-10 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 text-sm text-[#1a1a1a] focus:border-[#8c5bdb] focus:outline-none focus:ring-2 focus:ring-[#e8dbfa]"
                >
                  <option value="all">{t('Tous les niveaux')}</option>
                  <option value="high_or_critical">{t('Élevé ou critique')}</option>
                  <option value="critical">{t('Critique')}</option>
                  <option value="high">{t('Élevé')}</option>
                  <option value="medium">{t('Modéré')}</option>
                  <option value="low">{t('Faible')}</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#4a4a4a]">{t('Typologie client')}</span>
                <select
                  value={clientTypologyFilter}
                  onChange={event => setClientTypologyFilter(event.target.value as ClientTypologyFilter)}
                  className="h-10 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 text-sm text-[#1a1a1a] focus:border-[#8c5bdb] focus:outline-none focus:ring-2 focus:ring-[#e8dbfa]"
                >
                  <option value="all">{t('Toutes les typologies')}</option>
                  <option value="group">{t('Groupe')}</option>
                  <option value="individual">{t('Individuel')}</option>
                  <option value="unlinked">{t('Non rattaché')}</option>
                </select>
              </label>
            </div>

            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-[#4a4a4a]">
              <input
                type="checkbox"
                checked={overdueOnly}
                onChange={event => setOverdueOnly(event.target.checked)}
                className="h-4 w-4 rounded border-[#c6c6c6] text-[#59319f] focus:ring-[#8c5bdb]"
              />
              {t('Uniquement les dates cibles dépassées')}
            </label>
          </section>

          <section aria-labelledby="projects-heading">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 id="projects-heading" className="text-base font-semibold text-[#1f1f1f]">{t('Projets')}</h2>
                <p className="mt-0.5 text-xs text-[#696969]">{t('Les alertes les plus prioritaires apparaissent en premier.')}</p>
              </div>
              <span className="rounded-full bg-[#eee8f8] px-2.5 py-1 text-xs font-semibold tabular-nums text-[#59319f]">
                {filteredProjects.length}
              </span>
            </div>

            {filteredProjects.length === 0 ? (
              <div className="rounded-xl border border-[#e2e2e2] bg-white px-6 py-14 text-center shadow-sm">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#f0eafb] text-lg text-[#59319f]" aria-hidden="true">⌕</div>
                <h3 className="mt-4 text-sm font-semibold text-[#1f1f1f]">
                  {reportScope === 'mine' && portfolioProjects.length === 0
                    ? t('Aucun projet ne vous est attribué')
                    : t('Aucun projet trouvé')}
                </h3>
                <p className="mt-1 text-sm text-[#696969]">
                  {hasListFilters ? t('Modifiez ou effacez les filtres pour élargir la liste.') : t('Ce périmètre ne contient actuellement aucun projet.')}
                </p>
                {hasListFilters && (
                  <button
                    type="button"
                    onClick={resetListFilters}
                    className="mt-4 rounded-lg border border-[#c8b1eb] bg-white px-3 py-2 text-xs font-medium text-[#59319f] hover:bg-[#f7f5fa] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#59319f]"
                  >
                    {t('Effacer les filtres')}
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-xl border border-[#e2e2e2] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.06)] lg:block">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1080px] text-sm">
                      <thead className="border-b border-[#e2e2e2] bg-[#f7f7f7]">
                        <tr>
                          <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#696969]">{t('Hôtel / compte')}</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#696969]">{t('Produit')}</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#696969]">{t('Responsable')}</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#696969]">{t('Statut Zoho')}</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#696969]">{t('Risque')}</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#696969]">{t('Progression')}</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#696969]">{t('Go-live cible')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#ededed]">
                        {filteredProjects.map(project => (
                          <tr
                            key={project.id}
                            role="link"
                            tabIndex={0}
                            aria-label={`${t('Ouvrir le projet')} ${project.hotelName}`}
                            onClick={() => openProject(project)}
                            onKeyDown={event => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                openProject(project)
                              }
                            }}
                            className="cursor-pointer transition-colors hover:bg-[#f7f4fd] focus:bg-[#f7f4fd] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8c5bdb]"
                          >
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                {project.isBlocked && <span className="h-2 w-2 flex-none rounded-full bg-[#ed524e]" aria-label={t('Projet bloqué')} />}
                                <span className="max-w-[230px] truncate font-medium text-[#1a1a1a]">{project.hotelName}</span>
                              </div>
                              {project.accountCRMName && (
                                <p className="mt-1 max-w-[230px] truncate pl-4 text-xs text-[#696969]">{project.accountCRMName}</p>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              {project.product ? (
                                <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${productBadge(project.product)}`}>{project.product}</span>
                              ) : (
                                <span className="text-xs text-[#9a9a9a]">{t('Non renseigné')}</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-sm text-[#4a4a4a]">{project.ownerShort || t('Non assigné')}</td>
                            <td className="px-4 py-3.5"><StatusBadge status={project.status} /></td>
                            <td className="px-4 py-3.5"><RiskBadge risk={project.riskLevel} /></td>
                            <td className="w-44 px-4 py-3.5"><ProgressBar value={project.percentComplete} /></td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <span className={`text-xs font-medium ${project.isOverdue ? 'text-[#b7221b]' : 'text-[#4a4a4a]'}`}>
                                {project.endDate ? formatDate(project.endDate) : t('Non renseignée')}
                              </span>
                              {project.isOverdue && <p className="mt-1 text-[11px] font-medium text-[#b7221b]">{t('Date dépassée')}</p>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
                  {filteredProjects.map(project => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => openProject(project)}
                      aria-label={`${t('Ouvrir le projet')} ${project.hotelName}`}
                      className="rounded-xl border border-[#e2e2e2] bg-white p-4 text-left shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition hover:border-[#c8b1eb] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#59319f] focus-visible:ring-offset-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {project.isBlocked && <span className="h-2 w-2 flex-none rounded-full bg-[#ed524e]" aria-hidden="true" />}
                            <h3 className="truncate text-sm font-semibold text-[#1a1a1a]">{project.hotelName}</h3>
                          </div>
                          <p className="mt-1 truncate text-xs text-[#696969]">{project.ownerShort || t('Non assigné')}</p>
                        </div>
                        <svg className="mt-0.5 h-4 w-4 flex-none text-[#8a8a8a]" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                          <path d="m7.5 4.5 5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={project.status} />
                        <RiskBadge risk={project.riskLevel} />
                        {project.product && (
                          <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${productBadge(project.product)}`}>{project.product}</span>
                        )}
                        {project.isOverdue && (
                          <span className="inline-flex rounded-md bg-[#fee3e2] px-2 py-1 text-xs font-medium text-[#b7221b]">{t('Date dépassée')}</span>
                        )}
                      </div>

                      <div className="mt-4">
                        <p className="mb-1.5 text-xs text-[#696969]">{t('Progression')}</p>
                        <ProgressBar value={project.percentComplete} />
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-[#ededed] pt-3 text-xs">
                        <span className="text-[#696969]">{t('Go-live cible')}</span>
                        <span className={`font-medium ${project.isOverdue ? 'text-[#b7221b]' : 'text-[#4a4a4a]'}`}>
                          {project.endDate ? formatDate(project.endDate) : t('Non renseignée')}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>
        </main>
      )}
    </div>
  )
}
