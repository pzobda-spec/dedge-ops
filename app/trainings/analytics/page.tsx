'use client'

import { useState, useCallback, useEffect } from 'react'
import Badge from '@/components/ui/Badge'
import type { AcuitySession } from '@/lib/acuity/client'

function formatMonth(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-')
  const date = new Date(parseInt(year), parseInt(month) - 1, 1)
  return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

function monthDateRange(yyyyMM: string): { minDate: string; maxDate: string } {
  const [year, month] = yyyyMM.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  const mm = String(month).padStart(2, '0')
  return {
    minDate: `${year}-${mm}-01`,
    maxDate: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  }
}

interface AnalyticsData {
  totalSessions: number
  scheduledSessions: number
  totalRegistered: number
  totalCancelled: number
  cancellationRate: number
  totalUniqueHotels: number
  topFormations: { name: string; inscrits: number; sessions: number }[]
  topHotels: { name: string; sessions: number }[]
  byLanguage: Record<string, number>
}

function computeAnalytics(sessions: AcuitySession[]): AnalyticsData {
  const totalSessions = sessions.length
  const scheduledSessions = sessions.filter(s => s.status === 'scheduled').length
  const totalRegistered = sessions.reduce((s, t) => s + t.totalRegistered, 0)
  const totalCancelled = sessions.reduce((s, t) => s + t.totalCancelled, 0)
  const cancellationRate =
    totalRegistered + totalCancelled > 0
      ? Math.round((totalCancelled / (totalRegistered + totalCancelled)) * 100)
      : 0

  const allHotels = new Set<string>()
  sessions.forEach(s => s.uniqueHotels.forEach(h => allHotels.add(h)))

  const formationMap: Record<string, { inscrits: number; sessions: number }> = {}
  for (const s of sessions) {
    if (!formationMap[s.theme]) formationMap[s.theme] = { inscrits: 0, sessions: 0 }
    formationMap[s.theme].inscrits += s.totalRegistered
    formationMap[s.theme].sessions += 1
  }
  const topFormations = Object.entries(formationMap)
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.inscrits - a.inscrits)
    .slice(0, 5)

  const hotelSessionCount: Record<string, number> = {}
  for (const s of sessions) {
    for (const hotel of s.uniqueHotels) {
      hotelSessionCount[hotel] = (hotelSessionCount[hotel] || 0) + 1
    }
  }
  const topHotels = Object.entries(hotelSessionCount)
    .map(([name, sessions]) => ({ name, sessions }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 10)

  const byLanguage: Record<string, number> = {}
  for (const s of sessions) {
    byLanguage[s.language] = (byLanguage[s.language] || 0) + 1
  }

  return {
    totalSessions,
    scheduledSessions,
    totalRegistered,
    totalCancelled,
    cancellationRate,
    totalUniqueHotels: allHotels.size,
    topFormations,
    topHotels,
    byLanguage,
  }
}

function buildReport(analytics: AnalyticsData, monthLabel: string): string {
  const lines: string[] = [
    `📊 Rapport Formations — ${monthLabel}`,
    '',
    `Sessions : ${analytics.totalSessions} (dont ${analytics.scheduledSessions} programmées à venir)`,
    `Inscrits : ${analytics.totalRegistered}`,
    `Annulations : ${analytics.totalCancelled} (${analytics.cancellationRate}%)`,
    `Hôtels formés : ${analytics.totalUniqueHotels}`,
  ]

  if (analytics.topFormations.length > 0) {
    lines.push('', '🏆 Top formations')
    analytics.topFormations.forEach((f, i) => {
      lines.push(`${i + 1}. ${f.name} — ${f.inscrits} inscrits`)
    })
  }

  if (analytics.topHotels.length > 0) {
    lines.push('', '🏨 Top hôtels')
    analytics.topHotels.slice(0, 5).forEach((h, i) => {
      lines.push(`${i + 1}. ${h.name} — ${h.sessions} session${h.sessions > 1 ? 's' : ''}`)
    })
  }

  return lines.join('\n')
}

export default function TrainingsAnalyticsPage() {
  const [analyticsMonth, setAnalyticsMonth] = useState<string>(
    () => new Date().toISOString().slice(0, 7)
  )
  const [analyticsSessions, setAnalyticsSessions] = useState<AcuitySession[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const loadAnalytics = useCallback(async (month: string) => {
    setLoading(true)
    setError(null)
    try {
      const { minDate, maxDate } = monthDateRange(month)
      const res = await fetch(`/api/acuity/sessions?minDate=${minDate}&maxDate=${maxDate}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(body.error ?? res.statusText)
      }
      const data = await res.json()
      setAnalyticsSessions(data.sessions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAnalytics(analyticsMonth)
  }, [analyticsMonth, loadAnalytics])

  const analytics = computeAnalytics(analyticsSessions)

  function handleCopy() {
    const text = buildReport(analytics, formatMonth(analyticsMonth))
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div>
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Analytiques Formations</h1>
          <p className="text-sm text-slate-500 mt-0.5 capitalize">{formatMonth(analyticsMonth)}</p>
        </div>
        <input
          type="month"
          value={analyticsMonth}
          onChange={e => setAnalyticsMonth(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="p-6 space-y-6">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="text-slate-500 text-sm">Chargement des données…</div>
          </div>
        )}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            Erreur : {error}
          </div>
        )}
        {!loading && !error && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800 capitalize">
                {formatMonth(analyticsMonth)}
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

            {analyticsSessions.length === 0 ? (
              <div className="bg-white rounded-lg border border-slate-200 text-center py-12 text-slate-400 text-sm">
                Aucune session trouvée pour ce mois.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  <div className="bg-white rounded-lg border border-slate-200 p-4">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Sessions</p>
                    <p className="text-2xl font-bold text-slate-900">{analytics.totalSessions}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 p-4">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Programmées</p>
                    <p className="text-2xl font-bold text-blue-600">{analytics.scheduledSessions}</p>
                    <p className="text-xs text-slate-400 mt-0.5">à venir</p>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 p-4">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Inscrits</p>
                    <p className="text-2xl font-bold text-slate-900">{analytics.totalRegistered}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 p-4">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Taux annulation</p>
                    <p className="text-2xl font-bold text-slate-900">{analytics.cancellationRate}%</p>
                    <p className="text-xs text-slate-400 mt-0.5">{analytics.totalCancelled} annulation{analytics.totalCancelled !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 p-4">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Hôtels formés</p>
                    <p className="text-2xl font-bold text-slate-900">{analytics.totalUniqueHotels}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-white rounded-lg border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">Top formations</h3>
                    {analytics.topFormations.length === 0 ? (
                      <p className="text-sm text-slate-400">Aucune donnée</p>
                    ) : (
                      <div className="space-y-3">
                        {analytics.topFormations.map((f, i) => {
                          const maxInscrits = analytics.topFormations[0].inscrits
                          const pct = maxInscrits > 0 ? Math.round((f.inscrits / maxInscrits) * 100) : 0
                          return (
                            <div key={f.name}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm text-slate-700 truncate max-w-[200px]">
                                  {i + 1}. {f.name}
                                </span>
                                <span className="text-sm font-semibold text-slate-900 ml-2 shrink-0">
                                  {f.inscrits} inscrits
                                </span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-1.5">
                                <div
                                  className="bg-blue-500 h-1.5 rounded-full"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-lg border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">Top hôtels</h3>
                    {analytics.topHotels.length === 0 ? (
                      <p className="text-sm text-slate-400">Aucune donnée</p>
                    ) : (
                      <div className="space-y-2">
                        {analytics.topHotels.map((h, i) => (
                          <div key={h.name} className="flex items-center justify-between">
                            <span className="text-sm text-slate-700 truncate max-w-[220px]">
                              {i + 1}. {h.name}
                            </span>
                            <span className="text-sm font-medium text-slate-500 shrink-0 ml-2">
                              {h.sessions} session{h.sessions > 1 ? 's' : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {Object.keys(analytics.byLanguage).length > 0 && (
                  <div className="bg-white rounded-lg border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Répartition par langue</h3>
                    <div className="flex items-center gap-6">
                      {(Object.entries(analytics.byLanguage) as [string, number][])
                        .sort((a, b) => b[1] - a[1])
                        .map(([lang, count]) => (
                          <div key={lang} className="flex items-center gap-2">
                            <Badge label={lang} variant={lang.toLowerCase() as 'fr' | 'en' | 'es'} />
                            <span className="text-sm font-medium text-slate-700">
                              {count} session{count !== 1 ? 's' : ''}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
