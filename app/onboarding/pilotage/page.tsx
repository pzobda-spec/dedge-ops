'use client'

import { useEffect, useMemo, useState } from 'react'
import type { OnboardingProject, ProjectStatus } from '@/lib/zoho/projectsClient'
import { formatDate } from '@/lib/utils/dates'
import { IMPLEMENTATION_GROUP, isExcludedOnboardingOwner } from '@/lib/onboarding/constants'

// ─── Constants ────────────────────────────────────────────────────────────────

const CAPACITY_THRESHOLD = 50

const columns: { status: ProjectStatus; label: string }[] = [
  { status: 'not_started',    label: 'Non démarré' },
  { status: 'in_progress',    label: 'En cours' },
  { status: 'pending_client', label: 'En attente client' },
  { status: 'live',           label: 'Live' },
  { status: 'blocked',        label: 'Bloqué' },
  { status: 'other',          label: 'Autre' },
]

const STATUS_COLORS: Record<ProjectStatus, { bg: string; text: string }> = {
  not_started:    { bg: 'bg-[#f7f7f7]', text: 'text-[#696969]' },
  in_progress:    { bg: 'bg-[#d4e4f8]', text: 'text-[#2b5bb7]' },
  pending_client: { bg: 'bg-[#fbf1ca]', text: 'text-[#84550e]' },
  live:           { bg: 'bg-[#cff7dc]', text: 'text-[#1c6437]' },
  blocked:        { bg: 'bg-[#fee3e2]', text: 'text-[#b7221b]' },
  other:          { bg: 'bg-[#f7f7f7]', text: 'text-[#696969]' },
}

const PRODUCT_CONFIG: Record<string, { bg: string; text: string }> = {
  'LoungeUp':    { bg: 'bg-[#d4e4f8]', text: 'text-[#2b5bb7]' },
  'Dmbook Pro':  { bg: 'bg-[#e8dbfa]', text: 'text-[#59319f]' },
  'WhatsApp':    { bg: 'bg-[#cff7dc]', text: 'text-[#1c6437]' },
  'Mobile Keys': { bg: 'bg-[#f7f7f7]', text: 'text-[#696969]' },
}

function productBadgeClass(p: string): string {
  const c = PRODUCT_CONFIG[p]
  return c ? `${c.bg} ${c.text}` : 'bg-[#f7f7f7] text-[#696969]'
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

function fmtDays(d: number | null): string {
  if (d === null) return '—'
  if (d < 30) return `${d}j`
  return `${(d / 30.44).toFixed(1)} mois`
}

function chargeBarColor(pct: number): string {
  if (pct > 100) return 'bg-[#ed524e]'
  if (pct >= 70)  return 'bg-[#f7d878]'
  return 'bg-[#5ec281]'
}

function chargeTextColor(pct: number): string {
  if (pct > 100) return 'text-[#b7221b]'
  if (pct >= 70)  return 'text-[#84550e]'
  return 'text-[#1c6437]'
}

function resolveOwnerFilter(filter: string, availableOwners: string[]): string[] {
  if (filter === 'Tous') return availableOwners
  if (filter === 'Implémentation') return [...IMPLEMENTATION_GROUP]
  return [filter]
}

// ─── Date filter ──────────────────────────────────────────────────────────────

type DatePreset = 'all' | 'prev_month' | 'curr_month' | 'curr_quarter' | 'custom'

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'all',          label: 'Tous' },
  { value: 'prev_month',   label: 'Mois précédent' },
  { value: 'curr_month',   label: 'Mois en cours' },
  { value: 'curr_quarter', label: 'Trimestre en cours' },
  { value: 'custom',       label: 'Personnalisé' },
]

function computeDateRange(preset: DatePreset, customFrom: string, customTo: string): { from: string; to: string } | null {
  if (preset === 'all') return null
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth()
  const isoDate = (year: number, month: number, day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const lastDayOf = (year: number, month: number) => new Date(year, month + 1, 0).getDate()
  if (preset === 'curr_month') return { from: isoDate(y, m, 1), to: isoDate(y, m, lastDayOf(y, m)) }
  if (preset === 'prev_month') {
    const pm = m === 0 ? 11 : m - 1
    const py = m === 0 ? y - 1 : y
    return { from: isoDate(py, pm, 1), to: isoDate(py, pm, lastDayOf(py, pm)) }
  }
  if (preset === 'curr_quarter') {
    const qStart = Math.floor(m / 3) * 3
    const qEnd = qStart + 2
    return { from: isoDate(y, qStart, 1), to: isoDate(y, qEnd, lastDayOf(y, qEnd)) }
  }
  if (preset === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo }
  return null
}

function filterByDateRange(ps: OnboardingProject[], range: { from: string; to: string } | null): OnboardingProject[] {
  if (!range) return ps
  return ps.filter(p => {
    const start = p.startDate ?? ''
    const end = p.endDate ?? ''
    return (!start || start <= range.to) && (!end || end >= range.from)
  })
}

function fmtDateRange(range: { from: string; to: string }): string {
  const fmt = (iso: string) => iso.split('-').reverse().join('/')
  return `${fmt(range.from)} → ${fmt(range.to)}`
}

// ─── Satisfaction ──────────────────────────────────────────────────────────────

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

function scoreTextColor(avg: number): string {
  if (avg >= 4.5) return 'text-[#1c6437]'
  if (avg >= 3.5) return 'text-[#903b07]'
  return 'text-[#b7221b]'
}

function SatisfactionSection({
  data,
  filterLabel,
  syncing,
  onSync,
}: {
  data: SatisfactionRow[]
  filterLabel: string
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
  const countLabel = filterLabel !== 'Tous'
    ? `${data.length} réponse${data.length > 1 ? 's' : ''} — ${filterLabel}`
    : `${data.length} réponse${data.length > 1 ? 's' : ''}`

  return (
    <div className="bg-white rounded-[4px] border border-[#e2e2e2] shadow-[0_4px_8px_rgba(0,0,0,0.10)] overflow-hidden">
      <div className="px-5 py-3 border-b border-[#e2e2e2] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-[#1f1f1f]">Satisfaction client</h2>
          {data.length > 0 && <span className="text-xs text-[#696969]">{countLabel}</span>}
        </div>
        <button
          onClick={onSync}
          disabled={syncing}
          className="text-xs px-3 py-1.5 rounded-[4px] border border-[#e2e2e2] text-[#4a4a4a] hover:bg-[#f7f7f7] disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3b72d1] focus-visible:ring-offset-1"
        >
          {syncing ? 'Synchronisation…' : 'Synchroniser'}
        </button>
      </div>

      {data.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-[#696969]">
          Aucune donnée — cliquez sur Synchroniser pour importer les réponses Zoho Forms.
        </div>
      ) : (
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-5 gap-3">
            {scores.map(({ label, key }) => {
              const a = avg(key)
              return (
                <div key={key} className="text-center bg-[#f7f7f7] rounded-[4px] p-4 border border-[#e2e2e2]">
                  <p className={`text-2xl font-bold tabular-nums ${a !== null ? scoreTextColor(a) : 'text-[#878787]'}`}>
                    {a !== null ? a.toFixed(1) : '—'}
                  </p>
                  <p className="text-xs text-[#696969] mt-1 font-medium">{label}</p>
                </div>
              )
            })}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#f7f7f7] border-b border-[#e2e2e2]">
                <tr>
                  {['Établissement', 'Répondant', 'Owner', 'Global', 'Onboarding', 'Simplicité', 'Outil', 'Formation', 'Date'].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold text-[#696969] uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e2e2]">
                {pageRows.map(r => (
                  <tr key={r.zoho_id} className="hover:bg-[#faf9f5]">
                    <td className="px-3 py-2 text-[#1f1f1f] font-medium max-w-[140px] truncate">{r.establishment || '—'}</td>
                    <td className="px-3 py-2 text-[#4a4a4a] whitespace-nowrap">{r.respondent_name || '—'}</td>
                    <td className="px-3 py-2 text-[#4a4a4a] whitespace-nowrap">{r.owner || '—'}</td>
                    {[r.score_global, r.score_onboarding, r.score_simplicity, r.score_tool, r.score_training].map((s, i) => (
                      <td key={i} className={`px-3 py-2 font-semibold tabular-nums ${s > 0 ? scoreTextColor(s) : 'text-[#878787]'}`}>
                        {s > 0 ? s.toFixed(1) : '—'}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-[#696969] whitespace-nowrap">
                      {r.submitted_at ? formatDate(r.submitted_at.slice(0, 10)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-[#696969]">Page {page + 1} / {totalPages}</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="text-xs px-2 py-1 rounded-[4px] border border-[#e2e2e2] disabled:opacity-40 hover:bg-[#f7f7f7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3b72d1]">‹ Préc.</button>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="text-xs px-2 py-1 rounded-[4px] border border-[#e2e2e2] disabled:opacity-40 hover:bg-[#f7f7f7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3b72d1]">Suiv. ›</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-[4px] border border-[#e2e2e2] shadow-[0_4px_8px_rgba(0,0,0,0.10)] p-5">
      <p className="text-xs font-semibold text-[#696969] uppercase tracking-wide mb-2">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${accent ?? 'text-[#1f1f1f]'}`}>{value}</p>
      {sub && <p className="text-xs text-[#696969] mt-1">{sub}</p>}
    </div>
  )
}

// ─── Mini bar ─────────────────────────────────────────────────────────────────

function MiniBar({ value, max, color = 'bg-[#59319f]' }: { value: number; max: number; color?: string }) {
  return (
    <div className="flex-1 h-2 bg-[#e2e2e2] rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full`} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function OnboardingPilotagePage() {
  const [projects, setProjects] = useState<OnboardingProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [satisfaction, setSatisfaction] = useState<SatisfactionRow[]>([])
  const [satisfactionSyncing, setSatisfactionSyncing] = useState(false)

  const [activeOwner, setActiveOwner] = useState<string>('Tous')
  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

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

  const baseProjects = useMemo(
    () => projects.filter(p => !isExcludedOnboardingOwner(p.ownerShort)),
    [projects],
  )

  const availableOwners = useMemo(
    () => [...new Set(baseProjects.map(p => p.ownerShort).filter((o): o is string => Boolean(o)))].sort(),
    [baseProjects],
  )

  const dateRange = useMemo(
    () => computeDateRange(datePreset, customFrom, customTo),
    [datePreset, customFrom, customTo],
  )

  const dateFilteredProjects = useMemo(
    () => filterByDateRange(baseProjects, dateRange),
    [baseProjects, dateRange],
  )

  const filteredProjects = useMemo(() => {
    if (activeOwner === 'Tous') return dateFilteredProjects
    const resolved = resolveOwnerFilter(activeOwner, availableOwners)
    return dateFilteredProjects.filter(p => resolved.includes(p.ownerShort ?? ''))
  }, [dateFilteredProjects, activeOwner, availableOwners])

  const filteredSatisfaction = useMemo(() => {
    if (activeOwner === 'Tous') return satisfaction
    const resolved = resolveOwnerFilter(activeOwner, availableOwners)
    return satisfaction.filter(r => resolved.includes(r.owner))
  }, [satisfaction, activeOwner, availableOwners])

  const active = useMemo(() => filteredProjects.filter(p => p.status !== 'live' && p.status !== 'other'), [filteredProjects])
  const liveProjects = useMemo(() => filteredProjects.filter(p => p.status === 'live'), [filteredProjects])
  const uniqueAccounts = useMemo(() => new Set(filteredProjects.map(p => p.hotelName)).size, [filteredProjects])

  const ttvSamples = useMemo(
    () => liveProjects.filter(p => p.startDate && p.endDate).map(p => daysBetween(p.startDate!, p.endDate!)).filter(d => d > 0),
    [liveProjects],
  )
  const avgTtv = ttvSamples.length > 0 ? Math.round(ttvSamples.reduce((a, b) => a + b, 0) / ttvSamples.length) : null
  const goLiveThisMonth = useMemo(() => liveProjects.filter(p => p.endDate?.startsWith(thisMonth)).length, [liveProjects, thisMonth])
  const blocked = useMemo(() => filteredProjects.filter(p => p.status === 'blocked').length, [filteredProjects])

  const perPerson = useMemo(() => {
    const now = new Date()
    const map = new Map<string, OnboardingProject[]>()
    for (const p of filteredProjects) {
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
      const blockedCount = ps.filter(p => p.isBlocked).length
      const glThisMonth = ps.filter(p => {
        if (!p.endDate) return false
        const d = new Date(p.endDate)
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      }).length
      const highRisk = ps.filter(p => p.riskLevel === 'high' || p.riskLevel === 'critical').length
      return { owner, total: ps.length, active: activeCount, live: liveCount, accounts, avgTtv: avgOwnerTtv, chargePct, blockedCount, glThisMonth, highRisk }
    }).sort((a, b) => b.active - a.active)
  }, [filteredProjects])

  const perProduct = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of filteredProjects) { const k = p.product || 'Autre'; map[k] = (map[k] ?? 0) + 1 }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [filteredProjects])

  const perStatus = useMemo(() => {
    const map: Partial<Record<ProjectStatus, number>> = {}
    for (const p of filteredProjects) map[p.status] = (map[p.status] ?? 0) + 1
    return columns.map(col => ({ status: col.status, label: col.label, count: map[col.status] ?? 0 }))
  }, [filteredProjects])

  const typologieMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of filteredProjects) { const t = p.clientType ?? 'Non renseigné'; map[t] = (map[t] ?? 0) + 1 }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [filteredProjects])

  const hasTypologie = filteredProjects.some(p => p.clientType)
  const maxProduct = perProduct[0]?.[1] ?? 1
  const maxTypologie = typologieMap[0]?.[1] ?? 1
  const overloaded = perPerson.filter(r => r.chargePct > 100).length

  const ownerPills = useMemo(
    () => ['Tous', 'Implémentation', ...new Set([...IMPLEMENTATION_GROUP, ...availableOwners])],
    [availableOwners],
  )

  const isFiltered = activeOwner !== 'Tous' || datePreset !== 'all'
  const filterSummaryParts: string[] = []
  if (activeOwner !== 'Tous') filterSummaryParts.push(activeOwner)
  if (datePreset !== 'all') {
    if (datePreset === 'custom' && dateRange) filterSummaryParts.push(fmtDateRange(dateRange))
    else filterSummaryParts.push(DATE_PRESETS.find(p => p.value === datePreset)?.label ?? '')
  }

  return (
    <div style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'var(--bg-canvas)' }} className="min-h-screen">
      <div className="bg-white border-b border-[#e2e2e2] px-6 py-4">
        <h1 className="text-xl font-semibold text-[#1f1f1f]">Pilotage</h1>
        {loading ? (
          <p className="text-sm text-[#696969] mt-0.5">Chargement…</p>
        ) : error ? (
          <p className="text-sm text-[#b7221b] mt-0.5">{error}</p>
        ) : (
          <p className="text-sm text-[#696969] mt-0.5">
            {baseProjects.length} projets · {new Set(baseProjects.map(p => p.hotelName)).size} comptes
            {overloaded > 0 && <span className="ml-2 text-[#b7221b] font-medium">{overloaded} onboarder{overloaded > 1 ? 's' : ''} en surcharge</span>}
          </p>
        )}
      </div>

      {loading ? (
        <div className="p-12 text-center text-sm text-[#696969]">Chargement des projets…</div>
      ) : error ? (
        <div className="p-12 text-center text-sm text-[#b7221b]">{error}</div>
      ) : (
        <div className="p-6 space-y-5 max-w-6xl">

          {/* Owner filter */}
          <div className="flex items-center gap-2 flex-wrap">
            {ownerPills.map(owner => (
              <button
                key={owner}
                onClick={() => setActiveOwner(activeOwner === owner && owner !== 'Tous' ? 'Tous' : owner)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3b72d1] focus-visible:ring-offset-1 ${
                  activeOwner === owner
                    ? 'bg-[#59319f] text-white border-[#59319f]'
                    : owner === 'Implémentation'
                    ? 'border-[#8c5bdb] text-[#59319f] bg-[#f7f5fa] hover:bg-[#e8dbfa]'
                    : 'border-[#e2e2e2] text-[#696969] hover:bg-[#f7f5fa]'
                }`}
              >
                {owner}
              </button>
            ))}
          </div>

          {/* Date filter */}
          <div className="flex items-center gap-2 flex-wrap">
            {DATE_PRESETS.map(preset => (
              <button
                key={preset.value}
                onClick={() => setDatePreset(preset.value)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3b72d1] focus-visible:ring-offset-1 ${
                  datePreset === preset.value
                    ? 'bg-[#59319f] text-white border-[#59319f]'
                    : 'border-[#e2e2e2] text-[#696969] hover:bg-[#f7f5fa]'
                }`}
              >
                {preset.label}
              </button>
            ))}
            {datePreset === 'custom' && (
              <div className="flex items-center gap-1.5 ml-1">
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  className="text-xs border border-[#e2e2e2] rounded-[4px] px-2 py-1 text-[#1f1f1f] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3b72d1]" />
                <span className="text-xs text-[#696969]">→</span>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  className="text-xs border border-[#e2e2e2] rounded-[4px] px-2 py-1 text-[#1f1f1f] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3b72d1]" />
              </div>
            )}
          </div>

          {/* KPIs */}
          <div>
            <div className="grid grid-cols-5 gap-3">
              <KpiCard label="Projets actifs"  value={active.length}     sub="hors live et autre" />
              <KpiCard label="Comptes uniques" value={uniqueAccounts}    sub="hôtels distincts" />
              <KpiCard label="TTV moyen"       value={fmtDays(avgTtv)}   sub={`sur ${ttvSamples.length} projets live`} />
              <KpiCard label="Go-live ce mois" value={goLiveThisMonth}   sub={`sur ${liveProjects.length} live total`} accent="text-[#1c6437]" />
              <KpiCard label="Bloqués"         value={blocked}           accent={blocked > 0 ? 'text-[#b7221b]' : undefined} />
            </div>
            {isFiltered && (
              <div className="mt-2 flex items-center gap-2 text-xs text-[#696969]">
                <span>Affichage filtré : <span className="font-medium text-[#4a4a4a]">{filterSummaryParts.join(' · ')}</span></span>
                <button
                  onClick={() => { setActiveOwner('Tous'); setDatePreset('all'); setCustomFrom(''); setCustomTo('') }}
                  className="text-[#696969] hover:text-[#1f1f1f] transition-colors"
                >
                  × Réinitialiser
                </button>
              </div>
            )}
          </div>

          {/* Per person table */}
          <div className="bg-white rounded-[4px] border border-[#e2e2e2] shadow-[0_4px_8px_rgba(0,0,0,0.10)] overflow-hidden">
            <div className="px-5 py-3 border-b border-[#e2e2e2]">
              <h2 className="text-sm font-semibold text-[#1f1f1f]">Par chargé de projet</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-[#f7f7f7] border-b border-[#e2e2e2]">
                <tr>
                  {['Personne', 'Total', 'Actifs', 'Live', 'Comptes', 'TTV moyen', 'Charge'].map((h, i) => (
                    <th key={h} className={`py-2.5 text-xs font-semibold text-[#696969] uppercase tracking-wide ${i === 0 ? 'text-left px-5' : 'text-center px-4'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e2e2]">
                {perPerson.map(row => (
                  <tr key={row.owner} className="hover:bg-[#faf9f5]">
                    <td className="px-5 py-3 font-medium text-[#1f1f1f]">{row.owner}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-[#4a4a4a]">{row.total}</td>
                    <td className="px-4 py-3 text-center tabular-nums">
                      <span className={row.active > 0 ? 'font-semibold text-[#2b5bb7]' : 'text-[#878787]'}>{row.active}</span>
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums">
                      <span className={row.live > 0 ? 'font-semibold text-[#1c6437]' : 'text-[#878787]'}>{row.live}</span>
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-[#4a4a4a]">{row.accounts}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-[#4a4a4a]">{fmtDays(row.avgTtv)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-sm font-bold tabular-nums ${chargeTextColor(row.chargePct)}`}>{row.chargePct}%</span>
                      {row.chargePct > 100 && <span className="ml-1.5 text-xs bg-[#fee3e2] text-[#b7221b] px-1.5 py-0.5 rounded-full font-medium">Surcharge</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Charge bars */}
          <div className="bg-white rounded-[4px] border border-[#e2e2e2] shadow-[0_4px_8px_rgba(0,0,0,0.10)] p-5 space-y-4">
            <p className="text-xs font-semibold text-[#696969] uppercase tracking-wide">
              Taux de charge — seuil : {CAPACITY_THRESHOLD} projets actifs = 100%
            </p>
            {perPerson.map(({ owner, active: activeCount, chargePct }) => (
              <div key={owner} className="flex items-center gap-3">
                <span className="text-sm font-medium text-[#4a4a4a] w-28 flex-shrink-0">{owner}</span>
                <div className="flex-1 h-3 bg-[#e2e2e2] rounded-full overflow-hidden">
                  <div
                    className={`h-full ${chargeBarColor(chargePct)} rounded-full transition-all`}
                    style={{ width: `${Math.min(chargePct, 100)}%` }}
                  />
                </div>
                <span className="text-xs text-[#696969] tabular-nums w-32 flex-shrink-0">{activeCount} projets actifs</span>
                <span className={`text-sm font-bold tabular-nums w-12 text-right flex-shrink-0 ${chargeTextColor(chargePct)}`}>{chargePct}%</span>
                {chargePct > 100 && (
                  <span className="text-xs bg-[#fee3e2] text-[#b7221b] px-2 py-0.5 rounded-full font-medium flex-shrink-0">Surcharge</span>
                )}
              </div>
            ))}
          </div>

          {/* Bottom breakdowns */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-[4px] border border-[#e2e2e2] shadow-[0_4px_8px_rgba(0,0,0,0.10)] p-5">
              <p className="text-xs font-semibold text-[#696969] uppercase tracking-wide mb-4">Par statut</p>
              <div className="space-y-2.5">
                {perStatus.map(({ status, label, count }) => {
                  const c = STATUS_COLORS[status]
                  return (
                    <div key={status} className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.bg} ${c.text} truncate`}>{label}</span>
                      <span className="text-sm font-bold tabular-nums text-[#1f1f1f] flex-shrink-0">{count}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="bg-white rounded-[4px] border border-[#e2e2e2] shadow-[0_4px_8px_rgba(0,0,0,0.10)] p-5">
              <p className="text-xs font-semibold text-[#696969] uppercase tracking-wide mb-4">Par produit</p>
              <div className="space-y-2.5">
                {perProduct.map(([product, count]) => (
                  <div key={product} className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${productBadgeClass(product)}`}>{product}</span>
                    <MiniBar value={count} max={maxProduct} />
                    <span className="text-sm tabular-nums text-[#4a4a4a] w-5 text-right flex-shrink-0">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-[4px] border border-[#e2e2e2] shadow-[0_4px_8px_rgba(0,0,0,0.10)] p-5">
              <p className="text-xs font-semibold text-[#696969] uppercase tracking-wide mb-4">Typologie</p>
              {!hasTypologie ? (
                <p className="text-xs text-[#696969]">Champ &quot;Type&quot; non trouvé dans Zoho Projects.</p>
              ) : (
                <div className="space-y-2.5">
                  {typologieMap.map(([type, count]) => (
                    <div key={type} className="flex items-center gap-3">
                      <span className="text-sm text-[#4a4a4a] flex-shrink-0 w-28 truncate">{type}</span>
                      <MiniBar value={count} max={maxTypologie} color="bg-[#8c5bdb]" />
                      <span className="text-sm tabular-nums text-[#4a4a4a] w-5 text-right flex-shrink-0">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Satisfaction */}
          <SatisfactionSection
            data={filteredSatisfaction}
            filterLabel={activeOwner}
            syncing={satisfactionSyncing}
            onSync={handleSync}
          />
        </div>
      )}
    </div>
  )
}
