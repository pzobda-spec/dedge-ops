'use client'

import { useState, useEffect, useCallback } from 'react'
import type { LinearIssue, EscalationStatus } from '@/lib/linear/client'
import { formatHoursAgo } from '@/lib/utils/dates'

const columns: { status: EscalationStatus; label: string }[] = [
  { status: 'to_qualify', label: 'À qualifier' },
  { status: 'sent', label: 'Envoyé tech' },
  { status: 'waiting', label: 'En attente' },
  { status: 'in_progress', label: 'En cours' },
  { status: 'fix_ready', label: 'Fix prêt' },
  { status: 'resolved', label: 'Résolu' },
  { status: 'client_to_inform', label: 'Client à informer' },
]

const columnColors: Record<EscalationStatus, string> = {
  to_qualify: 'bg-slate-100',
  sent: 'bg-blue-50',
  waiting: 'bg-yellow-50',
  in_progress: 'bg-orange-50',
  fix_ready: 'bg-green-50',
  resolved: 'bg-emerald-50',
  client_to_inform: 'bg-purple-50',
}

const columnHeaderColors: Record<EscalationStatus, string> = {
  to_qualify: 'bg-slate-200 text-slate-700',
  sent: 'bg-blue-100 text-blue-800',
  waiting: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-orange-100 text-orange-800',
  fix_ready: 'bg-green-100 text-green-800',
  resolved: 'bg-emerald-100 text-emerald-800',
  client_to_inform: 'bg-purple-100 text-purple-800',
}

const priorityBadgeColors: Record<string, string> = {
  Urgent: 'bg-red-100 text-red-700',
  Haute: 'bg-orange-100 text-orange-700',
  Moyenne: 'bg-blue-100 text-blue-700',
  Basse: 'bg-slate-100 text-slate-600',
}

const priorityValues: Record<string, number> = {
  Urgent: 1,
  Haute: 2,
  Moyenne: 3,
  Basse: 4,
}

export default function EscalationsPage() {
  const [issues, setIssues] = useState<LinearIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formPriority, setFormPriority] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const loadIssues = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/linear/issues')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setIssues(data.issues ?? [])
    } catch (err) {
      setError('Erreur de chargement des escalades.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadIssues()
  }, [loadIssues])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!formTitle.trim() || !formDescription.trim()) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      const priority = formPriority ? priorityValues[formPriority] : undefined
      const res = await fetch('/api/linear/issues/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: formTitle, description: formDescription, priority }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      setShowModal(false)
      setFormTitle('')
      setFormDescription('')
      setFormPriority('')
      await loadIssues()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setSubmitting(false)
    }
  }

  const nonResolvedCount = issues.filter(i => i.status !== 'resolved').length

  return (
    <div>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Escalades</h1>
          {loading ? (
            <p className="text-sm text-slate-400 mt-0.5">Chargement...</p>
          ) : (
            <p className="text-sm text-slate-500 mt-0.5">
              {nonResolvedCount} escalade{nonResolvedCount !== 1 ? 's' : ''} en cours
            </p>
          )}
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-700 transition-colors"
        >
          Créer une escalade
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Kanban board */}
      <div className="p-6 overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mr-3" />
            <span className="text-slate-500 text-sm">Chargement des escalades...</span>
          </div>
        ) : (
          <div className="flex gap-4 min-w-max">
            {columns.map(col => {
              const colIssues = issues.filter(i => i.status === col.status)
              return (
                <div key={col.status} className="w-64 flex-shrink-0">
                  <div
                    className={`rounded-t-lg px-3 py-2 flex items-center justify-between ${columnHeaderColors[col.status]}`}
                  >
                    <span className="text-xs font-semibold">{col.label}</span>
                    <span className="text-xs font-bold">{colIssues.length}</span>
                  </div>
                  <div className={`rounded-b-lg ${columnColors[col.status]} min-h-32 p-2 space-y-2`}>
                    {colIssues.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">Aucune escalade</p>
                    ) : (
                      colIssues.map(issue => (
                        <div
                          key={issue.id}
                          className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm"
                        >
                          {/* Identifier + Linear link */}
                          <div className="flex items-center justify-between mb-1">
                            <a
                              href={issue.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-mono text-blue-600 hover:underline flex items-center gap-1"
                            >
                              {issue.identifier}
                              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                <polyline points="15 3 21 3 21 9"/>
                                <line x1="10" y1="14" x2="21" y2="3"/>
                              </svg>
                            </a>
                            {issue.priorityLabel !== '—' && (
                              <span
                                className={`text-xs font-medium px-1.5 py-0.5 rounded ${priorityBadgeColors[issue.priorityLabel] ?? 'bg-slate-100 text-slate-600'}`}
                              >
                                {issue.priorityLabel}
                              </span>
                            )}
                          </div>

                          {/* Title */}
                          <p className="text-sm font-medium text-slate-900 line-clamp-2 mb-1">
                            {issue.title.length > 60
                              ? issue.title.slice(0, 60) + '…'
                              : issue.title}
                          </p>

                          {/* Labels */}
                          {issue.labels.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-1">
                              {issue.labels.map(label => (
                                <span
                                  key={label}
                                  className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Assignee */}
                          {issue.assigneeName && (
                            <p className="text-xs text-slate-500 mb-1">{issue.assigneeName}</p>
                          )}

                          {/* Footer: updatedAt + linearState */}
                          <div className="flex items-center justify-between mt-2">
                            <p className="text-xs text-slate-400">{formatHoursAgo(issue.updatedAt)}</p>
                            <span className="text-xs text-slate-400">{issue.linearState}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create escalation modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Créer une escalade</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Titre <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  required
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                  placeholder="Ex: Campagnes email bloquées chez client X"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  required
                  rows={5}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                  placeholder="Décrivez le problème technique, les étapes de reproduction, l'impact..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Priorité</label>
                <select
                  value={formPriority}
                  onChange={e => setFormPriority(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  <option value="">— Aucune —</option>
                  <option value="Urgent">Urgent</option>
                  <option value="Haute">Haute</option>
                  <option value="Moyenne">Moyenne</option>
                  <option value="Basse">Basse</option>
                </select>
              </div>

              {submitError && (
                <p className="text-sm text-red-600">{submitError}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false)
                    setSubmitError(null)
                  }}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Création...
                    </span>
                  ) : (
                    'Créer dans Linear'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
