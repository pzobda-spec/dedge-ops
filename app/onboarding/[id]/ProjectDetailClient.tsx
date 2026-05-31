'use client'

import { useState } from 'react'

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

export function ProjectDetailTabs() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  return (
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
          <p className="text-sm text-slate-400">Vue d&apos;ensemble projet - placeholder phase 2.</p>
        )}
        {activeTab === 'timeline' && (
          <p className="text-sm text-slate-400">Timeline projet - placeholder phase 2.</p>
        )}
        {activeTab === 'documents' && (
          <p className="text-sm text-slate-400">Documents projet - placeholder phase 2.</p>
        )}
      </div>
    </div>
  )
}
