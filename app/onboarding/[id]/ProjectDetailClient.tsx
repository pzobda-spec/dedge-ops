'use client'

import { useEffect, useState } from 'react'
import ProjectProgress from '@/components/onboarding/ProjectProgress'
import Timeline from '@/components/onboarding/Timeline'
import type { ProjectEvent } from '@/lib/onboarding/events'
import type { OnboardingProjectDetail } from '@/lib/onboarding/projects'
import { formatDate } from '@/lib/utils/dates'

const tabs = [
  { key: 'overview', label: "Vue d'ensemble" },
  { key: 'timeline', label: 'Timeline' },
  { key: 'documents', label: 'Documents' },
] as const

type TabKey = typeof tabs[number]['key']

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
      setMessage(`${data.synced ?? 0} projet synchronise`)
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
        className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Synchronisation...' : 'Forcer la synchronisation'}
      </button>
      {message && <span className="text-xs text-slate-500">{message}</span>}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-slate-900 mt-1">{value}</p>
    </div>
  )
}

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
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setSummary(data.summary)
      setGeneratedAt(data.generated_at)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de générer le résumé.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Résumé exécutif</h2>
          {generatedAt && <p className="text-xs text-slate-400 mt-0.5">Généré le {formatDate(generatedAt.slice(0, 10))}</p>}
        </div>
        {canGenerate && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => generate(false)}
              disabled={loading}
              className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
            >
              {loading ? 'Génération...' : 'Générer le résumé'}
            </button>
            {summary && (
              <button
                onClick={() => generate(true)}
                disabled={loading}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Régénérer
              </button>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>}
      {summary ? (
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{summary}</p>
      ) : (
        <p className="text-sm text-slate-400">Aucun résumé généré.</p>
      )}
    </div>
  )
}

export function ProjectDetailTabs({
  project,
  readonly = false,
}: {
  project: OnboardingProjectDetail
  readonly?: boolean
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [timeline, setTimeline] = useState<ProjectEvent[]>([])

  useEffect(() => {
    fetch(`/api/onboarding/projects/${encodeURIComponent(project.id)}/timeline`)
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then(data => setTimeline(data.events ?? []))
      .catch(() => setTimeline([]))
  }, [project.id])

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="border-b border-slate-200 px-5 pt-4">
          <div className="flex gap-1">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
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
              <ProjectProgress timeline={timeline} zohoStatus={project.zoho_status} />
              <ExecutiveSummary project={project} canGenerate={!readonly} />
              <div className="grid grid-cols-4 gap-3">
                <MetricCard label="Début" value={project.start_date ? formatDate(project.start_date) : '—'} />
                <MetricCard label="Go-live cible" value={project.target_go_live ? formatDate(project.target_go_live) : '—'} />
                <MetricCard label="Go-live réel" value={project.actual_go_live ? formatDate(project.actual_go_live) : '—'} />
                <MetricCard label="Dernière sync" value={project.last_synced_at ? formatDate(project.last_synced_at.slice(0, 10)) : '—'} />
              </div>
            </div>
          )}
          {activeTab === 'timeline' && (
            <Timeline project_id={project.id} readonly={readonly} onTimelineChange={setTimeline} />
          )}
          {activeTab === 'documents' && (
            <p className="text-sm text-slate-400">Documents projet - placeholder phase 4.</p>
          )}
        </div>
      </div>
    </div>
  )
}
