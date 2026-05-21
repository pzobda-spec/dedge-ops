'use client'

import { useState, useEffect, useMemo } from 'react'
import type { LinearIssue } from '@/lib/linear/client'

type DatePreset = 'all' | '7d' | '30d' | 'quarter' | 'custom'

const LINEAR_STATE_DISPLAY: { state: string; label: string; bg: string; border: string; countColor: string }[] = [
  { state: 'Todo',            label: 'To do',           bg: 'bg-slate-50',   border: 'border-slate-200',  countColor: 'text-slate-700' },
  { state: 'In Progress',     label: 'In Progress',     bg: 'bg-orange-50',  border: 'border-orange-200', countColor: 'text-orange-700' },
  { state: 'Tech Blocked',    label: 'Tech Blocked',    bg: 'bg-red-50',     border: 'border-red-200',    countColor: 'text-red-700' },
  { state: 'CSM Blocked',     label: 'CSM Blocked',     bg: 'bg-amber-50',   border: 'border-amber-200',  countColor: 'text-amber-700' },
  { state: 'Product Blocked', label: 'Product Blocked', bg: 'bg-amber-50',   border: 'border-amber-200',  countColor: 'text-amber-700' },
  { state: 'To Review',       label: 'To Review',       bg: 'bg-green-50',   border: 'border-green-200',  countColor: 'text-green-700' },
  { state: 'In Review',       label: 'In Review',       bg: 'bg-green-50',   border: 'border-green-200',  countColor: 'text-green-700' },
  { state: 'Solved',          label: 'Resolved',        bg: 'bg-emerald-50', border: 'border-emerald-200',countColor: 'text-emerald-700' },
]

const PRIORITY_DISPLAY = [
  { label: 'Urgent',  color: 'text-red-600',    bar: 'bg-red-500' },
  { label: 'Haute',   color: 'text-orange-600', bar: 'bg-orange-400' },
  { label: 'Moyenne', color: 'text-blue-600',   bar: 'bg-blue-400' },
  { label: 'Basse',   color: 'text-slate-500',  bar: 'bg-slate-300' },
  { label: '—',       color: 'text-slate-400',  bar: 'bg-slate-200' },
]

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function getPresetRange(preset: DatePreset): { from: Date | null; to: Date | null } {
  const now = new Date()
  if (preset === 'all') return { from: null, to: null }
  if (preset === '7d') return { from: new Date(now.getTime() - 7 * 86_400_000), to: null }
  if (preset === '30d') return { from: new Date(now.getTime() - 30 * 86_400_000), to: null }
  if (preset === 'quarter') {
    const q = Math.floor(now.getMonth() / 3)
    const from = new Date(now.getFullYear(), q * 3, 1)
    return { from, to: null }
  }
  return { from: null, to: null }
}

export default function EscalationsAnalyticsPage() {
  const [issues, setIssues] = useState<LinearIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [preset, setPreset] = useState<DatePreset>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  useEffect(() => {
    fetch('/api/linear/issues')
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
      .then((data: { issues: LinearIssue[] }) => { setIssues(data.issues); setLoading(false) })
      .catch(err => { console.error(err); setError('Impossible de charger les escalades.'); setLoading(false) })
  }, [])

  const filteredIssues = useMemo(() => {
    if (preset === 'all' && !customFrom && !customTo) return issues
    let from: Date | null = null
    let to: Date | null = null
    if (preset === 'custom') {
      from = customFrom ? new Date(customFrom) : null
      to = customTo ? new Date(customTo + 'T23:59:59') : null
    } else {
      const range = getPresetRange(preset)
      from = range.from
      to = range.to
    }
    return issues.filter(i => {
      const d = new Date(i.createdAt)
      if (from && d < from) return false
      if (to && d > to) return false
      return true
    })
  }, [issues, preset, customFrom, customTo])

  const openIssues = useMemo(() => filteredIssues.filter(i => i.status !== 'resolved'), [filteredIssues])
  const resolvedCount = filteredIssues.length - openIssues.length
  const resolutionRate = filteredIssues.length > 0 ? Math.round((resolvedCount / filteredIssues.length) * 100) : 0

  const stateCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const i of filteredIssues) map[i.linearState] = (map[i.linearState] ?? 0) + 1
    return map
  }, [filteredIssues])

  const priorityCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const i of openIssues) map[i.priorityLabel] = (map[i.priorityLabel] ?? 0) + 1
    return map
  }, [openIssues])

  const ages = openIssues.map(i => daysSince(i.createdAt))
  const avgAge = ages.length > 0 ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0
  const oldest = openIssues.length > 0
    ? openIssues.reduce((a, b) => new Date(a.createdAt) < new Date(b.createdAt) ? a : b)
    : null
  const unassignedCount = openIssues.filter(i => !i.assigneeName).length

  const labelMap: Record<string, number> = {}
  for (const i of openIssues) for (const l of i.labels) labelMap[l] = (labelMap[l] ?? 0) + 1
  const topLabels = Object.entries(labelMap).sort((a, b) => b[1] - a[1]).slice(0, 6)

  const presets: { value: DatePreset; label: string }[] = [
    { value: 'all',     label: 'Tous' },
    { value: '7d',      label: '7 derniers jours' },
    { value: '30d',     label: '30 derniers jours' },
    { value: 'quarter', label: 'Ce trimestre' },
    { value: 'custom',  label: 'Personnalisé' },
  ]

  return (
    <div>
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Analytiques Board Bug</h1>
          {!loading && !error && (
            <p className="text-sm text-slate-500 mt-0.5">
              {filteredIssues.length} escalade{filteredIssues.length !== 1 ? 's' : ''}
              {preset !== 'all' && ` · filtrées sur ${issues.length} au total`}
            </p>
          )}
          {loading && <p className="text-sm text-slate-400 mt-0.5">Chargement…</p>}
          {error && <p className="text-sm text-red-500 mt-0.5">{error}</p>}
        </div>

        {/* Date filters */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {presets.map(p => (
              <button
                key={p.value}
                onClick={() => setPreset(p.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  preset === p.value
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-slate-400">→</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Chargement des escalades…</div>
      ) : error ? (
        <div className="p-12 text-center text-red-500 text-sm">{error}</div>
      ) : (
        <div className="p-6 space-y-6 max-w-5xl">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Statut en temps réel</p>
            <div className="grid grid-cols-4 gap-3">
              {LINEAR_STATE_DISPLAY.map(s => {
                const count = s.state === 'Solved'
                  ? resolvedCount
                  : (stateCounts[s.state] ?? 0)
                return (
                  <div key={s.state} className={`rounded-xl border-2 ${s.border} ${s.bg} p-4`}>
                    <div className={`text-3xl font-bold tabular-nums ${s.countColor}`}>{count}</div>
                    <div className="text-xs font-semibold text-slate-600 mt-1.5">{s.label}</div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-4">Par priorité (bugs ouverts)</p>
              <div className="space-y-3">
                {PRIORITY_DISPLAY.map(p => {
                  const count = priorityCounts[p.label] ?? 0
                  return (
                    <div key={p.label} className="flex items-center gap-3">
                      <span className={`text-xs font-semibold w-16 flex-shrink-0 ${p.color}`}>{p.label}</span>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${p.bar} rounded-full transition-all`}
                          style={{ width: `${openIssues.length > 0 ? (count / openIssues.length) * 100 : 0}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-slate-600 w-5 text-right flex-shrink-0">{count}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-4">Santé du backlog</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Bugs ouverts</span>
                  <span className="text-sm font-bold text-slate-900">{openIssues.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Âge moyen</span>
                  <span className="text-sm font-bold text-slate-900">{avgAge}j</span>
                </div>
                {oldest && (
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm text-slate-600 flex-shrink-0">Plus ancien</span>
                    <span className="text-xs font-medium text-right text-slate-700 line-clamp-1">
                      <a href={oldest.url} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-600">
                        {oldest.identifier}
                      </a> · {daysSince(oldest.createdAt)}j
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Sans assigné</span>
                  <span className={`text-sm font-bold ${unassignedCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{unassignedCount}</span>
                </div>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-sm text-slate-600">Taux de résolution</span>
                  <span className="text-sm font-bold text-emerald-600">{resolutionRate}%</span>
                </div>
              </div>
            </div>
          </div>

          {topLabels.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-4">Labels les plus fréquents (bugs ouverts)</p>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
                {topLabels.map(([label, count]) => {
                  const max = topLabels[0]?.[1] || 1
                  return (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-sm text-slate-700 w-28 truncate flex-shrink-0">{label}</span>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${(count / max) * 100}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-slate-500 w-4 text-right flex-shrink-0">{count}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
