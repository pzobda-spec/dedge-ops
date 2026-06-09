'use client'

import { useEffect, useState } from 'react'
import { Calendar, ClipboardList, LoaderCircle, Mail, Sparkles } from 'lucide-react'
import AcuityAppointments from '@/components/onboarding/AcuityAppointments'
import EmailComposer from '@/components/onboarding/EmailComposer'
import ProjectProgress from '@/components/onboarding/ProjectProgress'
import RecapModal from '@/components/onboarding/RecapModal'
import Timeline from '@/components/onboarding/Timeline'
import TodoistTimeline from '@/components/todoist/TodoistTimeline'
import type { EmailTemplateKey } from '@/lib/onboarding/email-templates'
import type { ProjectEvent } from '@/lib/onboarding/events'
import type { OnboardingProjectDetail, ProjectStatusReport } from '@/lib/onboarding/projects'
import { formatDate } from '@/lib/utils/dates'

const tabs = [
  { key: 'overview',   label: "Vue d'ensemble" },
  { key: 'timeline',   label: 'Timeline' },
  { key: 'documents',  label: 'Documents' },
] as const

type TabKey = typeof tabs[number]['key']

// ─── Force sync button ─────────────────────────────────────────────────────────

export function ForceSyncButton({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSync() {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/integrations/zoho/projects-sync?project_id=${encodeURIComponent(projectId)}`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setMessage(`${data.synced ?? 0} projet synchronisé`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erreur de synchronisation')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleSync}
        disabled={loading}
        className="px-3 py-1.5 rounded-lg border border-[#59319f] text-[#59319f] text-sm font-medium hover:bg-[#f3eeff] disabled:opacity-50 transition-colors"
      >
        {loading ? 'Synchronisation…' : 'Forcer la sync'}
      </button>
      {message && <span className="text-xs text-[#696969]">{message}</span>}
    </div>
  )
}

// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-[#e2e2e2] rounded-xl p-4">
      <p className="text-xs font-semibold text-[#696969] uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-[#1a1a1a] mt-1">{value}</p>
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
      <div className="flex items-center justify-between gap-4 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-[#1a1a1a]">Résumé exécutif</h3>
          {generatedAt && <p className="text-xs text-[#696969] mt-0.5">Généré le {formatDate(generatedAt.slice(0, 10))}</p>}
        </div>
        {canGenerate && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => generate(false)}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-[#59319f] text-white text-sm font-medium hover:bg-[#7b4dc4] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Génération…' : 'Générer le résumé'}
            </button>
            {summary && (
              <button
                onClick={() => generate(true)}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg border border-[#59319f] text-[#59319f] text-sm font-medium hover:bg-[#f3eeff] disabled:opacity-50 transition-colors"
              >
                Régénérer
              </button>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-sm text-[#b7221b] bg-[#fff8f8] border border-[#fee3e2] rounded-lg px-3 py-2 mb-3">{error}</p>}
      {summary ? (
        <p className="text-sm text-[#4a4a4a] leading-relaxed whitespace-pre-wrap">{summary}</p>
      ) : (
        <p className="text-sm text-[#696969]">Aucun résumé généré.</p>
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
      const payload: unknown = await response.json()
      if (typeof payload !== 'object' || payload === null) {
        throw new Error(`Réponse invalide (HTTP ${response.status})`)
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
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[#59319f]" />
            <h3 className="text-sm font-semibold text-[#1a1a1a]">État des lieux</h3>
          </div>
          <p className="mt-1 text-xs text-[#696969]">
            Vue d&apos;ensemble, timeline projet et commentaires Todoist.
            {generatedAt && ` Généré le ${formatDate(generatedAt.slice(0, 10))}.`}
          </p>
        </div>
        {canGenerate && (
          <button
            type="button"
            onClick={() => generate(Boolean(report))}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-[#59319f] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#7b4dc4] disabled:opacity-50"
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
        <p className="mb-4 rounded-lg border border-[#fee3e2] bg-[#fff8f8] px-3 py-2 text-sm text-[#b7221b]">
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
  const [emailComposer, setEmailComposer] = useState<EmailTemplateKey | null>(null)
  const [recapOpen, setRecapOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  async function loadTimeline() {
    try {
      const res = await fetch(`/api/onboarding/projects/${encodeURIComponent(project.id)}/timeline`)
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      setTimeline(data.events ?? [])
    } catch {
      setTimeline([])
    }
  }

  useEffect(() => {
    loadTimeline()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  function handleLogged(message: string) {
    setToast(message)
    loadTimeline()
    window.setTimeout(() => setToast(null), 3000)
  }

  return (
    <div className="space-y-5">
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg bg-[#1a1a1a] px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white border border-[#e2e2e2] rounded-xl overflow-hidden shadow-[0_4px_8px_rgba(0,0,0,0.06)]">
        <div className="border-b border-[#e2e2e2] px-5 pt-4">
          <div className="flex gap-1">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
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

        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-5">

              {/* Zone Informations */}
              <div className="bg-[#faf9f5] border border-[#e2e2e2] rounded-xl p-5 space-y-5">
                <h2 className="text-xs font-semibold text-[#696969] uppercase tracking-wide">Informations</h2>
                <ProjectProgress timeline={timeline} zohoStatus={project.zoho_status} />
                <div className="border-t border-[#e2e2e2] pt-5">
                  <ExecutiveSummary project={project} canGenerate={!readonly} />
                </div>
                <div className="border-t border-[#e2e2e2] pt-5">
                  <StatusReportSection project={project} canGenerate={!readonly} />
                </div>
                <div className="border-t border-[#e2e2e2] pt-5 grid grid-cols-4 gap-3">
                  <MetricCard label="Début"         value={project.start_date     ? formatDate(project.start_date)                     : '—'} />
                  <MetricCard label="Go-live cible" value={project.target_go_live ? formatDate(project.target_go_live)                 : '—'} />
                  <MetricCard label="Go-live réel"  value={project.actual_go_live ? formatDate(project.actual_go_live)                 : '—'} />
                  <MetricCard label="Dernière sync" value={project.last_synced_at ? formatDate(project.last_synced_at.slice(0, 10))   : '—'} />
                </div>
              </div>

              {/* Zone Actions */}
              {!readonly && (
                <div className="bg-[#faf9f5] border border-[#e2e2e2] rounded-xl p-5 space-y-5">
                  <h2 className="text-xs font-semibold text-[#696969] uppercase tracking-wide">Actions</h2>

                  {/* Communications */}
                  <div>
                    <div className="flex items-center justify-between gap-4 mb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-[#1a1a1a]">Communications</h3>
                        <p className="text-xs text-[#696969] mt-0.5">Prévisualiser, copier puis logger les emails envoyés.</p>
                      </div>
                      <Mail className="h-4 w-4 text-[#696969]" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {emailActions.map(action => (
                        <button
                          key={action.key}
                          onClick={() => setEmailComposer(action.key)}
                          className="inline-flex items-center gap-2 rounded-lg border border-[#59319f] px-3 py-2 text-sm font-medium text-[#59319f] hover:bg-[#f3eeff] transition-colors"
                        >
                          <Mail className="h-4 w-4" />
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Rendez-vous */}
                  <div className="border-t border-[#e2e2e2] pt-5">
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <h3 className="text-sm font-semibold text-[#1a1a1a]">Rendez-vous</h3>
                      <button
                        onClick={() => setRecapOpen(true)}
                        className="inline-flex items-center gap-2 rounded-lg bg-[#59319f] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#7b4dc4] transition-colors"
                      >
                        <Sparkles className="h-4 w-4" />
                        Récap RDV Gem
                      </button>
                    </div>
                    <AcuityAppointments project={project} onLogged={() => handleLogged('Lien Acuity loggé.')} />
                  </div>
                </div>
              )}

              {/* Acuity visible for readonly (lecture seule) */}
              {readonly && (
                <AcuityAppointments project={project} onLogged={() => {}} />
              )}
            </div>
          )}

          {activeTab === 'timeline' && (
            <Timeline project_id={project.id} readonly={readonly} onTimelineChange={setTimeline} />
          )}

          {activeTab === 'documents' && (
            <div className="flex items-center gap-2 text-sm text-[#696969]">
              <Calendar className="h-4 w-4" />
              Documents projet — placeholder phase 4.
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
