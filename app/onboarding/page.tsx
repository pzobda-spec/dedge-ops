'use client'

import { useEffect, useState } from 'react'
import type { OnboardingProject, ProjectStatus } from '@/lib/zoho/projectsClient'
import { formatDate } from '@/lib/utils/dates'

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const columns: { status: ProjectStatus; label: string }[] = [
  { status: 'not_started', label: 'Non démarré' },
  { status: 'in_progress', label: 'En cours' },
  { status: 'pending_client', label: 'En attente client' },
  { status: 'live', label: 'Live' },
  { status: 'blocked', label: 'Bloqué' },
  { status: 'other', label: 'Autre' },
]

const columnBg: Record<ProjectStatus, string> = {
  not_started: 'bg-slate-50',
  in_progress: 'bg-blue-50',
  pending_client: 'bg-yellow-50',
  live: 'bg-emerald-50',
  blocked: 'bg-red-50',
  other: 'bg-slate-50',
}

const columnHeaderColors: Record<ProjectStatus, string> = {
  not_started: 'bg-slate-200 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-800',
  pending_client: 'bg-yellow-100 text-yellow-800',
  live: 'bg-emerald-100 text-emerald-800',
  blocked: 'bg-red-100 text-red-800',
  other: 'bg-slate-200 text-slate-700',
}

// ---------------------------------------------------------------------------
// Product badge colours
// ---------------------------------------------------------------------------

type ProductKey = 'LoungeUp' | 'Dmbook Pro' | 'WhatsApp' | 'Mobile Keys'

const productColors: Record<ProductKey | string, string> = {
  'LoungeUp': 'bg-blue-100 text-blue-700',
  'Dmbook Pro': 'bg-purple-100 text-purple-700',
  'WhatsApp': 'bg-green-100 text-green-700',
  'Mobile Keys': 'bg-slate-200 text-slate-700',
}

function productBadgeClass(product: string): string {
  return productColors[product] ?? 'bg-slate-100 text-slate-600'
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function formatISODate(iso: string | null): string {
  if (!iso) return '—'
  return formatDate(iso)
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  const [projects, setProjects] = useState<OnboardingProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/zoho/projects')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: { projects: OnboardingProject[] }) => {
        setProjects(data.projects)
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setError('Impossible de charger les projets.')
        setLoading(false)
      })
  }, [])

  const today = new Date()

  // Owner workload
  const ownerMap = new Map<string, OnboardingProject[]>()
  for (const p of projects) {
    const key = p.ownerShort
    if (!ownerMap.has(key)) ownerMap.set(key, [])
    ownerMap.get(key)!.push(p)
  }

  const ownerStats = Array.from(ownerMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([owner, ownerProjects]) => {
      const inProgress = ownerProjects.filter(p => p.status === 'in_progress').length
      const blocked = ownerProjects.filter(p => p.isBlocked).length
      const goLiveThisMonth = ownerProjects.filter(p => {
        if (!p.endDate) return false
        const d = new Date(p.endDate)
        return (
          d.getMonth() === today.getMonth() &&
          d.getFullYear() === today.getFullYear()
        )
      }).length
      const highRisk = ownerProjects.filter(
        p => p.riskLevel === 'high' || p.riskLevel === 'critical',
      ).length
      return { owner, inProgress, blocked, goLiveThisMonth, highRisk }
    })

  return (
    <div>
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-slate-900">Onboarding</h1>
        {loading ? (
          <p className="text-sm text-slate-400 mt-0.5">Chargement…</p>
        ) : error ? (
          <p className="text-sm text-red-500 mt-0.5">{error}</p>
        ) : (
          <p className="text-sm text-slate-500 mt-0.5">{projects.length} projets</p>
        )}
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Chargement des projets…</div>
      ) : error ? (
        <div className="p-12 text-center text-red-500 text-sm">{error}</div>
      ) : (
        <div className="p-6 space-y-6">
          {/* Pipeline board */}
          <div className="overflow-x-auto">
            <div className="flex gap-4 min-w-max">
              {columns.map(col => {
                const colProjects = projects.filter(p => p.status === col.status)
                return (
                  <div key={col.status} className="w-60 flex-shrink-0">
                    <div
                      className={`rounded-t-lg px-3 py-2 flex items-center justify-between ${columnHeaderColors[col.status]}`}
                    >
                      <span className="text-xs font-semibold">{col.label}</span>
                      <span className="text-xs font-bold">{colProjects.length}</span>
                    </div>
                    <div
                      className={`rounded-b-lg ${columnBg[col.status]} min-h-24 p-2 space-y-2`}
                    >
                      {colProjects.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-4">—</p>
                      ) : (
                        colProjects.map(p => {
                          const border =
                            p.isBlocked
                              ? 'border-2 border-red-400'
                              : 'border border-slate-200'

                          return (
                            <div
                              key={p.id}
                              className={`bg-white rounded-lg ${border} p-3 shadow-sm`}
                            >
                              {/* Hotel name */}
                              <p className="text-xs font-semibold text-slate-800 line-clamp-2 mb-1">
                                {p.hotelName}
                              </p>

                              {/* Product badge */}
                              <div className="flex flex-wrap gap-1 mb-2">
                                {p.product && (
                                  <span
                                    className={`text-xs font-medium px-1.5 py-0.5 rounded ${productBadgeClass(p.product)}`}
                                  >
                                    {p.product}
                                  </span>
                                )}
                              </div>

                              {/* Alert badges */}
                              {p.isBlocked && (
                                <span className="block text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded mb-1 font-medium">
                                  Bloqué
                                </span>
                              )}
                              {p.isOverdue && (
                                <span className="block text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded mb-1">
                                  Go-live dépassé
                                </span>
                              )}
                              {(p.riskLevel === 'high' || p.riskLevel === 'critical') && (
                                <span className="block text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded mb-1 font-medium">
                                  Risque élevé
                                </span>
                              )}

                              {/* Progress bar */}
                              <div className="mb-2">
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-xs text-slate-400">Avancement</span>
                                  <span className="text-xs text-slate-500 font-medium">
                                    {p.percentComplete}%
                                  </span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-1.5">
                                  <div
                                    className="bg-blue-500 h-1.5 rounded-full"
                                    style={{ width: `${Math.min(p.percentComplete, 100)}%` }}
                                  />
                                </div>
                              </div>

                              {/* Owner chip */}
                              <div className="flex items-center justify-between">
                                <span className="inline-flex items-center text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                                  {p.ownerShort}
                                </span>
                                {p.endDate && (
                                  <span className="text-xs text-slate-400">
                                    {formatISODate(p.endDate)}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Owner workload table */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-700">
                Charge de travail par propriétaire
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Propriétaire
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    En cours
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Bloqués
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Go-live ce mois
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Risque élevé
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ownerStats.map(s => (
                  <tr key={s.owner}>
                    <td className="px-4 py-3 font-medium text-slate-900">{s.owner}</td>
                    <td className="px-4 py-3 text-slate-700">{s.inProgress}</td>
                    <td className="px-4 py-3">
                      {s.blocked > 0 ? (
                        <span className="text-red-600 font-medium">{s.blocked}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{s.goLiveThisMonth}</td>
                    <td className="px-4 py-3">
                      {s.highRisk > 0 ? (
                        <span className="text-orange-600 font-medium">{s.highRisk}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
                {ownerStats.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-xs">
                      Aucun projet chargé.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
