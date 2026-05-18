'use client'

import { useState } from 'react'
import { monthlyMetrics } from '@/lib/mockData'
import { formatMonth } from '@/lib/utils/formatting'
import ActionButton from '@/components/ui/ActionButton'

type AiAnalysis = {
  executiveSummary?: string
  keyNumbers?: { label: string; value: string; trend: string }[]
  attentionPoints?: string[]
  operationalAnalysis?: string
  allHandsMessage?: string
  error?: string
}

export default function ReportingPage() {
  const [selectedMonth, setSelectedMonth] = useState(5)
  const [selectedYear, setSelectedYear] = useState(2026)
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null)
  const [loadingAi, setLoadingAi] = useState(false)

  const currentMetrics = monthlyMetrics.find(
    m => m.month === selectedMonth && m.year === selectedYear
  )
  const previousMetrics = monthlyMetrics.find(
    m =>
      (m.month === selectedMonth - 1 && m.year === selectedYear) ||
      (selectedMonth === 1 && m.month === 12 && m.year === selectedYear - 1)
  )

  function diff(current: number, previous: number | undefined): string {
    if (!previous) return ''
    const delta = current - previous
    const pct = ((delta / previous) * 100).toFixed(1)
    return delta >= 0 ? `+${pct}%` : `${pct}%`
  }

  function diffColor(current: number, previous: number | undefined, lowerIsBetter = false): string {
    if (!previous) return 'text-slate-400'
    const delta = current - previous
    if (delta === 0) return 'text-slate-400'
    const isGood = lowerIsBetter ? delta < 0 : delta > 0
    return isGood ? 'text-green-600' : 'text-red-600'
  }

  async function handleAiAnalysis() {
    if (!currentMetrics) return
    setLoadingAi(true)
    setAiAnalysis(null)
    try {
      const res = await fetch('/api/ai/monthly-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          year: selectedYear,
          metrics: currentMetrics,
          comparisonMetrics: previousMetrics,
          topProducts: currentMetrics.topProducts,
          channelBreakdown: currentMetrics.byChannel,
        }),
      })
      const data = await res.json()
      setAiAnalysis(data)
    } catch {
      setAiAnalysis({ error: 'Erreur lors de la génération. Vérifiez la clé API OpenAI.' })
    } finally {
      setLoadingAi(false)
    }
  }

  function handleExportMarkdown() {
    if (!currentMetrics) return
    const md = `# Reporting ${formatMonth(selectedMonth, selectedYear)}

## Métriques clés

| Métrique | Valeur |
|----------|--------|
| Total tickets | ${currentMetrics.totalTickets} |
| Total appels | ${currentMetrics.totalCalls} |
| Total chats | ${currentMetrics.totalChats} |
| Première réponse moy. | ${currentMetrics.avgFirstResponseHours}h |
| Taux FCR | ${(currentMetrics.fcrRate * 100).toFixed(0)}% |

## Par produit

${currentMetrics.topProducts.map(p => `- ${p.name}: ${p.count}`).join('\n')}

## Par canal

- Tickets: ${currentMetrics.byChannel.tickets}
- Appels: ${currentMetrics.byChannel.calls}
- Chats: ${currentMetrics.byChannel.chats}

## Ouvertures vs Résolutions

- Ouverts: ${currentMetrics.openedVsResolved.opened}
- Résolus: ${currentMetrics.openedVsResolved.resolved}
`
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporting-${selectedYear}-${String(selectedMonth).padStart(2, '0')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const maxProduct = currentMetrics?.topProducts[0]?.count || 1

  return (
    <div>
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-slate-900">Reporting</h1>
        <p className="text-sm text-slate-500 mt-0.5">Analyse mensuelle de l&apos;activité support</p>
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
                {['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'][m - 1]}
              </option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white text-slate-700"
          >
            {[2026, 2025, 2024].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <span className="text-sm text-slate-500">
            {formatMonth(selectedMonth, selectedYear)}
          </span>
        </div>

        {!currentMetrics ? (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-400 text-sm">
            Aucune donnée disponible pour cette période.
          </div>
        ) : (
          <>
            {/* Metrics grid */}
            <div className="grid grid-cols-5 gap-4">
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Tickets</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{currentMetrics.totalTickets}</p>
                <p className={`text-xs mt-1 ${diffColor(currentMetrics.totalTickets, previousMetrics?.totalTickets, true)}`}>
                  {diff(currentMetrics.totalTickets, previousMetrics?.totalTickets)} vs mois préc.
                </p>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Appels</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{currentMetrics.totalCalls}</p>
                <p className={`text-xs mt-1 ${diffColor(currentMetrics.totalCalls, previousMetrics?.totalCalls, true)}`}>
                  {diff(currentMetrics.totalCalls, previousMetrics?.totalCalls)} vs mois préc.
                </p>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Chats</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{currentMetrics.totalChats}</p>
                <p className={`text-xs mt-1 ${diffColor(currentMetrics.totalChats, previousMetrics?.totalChats, true)}`}>
                  {diff(currentMetrics.totalChats, previousMetrics?.totalChats)} vs mois préc.
                </p>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Première réponse</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{currentMetrics.avgFirstResponseHours}h</p>
                <p className={`text-xs mt-1 ${diffColor(currentMetrics.avgFirstResponseHours, previousMetrics?.avgFirstResponseHours, true)}`}>
                  {diff(currentMetrics.avgFirstResponseHours, previousMetrics?.avgFirstResponseHours)} vs mois préc.
                </p>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Taux FCR</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {(currentMetrics.fcrRate * 100).toFixed(0)}%
                </p>
                <p className={`text-xs mt-1 ${diffColor(currentMetrics.fcrRate, previousMetrics?.fcrRate)}`}>
                  {diff(currentMetrics.fcrRate, previousMetrics?.fcrRate)} vs mois préc.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Product breakdown bar chart */}
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <h2 className="text-sm font-semibold text-slate-700 mb-4">Tickets par produit</h2>
                <div className="space-y-2">
                  {currentMetrics.topProducts.map(p => (
                    <div key={p.name}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-slate-600">{p.name}</span>
                        <span className="text-xs font-medium text-slate-700">{p.count}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full">
                        <div
                          className="h-2 bg-slate-700 rounded-full"
                          style={{ width: `${(p.count / maxProduct) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Channel breakdown */}
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <h2 className="text-sm font-semibold text-slate-700 mb-4">Par canal</h2>
                <div className="space-y-3">
                  {[
                    { label: 'Tickets email', value: currentMetrics.byChannel.tickets, color: 'bg-blue-500' },
                    { label: 'Appels téléphone', value: currentMetrics.byChannel.calls, color: 'bg-green-500' },
                    { label: 'Chats', value: currentMetrics.byChannel.chats, color: 'bg-purple-500' },
                  ].map(c => {
                    const total = currentMetrics.byChannel.tickets + currentMetrics.byChannel.calls + currentMetrics.byChannel.chats
                    return (
                      <div key={c.label}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs text-slate-600">{c.label}</span>
                          <span className="text-xs font-medium text-slate-700">
                            {c.value} ({((c.value / total) * 100).toFixed(0)}%)
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full">
                          <div
                            className={`h-2 ${c.color} rounded-full`}
                            style={{ width: `${(c.value / total) * 100}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100">
                  <h3 className="text-xs font-semibold text-slate-600 mb-2">Ouvertures vs Résolutions</h3>
                  <div className="flex gap-4">
                    <div>
                      <p className="text-xs text-slate-500">Ouverts</p>
                      <p className="text-lg font-bold text-slate-900">{currentMetrics.openedVsResolved.opened}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Résolus</p>
                      <p className="text-lg font-bold text-green-700">{currentMetrics.openedVsResolved.resolved}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Backlog net</p>
                      <p className={`text-lg font-bold ${currentMetrics.openedVsResolved.opened - currentMetrics.openedVsResolved.resolved > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {currentMetrics.openedVsResolved.opened - currentMetrics.openedVsResolved.resolved > 0 ? '+' : ''}
                        {currentMetrics.openedVsResolved.opened - currentMetrics.openedVsResolved.resolved}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <ActionButton
                label="Générer analyse IA"
                onClick={handleAiAnalysis}
                loading={loadingAi}
                variant="primary"
              />
              <ActionButton
                label="Exporter en markdown"
                onClick={handleExportMarkdown}
                variant="secondary"
              />
            </div>

            {/* AI Analysis panel */}
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
                              <span className="text-amber-500 mt-0.5">⚠</span>
                              {p}
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
