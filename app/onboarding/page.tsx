'use client'

import { useEffect, useMemo, useState } from 'react'
import type { OnboardingProject, ProjectStatus } from '@/lib/zoho/projectsClient'
import { formatDate } from '@/lib/utils/dates'

// ─── Constants ────────────────────────────────────────────────────────────────

const columns: { status: ProjectStatus; label: string }[] = [
  { status: 'not_started',    label: 'Non démarré' },
  { status: 'in_progress',    label: 'En cours' },
  { status: 'pending_client', label: 'En attente client' },
  { status: 'live',           label: 'Live' },
  { status: 'blocked',        label: 'Bloqué' },
  { status: 'other',          label: 'Autre' },
]

const CAPACITY_THRESHOLD = 50

const productColors: Record<string, string> = {
  'LoungeUp':    'bg-blue-100 text-blue-700',
  'Dmbook Pro':  'bg-purple-100 text-purple-700',
  'WhatsApp':    'bg-green-100 text-green-700',
  'Mobile Keys': 'bg-slate-200 text-slate-700',
}

const STATUS_COLORS: Record<ProjectStatus, { bg: string; text: string }> = {
  not_started:    { bg: 'bg-slate-100',   text: 'text-slate-600' },
  in_progress:    { bg: 'bg-blue-100',    text: 'text-blue-700' },
  pending_client: { bg: 'bg-yellow-100',  text: 'text-yellow-700' },
  live:           { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  blocked:        { bg: 'bg-red-100',     text: 'text-red-700' },
  other:          { bg: 'bg-slate-100',   text: 'text-slate-500' },
}

function productBadgeClass(p: string): string { return productColors[p] ?? 'bg-slate-100 text-slate-600' }

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

function fmtDays(d: number | null): string {
  if (d === null) return '—'
  if (d < 30) return `${d}j`
  return `${(d / 30.44).toFixed(1)} mois`
}

function chargeColor(pct: number): { text: string } {
  if (pct > 100) return { text: 'text-red-600' }
  if (pct >= 70)  return { text: 'text-orange-500' }
  return { text: 'text-emerald-600' }
}

// ─── Satisfaction types ────────────────────────────────────────────────────────

interface SatisfactionRow {
  zoho_id: string
  establishment: string
  respondent_name: string
  owner: string
  score_global: number
  score_onboarding: number
  score_simplicity: number
  score_tool: number
  score_training: number
  comment: string | null
  submitted_at: string
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

function scoreLabel(avg: number): string {
  if (avg >= 4.5) return 'text-emerald-600'
  if (avg >= 3.5) return 'text-orange-500'
  return 'text-red-500'
}

// ─── Satisfaction section ──────────────────────────────────────────────────────

function SatisfactionSection({
  data,
  syncing,
  onSync,
}: {
  data: SatisfactionRow[]
  syncing: boolean
  onSync: () => void
}) {
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 10

  const avg = (key: keyof SatisfactionRow) => {
    const vals = data.map(r => r[key] as number).filter(v => v > 0)
    if (vals.length === 0) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }

  const scores = [
    { label: 'Global',     key: 'score_global' as const },
    { label: 'Onboarding', key: 'score_onboarding' as const },
    { label: 'Simplicité', key: 'score_simplicity' as const },
    { label: 'Outil',      key: 'score_tool' as const },
    { label: 'Formation',  key: 'score_training' as const },
  ]

  const totalPages = Math.ceil(data.length / PAGE_SIZE)
  const pageRows = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-700">Satisfaction client</h2>
          {data.length > 0 && (
            <span className="text-xs text-slate-400">{data.length} réponse{data.length > 1 ? 's' : ''}</span>
          )}
        </div>
        <button
          onClick={onSync}
          disabled={syncing}
          className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          {syncing ? 'Synchronisation…' : 'Synchroniser'}
        </button>
      </div>

      {data.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-slate-400">
          Aucune donnée — cliquez sur Synchroniser pour importer les réponses Zoho Forms.
          <br />
          <span className="text-xs mt-1 block text-slate-300">Requiert le scope ZohoForms.form.READ sur le refresh token.</span>
        </div>
      ) : (
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-5 gap-3">
            {scores.map(({ label, key }) => {
              const a = avg(key)
              return (
                <div key={key} className="text-center bg-slate-50 rounded-lg p-4 border border-slate-100">
                  <p className={`text-3xl font-bold tabular-nums ${a !== null ? scoreLabel(a) : 'text-slate-400'}`}>
                    {a !== null ? a.toFixed(1) : '—'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 font-medium">{label}</p>
                </div>
              )
            })}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Établissement', 'Répondant', 'Owner', 'Global', 'Onboarding', 'Simplicité', 'Outil', 'Formation', 'Date'].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map(r => (
                  <tr key={r.zoho_id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-800 font-medium max-w-[140px] truncate">{r.establishment || '—'}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.respondent_name || '—'}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.owner || '—'}</td>
                    {[r.score_global, r.score_onboarding, r.score_simplicity, r.score_tool, r.score_training].map((s, i) => (
                      <td key={i} className={`px-3 py-2 font-semibold tabular-nums ${s > 0 ? scoreLabel(s) : 'text-slate-300'}`}>
                        {s > 0 ? s.toFixed(1) : '—'}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                      {r.submitted_at ? formatDate(r.submitted_at.slice(0, 10)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400">Page {page + 1} / {totalPages}</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="text-xs px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">‹ Préc.</button>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="text-xs px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Suiv. ›</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function OnboardingDashboardPage() {
  const [projects, setProjects] = useState<OnboardingProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [satisfaction, setSatisfaction] = useState<SatisfactionRow[]>([])
  const [satisfactionSyncing, setSatisfactionSyncing] = useState(false)

  useEffect(() => {
    fetch('/api/zoho/projects')
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
      .then((data: { projects: OnboardingProject[] }) => { setProjects(data.projects); setLoading(false) })
      .catch(err => { console.error(err); setError('Impossible de charger les projets.'); setLoading(false) })
  }, [])

  useEffect(() => {
    fetch('/api/onboarding/satisfaction')
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then(({ data }) => setSatisfaction(data ?? []))
      .catch(() => {/* silent */})
  }, [])

  async function handleSync() {
    setSatisfactionSyncing(true)
    try {
      const res = await fetch('/api/integrations/zoho/satisfaction-sync', { method: 'POST' })
      if (res.ok) {
        const refreshed = await fetch('/api/onboarding/satisfaction')
        if (refreshed.ok) { const { data } = await refreshed.json(); setSatisfaction(data ?? []) }
      }
    } finally {
      setSatisfactionSyncing(false)
    }
  }

  const today = new Date()
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const active = useMemo(() => projects.filter(p => p.status !== 'live' && p.status !== 'other'), [projects])
  const liveProjects = useMemo(() => projects.filter(p => p.status === 'live'), [projects])
  const uniqueAccounts = useMemo(() => new Set(projects.map(p => p.hotelName)).size, [projects])

  const ttvSamples = useMemo(
    () => liveProjects.filter(p => p.startDate && p.endDate).map(p => daysBetween(p.startDate!, p.endDate!)).filter(d => d > 0),
    [liveProjects],
  )
  const avgTtv = ttvSamples.length > 0 ? Math.round(ttvSamples.reduce((a, b) => a + b, 0) / ttvSamples.length) : null

  const goLiveThisMonth = useMemo(() => liveProjects.filter(p => p.endDate?.startsWith(thisMonth)).length, [liveProjects, thisMonth])
  const blocked = useMemo(() => projects.filter(p => p.status === 'blocked').length, [projects])

  const perPerson = useMemo(() => {
    const map = new Map<string, OnboardingProject[]>()
    for (const p of projects) {
      const key = p.ownerShort || p.ownerName || '—'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return Array.from(map.entries()).map(([owner, ps]) => {
      const activeCount = ps.filter(p => p.status !== 'live' && p.status !== 'other').length
      const liveCount = ps.filter(p => p.status === 'live').length
      const accounts = new Set(ps.map(p => p.hotelName)).size
      const ttv = ps.filter(p => p.status === 'live' && p.startDate && p.endDate).map(p => daysBetween(p.startDate!, p.endDate!)).filter(d => d > 0)
      const avgOwnerTtv = ttv.length > 0 ? Math.round(ttv.reduce((a, b) => a + b, 0) / ttv.length) : null
      const chargePct = Math.round((activeCount / CAPACITY_THRESHOLD) * 100)
      return { owner, total: ps.length, active: activeCount, live: liveCount, accounts, avgTtv: avgOwnerTtv, chargePct }
    }).sort((a, b) => b.active - a.active)
  }, [projects])

  const perProduct = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of projects) { const k = p.product || 'Autre'; map[k] = (map[k] ?? 0) + 1 }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [projects])

  const perStatus = useMemo(() => {
    const map: Partial<Record<ProjectStatus, number>> = {}
    for (const p of projects) map[p.status] = (map[p.status] ?? 0) + 1
    return columns.map(col => ({ status: col.status, label: col.label, count: map[col.status] ?? 0 }))
  }, [projects])

  const typologie = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of projects) { const t = p.clientType ?? 'Non renseigné'; map[t] = (map[t] ?? 0) + 1 }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [projects])

  const hasTypologie = projects.some(p => p.clientType)
  const maxProduct = perProduct[0]?.[1] ?? 1
  const maxTypologie = typologie[0]?.[1] ?? 1

  return (
    <div>
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        {loading ? (
          <p className="text-sm text-slate-400 mt-0.5">Chargement…</p>
        ) : error ? (
          <p className="text-sm text-red-500 mt-0.5">{error}</p>
        ) : (
          <p className="text-sm text-slate-500 mt-0.5">{projects.length} projets · {uniqueAccounts} comptes</p>
        )}
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Chargement des projets…</div>
      ) : error ? (
        <div className="p-12 text-center text-red-500 text-sm">{error}</div>
      ) : (
        <div className="p-6 space-y-6 max-w-5xl">
          {/* KPIs */}
          <div className="grid grid-cols-5 gap-3">
            <KpiCard label="Projets actifs"  value={active.length}       sub="hors live et autre" />
            <KpiCard label="Comptes uniques" value={uniqueAccounts}      sub="hôtels distincts" />
            <KpiCard label="TTV moyen"       value={fmtDays(avgTtv)}     sub={`sur ${ttvSamples.length} projets live`} />
            <KpiCard label="Go-live ce mois" value={goLiveThisMonth}     sub={`sur ${liveProjects.length} live total`} accent="text-emerald-600" />
            <KpiCard label="Bloqués"         value={blocked}             accent={blocked > 0 ? 'text-red-600' : undefined} />
          </div>

          {/* Per person */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-700">Par chargé de projet</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Personne', 'Total', 'Actifs', 'Live', 'Comptes', 'TTV moyen', 'Charge'].map((h, i) => (
                    <th key={h} className={`py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide ${i === 0 ? 'text-left px-5' : 'text-center px-4'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {perPerson.map(row => {
                  const c = chargeColor(row.chargePct)
                  return (
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
                      <td className="px-4 py-3 text-center">
                        <span className={`text-sm font-bold tabular-nums ${c.text}`}>{row.chargePct}%</span>
                        {row.chargePct > 100 && <span className="ml-1.5 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">Surcharge</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom grid */}
          <div className="grid grid-cols-3 gap-4">
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
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Typologie</p>
              {!hasTypologie ? (
                <p className="text-xs text-slate-400">Champ &quot;Type&quot; non trouvé dans Zoho Projects.<br />Vérifie le nom du champ personnalisé.</p>
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

          {/* Satisfaction */}
          <SatisfactionSection data={satisfaction} syncing={satisfactionSyncing} onSync={handleSync} />
        </div>
      )}
    </div>
  )
}
