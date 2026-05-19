'use client'

import { useState, useEffect, useCallback } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PeriodStats {
  label: string
  opened: number
  closed: number
  fcr: number
  topSubjects: { name: string; count: number }[]
}

interface StatsData {
  current: PeriodStats
  yoy: PeriodStats
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMonthDisplay(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-')
  const date = new Date(parseInt(year), parseInt(month) - 1, 1)
  return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

function prevMonth(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-').map(Number)
  const d = new Date(year, month - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function nextMonth(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-').map(Number)
  const d = new Date(year, month, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function defaultMonth(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function delta(current: number, yoy: number): string {
  const diff = current - yoy
  if (diff === 0) return '='
  return (diff > 0 ? '+' : '') + diff
}

function deltaColor(current: number, yoy: number, lowerIsBetter = false): string {
  const diff = current - yoy
  if (diff === 0) return 'text-slate-500'
  const improved = lowerIsBetter ? diff < 0 : diff > 0
  return improved ? 'text-green-600' : 'text-red-500'
}

function buildReport(stats: StatsData, monthLabel: string): string {
  const { current, yoy } = stats
  const lines: string[] = [
    `📊 Rapport Support — ${monthLabel}`,
    '',
    `Tickets créés : ${current.opened} (${delta(current.opened, yoy.opened)} vs ${yoy.label})`,
    `Tickets fermés : ${current.closed} (${delta(current.closed, yoy.closed)} vs ${yoy.label})`,
    `FCR : ${current.fcr}% (${delta(current.fcr, yoy.fcr)}pts vs ${yoy.label})`,
  ]

  if (current.topSubjects.length > 0) {
    lines.push('', '🔝 Top 3 sujets')
    current.topSubjects.forEach((s, i) => {
      const yoySubject = yoy.topSubjects.find(y => y.name === s.name)
      const note = yoySubject ? ` (${delta(s.count, yoySubject.count)} vs N-1)` : ''
      lines.push(`${i + 1}. ${s.name} — ${s.count} tickets${note}`)
    })
  }

  if (yoy.topSubjects.length > 0) {
    lines.push('', `📅 Référence ${yoy.label}`)
    lines.push(`Créés : ${yoy.opened} · Fermés : ${yoy.closed} · FCR : ${yoy.fcr}%`)
    yoy.topSubjects.forEach((s, i) => {
      lines.push(`${i + 1}. ${s.name} — ${s.count}`)
    })
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  current,
  yoy,
  unit = '',
  lowerIsBetter = false,
}: {
  label: string
  current: number
  yoy: number
  unit?: string
  lowerIsBetter?: boolean
}) {
  const d = delta(current, yoy)
  const color = deltaColor(current, yoy, lowerIsBetter)
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-900">{current}{unit}</p>
      <p className={`text-xs mt-1 font-medium ${color}`}>
        {d}{unit} vs N-1
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReportingPage() {
  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth)
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const loadStats = useCallback(async (month: string) => {
    setLoading(true)
    setError(null)
    setStats(null)
    try {
      const res = await fetch(`/api/zoho/stats?month=${month}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setStats(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadStats(selectedMonth) }, [selectedMonth, loadStats])

  const maxSubjectCount = stats?.current.topSubjects[0]?.count || 1

  function handleCopy() {
    if (!stats) return
    navigator.clipboard.writeText(buildReport(stats, formatMonthDisplay(selectedMonth))).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const today = new Date()
  const maxMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  return (
    <div>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Reporting Support</h1>
          <p className="text-sm text-slate-500 mt-0.5">Données Zoho Desk · comparaison N-1</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedMonth(prevMonth(selectedMonth))}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
            title="Mois précédent"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <input
            type="month"
            value={selectedMonth}
            max={maxMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => setSelectedMonth(nextMonth(selectedMonth))}
            disabled={selectedMonth >= maxMonth}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors disabled:opacity-30"
            title="Mois suivant"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {loading && (
          <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
            <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            Chargement des statistiques…
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            Erreur : {error}
          </div>
        )}

        {!loading && !error && stats && (
          <>
            {/* Period header + copy */}
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800 capitalize">
                {formatMonthDisplay(selectedMonth)}
              </h2>
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {copied ? (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Copié !
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copier le rapport
                  </>
                )}
              </button>
            </div>

            {stats.current.opened === 0 ? (
              <div className="bg-white rounded-lg border border-slate-200 text-center py-12 text-slate-400 text-sm">
                Aucun ticket trouvé pour cette période.
              </div>
            ) : (
              <>
                {/* KPI cards */}
                <div className="grid grid-cols-3 gap-4">
                  <StatCard
                    label="Tickets créés"
                    current={stats.current.opened}
                    yoy={stats.yoy.opened}
                    lowerIsBetter
                  />
                  <StatCard
                    label="Tickets fermés"
                    current={stats.current.closed}
                    yoy={stats.yoy.closed}
                  />
                  <StatCard
                    label="FCR (1er contact)"
                    current={stats.current.fcr}
                    yoy={stats.yoy.fcr}
                    unit="%"
                  />
                </div>

                {/* Top subjects */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-white rounded-lg border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">
                      Top 3 sujets — {stats.current.label}
                    </h3>
                    {stats.current.topSubjects.length === 0 ? (
                      <p className="text-sm text-slate-400">Aucune donnée</p>
                    ) : (
                      <div className="space-y-3">
                        {stats.current.topSubjects.map((s, i) => {
                          const pct = Math.round((s.count / maxSubjectCount) * 100)
                          const yoySubj = stats.yoy.topSubjects.find(y => y.name === s.name)
                          return (
                            <div key={s.name}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm text-slate-700 truncate max-w-[180px]">
                                  {i + 1}. {s.name}
                                </span>
                                <div className="flex items-center gap-2 ml-2 shrink-0">
                                  <span className="text-sm font-semibold text-slate-900">{s.count}</span>
                                  {yoySubj && (
                                    <span className={`text-xs ${deltaColor(s.count, yoySubj.count, true)}`}>
                                      {delta(s.count, yoySubj.count)} vs N-1
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-1.5">
                                <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* YoY reference */}
                  <div className="bg-white rounded-lg border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">
                      Référence N-1 — {stats.yoy.label}
                    </h3>
                    <div className="space-y-3 mb-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Tickets créés</span>
                        <span className="font-medium text-slate-700">{stats.yoy.opened}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Tickets fermés</span>
                        <span className="font-medium text-slate-700">{stats.yoy.closed}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">FCR</span>
                        <span className="font-medium text-slate-700">{stats.yoy.fcr}%</span>
                      </div>
                    </div>
                    {stats.yoy.topSubjects.length > 0 && (
                      <div className="border-t border-slate-100 pt-3 space-y-1.5">
                        <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Top sujets N-1</p>
                        {stats.yoy.topSubjects.map((s, i) => (
                          <div key={s.name} className="flex items-center justify-between text-sm">
                            <span className="text-slate-600 truncate">{i + 1}. {s.name}</span>
                            <span className="text-slate-500 ml-2 shrink-0">{s.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* FCR note */}
                <p className="text-xs text-slate-400 italic">
                  FCR calculé sur les tickets fermés avec ≤ 2 échanges (message client + réponse agent).
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
