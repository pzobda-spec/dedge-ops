'use client'

import { useEffect, useMemo, useState } from 'react'
import type { OnboardingProject, ProjectStatus } from '@/lib/zoho/projectsClient'
import { formatDate } from '@/lib/utils/dates'

// ─── Column definitions ────────────────────────────────────────────────────────

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

// ─── Dashboard helpers ─────────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

function fmtDays(d: number | null): string {
  if (d === null) return '—'
  if (d < 30) return `${d}j`
  return `${(d / 30.44).toFixed(1)} mois`
}

const STATUS_LABELS: Record<ProjectStatus, string> = {
  not_started:    'Non démarré',
  in_progress:    'En cours',
  pending_client: 'En attente client',
  live:           'Live',
  blocked:        'Bloqué',
  other:          'Autre',
}

const STATUS_COLORS: Record<ProjectStatus, { bg: string; text: string }> = {
  not_started:    { bg: 'bg-slate-100',   text: 'text-slate-600' },
  in_progress:    { bg: 'bg-blue-100',    text: 'text-blue-700' },
  pending_client: { bg: 'bg-yellow-100',  text: 'text-yellow-700' },
  live:           { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  blocked:        { bg: 'bg-red-100',     text: 'text-red-700' },
  other:          { bg: 'bg-slate-100',   text: 'text-slate-500' },
}

// ─── Small components ──────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${accent ?? 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

function MiniBar({ value, max, color = 'bg-slate-600' }: { value: number; max: number; color?: string }) {
  return (
    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full`} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
    </div>
  )
}

// ─── Dashboard view ────────────────────────────────────────────────────────────

function OnboardingDashboard({ projects }: { projects: OnboardingProject[] }) {
  const today = new Date()
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const active = useMemo(
    () => projects.filter(p => p.status !== 'live' && p.status !== 'other'),
    [projects],
  )

  const liveProjects = useMemo(() => projects.filter(p => p.status === 'live'), [projects])

  const uniqueAccounts = useMemo(
    () => new Set(projects.map(p => p.hotelName)).size,
    [projects],
  )

  // TTV: days from startDate to endDate for live projects
  const ttvSamples = useMemo(
    () =>
      liveProjects
        .filter(p => p.startDate && p.endDate)
        .map(p => daysBetween(p.startDate!, p.endDate!))
        .filter(d => d > 0),
    [liveProjects],
  )
  const avgTtv = ttvSamples.length > 0
    ? Math.round(ttvSamples.reduce((a, b) => a + b, 0) / ttvSamples.length)
    : null

  const goLiveThisMonth = useMemo(
    () => liveProjects.filter(p => p.endDate?.startsWith(thisMonth)).length,
    [liveProjects, thisMonth],
  )

  const blocked = useMemo(() => projects.filter(p => p.status === 'blocked').length, [projects])

  // ── Par personne ──
  const perPerson = useMemo(() => {
    const map = new Map<string, { projects: OnboardingProject[] }>()
    for (const p of projects) {
      const key = p.ownerShort || p.ownerName || '—'
      if (!map.has(key)) map.set(key, { projects: [] })
      map.get(key)!.projects.push(p)
    }
    return Array.from(map.entries())
      .map(([owner, { projects: ps }]) => {
        const activeCount = ps.filter(p => p.status !== 'live' && p.status !== 'other').length
        const liveCount = ps.filter(p => p.status === 'live').length
        const accounts = new Set(ps.map(p => p.hotelName)).size
        const ttv = ps
          .filter(p => p.status === 'live' && p.startDate && p.endDate)
          .map(p => daysBetween(p.startDate!, p.endDate!))
          .filter(d => d > 0)
        const avgOwnerTtv = ttv.length > 0
          ? Math.round(ttv.reduce((a, b) => a + b, 0) / ttv.length)
          : null
        return { owner, total: ps.length, active: activeCount, live: liveCount, accounts, avgTtv: avgOwnerTtv }
      })
      .sort((a, b) => b.active - a.active)
  }, [projects])

  // ── Par produit ──
  const perProduct = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of projects) {
      const key = p.product || 'Autre'
      map[key] = (map[key] ?? 0) + 1
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [projects])

  // ── Par statut ──
  const perStatus = useMemo(() => {
    const map: Partial<Record<ProjectStatus, number>> = {}
    for (const p of projects) map[p.status] = (map[p.status] ?? 0) + 1
    return columns.map(col => ({ status: col.status, label: col.label, count: map[col.status] ?? 0 }))
  }, [projects])

  // ── Typologie ──
  const typologie = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of projects) {
      const t = p.clientType ?? 'Non renseigné'
      map[t] = (map[t] ?? 0) + 1
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [projects])

  const hasTypologie = projects.some(p => p.clientType)

  const maxProduct = perProduct[0]?.[1] ?? 1
  const maxTypologie = typologie[0]?.[1] ?? 1

  return (
    <div className="p-6 space-y-6 max-w-5xl">

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-5 gap-3">
        <KpiCard label="Projets actifs"     value={active.length}          sub="hors live et autre" />
        <KpiCard label="Comptes uniques"    value={uniqueAccounts}         sub="hôtels distincts" />
        <KpiCard label="TTV moyen"          value={fmtDays(avgTtv)}        sub={`sur ${ttvSamples.length} projets live`} />
        <KpiCard label="Go-live ce mois"    value={goLiveThisMonth}        sub={`sur ${liveProjects.length} live total`} accent="text-emerald-600" />
        <KpiCard label="Bloqués"            value={blocked}                accent={blocked > 0 ? 'text-red-600' : undefined} />
      </div>

      {/* ── Par personne ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-700">Par chargé de projet</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Personne</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actifs</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Live</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Comptes</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">TTV moyen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {perPerson.map(row => (
              <tr key={row.owner} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-900">{row.owner}</td>
                <td className="px-4 py-3 text-center text-slate-600 tabular-nums">{row.total}</td>
                <td className="px-4 py-3 text-center tabular-nums">
                  <span className={row.active > 0 ? 'font-semibold text-blue-700' : 'text-slate-400'}>{row.active}</span>
                </td>
                <td className="px-4 py-3 text-center tabular-nums">
                  <span className={row.live > 0 ? 'font-semibold text-emerald-600' : 'text-slate-400'}>{row.live}</span>
                </td>
                <td className="px-4 py-3 text-center text-slate-600 tabular-nums">{row.accounts}</td>
                <td className="px-4 py-3 text-center text-slate-600 tabular-nums">{fmtDays(row.avgTtv)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Bottom grid ── */}
      <div className="grid grid-cols-3 gap-4">

        {/* Statut */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Par statut</p>
          <div className="space-y-2.5">
            {perStatus.map(({ status, label, count }) => {
              const c = STATUS_COLORS[status]
              return (
                <div key={status} className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${c.bg} ${c.text} truncate`}>{label}</span>
                  <span className="text-sm font-bold tabular-nums text-slate-700 flex-shrink-0">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Produit */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Par produit</p>
          <div className="space-y-2.5">
            {perProduct.map(([product, count]) => (
              <div key={product} className="flex items-center gap-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded flex-shrink-0 ${productBadgeClass(product)}`}>{product}</span>
                <MiniBar value={count} max={maxProduct} color="bg-blue-500" />
                <span className="text-sm tabular-nums text-slate-600 w-5 text-right flex-shrink-0">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Typologie */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Typologie</p>
          {!hasTypologie ? (
            <p className="text-xs text-slate-400">
              Champ &quot;Type&quot; non trouvé dans Zoho Projects.
              <br />Vérifie le nom du champ personnalisé.
            </p>
          ) : (
            <div className="space-y-2.5">
              {typologie.map(([type, count]) => (
                <div key={type} className="flex items-center gap-3">
                  <span className="text-sm text-slate-700 flex-shrink-0 w-28 truncate">{type}</span>
                  <MiniBar value={count} max={maxTypologie} color="bg-violet-400" />
                  <span className="text-sm tabular-nums text-slate-600 w-5 text-right flex-shrink-0">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const [projects, setProjects] = useState<OnboardingProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'board' | 'dashboard'>('dashboard')
  const [ownerFilter, setOwnerFilter] = useState<string>('')

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

  const owners = useMemo(
    () => [...new Set(projects.map(p => p.ownerShort).filter(Boolean))].sort(),
    [projects],
  )

  // Board owner workload
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
        return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()
      }).length
      const highRisk = ownerProjects.filter(p => p.riskLevel === 'high' || p.riskLevel === 'critical').length
      return { owner, inProgress, blocked, goLiveThisMonth, highRisk }
    })

  return (
    <div>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Onboarding</h1>
          {loading ? (
            <p className="text-sm text-slate-400 mt-0.5">Chargement…</p>
          ) : error ? (
            <p className="text-sm text-red-500 mt-0.5">{error}</p>
          ) : (
            <p className="text-sm text-slate-500 mt-0.5">{projects.length} projets · {new Set(projects.map(p => p.hotelName)).size} comptes</p>
          )}
        </div>
        <div className="flex rounded-md border border-slate-200 overflow-hidden">
          <button
            onClick={() => setView('dashboard')}
            className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${view === 'dashboard' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
            Dashboard
          </button>
          <button
            onClick={() => setView('board')}
            className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors border-l border-slate-200 ${view === 'board' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="18"/><rect x="14" y="3" width="7" height="18"/>
            </svg>
            Board
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Chargement des projets…</div>
      ) : error ? (
        <div className="p-12 text-center text-red-500 text-sm">{error}</div>
      ) : (
        <>
          {/* ── Dashboard ── */}
          {view === 'dashboard' && <OnboardingDashboard projects={projects} />}

          {/* ── Board ── */}
          {view === 'board' && (
            <div className="p-6 space-y-6">
              {/* Owner filter */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setOwnerFilter('')}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${ownerFilter === '' ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                >
                  Tous
                </button>
                {owners.map(owner => (
                  <button
                    key={owner}
                    onClick={() => setOwnerFilter(ownerFilter === owner ? '' : owner)}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${ownerFilter === owner ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                  >
                    {owner}
                  </button>
                ))}
              </div>
              <div className="overflow-x-auto">
                <div className="flex gap-4 min-w-max">
                  {columns.map(col => {
                    const colProjects = projects.filter(p =>
                      p.status === col.status &&
                      (ownerFilter === '' || p.ownerShort === ownerFilter)
                    )
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

              {/* Owner workload */}
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200">
                  <h2 className="text-sm font-semibold text-slate-700">Charge de travail par propriétaire</h2>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Propriétaire</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">En cours</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Bloqués</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Go-live ce mois</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Risque élevé</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ownerStats.map(s => (
                      <tr key={s.owner}>
                        <td className="px-4 py-3 font-medium text-slate-900">{s.owner}</td>
                        <td className="px-4 py-3 text-slate-700">{s.inProgress}</td>
                        <td className="px-4 py-3">{s.blocked > 0 ? <span className="text-red-600 font-medium">{s.blocked}</span> : <span className="text-slate-400">0</span>}</td>
                        <td className="px-4 py-3 text-slate-700">{s.goLiveThisMonth}</td>
                        <td className="px-4 py-3">{s.highRisk > 0 ? <span className="text-orange-600 font-medium">{s.highRisk}</span> : <span className="text-slate-400">0</span>}</td>
                      </tr>
                    ))}
                    {ownerStats.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-xs">Aucun projet chargé.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
