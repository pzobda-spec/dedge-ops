'use client'

import { useEffect, useState } from 'react'
import type { BacklogSummary } from '@/lib/support/backlog'

export default function SupportBacklog() {
  const [data, setData] = useState<BacklogSummary | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setError(false)
    setData(null)
    fetch('/api/support/backlog', { signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<BacklogSummary> })
      .then(setData).catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [retry])
  return <section className="rounded-xl border border-[#e2e2e2] bg-white p-5">
    <h2 className="font-semibold">Stock support — toutes dates de création</h2>
    <p className="mt-1 text-xs text-[#696969]">Open + Pending de la dernière synchronisation Desk, indépendamment des filtres ci-dessus. Âge depuis la création, pas depuis la dernière réponse. Les traitements restent dans Zoho Desk.</p>
    {error ? <p role="alert" className="mt-3 text-sm text-amber-800">Stock indisponible, pas zéro ticket. <button className="underline" onClick={() => setRetry(value => value + 1)}>Réessayer</button></p> : !data ? <p className="mt-3 text-sm" aria-live="polite">Chargement du stock…</p> : <>
      <dl className="my-4 grid grid-cols-2 gap-4 sm:grid-cols-4">{[['Ouverts', data.total], ['Plus de 7 jours', data.over7Days], ['Dont plus de 30 jours', data.over30Days], ['Plus ancien (jours)', data.oldestDays ?? '—']].map(([label, value]) => <div key={label}><dt className="text-xs text-[#696969]">{label}</dt><dd className="text-2xl font-semibold">{value}</dd></div>)}</dl>
      <p className="mb-3 text-xs text-[#696969]">Synchronisation la plus ancienne du stock : {data.oldestSync ? new Date(data.oldestSync).toLocaleString('fr-FR') : '—'}. {data.unknownAge > 0 && `${data.unknownAge} âge(s) inconnu(s).`} {data.unknownSync > 0 && `${data.unknownSync} synchronisation(s) non datée(s).`}</p>
      {data.oldestSync && Date.now() - Date.parse(data.oldestSync) > 48 * 3_600_000 && <p className="mb-3 text-sm text-amber-800">Une partie du stock n’a pas été synchronisée depuis plus de 48 h : vérifier la collecte avant arbitrage.</p>}
      <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Stock ouvert par produit</caption><thead><tr>{['Produit', 'Ouverts', '> 30 jours', 'Noms clients distincts'].map(label => <th key={label} className="p-2 text-left">{label}</th>)}</tr></thead><tbody>{data.products.map(row => <tr key={row.product} className="border-t"><th className="p-2 text-left font-normal">{row.product}</th><td className="p-2">{row.total}</td><td className="p-2">{row.over30Days}</td><td className="p-2">{row.clients}</td></tr>)}</tbody></table></div>
    </>}
  </section>
}
