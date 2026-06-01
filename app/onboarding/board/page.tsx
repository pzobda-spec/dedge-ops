'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { OnboardingProject, ProjectStatus } from '@/lib/zoho/projectsClient'
import { formatDate } from '@/lib/utils/dates'
import { IMPLEMENTATION_GROUP, isExcludedOnboardingOwner } from '@/lib/onboarding/constants'

const columns: { status: ProjectStatus; label: string }[] = [
  { status: 'not_started',    label: 'Non démarré' },
  { status: 'in_progress',    label: 'En cours' },
  { status: 'pending_client', label: 'En attente client' },
  { status: 'live',           label: 'Live' },
  { status: 'blocked',        label: 'Bloqué' },
  { status: 'other',          label: 'Autre' },
]

const STATUS_COLORS: Record<ProjectStatus, { header: string; bg: string }> = {
  not_started:    { header: 'bg-[#f7f7f7] text-[#696969]',   bg: 'bg-[#f7f7f7]' },
  in_progress:    { header: 'bg-[#d4e4f8] text-[#2b5bb7]',   bg: 'bg-[#eef4fc]' },
  pending_client: { header: 'bg-[#fbf1ca] text-[#84550e]',   bg: 'bg-[#fef8ea]' },
  live:           { header: 'bg-[#cff7dc] text-[#1c6437]',   bg: 'bg-[#edfff4]' },
  blocked:        { header: 'bg-[#fee3e2] text-[#b7221b]',   bg: 'bg-[#fff8f8]' },
  other:          { header: 'bg-[#f7f7f7] text-[#696969]',   bg: 'bg-[#f7f7f7]' },
}

const STATUS_BADGE: Record<ProjectStatus, string> = {
  not_started:    'bg-[#f7f7f7] text-[#696969]',
  in_progress:    'bg-[#d4e4f8] text-[#2b5bb7]',
  pending_client: 'bg-[#fbf1ca] text-[#84550e]',
  live:           'bg-[#cff7dc] text-[#1c6437]',
  blocked:        'bg-[#fee3e2] text-[#b7221b]',
  other:          'bg-[#f7f7f7] text-[#696969]',
}

const PRODUCT_CONFIG: Record<string, string> = {
  'LoungeUp':    'bg-[#d4e4f8] text-[#2b5bb7]',
  'Dmbook Pro':  'bg-[#e8dbfa] text-[#59319f]',
  'WhatsApp':    'bg-[#cff7dc] text-[#1c6437]',
  'Mobile Keys': 'bg-[#f7f7f7] text-[#696969]',
}

function productBadge(product: string): string {
  return PRODUCT_CONFIG[product] ?? 'bg-[#f7f7f7] text-[#696969]'
}

function formatISODate(iso: string | null): string {
  if (!iso) return '—'
  return formatDate(iso)
}

function resolveOwnerFilter(filter: string, availableOwners: string[]): string[] {
  if (filter === 'Tous') return availableOwners
  if (filter === 'Implémentation') return [...IMPLEMENTATION_GROUP]
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
    () => projects.filter(p => !isExcludedOnboardingOwner(p.ownerShort)),
    [projects],
  )

  const availableOwners = useMemo(
    () => [...new Set(baseProjects.map(p => p.ownerShort).filter(Boolean))].sort() as string[],
    [baseProjects],
  )

  const ownerPills = useMemo(
    () => ['Tous', 'Implémentation', ...new Set([...IMPLEMENTATION_GROUP, ...availableOwners])],
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
    <div style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'var(--bg-canvas)' }} className="min-h-screen">
      <div className="bg-white border-b border-[#e2e2e2] px-6 py-4">
        <h1 className="text-xl font-semibold text-[#1f1f1f]">Board</h1>
        {!loading && !error && (
          <p className="text-sm text-[#696969] mt-0.5">{baseProjects.length} projets · {new Set(baseProjects.map(p => p.hotelName)).size} comptes</p>
        )}
        {loading && <p className="text-sm text-[#696969] mt-0.5">Chargement…</p>}
        {error && <p className="text-sm text-[#b7221b] mt-0.5">{error}</p>}
      </div>

      {loading ? (
        <div className="p-12 text-center text-[#696969] text-sm">Chargement des projets…</div>
      ) : error ? (
        <div className="p-12 text-center text-[#b7221b] text-sm">{error}</div>
      ) : (
        <div className="p-6 space-y-4">
          {/* Owner filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {ownerPills.map(owner => (
              <button
                key={owner}
                onClick={() => setOwnerFilter(ownerFilter === owner && owner !== 'Tous' ? 'Tous' : owner)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  ownerFilter === owner
                    ? 'bg-[#59319f] text-white border-[#59319f]'
                    : owner === 'Implémentation'
                    ? 'border-[#c0a4f0] text-[#59319f] bg-[#f3eeff] hover:bg-[#e8dbfa]'
                    : 'border-[#e2e2e2] text-[#4a4a4a] hover:bg-[#f7f7f7]'
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
                const colors = STATUS_COLORS[col.status]
                return (
                  <div key={col.status} className="w-60 flex-shrink-0">
                    <div className={`rounded-t-lg px-3 py-2 flex items-center justify-between ${colors.header}`}>
                      <span className="text-xs font-semibold">{col.label}</span>
                      <span className="text-xs font-bold">{colProjects.length}</span>
                    </div>
                    <div className={`rounded-b-lg ${colors.bg} min-h-24 p-2 space-y-2`}>
                      {colProjects.length === 0 ? (
                        <p className="text-xs text-[#b0b0b0] text-center py-4">—</p>
                      ) : (
                        colProjects.map(p => {
                          const cardBorder = p.isBlocked
                            ? 'border-2 border-[#ed524e]'
                            : 'border border-[#e2e2e2]'
                          return (
                            <div
                              key={p.id}
                              className={`relative bg-white rounded-lg ${cardBorder} p-3 shadow-[0_4px_8px_rgba(0,0,0,0.10)] hover:shadow-[0_6px_12px_rgba(0,0,0,0.14)] hover:border-[#c0a4f0] transition-all`}
                            >
                              <Link
                                href={`/onboarding/${p.id}`}
                                className="absolute top-2 right-2 w-6 h-6 rounded-full border border-[#e2e2e2] text-[#696969] hover:text-[#59319f] hover:border-[#c0a4f0] hover:bg-[#f3eeff] inline-flex items-center justify-center text-xs font-bold transition-colors"
                                title="Voir le détail"
                                aria-label={`Voir le détail de ${p.hotelName}`}
                              >
                                i
                              </Link>
                              <a
                                href={p.projectUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block pr-7"
                              >
                                <p className="text-xs font-semibold text-[#1a1a1a] line-clamp-2 mb-1">{p.hotelName}</p>
                                <div className="flex flex-wrap gap-1 mb-2">
                                  {p.product && (
                                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${productBadge(p.product)}`}>
                                      {p.product}
                                    </span>
                                  )}
                                </div>
                                {p.isBlocked && (
                                  <span className="block text-xs bg-[#fee3e2] text-[#b7221b] px-1.5 py-0.5 rounded mb-1 font-medium">Bloqué</span>
                                )}
                                {p.isOverdue && (
                                  <span className="block text-xs bg-[#fbf1ca] text-[#84550e] px-1.5 py-0.5 rounded mb-1">Go-live dépassé</span>
                                )}
                                {(p.riskLevel === 'high' || p.riskLevel === 'critical') && (
                                  <span className="block text-xs bg-[#fbf1ca] text-[#84550e] px-1.5 py-0.5 rounded mb-1 font-medium">Risque élevé</span>
                                )}
                                <div className="mb-2">
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className="text-xs text-[#696969]">Avancement</span>
                                    <span className="text-xs text-[#4a4a4a] font-medium">{p.percentComplete}%</span>
                                  </div>
                                  <div className="w-full bg-[#e2e2e2] rounded-full h-1.5">
                                    <div className="bg-[#59319f] h-1.5 rounded-full" style={{ width: `${Math.min(p.percentComplete, 100)}%` }} />
                                  </div>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="inline-flex items-center text-xs bg-[#f3eeff] text-[#59319f] px-1.5 py-0.5 rounded-full">{p.ownerShort}</span>
                                  {p.endDate && <span className="text-xs text-[#696969]">{formatISODate(p.endDate)}</span>}
                                </div>
                              </a>
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
        </div>
      )}
    </div>
  )
}
