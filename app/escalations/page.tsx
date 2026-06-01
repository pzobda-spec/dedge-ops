'use client'

import { useState, useEffect, useCallback } from 'react'
import type { LinearIssue, EscalationStatus } from '@/lib/linear/client'
import { formatHoursAgo } from '@/lib/utils/dates'

const columns: { status: EscalationStatus; label: string }[] = [
  { status: 'to_qualify', label: 'À qualifier' },
  { status: 'waiting',    label: 'En attente' },
  { status: 'in_progress', label: 'En cours' },
  { status: 'fix_ready',  label: 'Fix prêt' },
  { status: 'resolved',   label: 'Résolu' },
]

const columnColors: Record<EscalationStatus, { bg: string; header: string }> = {
  to_qualify:       { bg: 'bg-[#f7f7f7]',  header: 'bg-[#e2e2e2] text-[#4a4a4a]' },
  sent:             { bg: 'bg-[#eef4fc]',  header: 'bg-[#d4e4f8] text-[#2b5bb7]' },
  waiting:          { bg: 'bg-[#fef8ea]',  header: 'bg-[#fbf1ca] text-[#84550e]' },
  in_progress:      { bg: 'bg-[#eef4fc]',  header: 'bg-[#d4e4f8] text-[#2b5bb7]' },
  fix_ready:        { bg: 'bg-[#edfff4]',  header: 'bg-[#cff7dc] text-[#1c6437]' },
  resolved:         { bg: 'bg-[#edfff4]',  header: 'bg-[#cff7dc] text-[#1c6437]' },
  client_to_inform: { bg: 'bg-[#f3eeff]',  header: 'bg-[#e8dbfa] text-[#59319f]' },
}

const priorityBadgeColors: Record<string, string> = {
  Urgent: 'bg-[#fee3e2] text-[#b7221b]',
  Haute:  'bg-[#ffe7cf] text-[#903b07]',
  Moyenne:'bg-[#d4e4f8] text-[#2b5bb7]',
  Basse:  'bg-[#e2e2e2] text-[#4a4a4a]',
}

const priorityValues: Record<string, number> = {
  Urgent: 1, Haute: 2, Moyenne: 3, Basse: 4,
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

  useEffect(() => { loadIssues() }, [loadIssues])

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

  const inputCls = 'w-full border border-[#e2e2e2] rounded-lg px-3 py-2 text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#3b72d1]'

  return (
    <div style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'var(--bg-canvas)' }} className="min-h-screen">
      {/* Header */}
      <div className="bg-white border-b border-[#e2e2e2] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a1a]">Board Bug</h1>
          {loading ? (
            <p className="text-sm text-[#696969] mt-0.5">Chargement…</p>
          ) : (
            <p className="text-sm text-[#696969] mt-0.5">
              {nonResolvedCount} escalade{nonResolvedCount !== 1 ? 's' : ''} en cours
            </p>
          )}
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-[#59319f] text-white rounded-lg text-sm font-medium hover:bg-[#3f2175] transition-colors focus:outline-none focus:ring-2 focus:ring-[#3b72d1]"
        >
          Créer une escalade
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 bg-[#fee3e2] border border-[#fca5a5] rounded-lg text-sm text-[#b7221b]">
          {error}
        </div>
      )}

      {!loading && issues.filter(i => i.status === 'to_qualify').length >= 20 && (
        <div className="mx-6 mt-4 p-3 bg-[#fbf1ca] border border-[#f7d878] rounded-lg text-sm text-[#84550e] font-medium">
          {issues.filter(i => i.status === 'to_qualify').length} bugs en attente de qualification — action requise
        </div>
      )}

      {/* Kanban board */}
      <div className="p-6 overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#e2e2e2] border-t-[#59319f] rounded-full animate-spin mr-3" />
            <span className="text-[#696969] text-sm">Chargement des escalades…</span>
          </div>
        ) : (
          <div className="flex gap-4 min-w-max">
            {columns.map(col => {
              const colIssues = issues.filter(i => i.status === col.status)
              const { bg, header } = columnColors[col.status]
              return (
                <div key={col.status} className="w-64 flex-shrink-0">
                  <div className={`rounded-t-lg px-3 py-2 flex items-center justify-between ${header}`}>
                    <span className="text-xs font-semibold">{col.label}</span>
                    <span className="text-xs font-bold">{colIssues.length}</span>
                  </div>
                  <div className={`rounded-b-lg ${bg} min-h-32 p-2 space-y-2`}>
                    {colIssues.length === 0 ? (
                      <p className="text-xs text-[#b0b0b0] text-center py-4">Aucune escalade</p>
                    ) : (
                      colIssues.map(issue => (
                        <div
                          key={issue.id}
                          className="bg-white rounded-lg border border-[#e2e2e2] p-3 shadow-[0_2px_6px_rgba(0,0,0,0.08)]"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <a
                              href={issue.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-mono text-[#59319f] hover:underline flex items-center gap-1"
                            >
                              {issue.identifier}
                              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                <polyline points="15 3 21 3 21 9"/>
                                <line x1="10" y1="14" x2="21" y2="3"/>
                              </svg>
                            </a>
                            {issue.priorityLabel !== '—' && (
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${priorityBadgeColors[issue.priorityLabel] ?? 'bg-[#e2e2e2] text-[#4a4a4a]'}`}>
                                {issue.priorityLabel}
                              </span>
                            )}
                          </div>

                          <p className="text-sm font-medium text-[#1a1a1a] line-clamp-2 mb-1">
                            {issue.title.length > 60 ? issue.title.slice(0, 60) + '…' : issue.title}
                          </p>

                          {issue.labels.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-1">
                              {issue.labels.map(label => (
                                <span key={label} className="text-xs px-1.5 py-0.5 rounded bg-[#f7f7f7] text-[#696969]">
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}

                          {issue.assigneeName && (
                            <p className="text-xs text-[#696969] mb-1">{issue.assigneeName}</p>
                          )}

                          <div className="flex items-center justify-between mt-2">
                            <p className="text-xs text-[#b0b0b0]">{formatHoursAgo(issue.updatedAt)}</p>
                            <span className="text-xs text-[#b0b0b0]">{issue.linearState}</span>
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
          <div className="bg-white rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] w-full max-w-lg mx-4 p-6">
            <h2 className="text-lg font-semibold text-[#1a1a1a] mb-4">Créer une escalade</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#696969] uppercase tracking-wide mb-1">
                  Titre <span className="text-[#b7221b]">*</span>
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  required
                  className={inputCls}
                  placeholder="Ex : Campagnes email bloquées chez client X"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#696969] uppercase tracking-wide mb-1">
                  Description <span className="text-[#b7221b]">*</span>
                </label>
                <textarea
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  required
                  rows={5}
                  className={inputCls}
                  placeholder="Décrivez le problème technique, les étapes de reproduction, l'impact…"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#696969] uppercase tracking-wide mb-1">Priorité</label>
                <select
                  value={formPriority}
                  onChange={e => setFormPriority(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— Aucune —</option>
                  <option value="Urgent">Urgent</option>
                  <option value="Haute">Haute</option>
                  <option value="Moyenne">Moyenne</option>
                  <option value="Basse">Basse</option>
                </select>
              </div>

              {submitError && (
                <p className="text-sm text-[#b7221b] bg-[#fee3e2] border border-[#fca5a5] rounded-lg px-3 py-2">{submitError}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setSubmitError(null) }}
                  className="px-4 py-2 text-sm font-medium text-[#696969] hover:bg-[#f7f7f7] rounded-lg transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-[#59319f] text-white rounded-lg text-sm font-medium hover:bg-[#3f2175] transition-colors disabled:opacity-50"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Création…
                    </span>
                  ) : 'Créer dans Linear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
