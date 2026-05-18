'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatMonth } from '@/lib/utils/formatting'
import ActionButton from '@/components/ui/ActionButton'

type StatsData = {
  month: number
  year: number
  totalTickets: number
  topProducts: { name: string; count: number }[]
  priorityCounts: Record<string, number>
  segmentCounts: Record<string, number>
  openedVsResolved: { opened: number; resolved: number }
  note?: string
}

type AiAnalysis = {
  executiveSummary?: string
  keyNumbers?: { label: string; value: string; trend: string }[]
  attentionPoints?: string[]
  operationalAnalysis?: string
  allHandsMessage?: string
  error?: string
}

export default function ReportingPage() {
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null)
  const [loadingAi, setLoadingAi] = useState(false)

  const loadStats = useCallback(async () => {
    setLoading(true)
    setStats(null)
    try {
      const res = await fetch(`/api/zoho/stats?month=${selectedMonth}&year=${selectedYear}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setStats(await res.json())
    } catch (err) {
      console.error('Stats error:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedMonth, selectedYear])

  useEffect(() => { loadStats() }, [loadStats])

  const maxProduct = stats?.topProducts[0]?.count || 1

  async function handleAiAnalysis() {
    if (!stats) return
    setLoadingAi(true)
    setAiAnalysis(null)
    try {
      const res = await fetch('/api/ai/monthly-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          year: selectedYear,
          metrics: {
            totalTickets: stats.totalTickets,
            totalCalls: 0,
            totalChats: 0,
            avgFirstResponseHours: null,
            fcrRate: stats.totalTickets > 0
              ? stats.openedVsResolved.resolved / stats.totalTickets
              : 0,
            topProducts: stats.topProducts,
            byChannel: { tickets: stats.totalTickets, calls: 0, chats: 0 },
            openedVsResolved: stats.openedVsResolved,
          },
          topProducts: stats.topProducts,
        }),
      })
      setAiAnalysis(await res.json())
    } catch {
      setAiAnalysis({ error: 'Erreur lors de la génération.' })
    } finally {
      setLoadingAi(false)
    }
  }

  function handleExportMarkdown() {
    if (!stats) return
    const md = `# Reporting ${formatMonth(selectedMonth, selectedYear)}

## Métriques clés

| Métrique | Valeur |
|----------|--------|
| Total tickets | ${stats.totalTickets} |
| Résolus | ${stats.openedVsResolved.resolved} |
| Taux résolution | ${stats.totalTickets > 0 ? ((stats.openedVsResolved.resolved / stats.totalTickets) * 100).toFixed(0) : 0}% |

## Par produit

${stats.topProducts.map(p => `- ${p.name}: ${p.count}`).join('\n')}

## Ouvertures vs Résolutions

- Ouverts : ${stats.openedVsResolved.opened}
- Résolus : ${stats.openedVsResolved.resolved}
`
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporting-${selectedYear}-${String(selectedMonth).padStart(2, '0')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-slate-900">Reporting</h1>
        <p className="text-sm text-slate-500 mt-0.5">Analyse de l&apos;activité support — données Zoho Desk en temps réel</p>
      </div>

      <div className="p-6 space-y-6">
        {/* Month selector */}
        <div className="flex items-center gap-3">
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(Number(e.target.value))}
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white text-slate-700"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>
                {['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'][m - 1]}
              </option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white text-slate-700"
          >
            {[2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <span className="text-sm text-slate-500">{formatMonth(selectedMonth, selectedYear)}</span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
            <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            Chargement des statistiques...
          </div>
        ) : !stats || stats.totalTickets === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-400 text-sm">
            Aucune donnée disponible pour cette période.
          </div>
        ) : (
          <>
            {stats.note && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                {stats.note}
              </p>
            )}

            {/* Metrics */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Tickets ce mois</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.totalTickets}</p>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Résolus</p>
                <p className="text-2xl font-bold text-green-700 mt-1">{stats.openedVsResolved.resolved}</p>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Backlog net</p>
                <p className={`text-2xl font-bold mt-1 ${stats.openedVsResolved.opened - stats.openedVsResolved.resolved > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {stats.openedVsResolved.opened - stats.openedVsResolved.resolved > 0 ? '+' : ''}
                  {stats.openedVsResolved.opened - stats.openedVsResolved.resolved}
                </p>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Taux résolution</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {((stats.openedVsResolved.resolved / stats.totalTickets) * 100).toFixed(0)}%
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Product breakdown */}
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <h2 className="text-sm font-semibold text-slate-700 mb-4">Tickets par produit</h2>
                <div className="space-y-2">
                  {stats.topProducts.map(p => (
                    <div key={p.name}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-slate-600">{p.name}</span>
                        <span className="text-xs font-medium text-slate-700">{p.count}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full">
                        <div className="h-2 bg-slate-700 rounded-full" style={{ width: `${(p.count / maxProduct) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Priority + segment */}
              <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-700 mb-3">Par priorité</h2>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'urgent', label: 'Urgente', color: 'text-red-600' },
                      { key: 'high', label: 'Haute', color: 'text-orange-600' },
                      { key: 'medium', label: 'Moyenne', color: 'text-yellow-600' },
                      { key: 'low', label: 'Faible', color: 'text-slate-500' },
                    ].map(({ key, label, color }) => (
                      <div key={key} className="bg-slate-50 rounded p-2">
                        <p className="text-xs text-slate-500">{label}</p>
                        <p className={`text-lg font-bold ${color}`}>{stats.priorityCounts[key] ?? 0}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-700 mb-3">Par segment</h2>
                  <div className="space-y-1">
                    {Object.entries(stats.segmentCounts).sort((a, b) => b[1] - a[1]).map(([seg, count]) => (
                      <div key={seg} className="flex items-center justify-between text-xs">
                        <span className="text-slate-600">{seg}</span>
                        <span className="font-medium text-slate-700">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <ActionButton label="Générer analyse IA" onClick={handleAiAnalysis} loading={loadingAi} variant="primary" />
              <ActionButton label="Exporter en markdown" onClick={handleExportMarkdown} variant="secondary" />
            </div>

            {(loadingAi || aiAnalysis) && (
              <div className="bg-white rounded-lg border border-slate-200 p-5">
                <h2 className="text-sm font-semibold text-slate-700 mb-4">Analyse IA</h2>
                {loadingAi ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                    Génération de l&apos;analyse...
                  </div>
                ) : aiAnalysis?.error ? (
                  <p className="text-sm text-red-600">{aiAnalysis.error}</p>
                ) : aiAnalysis ? (
                  <div className="space-y-4">
                    {aiAnalysis.executiveSummary && (
                      <div>
                        <h3 className="text-xs font-semibold text-slate-500 uppercase mb-1">Résumé exécutif</h3>
                        <p className="text-sm text-slate-700">{aiAnalysis.executiveSummary}</p>
                      </div>
                    )}
                    {aiAnalysis.keyNumbers && aiAnalysis.keyNumbers.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Chiffres clés</h3>
                        <div className="grid grid-cols-3 gap-3">
                          {aiAnalysis.keyNumbers.map((kn, i) => (
                            <div key={i} className="bg-slate-50 rounded p-3">
                              <p className="text-xs text-slate-500">{kn.label}</p>
                              <p className="text-lg font-bold text-slate-900">{kn.value}</p>
                              <p className="text-xs text-slate-400">{kn.trend}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {aiAnalysis.attentionPoints && aiAnalysis.attentionPoints.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Points d&apos;attention</h3>
                        <ul className="space-y-1">
                          {aiAnalysis.attentionPoints.map((p, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                              <span className="text-amber-500 mt-0.5">⚠</span>{p}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {aiAnalysis.operationalAnalysis && (
                      <div>
                        <h3 className="text-xs font-semibold text-slate-500 uppercase mb-1">Analyse opérationnelle</h3>
                        <p className="text-sm text-slate-700 leading-relaxed">{aiAnalysis.operationalAnalysis}</p>
                      </div>
                    )}
                    {aiAnalysis.allHandsMessage && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h3 className="text-xs font-semibold text-blue-700 uppercase mb-1">Message All Hands</h3>
                        <p className="text-sm text-blue-900 leading-relaxed">{aiAnalysis.allHandsMessage}</p>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
