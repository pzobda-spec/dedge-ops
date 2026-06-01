'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { OnboardingProject, ProjectStatus, RiskLevel } from '@/lib/zoho/projectsClient'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { IMPLEMENTATION_GROUP, isExcludedOnboardingOwner } from '@/lib/onboarding/constants'
import { formatDate } from '@/lib/utils/dates'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ProjectStatus, { bg: string; text: string }> = {
  not_started:    { bg: 'bg-[#f7f7f7]', text: 'text-[#696969]' },
  in_progress:    { bg: 'bg-[#d4e4f8]', text: 'text-[#2b5bb7]' },
  pending_client: { bg: 'bg-[#fbf1ca]', text: 'text-[#84550e]' },
  live:           { bg: 'bg-[#cff7dc]', text: 'text-[#1c6437]' },
  blocked:        { bg: 'bg-[#fee3e2]', text: 'text-[#b7221b]' },
  other:          { bg: 'bg-[#f7f7f7]', text: 'text-[#696969]' },
}

const STATUS_LABELS: Record<ProjectStatus, string> = {
  not_started:    'Non démarré',
  in_progress:    'En cours',
  pending_client: 'En attente client',
  live:           'Live',
  blocked:        'Bloqué',
  other:          'Autre',
}

const PRODUCT_CONFIG: Record<string, { bg: string; text: string }> = {
  'LoungeUp':    { bg: 'bg-[#d4e4f8]', text: 'text-[#2b5bb7]' },
  'Dmbook Pro':  { bg: 'bg-[#e8dbfa]', text: 'text-[#59319f]' },
  'WhatsApp':    { bg: 'bg-[#cff7dc]', text: 'text-[#1c6437]' },
  'Mobile Keys': { bg: 'bg-[#f7f7f7]', text: 'text-[#696969]' },
}

function productBadge(p: string): string {
  const c = PRODUCT_CONFIG[p]
  return c ? `${c.bg} ${c.text}` : 'bg-[#f7f7f7] text-[#696969]'
}

function sortScore(p: OnboardingProject): number {
  if (p.isBlocked)                return 0
  if (p.riskLevel === 'critical') return 1
  if (p.riskLevel === 'high')     return 2
  if (p.isOverdue)                return 3
  if (p.riskLevel === 'medium')   return 4
  if (p.status === 'pending_client') return 5
  if (p.status === 'in_progress') return 6
  if (p.status === 'not_started') return 7
  if (p.status === 'live')        return 8
  return 9
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function MesProjetsPage() {
  const router = useRouter()
  const { user, loading: userLoading } = useCurrentUser()
  const [projects, setProjects] = useState<OnboardingProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pill, setPill] = useState<string>('mine')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/zoho/projects')
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
      .then((data: { projects: OnboardingProject[] }) => { setProjects(data.projects); setLoading(false) })
      .catch(err => { console.error(err); setError('Impossible de charger les projets.'); setLoading(false) })
  }, [])

  const base = useMemo(
    () => projects.filter(p => !isExcludedOnboardingOwner(p.ownerShort)),
    [projects],
  )

  const owners = useMemo(
    () => [...new Set([...IMPLEMENTATION_GROUP, ...base.map(p => p.ownerShort).filter((o): o is string => Boolean(o))])].sort(),
    [base],
  )

  const filtered = useMemo(() => {
    let result = base
    if (pill === 'mine') {
      if (user?.email) result = base.filter(p => p.ownerEmail?.toLowerCase() === user.email.toLowerCase())
      else if (!userLoading) result = []
    } else if (pill === 'impl') {
      result = base.filter(p => (IMPLEMENTATION_GROUP as readonly string[]).includes(p.ownerShort ?? ''))
    } else if (pill !== 'all') {
      result = base.filter(p => p.ownerShort === pill)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(p => p.hotelName.toLowerCase().includes(q))
    }
    return [...result].sort((a, b) => sortScore(a) - sortScore(b))
  }, [base, pill, user, userLoading, search])

  const pills = useMemo(() => [
    { key: 'mine', label: 'Mes projets' },
    { key: 'all',  label: 'Tous' },
    { key: 'impl', label: 'Implémentation' },
    ...owners.map(o => ({ key: o, label: o })),
  ], [owners])

  return (
    <div style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'var(--bg-canvas)' }} className="min-h-screen">
      <div className="bg-white border-b border-[#e2e2e2] px-6 py-4">
        <h1 className="text-xl font-semibold text-[#1f1f1f]">Mes projets</h1>
        {loading ? (
          <p className="text-sm text-[#696969] mt-0.5">Chargement…</p>
        ) : error ? (
          <p className="text-sm text-[#b7221b] mt-0.5">{error}</p>
        ) : (
          <p className="text-sm text-[#696969] mt-0.5">{base.length} projets · {new Set(base.map(p => p.hotelName)).size} comptes</p>
        )}
      </div>

      {loading ? (
        <div className="p-12 text-center text-[#696969] text-sm">Chargement des projets…</div>
      ) : error ? (
        <div className="p-12 text-center text-[#b7221b] text-sm">{error}</div>
      ) : (
        <div className="p-6 space-y-4 max-w-6xl">

          {/* Pills + search */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {pills.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setPill(key)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    pill === key
                      ? 'bg-[#59319f] text-white border-[#59319f]'
                      : key === 'impl'
                      ? 'border-[#c0a4f0] text-[#59319f] bg-[#f3eeff] hover:bg-[#e8dbfa]'
                      : 'border-[#e2e2e2] text-[#4a4a4a] hover:bg-[#f7f7f7]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              type="search"
              placeholder="Rechercher un hôtel…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="ml-auto text-xs border border-[#e2e2e2] rounded-lg px-3 py-1.5 text-[#1a1a1a] placeholder:text-[#b0b0b0] focus:outline-none focus:ring-1 focus:ring-[#59319f] bg-white w-52"
            />
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#e2e2e2] px-6 py-16 text-center text-sm text-[#696969]">
              {pill === 'mine' && !userLoading
                ? "Vous n'avez aucun projet en cours."
                : 'Aucun projet trouvé.'}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-[#e2e2e2] shadow-[0_4px_8px_rgba(0,0,0,0.06)] overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#f7f7f7] border-b border-[#e2e2e2]">
                  <tr>
                    {['Hôtel', 'Produit', 'Statut', 'Progression', 'Go-live cible'].map((h, i) => (
                      <th
                        key={h}
                        className={`py-2.5 text-xs font-semibold text-[#696969] uppercase tracking-wide ${i === 0 ? 'text-left px-5' : 'text-left px-4'}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f0f0]">
                  {filtered.map(p => (
                    <tr
                      key={p.id}
                      onClick={() => router.push(`/onboarding/${p.id}`)}
                      className="hover:bg-[#f7f4fd] cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {p.isBlocked && <span className="w-1.5 h-1.5 rounded-full bg-[#ed524e] flex-shrink-0" />}
                          <span className="font-medium text-[#1a1a1a] truncate max-w-[220px]">{p.hotelName}</span>
                        </div>
                        <p className="text-xs text-[#696969] mt-0.5 pl-3.5">{p.ownerShort}</p>
                      </td>
                      <td className="px-4 py-3">
                        {p.product ? (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${productBadge(p.product)}`}>{p.product}</span>
                        ) : (
                          <span className="text-[#b0b0b0] text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_COLORS[p.status].bg} ${STATUS_COLORS[p.status].text}`}>
                            {STATUS_LABELS[p.status]}
                          </span>
                          {p.isOverdue && (
                            <span className="text-xs bg-[#fee3e2] text-[#b7221b] px-1.5 py-0.5 rounded">Dépassé</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 w-44">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-[#e2e2e2] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#59319f]"
                              style={{ width: `${Math.min(p.percentComplete, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-[#696969] tabular-nums w-8 text-right">{p.percentComplete}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#696969] whitespace-nowrap">
                        {p.endDate ? formatDate(p.endDate) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
