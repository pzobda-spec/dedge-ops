'use client'

import { useEffect, useMemo, useState } from 'react'
import type { OnboardingProject, ProjectStatus } from '@/lib/zoho/projectsClient'
import { formatDate } from '@/lib/utils/dates'

const IMPLEMENTATION_GROUP = ['Lan', 'Thuy-Tien', 'Dalia', 'Winli']
const EXCLUDED_OWNERS = ['Bruno', 'Admin', 'Dominic', 'Lauren']

const columns: { status: ProjectStatus; label: string }[] = [
  { status: 'not_started',    label: 'Non démarré' },
  { status: 'in_progress',    label: 'En cours' },
  { status: 'pending_client', label: 'En attente client' },
  { status: 'live',           label: 'Live' },
  { status: 'blocked',        label: 'Bloqué' },
  { status: 'other',          label: 'Autre' },
]

const columnBg: Record<ProjectStatus, string> = {
  not_started:    'bg-slate-50',
  in_progress:    'bg-blue-50',
  pending_client: 'bg-yellow-50',
  live:           'bg-emerald-50',
  blocked:        'bg-red-50',
  other:          'bg-slate-50',
}

const columnHeaderColors: Record<ProjectStatus, string> = {
  not_started:    'bg-slate-200 text-slate-700',
  in_progress:    'bg-blue-100 text-blue-800',
  pending_client: 'bg-yellow-100 text-yellow-800',
  live:           'bg-emerald-100 text-emerald-800',
  blocked:        'bg-red-100 text-red-800',
  other:          'bg-slate-200 text-slate-700',
}

const productColors: Record<string, string> = {
  'LoungeUp':    'bg-blue-100 text-blue-700',
  'Dmbook Pro':  'bg-purple-100 text-purple-700',
  'WhatsApp':    'bg-green-100 text-green-700',
  'Mobile Keys': 'bg-slate-200 text-slate-700',
}

function productBadgeClass(product: string): string {
  return productColors[product] ?? 'bg-slate-100 text-slate-600'
}

function formatISODate(iso: string | null): string {
  if (!iso) return '—'
  return formatDate(iso)
}

function resolveOwnerFilter(filter: string, availableOwners: string[]): string[] {
  if (filter === 'Tous') return availableOwners
  if (filter === 'Implémentation') return IMPLEMENTATION_GROUP.filter(o => availableOwners.includes(o))
  return [filter]
}

export default function OnboardingBoardPage() {
  const [projects, setProjects] = useState<OnboardingProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ownerFilter, setOwnerFilter] = useState<string>('Tous')

  useEffect(() => {
    fetch('/api/zoho/projects')
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
      .then((data: { projects: OnboardingProject[] }) => { setProjects(data.projects); setLoading(false) })
      .catch(err => { console.error(err); setError('Impossible de charger les projets.'); setLoading(false) })
  }, [])

  const baseProjects = useMemo(
    () => projects.filter(p => !EXCLUDED_OWNERS.includes(p.ownerShort ?? '')),
    [projects],
  )

  const availableOwners = useMemo(
    () => [...new Set(baseProjects.map(p => p.ownerShort).filter(Boolean))].sort() as string[],
    [baseProjects],
  )

  const ownerPills = useMemo(
    () => ['Tous', 'Implémentation', ...availableOwners],
    [availableOwners],
  )

  const resolvedOwners = useMemo(
    () => resolveOwnerFilter(ownerFilter, availableOwners),
    [ownerFilter, availableOwners],
  )

  const visibleProjects = useMemo(
    () => ownerFilter === 'Tous' ? baseProjects : baseProjects.filter(p => resolvedOwners.includes(p.ownerShort ?? '')),
    [baseProjects, ownerFilter, resolvedOwners],
  )

  return (
    <div>
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-slate-900">Board</h1>
        {!loading && !error && (
          <p className="text-sm text-slate-500 mt-0.5">{baseProjects.length} projets · {new Set(baseProjects.map(p => p.hotelName)).size} comptes</p>
        )}
        {loading && <p className="text-sm text-slate-400 mt-0.5">Chargement…</p>}
        {error && <p className="text-sm text-red-500 mt-0.5">{error}</p>}
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Chargement des projets…</div>
      ) : error ? (
        <div className="p-12 text-center text-red-500 text-sm">{error}</div>
      ) : (
        <div className="p-6 space-y-4">
          {/* Owner filter */}
          <div className="flex items-center gap-2 flex-wrap">
            {ownerPills.map(owner => (
              <button
                key={owner}
                onClick={() => setOwnerFilter(ownerFilter === owner && owner !== 'Tous' ? 'Tous' : owner)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  ownerFilter === owner
                    ? 'bg-slate-800 text-white border-slate-800'
                    : owner === 'Implémentation'
                    ? 'border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {owner}
              </button>
            ))}
          </div>

          {/* Kanban */}
          <div className="overflow-x-auto">
            <div className="flex gap-4 min-w-max">
              {columns.map(col => {
                const colProjects = visibleProjects.filter(p => p.status === col.status)
                return (
                  <div key={col.status} className="w-60 flex-shrink-0">
                    <div className={`rounded-t-lg px-3 py-2 flex items-center justify-between ${columnHeaderColors[col.status]}`}>
                      <span className="text-xs font-semibold">{col.label}</span>
                      <span className="text-xs font-bold">{colProjects.length}</span>
                    </div>
                    <div className={`rounded-b-lg ${columnBg[col.status]} min-h-24 p-2 space-y-2`}>
                      {colProjects.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-4">—</p>
                      ) : (
                        colProjects.map(p => {
                          const border = p.isBlocked ? 'border-2 border-red-400' : 'border border-slate-200'
                          return (
                            <a
                              key={p.id}
                              href={p.projectUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`block bg-white rounded-lg ${border} p-3 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer`}
                            >
                              <p className="text-xs font-semibold text-slate-800 line-clamp-2 mb-1">{p.hotelName}</p>
                              <div className="flex flex-wrap gap-1 mb-2">
                                {p.product && (
                                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${productBadgeClass(p.product)}`}>
                                    {p.product}
                                  </span>
                                )}
                              </div>
                              {p.isBlocked && <span className="block text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded mb-1 font-medium">Bloqué</span>}
                              {p.isOverdue && <span className="block text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded mb-1">Go-live dépassé</span>}
                              {(p.riskLevel === 'high' || p.riskLevel === 'critical') && (
                                <span className="block text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded mb-1 font-medium">Risque élevé</span>
                              )}
                              <div className="mb-2">
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-xs text-slate-400">Avancement</span>
                                  <span className="text-xs text-slate-500 font-medium">{p.percentComplete}%</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-1.5">
                                  <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(p.percentComplete, 100)}%` }} />
                                </div>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="inline-flex items-center text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{p.ownerShort}</span>
                                {p.endDate && <span className="text-xs text-slate-400">{formatISODate(p.endDate)}</span>}
                              </div>
                            </a>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
