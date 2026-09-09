'use client'

import type { AcuitySession } from '@/lib/acuity/client'
import { summarizeTrainingPlanning } from '@/lib/acuity/planning'

export default function TrainingPlanning({ sessions }: { sessions: AcuitySession[] }) {
  const rows = summarizeTrainingPlanning(sessions)
  return <section className="rounded-xl border border-[#e2e2e2] bg-white p-5">
    <h2 className="font-semibold">Arbitrer les formations à venir</h2>
    <p className="mt-1 text-xs text-[#696969]">Périmètre des filtres actifs, sessions programmées hors brouillons. Une session vide invite à vérifier la demande et les invitations ; elle ne constitue pas une recommandation d’annulation.</p>
    {rows.length === 0 ? <p className="mt-3 text-sm">Aucune session programmée dans ce périmètre.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Thème / langue', 'Sessions', 'Heures prévues', 'Inscrits', 'Sans inscrit', 'Remplissage connu'].map(label => <th key={label} className="p-2 text-left">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={JSON.stringify([row.theme, row.language])} className="border-t"><th className="p-2 text-left font-normal">{row.theme} · {row.language}</th><td className="p-2">{row.sessions}</td><td className="p-2">{(row.minutes / 60).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</td><td className="p-2">{row.registrations}</td><td className="p-2">{row.empty}</td><td className="p-2">{row.capacity > 0 ? `${Math.round(row.registrationsWithCapacity / row.capacity * 100)} % (${row.knownCapacitySessions}/${row.sessions} sessions)` : '—'}</td></tr>)}</tbody></table></div>}
  </section>
}
