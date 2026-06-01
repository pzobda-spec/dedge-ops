'use client'

import { useState, useEffect, useCallback } from 'react'

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
  if (diff === 0) return 'text-[#696969]'
  const improved = lowerIsBetter ? diff < 0 : diff > 0
  return improved ? 'text-[#1c6437]' : 'text-[#b7221b]'
}

function buildReport(stats: StatsData, monthLabel: string): string {
  const { current, yoy } = stats
  const lines: string[] = [
    `Rapport Support — ${monthLabel}`,
    '',
    `Tickets créés : ${current.opened} (${delta(current.opened, yoy.opened)} vs ${yoy.label})`,
    `Tickets fermés : ${current.closed} (${delta(current.closed, yoy.closed)} vs ${yoy.label})`,
    `FCR : ${current.fcr}% (${delta(current.fcr, yoy.fcr)}pts vs ${yoy.label})`,
  ]

  if (current.topSubjects.length > 0) {
    lines.push('', 'Top 3 sujets')
    current.topSubjects.forEach((s, i) => {
      const yoySubject = yoy.topSubjects.find(y => y.name === s.name)
      const note = yoySubject ? ` (${delta(s.count, yoySubject.count)} vs N-1)` : ''
      lines.push(`${i + 1}. ${s.name} — ${s.count} tickets${note}`)
    })
  }

  if (yoy.topSubjects.length > 0) {
    lines.push('', `Référence ${yoy.label}`)
    lines.push(`Créés : ${yoy.opened} · Fermés : ${yoy.closed} · FCR : ${yoy.fcr}%`)
    yoy.topSubjects.forEach((s, i) => { lines.push(`${i + 1}. ${s.name} — ${s.count}`) })
  }

  return lines.join('\n')
}

function StatCard({
  label, current, yoy, unit = '', lowerIsBetter = false,
}: {
  label: string; current: number; yoy: number; unit?: string; lowerIsBetter?: boolean
}) {
  const d = delta(current, yoy)
  const color = deltaColor(current, yoy, lowerIsBetter)
  return (
    <div className="bg-white rounded-xl border border-[#e2e2e2] shadow-[0_4px_8px_rgba(0,0,0,0.06)] p-4">
      <p className="text-xs text-[#696969] uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-[#1a1a1a]">{current}{unit}</p>
      <p className={`text-xs mt-1 font-medium tabular-nums ${color}`}>
        {d}{unit} vs N-1
      </p>
    </div>
  )
}

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

  const navBtnCls = 'p-1.5 rounded-lg hover:bg-[#f7f7f7] text-[#696969] transition-colors disabled:opacity-30'

  return (
    <div style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'var(--bg-canvas)' }} className="min-h-screen">
      <div className="bg-white border-b border-[#e2e2e2] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a1a]">Reporting support</h1>
          <p className="text-sm text-[#696969] mt-0.5">Données Zoho Desk · comparaison N-1</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSelectedMonth(prevMonth(selectedMonth))} className={navBtnCls} title="Mois précédent">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <input
            type="month"
            value={selectedMonth}
            max={maxMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="text-sm border border-[#e2e2e2] rounded-lg px-3 py-1.5 text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#3b72d1]"
          />
          <button onClick={() => setSelectedMonth(nextMonth(selectedMonth))} disabled={selectedMonth >= maxMonth} className={navBtnCls} title="Mois suivant">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {loading && (
          <div className="flex items-center gap-2 py-12 text-sm text-[#696969]">
            <div className="w-4 h-4 border-2 border-[#e2e2e2] border-t-[#59319f] rounded-full animate-spin" />
            Chargement des statistiques…
          </div>
        )}

        {!loading && error && (
          <div className="bg-[#fee3e2] border border-[#fca5a5] rounded-lg px-4 py-3 text-sm text-[#b7221b]">
            Erreur : {error}
          </div>
        )}

        {!loading && !error && stats && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#1a1a1a] capitalize">
                {formatMonthDisplay(selectedMonth)}
              </h2>
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#59319f] hover:bg-[#3f2175] text-white text-sm font-medium rounded-lg transition-colors"
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
              <div className="bg-white rounded-xl border border-[#e2e2e2] text-center py-12 text-[#696969] text-sm">
                Aucun ticket trouvé pour cette période.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <StatCard label="Tickets créés"   current={stats.current.opened} yoy={stats.yoy.opened} lowerIsBetter />
                  <StatCard label="Tickets fermés"  current={stats.current.closed} yoy={stats.yoy.closed} />
                  <StatCard label="FCR (1er contact)" current={stats.current.fcr} yoy={stats.yoy.fcr} unit="%" />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl border border-[#e2e2e2] shadow-[0_4px_8px_rgba(0,0,0,0.06)] p-4">
                    <h3 className="text-sm font-semibold text-[#4a4a4a] mb-4">
                      Top 3 sujets — {stats.current.label}
                    </h3>
                    {stats.current.topSubjects.length === 0 ? (
                      <p className="text-sm text-[#696969]">Aucune donnée</p>
                    ) : (
                      <div className="space-y-3">
                        {stats.current.topSubjects.map((s, i) => {
                          const pct = Math.round((s.count / maxSubjectCount) * 100)
                          const yoySubj = stats.yoy.topSubjects.find(y => y.name === s.name)
                          return (
                            <div key={s.name}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm text-[#4a4a4a] truncate max-w-[180px]">
                                  {i + 1}. {s.name}
                                </span>
                                <div className="flex items-center gap-2 ml-2 shrink-0">
                                  <span className="text-sm font-semibold tabular-nums text-[#1a1a1a]">{s.count}</span>
                                  {yoySubj && (
                                    <span className={`text-xs tabular-nums ${deltaColor(s.count, yoySubj.count, true)}`}>
                                      {delta(s.count, yoySubj.count)} vs N-1
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="w-full bg-[#e2e2e2] rounded-full h-1.5">
                                <div className="bg-[#59319f] h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-xl border border-[#e2e2e2] shadow-[0_4px_8px_rgba(0,0,0,0.06)] p-4">
                    <h3 className="text-sm font-semibold text-[#4a4a4a] mb-4">
                      Référence N-1 — {stats.yoy.label}
                    </h3>
                    <div className="space-y-3 mb-4">
                      {[
                        { label: 'Tickets créés', val: stats.yoy.opened },
                        { label: 'Tickets fermés', val: stats.yoy.closed },
                        { label: 'FCR', val: `${stats.yoy.fcr}%` },
                      ].map(({ label, val }) => (
                        <div key={label} className="flex items-center justify-between text-sm">
                          <span className="text-[#696969]">{label}</span>
                          <span className="font-medium text-[#4a4a4a] tabular-nums">{val}</span>
                        </div>
                      ))}
                    </div>
                    {stats.yoy.topSubjects.length > 0 && (
                      <div className="border-t border-[#e2e2e2] pt-3 space-y-1.5">
                        <p className="text-xs text-[#696969] uppercase tracking-wide mb-2">Top sujets N-1</p>
                        {stats.yoy.topSubjects.map((s, i) => (
                          <div key={s.name} className="flex items-center justify-between text-sm">
                            <span className="text-[#4a4a4a] truncate">{i + 1}. {s.name}</span>
                            <span className="text-[#696969] ml-2 shrink-0 tabular-nums">{s.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-xs text-[#696969] italic">
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
