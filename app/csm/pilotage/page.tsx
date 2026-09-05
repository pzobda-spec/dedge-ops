'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Link2, Lock } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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

type Tier = 'Bronze' | 'Silver' | 'Gold' | 'Key'
type Availability = 'full' | 'relache' | 'absent' | 'stop'
type ObSource = 'override' | 'auto' | null
type CsmSource = 'override' | 'continuity' | 'auto' | null

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
}

export default function CsmPage() {
  const { locale, t } = useLocale()
  const [data, setData] = useState<PlanChargeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch('/api/onboarding/plan-charge', { signal: controller.signal })
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
      const response = await fetch('/api/onboarding/plan-charge')
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
      const response = await fetch('/api/onboarding/plan-charge/assignments', {
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
      const response = await fetch('/api/onboarding/plan-charge/roster', {
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
  const portfolioAccounts = useMemo(
    () => csmPortfolios.reduce((sum, row) => sum + row.liveAccounts, 0),
    [csmPortfolios],
  )
  const attentionProjectsTotal = useMemo(
    () => csmPortfolios.reduce((sum, row) => sum + row.attentionProjects, 0),
    [csmPortfolios],
  )
  const goLivesThisMonthTotal = useMemo(
    () => csmPortfolios.reduce((sum, row) => sum + row.goLivesThisMonth, 0),
    [csmPortfolios],
  )

  return (
    <main className="min-h-screen" style={{ backgroundColor: 'var(--bg-canvas)', color: 'var(--fg1)' }} aria-busy={loading}>
      <header className="border-b border-[#e2e2e2] bg-white px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-[#1a1a1a]">{t('Pilotage CSM')}</h1>
            <p className="mt-1 text-sm text-[#696969]">
              {t('Suit le portefeuille, la charge et la montée en charge de l’équipe CSM.')}
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

            <section aria-label={t('Indicateurs clés')} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <KpiCard label={t('CSM disponibles')} value={formatNumber(availableCsmCount, locale)} subtitle={t('Dispo ou relâche')} />
              <KpiCard label={t('Comptes en portefeuille')} value={formatNumber(portfolioAccounts, locale)} subtitle={t('Comptes live rattachés à un CSM')} />
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
