'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, TriangleAlert } from 'lucide-react'
import { useLocale } from '@/lib/i18n/LocaleContext'

// ─── Types ──────────────────────────────────────────────────────────────────

type ExceptionSubjectKind = 'project' | 'account' | 'implementer'

type ExceptionRuleKey =
  | 'milestone_overdue'
  | 'started_without_go_live'
  | 'ticket_burst'
  | 'live_without_csm'
  | 'implementer_over_capacity'
  | 'follow_up_due'

interface ExceptionReason {
  rule: ExceptionRuleKey
  label: string
  ageDays: number | null
  weight: number
}

interface ExceptionRow {
  subjectKind: ExceptionSubjectKind
  subjectId: string
  subjectName: string
  ownerName: string | null
  actionUrl: string | null
  reasons: ExceptionReason[]
  score: number
  oldestAgeDays: number | null
}

interface WeeklyExceptionsResponse {
  referenceDate: string
  subjectCount: number
  reasonCount: number
  countsByRule: Record<string, number>
  rows: ExceptionRow[]
  uncoveredRules: { rule: string; reason: string }[]
  diagnostics: { ticketAccountsUnlinked: number }
  warnings: string[]
  milestonesTruncated: boolean
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SUBJECT_KIND_LABELS: Record<ExceptionSubjectKind, string> = {
  project: 'Projet',
  account: 'Compte',
  implementer: 'Implémenteur',
}

const RULE_FILTER_LABELS: Record<ExceptionRuleKey, string> = {
  milestone_overdue: 'Jalons en retard',
  started_without_go_live: 'Sans date de mise en ligne',
  ticket_burst: 'Pic de tickets',
  live_without_csm: 'En ligne sans CSM',
  implementer_over_capacity: 'Implémenteur en surcharge',
  follow_up_due: 'Relance échue',
}

const RULE_FILTER_ORDER: ExceptionRuleKey[] = [
  'milestone_overdue',
  'started_without_go_live',
  'ticket_burst',
  'live_without_csm',
  'implementer_over_capacity',
  'follow_up_due',
]

type RuleFilter = 'all' | ExceptionRuleKey

// ─── Helpers ────────────────────────────────────────────────────────────────

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

// ─── Small components ───────────────────────────────────────────────────────

function KpiCard({ label, value, subtitle }: { label: string; value: number; subtitle: string }) {
  return (
    <article className="min-w-0 rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-[0_4px_10px_rgba(36,25,55,0.05)] sm:p-5">
      <p className="min-h-8 text-xs font-semibold uppercase tracking-wide text-[#696969]">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-[#1a1a1a]">{value}</p>
      <p className="mt-2 min-h-8 text-xs leading-4 text-[#8a8a8a]">{subtitle}</p>
    </article>
  )
}

function WarningBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#f0c756] bg-[#fbf1ca] p-4 text-sm text-[#84550e]">
      <TriangleAlert aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
      <p>{children}</p>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useLocale()
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-xl border border-[#f1b4b0] bg-[#fff1f0] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0 text-[#b7221b]" size={18} />
        <div>
          <p className="text-sm font-semibold text-[#8f211d]">{t('Données indisponibles')}</p>
          <p className="mt-0.5 text-sm text-[#a33b36]">{message}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="self-start rounded-lg border border-[#d98984] bg-white px-3 py-2 text-xs font-semibold text-[#8f211d] hover:bg-[#fff8f7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d98984]"
      >
        {t('Réessayer')}
      </button>
    </div>
  )
}

function LoadingState() {
  const { t } = useLocale()
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 lg:px-8" aria-live="polite" aria-busy="true">
      <p className="sr-only">{t('Chargement des dossiers à traiter…')}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-[124px] animate-pulse rounded-xl border border-[#e2e2e2] bg-white p-4">
            <div className="h-3 w-24 rounded bg-[#ededed]" />
            <div className="mt-4 h-8 w-14 rounded bg-[#ededed]" />
            <div className="mt-3 h-3 w-32 rounded bg-[#f2f2f2]" />
          </div>
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-xl border border-[#e2e2e2] bg-white" />
      <div className="h-40 animate-pulse rounded-xl border border-[#e2e2e2] bg-white" />
    </div>
  )
}

function SuccessState({ referenceDate }: { referenceDate: string }) {
  const { t } = useLocale()
  return (
    <div className="rounded-xl border border-[#bfe6d2] bg-[#eafaf1] px-5 py-10 text-center">
      <p className="text-sm font-semibold text-[#1c6437]">{t('Aucun dossier ne demande d’arbitrage cette semaine.')}</p>
      <p className="mt-1 text-xs text-[#3c7a5a]">
        {t('Référence')} : {referenceDate}
      </p>
    </div>
  )
}

function ExceptionRowCard({ row }: { row: ExceptionRow }) {
  const { t } = useLocale()
  return (
    <li className="rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-[#1a1a1a]">{row.subjectName}</p>
            <span className="inline-flex rounded-md bg-[#f0eafb] px-2 py-0.5 text-xs font-medium text-[#59319f]">
              {t(SUBJECT_KIND_LABELS[row.subjectKind])}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#696969]">
            {t('Propriétaire')} : {row.ownerName ?? t('Non assigné')}
          </p>
        </div>
        {row.actionUrl && (
          <a
            href={row.actionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-lg border border-[#cbbcdf] bg-white px-3 py-2 text-xs font-semibold text-[#59319f] hover:bg-[#fbf9fd] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8064b3]"
          >
            {t('Ouvrir dans Zoho')} — {row.subjectName}
          </a>
        )}
      </div>
      <ul className="mt-3 space-y-1.5">
        {row.reasons.map((reason, index) => (
          <li key={index} className="text-sm leading-5 text-[#3f3f3f]">
            {reason.label}
          </li>
        ))}
      </ul>
    </li>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ATraiterPage() {
  const { t } = useLocale()
  const [data, setData] = useState<WeeklyExceptionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [requestKey, setRequestKey] = useState(0)
  const [ruleFilter, setRuleFilter] = useState<RuleFilter>('all')

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/onboarding/weekly-exceptions', { signal: controller.signal })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const json = await response.json() as WeeklyExceptionsResponse
        setData(json)
      } catch (fetchError) {
        if (isAbortError(fetchError)) return
        console.error(fetchError)
        setError(t('Impossible de charger les dossiers à traiter.'))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [requestKey, t])

  const filteredRows = useMemo(() => {
    if (!data) return []
    if (ruleFilter === 'all') return data.rows
    return data.rows.filter(row => row.reasons.some(reason => reason.rule === ruleFilter))
  }, [data, ruleFilter])

  const projectCount = useMemo(
    () => (data ? data.rows.filter(row => row.subjectKind === 'project').length : 0),
    [data],
  )
  const accountCount = useMemo(
    () => (data ? data.rows.filter(row => row.subjectKind === 'account').length : 0),
    [data],
  )

  if (loading) return <LoadingState />

  if (error || !data) {
    return (
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <ErrorState message={error ?? t('Réponse invalide')} onRetry={() => setRequestKey(value => value + 1)} />
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-bold text-[#1a1a1a]">{t('À traiter cette semaine')}</h1>
        <p className="mt-1 text-sm text-[#696969]">
          {t('Cette vue liste les dossiers qui demandent une décision, pas l’état général du portefeuille.')}
        </p>
        <p className="mt-1 text-xs text-[#8a8a8a]">
          {t('Référence')} : {data.referenceDate}
        </p>
      </header>

      {data.warnings.map((warning, index) => (
        <WarningBanner key={index}>{warning}</WarningBanner>
      ))}
      {data.milestonesTruncated && (
        <WarningBanner>
          {t('La liste des jalons en retard a été tronquée par Zoho : certains retards peuvent manquer.')}
        </WarningBanner>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label={t('Dossiers à traiter')}
          value={data.subjectCount}
          subtitle={`${data.reasonCount} ${t('signaux au total')}`}
        />
        <KpiCard label={t('Dont projets')} value={projectCount} subtitle={t('Dossiers de nature projet')} />
        <KpiCard label={t('Dont comptes')} value={accountCount} subtitle={t('Dossiers de nature compte')} />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={t('Filtrer par règle')}>
        <button
          type="button"
          onClick={() => setRuleFilter('all')}
          aria-pressed={ruleFilter === 'all'}
          className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
            ruleFilter === 'all'
              ? 'border-[#8c5bdb] bg-[#f0eafb] text-[#59319f]'
              : 'border-[#d8d8d8] bg-white text-[#4a4a4a] hover:bg-[#f7f7f7]'
          }`}
        >
          {t('Tous')}
        </button>
        {RULE_FILTER_ORDER.filter(rule => (data.countsByRule[rule] ?? 0) > 0).map(rule => (
          <button
            key={rule}
            type="button"
            onClick={() => setRuleFilter(rule)}
            aria-pressed={ruleFilter === rule}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
              ruleFilter === rule
                ? 'border-[#8c5bdb] bg-[#f0eafb] text-[#59319f]'
                : 'border-[#d8d8d8] bg-white text-[#4a4a4a] hover:bg-[#f7f7f7]'
            }`}
          >
            {t(RULE_FILTER_LABELS[rule])} ({data.countsByRule[rule] ?? 0})
          </button>
        ))}
      </div>

      {data.rows.length === 0 ? (
        <SuccessState referenceDate={data.referenceDate} />
      ) : (
        <ul className="space-y-3">
          {filteredRows.map(row => (
            <ExceptionRowCard key={`${row.subjectKind}:${row.subjectId}`} row={row} />
          ))}
        </ul>
      )}

      <section className="rounded-xl border border-[#e2e2e2] bg-[#fafafa] p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-[#1a1a1a]">{t('Ce que cette vue ne couvre pas encore')}</h2>
        <ul className="mt-3 space-y-2">
          {data.uncoveredRules.map((uncovered, index) => (
            <li key={index} className="text-sm leading-5 text-[#4a4a4a]">
              <span className="font-medium text-[#1a1a1a]">{uncovered.rule}</span> — {uncovered.reason}
            </li>
          ))}
        </ul>
      </section>

      {data.diagnostics.ticketAccountsUnlinked > 0 && (
        <p className="text-xs text-[#8a8a8a]">
          {data.diagnostics.ticketAccountsUnlinked}{' '}
          {t('compte(s) signalé(s) par un pic de tickets n’a/n’ont pas pu être rattaché(s) à une fiche CRM ; leur nom affiché est celui du support.')}
        </p>
      )}
    </main>
  )
}
