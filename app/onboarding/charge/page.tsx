'use client'

import { useEffect, useMemo, useState } from 'react'
import type { OnboardingProject } from '@/lib/zoho/projectsClient'

const CAPACITY_THRESHOLD = 50

function chargeColor(pct: number): { bar: string; text: string } {
  if (pct > 100) return { bar: 'bg-red-500', text: 'text-red-600' }
  if (pct >= 70)  return { bar: 'bg-orange-400', text: 'text-orange-500' }
  return { bar: 'bg-emerald-500', text: 'text-emerald-600' }
}

export default function OnboardingChargePage() {
  const [projects, setProjects] = useState<OnboardingProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/zoho/projects')
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
      .then((data: { projects: OnboardingProject[] }) => { setProjects(data.projects); setLoading(false) })
      .catch(err => { console.error(err); setError('Impossible de charger les projets.'); setLoading(false) })
  }, [])

  const today = new Date()

  const rows = useMemo(() => {
    const map = new Map<string, OnboardingProject[]>()
    for (const p of projects) {
      const key = p.ownerShort || p.ownerName || '—'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return Array.from(map.entries())
      .map(([owner, ps]) => {
        const active = ps.filter(p => p.status !== 'live' && p.status !== 'other').length
        const live = ps.filter(p => p.status === 'live').length
        const blocked = ps.filter(p => p.isBlocked).length
        const goLiveThisMonth = ps.filter(p => {
          if (!p.endDate) return false
          const d = new Date(p.endDate)
          return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()
        }).length
        const highRisk = ps.filter(p => p.riskLevel === 'high' || p.riskLevel === 'critical').length
        const pct = Math.round((active / CAPACITY_THRESHOLD) * 100)
        return { owner, total: ps.length, active, live, blocked, goLiveThisMonth, highRisk, pct }
      })
      .sort((a, b) => b.pct - a.pct)
  }, [projects, today])

  const overloaded = rows.filter(r => r.pct > 100).length

  return (
    <div>
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-slate-900">Charge</h1>
        {!loading && !error && (
          <p className="text-sm text-slate-500 mt-0.5">
            {rows.length} onboarder{rows.length > 1 ? 's' : ''}
            {overloaded > 0 && (
              <span className="ml-2 text-red-600 font-medium">{overloaded} en surcharge</span>
            )}
          </p>
        )}
        {loading && <p className="text-sm text-slate-400 mt-0.5">Chargement…</p>}
        {error && <p className="text-sm text-red-500 mt-0.5">{error}</p>}
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Chargement des projets…</div>
      ) : error ? (
        <div className="p-12 text-center text-red-500 text-sm">{error}</div>
      ) : (
        <div className="p-6 max-w-3xl space-y-6">
          {/* Charge bars */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Taux de charge — seuil : {CAPACITY_THRESHOLD} projets actifs = 100%
            </p>
            {rows.map(({ owner, active, pct }) => {
              const c = chargeColor(pct)
              return (
                <div key={owner} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-700 w-28 flex-shrink-0">{owner}</span>
                  <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${c.bar} rounded-full transition-all`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-500 tabular-nums w-36 flex-shrink-0">
                    {active} projets actifs
                  </span>
                  <span className={`text-sm font-bold tabular-nums w-14 text-right flex-shrink-0 ${c.text}`}>
                    {pct}%
                  </span>
                  {pct > 100 && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                      Surcharge
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Workload detail table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-700">Détail par onboarder</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Onboarder', 'Total', 'Actifs', 'Live', 'Bloqués', 'Go-live ce mois', 'Risque élevé', 'Charge'].map(h => (
                    <th key={h} className={`py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide ${h === 'Onboarder' ? 'text-left px-5' : 'text-center px-4'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(row => {
                  const c = chargeColor(row.pct)
                  return (
                    <tr key={row.owner} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-900">{row.owner}</td>
                      <td className="px-4 py-3 text-center tabular-nums text-slate-600">{row.total}</td>
                      <td className="px-4 py-3 text-center tabular-nums">
                        <span className={row.active > 0 ? 'font-semibold text-blue-700' : 'text-slate-400'}>{row.active}</span>
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums">
                        <span className={row.live > 0 ? 'font-semibold text-emerald-600' : 'text-slate-400'}>{row.live}</span>
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums">
                        {row.blocked > 0 ? <span className="text-red-600 font-medium">{row.blocked}</span> : <span className="text-slate-400">0</span>}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-slate-600">{row.goLiveThisMonth}</td>
                      <td className="px-4 py-3 text-center tabular-nums">
                        {row.highRisk > 0 ? <span className="text-orange-600 font-medium">{row.highRisk}</span> : <span className="text-slate-400">0</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-sm font-bold tabular-nums ${c.text}`}>{row.pct}%</span>
                        {row.pct > 100 && (
                          <span className="ml-1.5 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">Surcharge</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
