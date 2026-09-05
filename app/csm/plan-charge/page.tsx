'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
const GRID = '#e2e2e2'
const TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: `1px solid ${GRID}`,
  borderRadius: 10,
  boxShadow: '0 8px 24px rgba(36,25,55,0.12)',
  fontSize: 12,
}
const OWNER_COLORS = ['#59319f', '#3b72d1', '#1D9E75', '#d58b28', '#c2410c', '#8c5bdb', '#447a76', '#b7221b']

const AVAILABILITY_LABEL: Record<Availability, string> = {
  full: 'Dispo',
  relache: 'Relâche',
  absent: 'Absent',
  stop: 'STOP',
}
const OB_ROLE_ELIGIBILITY: Record<ObRole, string> = {
  senior: 'tout',
  junior: 'indiv + groupes de moins de 5',
  alternant: 'indiv seulement',
  stagiaire: 'indiv seulement',
}

type Tier = 'Bronze' | 'Silver' | 'Gold' | 'Key'
type Availability = 'full' | 'relache' | 'absent' | 'stop'
type ObRole = 'senior' | 'junior' | 'alternant' | 'stagiaire'
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

interface ObRosterMember {
  name: string
  role: ObRole
  maxProjects: number
  availability: Availability
  effectiveCapacity: number
  load: number
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

interface PlanChargeResponse {
  referenceDate: string
  currentMonth: string
  months: string[]
  accounts: AccountRow[]
  obRoster: ObRosterMember[]
  csmRoster: CsmRosterMember[]
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

export default function PlanChargePage() {
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
      // Les 400 de la route portent des messages actionnables en français
      // (« Un verrou OB exige un implémenteur »), il ne faut pas les avaler.
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

  const totalHotels = useMemo(() => data?.accounts.reduce((sum, account) => sum + account.hotels, 0) ?? 0, [data])
  const overloadedObNames = useMemo(() => new Set(data?.obOverloads.map(entry => entry.name) ?? []).size, [data])

  return (
    <main className="min-h-screen" style={{ backgroundColor: 'var(--bg-canvas)', color: 'var(--fg1)' }} aria-busy={loading}>
      <header className="border-b border-[#e2e2e2] bg-white px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-[#1a1a1a]">{t('Plan de charge')}</h1>
            <p className="mt-1 text-sm text-[#696969]">
              {t('Pré-attribue les comptes signés pas encore live à un implémenteur et un CSM, et projette la montée en charge des deux équipes.')}
            </p>
          </div>
          <nav className="inline-flex max-w-full overflow-x-auto rounded-lg border border-[#ded8e8] bg-[#f7f5fa] p-1" aria-label={t('Vues CSM')}>
            <Link href="/csm/pilotage" className="flex-none shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold text-[#696969] hover:text-[#59319f]">{t('Pilotage')}</Link>
            <span aria-current="page" className="flex-none shrink-0 whitespace-nowrap rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-[#59319f] shadow-sm">{t('Plan de charge')}</span>
          </nav>
        </div>
      </header>

      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {loading ? (
          <PlanChargeSkeleton />
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
              <KpiCard label={t('Comptes au pipeline')} value={formatNumber(data.accounts.length, locale)} subtitle={t('Signés, pas encore live')} />
              <KpiCard label={t('Hôtels à implémenter')} value={formatNumber(totalHotels, locale)} subtitle={t('Somme des hôtels du pipeline')} />
              <KpiCard label={t('Implémenteurs en surcharge')} value={formatNumber(overloadedObNames, locale)} subtitle={t('Nombre de personnes distinctes')} accent={overloadedObNames > 0 ? 'text-[#b7221b]' : undefined} />
              <KpiCard label={t('Mois CSM au-dessus du plafond')} value={formatNumber(data.csmOverloads.length, locale)} subtitle={t('Occurrences mois × CSM')} accent={data.csmOverloads.length > 0 ? 'text-[#b7221b]' : undefined} />
              <KpiCard label={t('Comptes non attribuables')} value={formatNumber(data.unassigned.length, locale)} subtitle={t('Aucun implémenteur ou CSM éligible')} accent={data.unassigned.length > 0 ? 'text-[#b7221b]' : undefined} />
            </section>

            <AttributionSection data={data} onAssign={postAssignment} />

            <section className="grid grid-cols-1 gap-5 lg:grid-cols-2" aria-label={t('Équipes et disponibilité')}>
              <ObRosterSection roster={data.obRoster} onUpdate={postRoster} />
              <CsmRosterSection roster={data.csmRoster} onUpdate={postRoster} />
            </section>

            <ProjectionSection data={data} />

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

function AttributionSection({
  data,
  onAssign,
}: {
  data: PlanChargeResponse
  onAssign: (body: Record<string, unknown>) => Promise<void>
}) {
  const { locale, t } = useLocale()
  const { accounts, obRoster, csmRoster } = data

  function obOptionEligible(member: ObRosterMember, account: AccountRow): boolean {
    if (member.availability === 'absent' || member.availability === 'stop') return false
    const groupOfFive = account.isGroup && account.hotels >= 5
    if (member.role === 'senior') return true
    if (member.role === 'junior') return !groupOfFive
    if (member.role === 'alternant' || member.role === 'stagiaire') return !account.isGroup
    return false
  }
  function csmOptionEligible(member: CsmRosterMember): boolean {
    return member.availability !== 'absent' && member.availability !== 'stop'
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[#e2e2e2] bg-white shadow-[0_4px_10px_rgba(36,25,55,0.05)]" aria-labelledby="attribution-title">
      <div className="border-b border-[#e2e2e2] px-4 py-4 sm:px-5">
        <h2 id="attribution-title" className="text-sm font-bold text-[#1a1a1a]">{t('Attribution')}</h2>
        <p className="mt-0.5 text-xs text-[#8a8a8a]">{t('Comptes signés pas encore live, avec pré-attribution de l’implémenteur et du CSM.')}</p>
      </div>

      {accounts.length === 0 ? (
        <div className="p-8 text-center text-sm text-[#696969]">{t('Aucun compte dans le pipeline.')}</div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="border-b border-[#e2e2e2] bg-[#f7f7f7]">
                <tr>
                  {[t('Compte'), t('Tier'), t('Type'), t('Hôtels'), t('Poids'), t('Go-live'), t('Implémenteur'), t('CSM'), ''].map((heading, index) => (
                    <th key={index} className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#696969] ${index === 0 ? 'text-left' : index === 8 ? '' : 'text-center'}`}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e2e2]">
                {accounts.map(account => (
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
                    <td className="px-4 py-3 text-center text-[#4a4a4a]">{tierLabel(account.tier)}</td>
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
                      <AssignmentCell
                        value={account.obOwner}
                        source={account.obSource}
                        locked={account.obLocked}
                        emptyLabel={t('aucun éligible')}
                        options={obRoster.map(member => ({
                          value: member.name,
                          label: member.name,
                          disabled: !obOptionEligible(member, account),
                          suffix: obOptionEligible(member, account) ? '' : ` (${t('non éligible')})`,
                        }))}
                        onChange={value => onAssign({
                          account_id: account.accountId,
                          account_name: account.accountName,
                          group_id: account.groupId,
                          ob_owner: value,
                          ob_locked: true,
                          csm_name: account.csmName,
                          csm_locked: account.csmLocked,
                        })}
                        onUnlock={() => onAssign({
                          account_id: account.accountId,
                          account_name: account.accountName,
                          group_id: account.groupId,
                          ob_owner: null,
                          ob_locked: false,
                          csm_name: account.csmName,
                          csm_locked: account.csmLocked,
                        })}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <AssignmentCell
                        value={account.csmName}
                        source={account.csmSource}
                        locked={account.csmLocked}
                        emptyLabel={t('aucun dispo')}
                        options={csmRoster.map(member => ({
                          value: member.name,
                          label: member.name,
                          disabled: !csmOptionEligible(member),
                          suffix: csmOptionEligible(member) ? '' : ` (${t('indisponible')})`,
                        }))}
                        onChange={value => onAssign({
                          account_id: account.accountId,
                          account_name: account.accountName,
                          group_id: account.groupId,
                          ob_owner: account.obOwner,
                          ob_locked: account.obLocked,
                          csm_name: value,
                          csm_locked: true,
                        })}
                        onUnlock={() => onAssign({
                          account_id: account.accountId,
                          account_name: account.accountName,
                          group_id: account.groupId,
                          ob_owner: account.obOwner,
                          ob_locked: account.obLocked,
                          csm_name: null,
                          csm_locked: false,
                        })}
                      />
                    </td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-[#e2e2e2] md:hidden">
            {accounts.map(account => (
              <article key={account.accountId} className="space-y-3 p-4">
                <div>
                  <h3 className="font-semibold text-[#1a1a1a]">{account.accountName}</h3>
                  <p className="mt-0.5 text-xs text-[#8a8a8a]">
                    {tierLabel(account.tier)} · {account.isGroup ? t('Groupe') : t('Indiv')}{account.dmbookOnly ? ' · DMB' : ''} · {account.hotels} {t('hôtels')} · {t('poids')} {account.weight} · {formatMonth(account.goLiveMonth, locale)}
                  </p>
                  {account.rawCsm && !account.resolvedCsm && <p className="mt-0.5 text-xs font-semibold text-[#b7221b]">{t('CSM Zoho non résolu')}</p>}
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8a8a8a]">{t('Implémenteur')}</p>
                  <AssignmentCell
                    value={account.obOwner}
                    source={account.obSource}
                    locked={account.obLocked}
                    emptyLabel={t('aucun éligible')}
                    options={obRoster.map(member => ({
                      value: member.name,
                      label: member.name,
                      disabled: !obOptionEligible(member, account),
                      suffix: obOptionEligible(member, account) ? '' : ` (${t('non éligible')})`,
                    }))}
                    onChange={value => onAssign({
                      account_id: account.accountId,
                      account_name: account.accountName,
                      group_id: account.groupId,
                      ob_owner: value,
                      ob_locked: true,
                      csm_name: account.csmName,
                      csm_locked: account.csmLocked,
                    })}
                    onUnlock={() => onAssign({
                      account_id: account.accountId,
                      account_name: account.accountName,
                      group_id: account.groupId,
                      ob_owner: null,
                      ob_locked: false,
                      csm_name: account.csmName,
                      csm_locked: account.csmLocked,
                    })}
                  />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8a8a8a]">CSM</p>
                  <AssignmentCell
                    value={account.csmName}
                    source={account.csmSource}
                    locked={account.csmLocked}
                    emptyLabel={t('aucun dispo')}
                    options={csmRoster.map(member => ({
                      value: member.name,
                      label: member.name,
                      disabled: !csmOptionEligible(member),
                      suffix: csmOptionEligible(member) ? '' : ` (${t('indisponible')})`,
                    }))}
                    onChange={value => onAssign({
                      account_id: account.accountId,
                      account_name: account.accountName,
                      group_id: account.groupId,
                      ob_owner: account.obOwner,
                      ob_locked: account.obLocked,
                      csm_name: value,
                      csm_locked: true,
                    })}
                    onUnlock={() => onAssign({
                      account_id: account.accountId,
                      account_name: account.accountName,
                      group_id: account.groupId,
                      ob_owner: account.obOwner,
                      ob_locked: account.obLocked,
                      csm_name: null,
                      csm_locked: false,
                    })}
                  />
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

interface AssignmentOption {
  value: string
  label: string
  disabled: boolean
  suffix: string
}

function AssignmentCell({
  value,
  source,
  locked,
  emptyLabel,
  options,
  onChange,
  onUnlock,
}: {
  value: string | null
  source: ObSource | CsmSource
  locked: boolean
  emptyLabel: string
  options: AssignmentOption[]
  onChange: (value: string) => void
  onUnlock: () => void
}) {
  const { t } = useLocale()
  if (!value) {
    return <span className="text-xs font-semibold text-[#b7221b]">{emptyLabel}</span>
  }
  return (
    <div className="flex items-center gap-1.5">
      <label className="sr-only" htmlFor={`assign-${value}`}>{t('Attribution')}</label>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="min-w-[130px] rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 text-xs text-[#1a1a1a] outline-none focus:border-[#8064b3] focus:ring-1 focus:ring-[#8064b3]"
      >
        {options.map(option => (
          <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}{option.suffix}</option>
        ))}
      </select>
      {source === 'override' && <Lock aria-hidden="true" size={13} className="shrink-0 text-[#59319f]" />}
      {source === 'continuity' && (
        <span className="shrink-0" title={t('continuité de groupe')}>
          <Link2 aria-hidden="true" size={13} className="text-[#3b72d1]" />
        </span>
      )}
      {locked && (
        <button type="button" onClick={onUnlock} className="shrink-0 rounded-md border border-[#d8d8d8] px-1.5 py-1 text-[10px] font-semibold text-[#696969] hover:bg-[#f7f7f7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8064b3]">
          {t('Lever')}
        </button>
      )}
    </div>
  )
}

function ObRosterSection({ roster, onUpdate }: { roster: ObRosterMember[]; onUpdate: (body: Record<string, unknown>) => Promise<void> }) {
  const { t } = useLocale()
  return (
    <article className="overflow-hidden rounded-xl border border-[#e2e2e2] bg-white shadow-[0_4px_10px_rgba(36,25,55,0.05)]">
      <div className="border-b border-[#e2e2e2] px-4 py-4 sm:px-5">
        <h2 className="text-sm font-bold text-[#1a1a1a]">{t('Implémenteurs')}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-[#e2e2e2] bg-[#f7f7f7]">
            <tr>
              {[t('Nom'), t('Rôle'), t('Plafond'), t('Dispo'), t('Charge'), t('Éligibilité')].map(heading => (
                <th key={heading} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[#696969]">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e2e2e2]">
            {roster.map(member => (
              <tr key={member.name}>
                <td className="px-3 py-3 font-semibold text-[#1a1a1a]">{member.name}</td>
                <td className="px-3 py-3">
                  <label className="sr-only" htmlFor={`ob-role-${member.name}`}>{t('Rôle')}</label>
                  <select
                    id={`ob-role-${member.name}`}
                    value={member.role}
                    onChange={event => onUpdate({ kind: 'ob', name: member.name, role: event.target.value })}
                    className="rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 text-xs text-[#1a1a1a] outline-none focus:border-[#8064b3] focus:ring-1 focus:ring-[#8064b3]"
                  >
                    {(['senior', 'junior', 'alternant', 'stagiaire'] as ObRole[]).map(role => <option key={role} value={role}>{role}</option>)}
                  </select>
                </td>
                <td className="px-3 py-3">
                  <label className="sr-only" htmlFor={`ob-cap-${member.name}`}>{t('Plafond')}</label>
                  <input
                    id={`ob-cap-${member.name}`}
                    type="number"
                    min={0}
                    defaultValue={member.maxProjects}
                    onBlur={event => onUpdate({ kind: 'ob', name: member.name, max_projects: Math.max(0, Number(event.target.value) || 0) })}
                    className="w-16 rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 text-right text-xs text-[#1a1a1a] outline-none focus:border-[#8064b3] focus:ring-1 focus:ring-[#8064b3]"
                  />
                </td>
                <td className="px-3 py-3">
                  <label className="sr-only" htmlFor={`ob-avail-${member.name}`}>{t('Dispo')}</label>
                  <select
                    id={`ob-avail-${member.name}`}
                    value={member.availability}
                    onChange={event => onUpdate({ kind: 'ob', name: member.name, availability: event.target.value })}
                    className="rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 text-xs text-[#1a1a1a] outline-none focus:border-[#8064b3] focus:ring-1 focus:ring-[#8064b3]"
                  >
                    {(['full', 'relache', 'absent', 'stop'] as Availability[]).map(availability => <option key={availability} value={availability}>{t(AVAILABILITY_LABEL[availability])}</option>)}
                  </select>
                </td>
                <td className="px-3 py-3">
                  <ChargeBar load={member.load} capacity={member.effectiveCapacity} />
                </td>
                <td className="px-3 py-3 text-xs text-[#696969]">{t(OB_ROLE_ELIGIBILITY[member.role])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  )
}

function CsmRosterSection({ roster, onUpdate }: { roster: CsmRosterMember[]; onUpdate: (body: Record<string, unknown>) => Promise<void> }) {
  const { t } = useLocale()
  return (
    <article className="overflow-hidden rounded-xl border border-[#e2e2e2] bg-white shadow-[0_4px_10px_rgba(36,25,55,0.05)]">
      <div className="border-b border-[#e2e2e2] px-4 py-4 sm:px-5">
        <h2 className="text-sm font-bold text-[#1a1a1a]">CSM</h2>
      </div>
      <div className="overflow-x-auto">
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
    </article>
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

function ProjectionSection({ data }: { data: PlanChargeResponse }) {
  const { locale, t } = useLocale()
  const obNames = useMemo(() => data.obRoster.filter(member => member.availability !== 'absent').map(member => member.name), [data.obRoster])
  const csmNames = useMemo(() => data.csmRoster.filter(member => member.availability !== 'absent' && member.effectiveCapacity > 0).map(member => member.name), [data.csmRoster])
  const obCapLine = useMemo(() => {
    const capacities = data.obRoster.filter(member => member.availability !== 'absent' && member.effectiveCapacity > 0).map(member => member.effectiveCapacity)
    return capacities.length > 0 ? Math.min(...capacities) : null
  }, [data.obRoster])
  const csmCapLine = useMemo(() => {
    const capacities = data.csmRoster.filter(member => member.availability !== 'absent' && member.effectiveCapacity > 0).map(member => member.monthlyCapacityPoints)
    return capacities.length > 0 ? Math.min(...capacities) : null
  }, [data.csmRoster])

  const obChartData = useMemo(
    () => data.months.map(month => {
      const row: Record<string, string | number> = { month, label: formatMonth(month, locale) }
      for (const name of obNames) row[name] = data.obLoadByMonth[name]?.[month] ?? 0
      return row
    }),
    [data.months, data.obLoadByMonth, locale, obNames],
  )
  const csmChartData = useMemo(
    () => data.months.map(month => {
      const row: Record<string, string | number> = { month, label: formatMonth(month, locale) }
      for (const name of csmNames) row[name] = data.csmLoadByMonth[name]?.[month] ?? 0
      return row
    }),
    [data.months, data.csmLoadByMonth, locale, csmNames],
  )

  return (
    <section className="grid grid-cols-1 gap-5 xl:grid-cols-2" aria-label={t('Projection')}>
      <article className="rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-[0_4px_10px_rgba(36,25,55,0.05)] sm:p-5">
        <h2 className="text-sm font-bold text-[#1a1a1a]">{t('Charge OB par mois')}</h2>
        <p className="mt-0.5 text-xs text-[#8a8a8a]">{t('Projets simultanés par implémenteur, jusqu’au go-live de chaque compte.')}</p>
        <div className="mt-3 h-[300px] w-full" role="img" aria-label={t('Graphique de la charge OB projetée par mois')}>
          {obNames.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={obChartData} margin={{ top: 16, right: 16, left: -8, bottom: 12 }}>
                <CartesianGrid stroke="#ece8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={value => [formatNumber(Number(value), locale), t('Projets')]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {obCapLine !== null && <ReferenceLine y={obCapLine} stroke="#b7221b" strokeDasharray="4 4" label={{ value: `${t('plafond')} ${obCapLine}`, fontSize: 10, fill: '#b7221b', position: 'insideTopRight' }} />}
                {obNames.map((name, index) => <Bar key={name} dataKey={name} name={name} fill={OWNER_COLORS[index % OWNER_COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={28} />)}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <OverloadNote overloads={data.obOverloads} emptyMessage={t('Charge OB tenable sur l’horizon avec le pipeline actuel.')} unit={t('projets')} locale={locale} />
      </article>

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
        <OverloadNote overloads={data.csmOverloads} emptyMessage={t('Montée en charge CSM absorbable avec l’effectif disponible actuel.')} unit={t('points')} locale={locale} />
      </article>
    </section>
  )
}

function OverloadNote({ overloads, emptyMessage, unit, locale }: { overloads: OverloadEntry[]; emptyMessage: string; unit: string; locale: Locale }) {
  const { t } = useLocale()
  if (overloads.length === 0) {
    return <p className="mt-3 rounded-lg border border-[#ccebdd] bg-[#f0fbf6] px-3 py-2.5 text-xs text-[#1c6437]">{emptyMessage}</p>
  }
  return (
    <div className="mt-3 rounded-lg border border-[#f1b4b0] bg-[#fff1f0] px-3 py-2.5 text-xs text-[#8f211d]">
      <ul className="list-disc space-y-1 pl-4">
        {overloads.map((entry, index) => (
          <li key={index}>
            {t('{name} dépasse son plafond de {capacity} {unit} en {month} ({load}).')
              .replace('{name}', entry.name)
              .replace('{capacity}', formatNumber(entry.capacity, locale))
              .replace('{unit}', unit)
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

function PlanChargeSkeleton() {
  const { t } = useLocale()
  return (
    <div className="space-y-6" aria-label={t('Chargement du plan de charge')}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-xl bg-[#ece9ef]" />)}</div>
      <div className="h-72 animate-pulse rounded-xl bg-[#ece9ef]" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2"><div className="h-64 animate-pulse rounded-xl bg-[#ece9ef]" /><div className="h-64 animate-pulse rounded-xl bg-[#ece9ef]" /></div>
    </div>
  )
}

function tierLabel(tier: Tier): string {
  return tier
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
