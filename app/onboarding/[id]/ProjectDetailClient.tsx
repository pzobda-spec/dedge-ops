'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  LoaderCircle,
  Mail,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import AcuityAppointments from '@/components/onboarding/AcuityAppointments'
import EmailComposer from '@/components/onboarding/EmailComposer'
import ProjectProgress from '@/components/onboarding/ProjectProgress'
import RecapModal from '@/components/onboarding/RecapModal'
import Timeline from '@/components/onboarding/Timeline'
import TodoistTimeline from '@/components/todoist/TodoistTimeline'
import type { EmailTemplateKey } from '@/lib/onboarding/email-templates'
import type { ProjectEvent } from '@/lib/onboarding/events'
import type { OnboardingProjectDetail, ProjectStatusReport } from '@/lib/onboarding/projects'

const tabs = [
  { key: 'overview',   label: "Vue d'ensemble" },
  { key: 'timeline',   label: 'Timeline' },
  { key: 'documents',  label: 'Documents' },
] as const

type TabKey = typeof tabs[number]['key']

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date invalide'
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(date)
}

function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) return null
  return date
}

function formatProjectDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match || !parseDateOnly(value)) return 'Date invalide'
  return `${match[3]}/${match[2]}/${match[1]}`
}

function daysBetween(start: string, end: string): number | null {
  const startDate = parseDateOnly(start)
  const endDate = parseDateOnly(end)
  if (!startDate || !endDate) return null
  return Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000)
}

function projectDayLabel(days: number): string {
  if (days === 0) return 'le jour du démarrage'
  return days > 0 ? `à J+${days}` : `${Math.abs(days)} j avant le démarrage`
}

// ─── Force sync button ─────────────────────────────────────────────────────────

export function ForceSyncButton({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  async function handleSync() {
    setLoading(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/integrations/zoho/projects-sync?project_id=${encodeURIComponent(projectId)}`, {
        method: 'POST',
      })
      const text = await res.text()
      let data: { error?: string; synced?: number } = {}
      try { data = text ? JSON.parse(text) : {} } catch { data = { error: text } }
      if (!res.ok) throw new Error(data.error || `La synchronisation a échoué (HTTP ${res.status}).`)
      const synced = data.synced ?? 0
      setFeedback({
        tone: 'success',
        message: synced > 0
          ? `${synced} projet${synced > 1 ? 's' : ''} synchronisé${synced > 1 ? 's' : ''}.`
          : 'Synchronisation terminée, aucun changement détecté.',
      })
      router.refresh()
    } catch (err) {
      setFeedback({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Impossible de synchroniser le projet.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={handleSync}
        disabled={loading}
        aria-busy={loading}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#59319f] px-3 py-2 text-sm font-medium text-[#59319f] transition-colors hover:bg-[#f3eeff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#59319f] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        {loading ? 'Synchronisation…' : 'Actualiser depuis Zoho'}
      </button>
      {feedback && (
        <span
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={`max-w-72 text-xs leading-4 ${feedback.tone === 'error' ? 'text-[#b7221b]' : 'text-[#1c6437]'}`}
        >
          {feedback.message}
        </span>
      )}
    </div>
  )
}

// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = 'neutral',
}: {
  label: string
  value: string
  detail: string
  icon: ReactNode
  tone?: 'neutral' | 'target' | 'success'
}) {
  const iconClass = tone === 'success'
    ? 'bg-[#cff7dc] text-[#1c6437]'
    : tone === 'target'
      ? 'bg-[#fbf1ca] text-[#84550e]'
      : 'bg-[#f0eafb] text-[#59319f]'

  return (
    <div className="min-w-0 rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-[0_2px_5px_rgba(0,0,0,0.03)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#696969]">{label}</p>
        <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg ${iconClass}`} aria-hidden="true">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-lg font-semibold leading-6 text-[#1a1a1a]">{value}</p>
      <p className="mt-1 text-xs leading-5 text-[#696969]">{detail}</p>
    </div>
  )
}

// ─── Executive summary ────────────────────────────────────────────────────────

function ExecutiveSummary({
  project,
  canGenerate,
}: {
  project: OnboardingProjectDetail
  canGenerate: boolean
}) {
  const [summary, setSummary] = useState(project.executive_summary)
  const [generatedAt, setGeneratedAt] = useState(project.executive_summary_generated_at)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate(force: boolean) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/onboarding-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.id, force }),
      })
      const text = await res.text()
      let data: { error?: string; summary?: string; generated_at?: string } = {}
      try { data = text ? JSON.parse(text) : {} } catch { data = { error: text || `HTTP ${res.status}` } }
      if (!res.ok) throw new Error(data.error ?? text ?? `HTTP ${res.status}`)
      setSummary(data.summary ?? null)
      setGeneratedAt(data.generated_at ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de générer le résumé.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#59319f]" aria-hidden="true" />
            <h3 className="text-base font-semibold text-[#1a1a1a]">Résumé exécutif</h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#696969]">
            Synthèse courte du contexte et de l&apos;avancement.
            {generatedAt && ` Dernière génération : ${formatDateTime(generatedAt)}.`}
          </p>
        </div>
        {canGenerate && (
          <button
            type="button"
            onClick={() => generate(Boolean(summary))}
            disabled={loading}
            aria-busy={loading}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#59319f] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#7b4dc4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#59319f] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50 sm:w-auto"
          >
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            {loading ? 'Génération…' : summary ? 'Régénérer' : 'Générer le résumé'}
          </button>
        )}
      </div>
      {error && <p role="alert" className="mb-3 rounded-lg border border-[#fee3e2] bg-[#fff8f8] px-3 py-2 text-sm text-[#b7221b]">{error}</p>}
      {summary ? (
        <p className="whitespace-pre-wrap rounded-lg bg-[#faf9f5] p-4 text-sm leading-6 text-[#4a4a4a]">{summary}</p>
      ) : (
        <p className="rounded-lg border border-dashed border-[#d9d9d9] px-4 py-5 text-sm text-[#696969]">
          Aucun résumé généré pour ce projet.
        </p>
      )}
    </div>
  )
}

function StatusReportSection({
  project,
  canGenerate,
}: {
  project: OnboardingProjectDetail
  canGenerate: boolean
}) {
  const [report, setReport] = useState<ProjectStatusReport | null>(project.status_report)
  const [generatedAt, setGeneratedAt] = useState(project.status_report_generated_at)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate(force: boolean) {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/ai/project-status-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.id, force }),
      })
      const text = await response.text()
      let payload: unknown
      try { payload = text ? JSON.parse(text) : null } catch { payload = null }
      if (typeof payload !== 'object' || payload === null) {
        throw new Error(text || `Réponse invalide (HTTP ${response.status})`)
      }

      const data = payload as {
        error?: unknown
        report?: ProjectStatusReport
        generated_at?: string
      }
      if (!response.ok || !data.report) {
        throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${response.status}`)
      }

      setReport(data.report)
      setGeneratedAt(data.generated_at ?? null)
    } catch (generateError) {
      setError(generateError instanceof Error
        ? generateError.message
        : 'Impossible de générer l’état des lieux.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[#59319f]" />
            <h3 className="text-base font-semibold text-[#1a1a1a]">État des lieux</h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#696969]">
            Vue d&apos;ensemble, timeline projet et commentaires Todoist.
            {generatedAt && ` Dernière génération : ${formatDateTime(generatedAt)}.`}
          </p>
        </div>
        {canGenerate && (
          <button
            type="button"
            onClick={() => generate(Boolean(report))}
            disabled={loading}
            aria-busy={loading}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#59319f] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#7b4dc4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#59319f] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50 sm:w-auto"
          >
            {loading ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {loading
              ? 'Analyse en cours…'
              : report
                ? 'Régénérer'
                : 'Générer un état des lieux'}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-[#fee3e2] bg-[#fff8f8] px-3 py-2 text-sm text-[#b7221b]">
          {error}
        </p>
      )}

      {report ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-[#d9caef] bg-[#f7f2ff] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#59319f]">TL;DR</p>
            <p className="mt-1 text-sm leading-6 text-[#3f286c]">{report.tldr}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#696969]">État actuel</p>
            <p className="mt-1 text-sm leading-6 text-[#4a4a4a]">{report.current_status}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <ReportList title="Faits marquants" items={report.key_updates} emptyLabel="Aucun fait marquant identifié." />
            <ReportList title="Risques / blocages" items={report.risks} emptyLabel="Aucun risque documenté." tone="risk" />
            <ReportList title="Prochaines étapes" items={report.next_steps} emptyLabel="Aucune prochaine étape documentée." tone="next" />
          </div>

          <p className="text-xs text-[#8a8a8a]">
            Analyse basée sur {report.source_comment_count} commentaire{report.source_comment_count > 1 ? 's' : ''} Todoist.
          </p>
        </div>
      ) : (
        <p className="text-sm text-[#696969]">
          Aucun état des lieux généré.
        </p>
      )}
    </div>
  )
}

function ReportList({
  title,
  items,
  emptyLabel,
  tone = 'default',
}: {
  title: string
  items: string[]
  emptyLabel: string
  tone?: 'default' | 'risk' | 'next'
}) {
  const dotClass = tone === 'risk'
    ? 'bg-[#b7221b]'
    : tone === 'next'
      ? 'bg-[#1c6437]'
      : 'bg-[#59319f]'

  return (
    <div className="rounded-lg border border-[#e2e2e2] bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#696969]">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="flex gap-2 text-sm leading-5 text-[#4a4a4a]">
              <span className={`mt-2 h-1.5 w-1.5 flex-none rounded-full ${dotClass}`} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-[#8a8a8a]">{emptyLabel}</p>
      )}
    </div>
  )
}

// ─── Email actions ────────────────────────────────────────────────────────────

const emailActions: Array<{ key: EmailTemplateKey; label: string }> = [
  { key: 'email_launch',          label: 'Email de lancement (J+0)' },
  { key: 'email_content_request', label: 'Email préparation contenu (J+1)' },
  { key: 'email_backoffice',      label: 'Email accès back-office (J+1)' },
  { key: 'email_followup_1',      label: 'Relance niveau 1' },
  { key: 'email_followup_2',      label: 'Relance niveau 2' },
]

// ─── Project detail tabs ──────────────────────────────────────────────────────

export function ProjectDetailTabs({
  project,
  readonly = false,
}: {
  project: OnboardingProjectDetail
  readonly?: boolean
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [timeline, setTimeline] = useState<ProjectEvent[]>([])
  const [timelineLoading, setTimelineLoading] = useState(true)
  const [timelineError, setTimelineError] = useState<string | null>(null)
  const [emailComposer, setEmailComposer] = useState<EmailTemplateKey | null>(null)
  const [recapOpen, setRecapOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)

  const loadTimeline = useCallback(async () => {
    setTimelineLoading(true)
    setTimelineError(null)
    try {
      const res = await fetch(`/api/onboarding/projects/${encodeURIComponent(project.id)}/timeline`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { events?: unknown }
      if (!Array.isArray(data.events)) throw new Error('Réponse timeline invalide')
      setTimeline(data.events as ProjectEvent[])
    } catch (loadError) {
      console.error(loadError)
      setTimeline([])
      setTimelineError('La timeline n’a pas pu être chargée. Les indicateurs de progression peuvent être incomplets.')
    } finally {
      setTimelineLoading(false)
    }
  }, [project.id])

  useEffect(() => {
    void loadTimeline()
  }, [loadTimeline])

  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
  }, [])

  function handleLogged(message: string) {
    setToast(message)
    void loadTimeline()
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3000)
  }

  const plannedDuration = project.start_date && project.target_go_live
    ? daysBetween(project.start_date, project.target_go_live)
    : null
  const actualDuration = project.start_date && project.actual_go_live
    ? daysBetween(project.start_date, project.actual_go_live)
    : null
  const targetVariance = project.target_go_live && project.actual_go_live
    ? daysBetween(project.target_go_live, project.actual_go_live)
    : null
  const targetDetail = plannedDuration === null
    ? 'Prévision issue de Zoho — ce n’est pas la date réelle.'
    : `Prévision ${projectDayLabel(plannedDuration)} — ce n’est pas la date réelle.`
  const actualDetail = actualDuration === null
    ? 'Champ Zoho « Live date » uniquement.'
    : targetVariance === null
      ? `Mise en ligne ${projectDayLabel(actualDuration)}.`
      : targetVariance === 0
        ? `Mise en ligne ${projectDayLabel(actualDuration)}, conforme à la cible.`
        : targetVariance > 0
          ? `Mise en ligne ${projectDayLabel(actualDuration)}, ${targetVariance} j après la cible.`
          : `Mise en ligne ${projectDayLabel(actualDuration)}, ${Math.abs(targetVariance)} j avant la cible.`

  return (
    <div className="space-y-6">
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-[#1a1a1a] px-4 py-3 text-sm font-medium text-white shadow-lg sm:bottom-5 sm:left-auto sm:right-5 sm:max-w-sm"
        >
          <CheckCircle2 className="h-4 w-4 flex-none text-[#8fe0aa]" aria-hidden="true" />
          {toast}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[#e2e2e2] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
        <div className="border-b border-[#e2e2e2] px-3 pt-3 sm:px-6 sm:pt-4">
          <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Sections du projet">
            {tabs.map(tab => (
              <button
                key={tab.key}
                id={`project-tab-${tab.key}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                aria-controls={`project-panel-${tab.key}`}
                onClick={() => setActiveTab(tab.key)}
                className={`min-h-11 flex-none border-b-2 px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#59319f] ${
                  activeTab === tab.key
                    ? 'border-[#59319f] text-[#59319f]'
                    : 'border-transparent text-[#696969] hover:text-[#1a1a1a]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-6 lg:p-8">
          {activeTab === 'overview' && (
            <div
              id="project-panel-overview"
              role="tabpanel"
              aria-labelledby="project-tab-overview"
              className="space-y-6"
            >
              {readonly && (
                <div className="flex items-start gap-2 rounded-lg border border-[#d4e4f8] bg-[#f4f8fe] px-4 py-3 text-sm text-[#2b5bb7]">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
                  <p>Vous consultez cette fiche en lecture seule. Les actions et modifications sont masquées.</p>
                </div>
              )}

              <section aria-labelledby="pilotage-title" className="space-y-5 rounded-xl border border-[#e2e2e2] bg-[#faf9f5] p-4 sm:p-6">
                <div>
                  <h2 id="pilotage-title" className="text-lg font-semibold text-[#1a1a1a]">Pilotage du projet</h2>
                  <p className="mt-1 text-sm leading-5 text-[#696969]">
                    Avancement, jalons prévisionnels et dates réellement enregistrées dans Zoho.
                  </p>
                </div>

                {timelineError && (
                  <div role="alert" className="flex flex-col gap-3 rounded-lg border border-[#fee3e2] bg-[#fff8f8] px-4 py-3 text-sm text-[#b7221b] sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
                      {timelineError}
                    </span>
                    <button
                      type="button"
                      onClick={() => void loadTimeline()}
                      className="self-start font-semibold underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b7221b] sm:self-auto"
                    >
                      Réessayer
                    </button>
                  </div>
                )}

                <div aria-busy={timelineLoading}>
                  {timelineLoading && (
                    <p role="status" className="mb-3 inline-flex items-center gap-2 text-xs text-[#696969]">
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      Mise à jour de la progression…
                    </p>
                  )}
                  <ProjectProgress timeline={timeline} zohoStatus={project.zoho_status} />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="Démarrage"
                    value={project.start_date ? formatProjectDate(project.start_date) : 'Non renseigné'}
                    detail="Date de début enregistrée dans Zoho."
                    icon={<Calendar className="h-4 w-4" />}
                  />
                  <MetricCard
                    label="Date cible (prévision)"
                    value={project.target_go_live ? formatProjectDate(project.target_go_live) : 'Non renseignée'}
                    detail={targetDetail}
                    icon={<CalendarClock className="h-4 w-4" />}
                    tone="target"
                  />
                  <MetricCard
                    label="Mise en ligne réelle"
                    value={project.actual_go_live ? formatProjectDate(project.actual_go_live) : 'Non renseignée'}
                    detail={actualDetail}
                    icon={<CalendarCheck className="h-4 w-4" />}
                    tone={project.actual_go_live ? 'success' : 'neutral'}
                  />
                  <MetricCard
                    label="Données actualisées"
                    value={project.last_synced_at ? formatDateTime(project.last_synced_at) : 'Jamais synchronisées'}
                    detail="Dernière synchronisation réussie avec Zoho."
                    icon={<RefreshCw className="h-4 w-4" />}
                  />
                </div>
              </section>

              <section aria-label="Synthèses du projet" className="rounded-xl border border-[#e2e2e2] bg-white p-4 sm:p-6">
                <ExecutiveSummary project={project} canGenerate={!readonly} />
              </section>

              <section aria-label="État des lieux du projet" className="rounded-xl border border-[#e2e2e2] bg-white p-4 sm:p-6">
                <StatusReportSection project={project} canGenerate={!readonly} />
              </section>

              {!readonly && (
                <section aria-labelledby="actions-title" className="space-y-6 rounded-xl border border-[#e2e2e2] bg-[#faf9f5] p-4 sm:p-6">
                  <div>
                    <h2 id="actions-title" className="text-lg font-semibold text-[#1a1a1a]">Actions du projet</h2>
                    <p className="mt-1 text-sm leading-5 text-[#696969]">Communications, rendez-vous et comptes rendus liés à cet onboarding.</p>
                  </div>

                  <div>
                    <div className="mb-3 flex items-start gap-3">
                      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#f0eafb] text-[#59319f]">
                        <Mail className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div>
                        <h3 className="text-base font-semibold text-[#1a1a1a]">Communications</h3>
                        <p className="mt-0.5 text-xs leading-5 text-[#696969]">Prévisualisez et copiez le message avant de consigner l&apos;envoi dans la timeline.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {emailActions.map(action => (
                        <button
                          key={action.key}
                          type="button"
                          onClick={() => setEmailComposer(action.key)}
                          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#d9caef] bg-white px-3 py-2.5 text-left text-sm font-medium text-[#59319f] transition-colors hover:border-[#59319f] hover:bg-[#f3eeff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#59319f] focus-visible:ring-offset-2"
                        >
                          <Mail className="h-4 w-4 flex-none" aria-hidden="true" />
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-[#e2e2e2] pt-6">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-[#1a1a1a]">Rendez-vous</h3>
                        <p className="mt-0.5 text-xs leading-5 text-[#696969]">Planifiez avec Acuity ou préparez un compte rendu à partir de vos notes.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRecapOpen(true)}
                        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#59319f] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#7b4dc4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#59319f] focus-visible:ring-offset-2 sm:w-auto"
                      >
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                        Préparer le récap RDV
                      </button>
                    </div>
                    <AcuityAppointments
                      project={project}
                      readonly={false}
                      onLogged={() => handleLogged('Lien Acuity loggé.')}
                    />
                  </div>
                </section>
              )}

              {readonly && (
                <section aria-label="Rendez-vous Acuity" className="rounded-xl border border-[#e2e2e2] bg-[#faf9f5] p-4 sm:p-6">
                  <AcuityAppointments project={project} readonly />
                </section>
              )}
            </div>
          )}

          {activeTab === 'timeline' && (
            <div id="project-panel-timeline" role="tabpanel" aria-labelledby="project-tab-timeline">
              <Timeline
                project_id={project.id}
                readonly={readonly}
                onTimelineChange={(events) => {
                  setTimeline(events)
                  setTimelineError(null)
                }}
              />
            </div>
          )}

          {activeTab === 'documents' && (
            <div
              id="project-panel-documents"
              role="tabpanel"
              aria-labelledby="project-tab-documents"
              className="rounded-xl border border-dashed border-[#d9d9d9] bg-[#faf9f5] px-5 py-10 text-center"
            >
              <Calendar className="mx-auto h-6 w-6 text-[#8a8a8a]" aria-hidden="true" />
              <h2 className="mt-3 text-base font-semibold text-[#1a1a1a]">Documents du projet</h2>
              <p className="mt-1 text-sm text-[#696969]">Cet espace sera disponible dans une prochaine version.</p>
            </div>
          )}
        </div>
      </div>

      <TodoistTimeline
        zoho_project_id={project.zoho_project_id ?? project.id}
        canReviewMatch={!readonly}
      />

      {emailComposer && (
        <EmailComposer
          project={project}
          templateKey={emailComposer}
          onClose={() => setEmailComposer(null)}
          onLogged={() => handleLogged('Email loggé.')}
        />
      )}
      {recapOpen && (
        <RecapModal
          project={project}
          onClose={() => setRecapOpen(false)}
          onLogged={() => handleLogged('Récap RDV loggé.')}
        />
      )}
    </div>
  )
}
