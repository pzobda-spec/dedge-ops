'use client'

import { useState } from 'react'

export interface PeriodMetrics {
  label: string
  from: string
  to: string
  opened: number
  closed: number
  fcr: number
  avgFirstReplyHours: number | null
  avgResolutionHours: number | null
  topCategories: { name: string; count: number }[]
  otherCategoryCount: number
}

interface AnalyticsResult {
  primary: PeriodMetrics
  comparison: PeriodMetrics | null
}

// ─── Date helpers ──────────────────────────────────────────────────────────────

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10)
}

function fmtShortDate(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

const MONTH_NAMES = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc']

function prevWeekPreset() {
  const today = new Date()
  const dow = today.getDay() // 0=Sun
  const daysToThisMon = dow === 0 ? 6 : dow - 1
  const thisMon = new Date(today)
  thisMon.setDate(today.getDate() - daysToThisMon)
  const lastMon = new Date(thisMon)
  lastMon.setDate(thisMon.getDate() - 7)
  const lastFri = new Date(lastMon)
  lastFri.setDate(lastMon.getDate() + 4)
  const f = toDateStr(lastMon)
  const t = toDateStr(lastFri)
  return { from: f, to: t, label: `Sem. ${fmtShortDate(f)} – ${fmtShortDate(t)}`, compareFrom: '', compareTo: '', compareLabel: '' }
}

function prevMonthPreset() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() // 0-indexed current month
  const prevStart = new Date(y, m - 1, 1)
  const prevEnd = new Date(y, m, 0)
  const prev2Start = new Date(y, m - 2, 1)
  const prev2End = new Date(y, m - 1, 0)
  const mIdx = m - 1 < 0 ? 11 : m - 1
  const mY = m - 1 < 0 ? y - 1 : y
  const m2Idx = ((m - 2) % 12 + 12) % 12
  const m2Y = m - 2 < 0 ? y - 1 : y
  return {
    from: toDateStr(prevStart),
    to: toDateStr(prevEnd),
    label: `${MONTH_NAMES[mIdx]} ${mY}`,
    compareFrom: toDateStr(prev2Start),
    compareTo: toDateStr(prev2End),
    compareLabel: `${MONTH_NAMES[m2Idx]} ${m2Y}`,
  }
}

// ─── Formatters ────────────────────────────────────────────────────────────────

function fmtHours(h: number | null): string {
  if (h === null) return 'N/D'
  if (h < 1) return `${Math.round(h * 60)}m`
  if (h < 48) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}j`
}

function pct(current: number, prev: number) {
  if (prev === 0) return null
  return Math.round(((current - prev) / prev) * 100)
}

function fmtPct(p: number | null) {
  if (p === null) return '—'
  return p >= 0 ? `+${p}%` : `${p}%`
}

function fmtFCRDelta(current: number, prev: number) {
  const diff = current - prev
  if (diff === 0) return '—'
  return diff > 0 ? `+${diff} pp` : `${diff} pp`
}

function deltaColor(p: number | null, lowerIsBetter = false) {
  if (p === null || p === 0) return 'text-slate-400'
  const good = lowerIsBetter ? p < 0 : p > 0
  return good ? 'text-emerald-600' : 'text-red-500'
}

// ─── Metric card ───────────────────────────────────────────────────────────────

interface MetricCardProps {
  icon: string
  label: string
  value: string
  compValue?: string | null
  deltaStr?: string
  deltaPositive?: boolean | null
  subtitle?: string
}

function MetricCard({ icon, label, value, compValue, deltaStr, deltaPositive, subtitle }: MetricCardProps) {
  const colorClass =
    deltaStr && deltaStr !== '—'
      ? deltaPositive === true
        ? 'text-emerald-600'
        : deltaPositive === false
          ? 'text-red-500'
          : 'text-slate-400'
      : 'text-slate-400'

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-lg leading-none">{icon}</span>
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-3xl font-bold text-slate-900 tabular-nums leading-none">{value}</div>
      {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      {compValue != null && (
        <div className="flex items-baseline gap-2 text-xs mt-auto pt-1 border-t border-slate-100">
          <span className="text-slate-400">vs {compValue}</span>
          {deltaStr && deltaStr !== '—' && (
            <span className={`font-semibold ${colorClass}`}>{deltaStr}</span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Analytics Pane ────────────────────────────────────────────────────────────

type LoadState = 'idle' | 'loading' | 'loaded' | 'error'

export default function AnalyticsPane() {
  const week = prevWeekPreset()
  const allHands = prevMonthPreset()

  const [from, setFrom] = useState(week.from)
  const [to, setTo] = useState(week.to)
  const [label, setLabel] = useState(week.label)
  const [withComparison, setWithComparison] = useState(false)
  const [compareFrom, setCompareFrom] = useState('')
  const [compareTo, setCompareTo] = useState('')
  const [compareLabel, setCompareLabel] = useState('')

  const [state, setState] = useState<LoadState>('idle')
  const [result, setResult] = useState<AnalyticsResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  function applyPreset(preset: ReturnType<typeof prevWeekPreset>) {
    setFrom(preset.from)
    setTo(preset.to)
    setLabel(preset.label)
    if (preset.compareFrom) {
      setWithComparison(true)
      setCompareFrom(preset.compareFrom)
      setCompareTo(preset.compareTo)
      setCompareLabel(preset.compareLabel)
    } else {
      setWithComparison(false)
      setCompareFrom('')
      setCompareTo('')
      setCompareLabel('')
    }
  }

  async function handleFetch() {
    if (!from || !to) return
    setState('loading')
    setResult(null)
    try {
      const params = new URLSearchParams({ from, to, label })
      if (withComparison && compareFrom && compareTo) {
        params.set('compareFrom', compareFrom)
        params.set('compareTo', compareTo)
        params.set('compareLabel', compareLabel)
      }
      const res = await fetch(`/api/zoho/analytics?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setResult(data)
      setState('loaded')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Erreur inconnue')
      setState('error')
    }
  }

  const p = result?.primary
  const c = result?.comparison
  const otherTicketsHref = p
    ? `/tickets/analytics/other?${new URLSearchParams({ from: p.from.slice(0, 10), to: p.to.slice(0, 10), label: p.label })}`
    : ''

  return (
    <div className="p-6 max-w-5xl">

      {/* ── Presets ── */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Weekly */}
        <button
          onClick={() => applyPreset(week)}
          className={`text-left rounded-xl border-2 p-4 transition-all hover:shadow-md ${
            from === week.from && to === week.to
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-200 bg-white hover:border-slate-400'
          }`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span className="text-sm font-bold">Rapport hebdomadaire</span>
          </div>
          <p className={`text-xs ${from === week.from && to === week.to ? 'text-slate-300' : 'text-slate-500'}`}>
            {week.label} · Lun – Ven · sans comparaison
          </p>
        </button>

        {/* All Hands */}
        <button
          onClick={() => applyPreset(allHands)}
          className={`text-left rounded-xl border-2 p-4 transition-all hover:shadow-md ${
            from === allHands.from && to === allHands.to
              ? 'border-violet-700 bg-violet-700 text-white'
              : 'border-slate-200 bg-white hover:border-violet-400'
          }`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
            <span className="text-sm font-bold">All Hands mensuel</span>
          </div>
          <p className={`text-xs ${from === allHands.from && to === allHands.to ? 'text-violet-200' : 'text-slate-500'}`}>
            {allHands.label} vs {allHands.compareLabel} · comparaison MoM
          </p>
        </button>
      </div>

      {/* ── Controls ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Période personnalisée</p>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Du</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-1.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Au</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-1.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Label</label>
            <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="ex : Semaine 20"
              className="border border-slate-300 rounded-md px-3 py-1.5 text-sm text-slate-800 bg-white w-36 focus:outline-none focus:ring-2 focus:ring-slate-400" />
          </div>
        </div>

        {/* Comparison toggle */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-600">
            <div
              onClick={() => setWithComparison(v => !v)}
              className={`w-9 h-5 rounded-full transition-colors relative ${withComparison ? 'bg-slate-900' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${withComparison ? 'translate-x-4' : ''}`} />
            </div>
            Comparer avec une période
          </label>
        </div>

        {withComparison && (
          <div className="flex flex-wrap items-end gap-3 pl-1 pt-1 border-t border-slate-100">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Du</label>
              <input type="date" value={compareFrom} onChange={e => setCompareFrom(e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-1.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Au</label>
              <input type="date" value={compareTo} onChange={e => setCompareTo(e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-1.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Label</label>
              <input type="text" value={compareLabel} onChange={e => setCompareLabel(e.target.value)} placeholder="ex : avr 2025"
                className="border border-slate-300 rounded-md px-3 py-1.5 text-sm text-slate-800 bg-white w-36 focus:outline-none focus:ring-2 focus:ring-slate-400" />
            </div>
          </div>
        )}

        <div className="pt-1">
          <button
            onClick={handleFetch}
            disabled={!from || !to || state === 'loading'}
            className="flex items-center gap-2 px-5 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {state === 'loading' ? (
              <>
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Calcul en cours…
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
                Calculer
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {state === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 mb-6">
          Erreur : {errorMsg}
        </div>
      )}

      {/* ── Results ── */}
      {state === 'loaded' && p && (
        <div>
          {/* Period label */}
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-base font-bold text-slate-900">{p.label}</h2>
            {c && (
              <>
                <span className="text-slate-300">vs</span>
                <span className="text-sm text-slate-500">{c.label}</span>
              </>
            )}
          </div>

          {/* Metric cards */}
          <div className="grid grid-cols-5 gap-3 mb-6">
            <MetricCard
              icon="📥"
              label="Nouveaux"
              value={String(p.opened)}
              compValue={c ? String(c.opened) : null}
              deltaStr={c ? fmtPct(pct(p.opened, c.opened)) : undefined}
              deltaPositive={c ? (pct(p.opened, c.opened) ?? 0) >= 0 ? null : null : undefined}
              subtitle="tickets créés"
            />
            <MetricCard
              icon="✅"
              label="Fermés"
              value={String(p.closed)}
              compValue={c ? String(c.closed) : null}
              deltaStr={c ? fmtPct(pct(p.closed, c.closed)) : undefined}
              deltaPositive={c ? (pct(p.closed, c.closed) ?? 0) > 0 : undefined}
              subtitle="tickets résolus"
            />
            <MetricCard
              icon="🎯"
              label="FCR"
              value={`${p.fcr}%`}
              compValue={c ? `${c.fcr}%` : null}
              deltaStr={c ? fmtFCRDelta(p.fcr, c.fcr) : undefined}
              deltaPositive={c ? p.fcr > c.fcr : undefined}
              subtitle="1er contact résolu"
            />
            <MetricCard
              icon="⚡"
              label="1ère réponse"
              value={fmtHours(p.avgFirstReplyHours)}
              compValue={c ? fmtHours(c.avgFirstReplyHours) : null}
              deltaStr={c && p.avgFirstReplyHours !== null && c.avgFirstReplyHours !== null ? fmtPct(pct(p.avgFirstReplyHours, c.avgFirstReplyHours)) : undefined}
              deltaPositive={c && p.avgFirstReplyHours !== null && c.avgFirstReplyHours !== null ? p.avgFirstReplyHours < c.avgFirstReplyHours : undefined}
              subtitle="temps moyen"
            />
            <MetricCard
              icon="🕐"
              label="Résolution"
              value={fmtHours(p.avgResolutionHours)}
              compValue={c ? fmtHours(c.avgResolutionHours) : null}
              deltaStr={c && p.avgResolutionHours !== null && c.avgResolutionHours !== null ? fmtPct(pct(p.avgResolutionHours, c.avgResolutionHours)) : undefined}
              deltaPositive={c && p.avgResolutionHours !== null && c.avgResolutionHours !== null ? p.avgResolutionHours < c.avgResolutionHours : undefined}
              subtitle="temps moyen"
            />
          </div>

          {/* Top categories */}
          {p.topCategories.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              {/* Primary */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Top catégories · {p.label}
                  </p>
                  {p.otherCategoryCount > 0 && (
                    <a
                      href={otherTicketsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                    >
                      Corriger Autre/Other
                      <span className="rounded bg-white/15 px-1.5 py-0.5 tabular-nums">{p.otherCategoryCount}</span>
                    </a>
                  )}
                </div>
                <div className="space-y-2.5">
                  {p.topCategories.map(cat => {
                    const maxCount = p.topCategories[0]?.count || 1
                    return (
                      <div key={cat.name} className="flex items-center gap-3">
                        <span className="text-sm text-slate-700 w-32 truncate flex-shrink-0">{cat.name}</span>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-slate-700 rounded-full"
                            style={{ width: `${(cat.count / maxCount) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-slate-500 w-6 text-right flex-shrink-0">{cat.count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Comparison */}
              {c && c.topCategories.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                    Top catégories · {c.label}
                  </p>
                  <div className="space-y-2.5">
                    {c.topCategories.map(cat => {
                      const maxCount = c.topCategories[0]?.count || 1
                      return (
                        <div key={cat.name} className="flex items-center gap-3">
                          <span className="text-sm text-slate-700 w-32 truncate flex-shrink-0">{cat.name}</span>
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-violet-400 rounded-full"
                              style={{ width: `${(cat.count / maxCount) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-slate-500 w-6 text-right flex-shrink-0">{cat.count}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Idle hint ── */}
      {state === 'idle' && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 opacity-40">
            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
          <p className="text-sm">Sélectionne un preset ou une période, puis clique sur <strong>Calculer</strong></p>
        </div>
      )}
    </div>
  )
}
