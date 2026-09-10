'use client'

import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { monthKey, shiftMonth, PHONE_BREAK_NOTE } from '@/lib/reporting/monthly'
import type { channelMetrics, supportMetrics } from '@/lib/reporting/monthly'
import type { readCoverage, readImplementation } from '@/lib/reporting/source'
import type { supportLevelMetrics } from '@/lib/reporting/supportLevels'

type Levels = ReturnType<typeof supportLevelMetrics> & { month: string; note: string; coverage: { oldest_checked_at: string | null; cache_minutes: number } }

type Coverage = Awaited<ReturnType<typeof readCoverage>> & { tickets_read: number; certified: boolean; partial_month: boolean }
type Monthly = {
  month: string
  support: ReturnType<typeof supportMetrics>
  implementation: { data: Awaited<ReturnType<typeof readImplementation>> | null; error: string | null }
  coverage: Coverage
  unavailable: Record<string, string>
}
type Channels = Omit<ReturnType<typeof channelMetrics>, 'months'> & {
  months: (ReturnType<typeof channelMetrics>['months'][number] & { certified: boolean })[]
  coverage: Coverage
  limitations: string[]
}
const number = (value: number | null | undefined, suffix = '') => value == null ? '—' : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value)}${suffix}`
const label = (month: string) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
const syncLabel = (value: string | null) => value ? new Date(value).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : '—'
const panel = 'rounded-xl border border-[#ded8e8] bg-white p-4 sm:p-5'
const note = 'rounded-lg border border-[#edc86b] bg-[#fffaf0] p-3 text-xs leading-5 text-[#765314]'
const cell = 'px-3 py-2 text-right tabular-nums'

function Kpi({ title, value, detail }: { title: string; value: string; detail?: string }) {
  return <div className="rounded-lg bg-[#f7f3fc] p-4"><h4 className="text-xs font-semibold text-[#696969]">{title}</h4><p className="mt-2 text-2xl font-bold text-[#59319f]">{value}</p>{detail && <p className="mt-2 text-xs leading-5 text-[#696969]">{detail}</p>}</div>
}

export default function MonthlyReporting() {
  const [month, setMonth] = useState(() => shiftMonth(monthKey(new Date()), -1))
  const [monthly, setMonthly] = useState<Monthly | null>(null)
  const [channels, setChannels] = useState<Channels | null>(null)
  const [levels, setLevels] = useState<Levels | null>(null)
  const [levelsError, setLevelsError] = useState('')
  const [levelsLoading, setLevelsLoading] = useState(true)
  const [error, setError] = useState('')
  const [channelError, setChannelError] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [channelLoading, setChannelLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setMonthly(null); setChannels(null); setError(''); setChannelError(''); setCopyStatus('')
    setLevels(null); setLevelsError(''); setLevelsLoading(true)
    setLoading(true); setChannelLoading(true)
    async function load<T>(url: string, save: (value: T) => void, fail: (value: string) => void, done: () => void) {
      try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Données indisponibles.')
        if (!controller.signal.aborted) save(body)
      } catch (cause) {
        if (!controller.signal.aborted) fail(cause instanceof Error ? cause.message : 'Données indisponibles.')
      } finally { if (!controller.signal.aborted) done() }
    }
    void load<Monthly>(`/api/reporting/monthly?month=${month}`, setMonthly, setError, () => setLoading(false))
    void load<Levels>(`/api/reporting/support-levels?month=${month}`, setLevels, setLevelsError, () => setLevelsLoading(false))
    void load<Channels>(`/api/reporting/channels?from=${shiftMonth(month, -23)}-01&to=${shiftMonth(month, 1)}-01`, setChannels, setChannelError, () => setChannelLoading(false))
    return () => controller.abort()
  }, [month])

  async function copy() {
    if (!monthly) return
    const s = monthly.support, p = monthly.implementation.data
    const lines = [
      `Reporting mensuel — ${label(month)} — périmètre CRM / Support Zoho synchronisé (pas le global D-EDGE)`,
      `Couverture : ${monthly.coverage.certified ? 'mois dans les bornes déclarées du backfill ; exhaustivité non vérifiée' : 'exhaustivité non certifiée'}${monthly.coverage.partial_month ? ' ; mois en cours' : ''}. Synchronisation tickets : ${syncLabel(monthly.coverage.last_synced_at)}.`,
      `Tickets créés : ${s.opened} ; clôturés : ${s.closed} ; clôturés / créés : ${number(s.closed_opened_pct, ' %')}.`,
      'Créations selon created_at ; clôtures selon resolved_at, y compris les tickets créés avant le mois. Ce sont les dates de clôture actuellement synchronisées, pas un historique de toutes les transitions.',
      `Première réponse moyenne : ${number(s.first_response_hours, ' h')} (${s.first_response_sample}/${s.opened} tickets créés documentés). Résolution moyenne calendaire hors délais > ${s.resolution_max_days} jours : ${number(s.resolution_hours, ' h')} (${s.resolution_sample}/${s.closed} clôtures retenues ; ${s.resolution_excluded_count} exclues au-delà du seuil ; ${s.resolution_missing_count} durées manquantes ou invalides).`,
      `FCR estimé : ${number(s.fcr_estimate_pct, ' %')} (${s.fcr_sample}/${s.closed} clôtures documentées).`,
      `Produits les plus sollicités : ${s.top_products.map(v => `${v.name} : ${v.count}`).join(' ; ') || '—'}.`,
      `Jours les plus chargés (Paris) : ${s.peak_days.map(v => `${v.name} : ${v.count}`).join(' ; ') || '—'}. Aucune cause incident ou release déduite.`,
      ...(p ? [`Implémentation — nouveaux projets démarrés (Non démarré → In Progress) : ${number(p.in_progress)} ; ${p.in_progress_resumed_or_other} reprises ou autres transitions exclues ; passés Live : ${p.went_live}.`,
        `Live : ${p.live_dated} selon Live date, ${p.live_observed_without_date} transitions observées sans date métier. ${p.live_without_usable_date} projets actuellement Live sans date exploitable pour ce mois. ${p.imported_in_progress_without_transition} imports déjà In Progress sans transition prouvée pendant le mois. Début du suivi : ${syncLabel(p.tracking_started_at)}. Synchronisation projets : ${syncLabel(p.last_synced_at)}.`,
        `Portefeuille actuel (${p.project_count} projets, non historique) : ${p.current_statuses.map(v => `${v.name} : ${v.count}`).join(' ; ')}.`] : [monthly.implementation.error || 'Implémentation indisponible.']),
      ...Object.values(monthly.unavailable), PHONE_BREAK_NOTE,
    ]
    const selected = channels?.months.find(row => row.key === month)
    if (levels) {
      for (const [name, group] of [['L1 sans lien Linear', levels.l1], ['L2 avec lien Linear', levels.l2], ['Niveau non déterminé', levels.unknown]] as const) {
        lines.push(`${name} — résolution moyenne : ${number(group.resolution_hours == null ? null : group.resolution_hours / 24, ' j')} (${number(group.resolution_hours, ' h')}) ; ${group.resolution_sample}/${group.closed} clôtures retenues ; ${group.resolution_excluded_count} délais > ${group.resolution_max_days} jours exclus ; ${group.resolution_missing_count} durées manquantes.`)
      }
      lines.push(levels.note, `Liens vérifiés depuis ${syncLabel(levels.coverage.oldest_checked_at)} ; cache ${levels.coverage.cache_minutes} minutes.`)
    } else lines.push('Résolution L1 / L2 : indisponible. ' + levelsError)
    if (selected?.sparse_history) lines.push('Attention : volume mensuel atypiquement faible par rapport aux six derniers mois complets affichés ; historique à vérifier avant utilisation dans les slides.')
    if (selected) lines.push(`Canaux du mois — courriel : ${selected.email} ; téléphone (tickets) : ${selected.phone} ; web : ${selected.web} ; messagerie instantanée : ${selected.chat} ; autre : ${selected.autre}. Part Phone : ${number(selected.phone_share_pct, ' %')}.`)
    try { await navigator.clipboard.writeText(lines.join('\n')); setCopyStatus('Synthèse copiée.') } catch { setCopyStatus('Copie impossible dans ce navigateur. Vous pouvez sélectionner le tableau.') }
  }

  const selectedChannel = channels?.months.find(row => row.key === month)
  const shaded = channels?.months.filter(row => row.key >= '2026-03') ?? []
  return <section aria-labelledby="monthly-report-title" className="space-y-5 border-b border-[#ded8e8] pb-8">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="monthly-report-title" className="text-xl font-bold">Synthèse mensuelle pour les slides</h2><p className="mt-1 text-sm text-[#696969]">Support CRM, implémentation et portefeuille projets. Le périmètre global D-EDGE n’est pas disponible ici.</p></div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold">Mois du reporting<input aria-label="Mois du reporting" type="month" min="2000-01" max={monthKey(new Date())} value={month} onChange={event => { if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(event.target.value)) setMonth(event.target.value) }} className="mt-1 block rounded-lg border border-[#ded8e8] bg-white px-3 py-2 text-sm" /></label>
        <button type="button" onClick={copy} disabled={!monthly || loading || levelsLoading} className="rounded-lg bg-[#59319f] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Copier les données des slides</button>
      </div>
    </div>
    {copyStatus && <p role="status" className="text-sm">{copyStatus}</p>}
    {loading && <p role="status" className="text-sm">Chargement de la synthèse mensuelle…</p>}
    {error && <p role="alert" className={note}>{error}</p>}
    {monthly && <>
      <p className={note}>Données observées pour {label(month)} · {monthly.coverage.certified ? 'mois dans les bornes déclarées du backfill ; exhaustivité non vérifiée' : 'exhaustivité de la période non certifiée'}{monthly.coverage.partial_month ? ' · mois en cours, chiffres partiels' : ''}. Dernière synchronisation tickets : {syncLabel(monthly.coverage.last_synced_at)}. Un zéro désigne l’absence de ligne correspondante dans la source synchronisée ; il ne prouve pas l’absence d’activité. {selectedChannel?.sparse_history && 'Volume atypiquement faible : historique à vérifier avant utilisation dans les slides.'}</p>
      <section className={`${panel} space-y-4`} aria-labelledby="monthly-support-title">
        <h3 id="monthly-support-title" className="font-bold">Support | CRM — {label(month)}</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi title="Tickets créés" value={number(monthly.support.opened)} detail="Créations pendant le mois, tous canaux." />
          <Kpi title="Tickets clôturés" value={number(monthly.support.closed)} detail={`Selon la date de clôture synchronisée, même si créés avant ce mois. Clôturés / créés : ${number(monthly.support.closed_opened_pct, ' %')}.`} />
          <Kpi title="Première réponse moyenne" value={number(monthly.support.first_response_hours, ' h')} detail={`${monthly.support.first_response_sample} / ${monthly.support.opened} créations documentées. Métrique Zoho, sinon écart entre horodatages ; ce n’est pas la première action.`} />
          <Kpi title="Résolution moyenne globale" value={number(monthly.support.resolution_hours == null ? null : monthly.support.resolution_hours / 24, ' j')} detail={`Hors délais > ${monthly.support.resolution_max_days} jours. ${monthly.support.resolution_sample} / ${monthly.support.closed} clôtures retenues ; ${monthly.support.resolution_excluded_count} exclues ; ${monthly.support.resolution_missing_count} durées manquantes ou invalides. Temps calendaire, pas un taux SLA.`} />
        </div>
        <div className="space-y-3" aria-labelledby="support-levels-title">
          <h4 id="support-levels-title" className="text-sm font-bold">Résolution moyenne par niveau de support</h4>
          {levelsLoading && <p role="status" className="text-xs text-[#696969]">Vérification des liens Linear dans Zoho Desk…</p>}
          {levelsError && <p role="alert" className={note}>{levelsError}</p>}
          {!levels && <div className="grid gap-3 sm:grid-cols-2"><Kpi title="L1 — sans lien Linear" value="—" /><Kpi title="L2 — avec lien Linear" value="—" /></div>}
          {levels && <>
            <div className="grid gap-3 sm:grid-cols-2">{([{ title: 'L1 — sans lien Linear', group: levels.l1 }, { title: 'L2 — avec lien Linear', group: levels.l2 }]).map(({ title, group }) => <Kpi key={title} title={title} value={number(group.resolution_hours == null ? null : group.resolution_hours / 24, ' j')} detail={`${number(group.resolution_hours, ' h')} · ${group.resolution_sample} / ${group.closed} clôtures retenues ; ${group.resolution_excluded_count} délais > ${group.resolution_max_days} jours exclus ; ${group.resolution_missing_count} durées manquantes.`} />)}</div>
            <p className="text-xs leading-5 text-[#696969]">{levels.note} Liens vérifiés depuis {syncLabel(levels.coverage.oldest_checked_at)} ; cache de {levels.coverage.cache_minutes} minutes.</p>
            {levels.unknown.closed > 0 && <p className={note}>{levels.unknown.closed} tickets de niveau non déterminé, exclus de la ventilation L1 / L2 : {levels.unknown.resolution_sample} délais retenus, {levels.unknown.resolution_excluded_count} supérieurs à 90 jours, {levels.unknown.resolution_missing_count} manquants. La couverture est partielle.</p>}
          </>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Kpi title="FCR estimé" value={number(monthly.support.fcr_estimate_pct, ' %')} detail={`${monthly.support.fcr_sample} clôtures documentées. Estimation selon les réouvertures / échanges disponibles.`} />
          {['CSAT', 'Insatisfaction', 'Réponse aux enquêtes', 'IQS'].map(title => <Kpi key={title} title={title} value="—" detail="Source de qualité indisponible." />)}
        </div>
        <p className="text-xs leading-5 text-[#696969]">{monthly.unavailable.cancellation} {monthly.unavailable.sla} Les clôtures reflètent l’état synchronisé actuel, pas toutes les transitions historiques.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {[{ title: 'Produits les plus sollicités', items: monthly.support.top_products }, { title: 'Jours les plus chargés (Europe/Paris)', items: monthly.support.peak_days }].map(group => <div key={group.title}><h4 className="mb-2 text-sm font-semibold">{group.title}</h4>{group.items.length ? <table className="w-full text-sm"><thead className="text-xs text-[#696969]"><tr><th className="text-left">{group.title.startsWith('Produits') ? 'Produit' : 'Jour'}</th><th className="text-right">Tickets créés</th></tr></thead><tbody>{group.items.map(item => <tr key={item.name} className="border-t border-[#eeeaf3]"><td className="py-2">{item.name}</td><td className="text-right tabular-nums">{item.count}</td></tr>)}</tbody></table> : <p className="text-sm">— Aucune création observée.</p>}</div>)}
        </div>
        <p className="text-xs text-[#696969]">Ces concentrations ne permettent pas d’attribuer une cause à un incident ou une mise en production. Commentaire métier à compléter dans la slide.</p>
      </section>
      <section className={`${panel} space-y-4`} aria-labelledby="monthly-implementation-title">
        <h3 id="monthly-implementation-title" className="font-bold">Implémentation | CRM — {label(month)}</h3>
        {monthly.implementation.data ? <>
          <div className="grid gap-3 sm:grid-cols-2"><Kpi title="Nouveaux projets démarrés" value={number(monthly.implementation.data.in_progress)} detail={`Non démarré → In Progress pendant le mois. ${monthly.implementation.data.in_progress_resumed_or_other} reprises depuis une attente, une pause ou un autre statut exclues.`} /><Kpi title="Projets passés Live" value={number(monthly.implementation.data.went_live)} detail={`${monthly.implementation.data.live_dated} selon Live date ; ${monthly.implementation.data.live_observed_without_date} transitions observées sans date métier. Chaque projet compte une fois par mois.`} /></div>
          <p className="text-xs text-[#696969]">Parcours : opportunité gagnée → projet migré dans Zoho Projects → In Progress → Live. La migration et la date de début planifiée ne sont pas des passages In Progress.</p>
          <p className="text-xs text-[#696969]">Source : Zoho Projects synchronisé et journal de transitions · {monthly.implementation.data.project_count} projets · suivi enregistré depuis {syncLabel(monthly.implementation.data.tracking_started_at)} · synchronisation : {syncLabel(monthly.implementation.data.last_synced_at)}. {monthly.implementation.data.imported_in_progress_without_transition} imports déjà In Progress sans transition prouvée ce mois ; {monthly.implementation.data.live_without_usable_date} projets actuellement Live sans date exploitable pour ce mois.</p>
          {!monthly.implementation.data.tracking_covers_month && <p className={note}>Le mois sélectionné précède le début du suivi ou n’est couvert qu’en partie. L’historique In Progress est incomplet.</p>}
        </> : <p role="alert" className={note}>{monthly.implementation.error}</p>}
        <p className={note}>{monthly.unavailable.implementation} {monthly.unavailable.quality}</p>
      </section>
      <section className={`${panel} space-y-3`} aria-labelledby="monthly-projects-title"><h3 id="monthly-projects-title" className="font-bold">Projets — portefeuille actuel d’onboarding</h3><p className="text-xs leading-5 text-[#696969]">{monthly.unavailable.projects}</p>{monthly.implementation.data && <div className="flex flex-wrap gap-2">{monthly.implementation.data.current_statuses.map(item => <span key={item.name} className="rounded-lg bg-[#f7f3fc] px-3 py-2 text-sm">{item.name} : <strong>{item.count}</strong></span>)}</div>}</section>
      <section className={`${panel} space-y-3`} aria-labelledby="monthly-phone-title"><h3 id="monthly-phone-title" className="font-bold">Téléphonie — mesures réelles attendues dans la slide</h3><div className="grid gap-3 sm:grid-cols-3"><Kpi title="Appels entrants" value="—" /><Kpi title="Appels décrochés en moins de 30 s" value="—" /><Kpi title="Taux d’appels manqués" value="—" /></div><p className={note}>{monthly.unavailable.phone}</p>{selectedChannel && <p className="text-sm">Mesure disponible pour {label(month)} : <strong>{selectedChannel.phone} tickets Phone</strong>, soit {number(selectedChannel.phone_share_pct, ' %')} des tickets créés.</p>}</section>
    </>}
    <section className={`${panel} space-y-4`} aria-labelledby="channels-title">
      <h3 id="channels-title" className="font-bold">Canaux et téléphonie — historique de 24 mois</h3>
      <p className="text-xs text-[#696969]">De {label(shiftMonth(month, -23))} à {label(month)} · tickets créés selon le canal Zoho brut, agrégation en Europe/Paris.</p>
      {channelLoading && <p role="status">Chargement des canaux…</p>}{channelError && <p role="alert" className={note}>{channelError}</p>}
      {channels && <>
        <p className={note}>{PHONE_BREAK_NOTE}</p>
        <div className="h-80 w-full" role="img" aria-label="Volumes mensuels de tickets par canal. La zone grisée commence en mars 2026. Les données sont aussi disponibles dans le tableau ci-dessous.">
          <ResponsiveContainer width="100%" height="100%"><BarChart data={channels.months} margin={{ top: 20, right: 15, bottom: 5, left: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="key" tick={{ fontSize: 10 }} minTickGap={18} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip formatter={(value, name) => [number(Number(value)), name]} /><Legend wrapperStyle={{ fontSize: 12 }} />{shaded.length > 0 && <ReferenceArea x1={shaded[0].key} x2={shaded[shaded.length - 1].key} fill="#71717a" fillOpacity={0.12} label={{ value: 'Arrêt de la prise d’appels', fontSize: 10, position: 'insideTop' }} />}<Bar dataKey="email" name="Courriel" stackId="channels" fill="#8064b3" /><Bar dataKey="phone" name="Téléphone (tickets)" stackId="channels" fill="#00a99d" /><Bar dataKey="web" name="Web" stackId="channels" fill="#e6a03b" /><Bar dataKey="chat" name="Messagerie instantanée" stackId="channels" fill="#4a86cf" /><Bar dataKey="autre" name="Autre / non renseigné" stackId="channels" fill="#a3a3a3" /></BarChart></ResponsiveContainer>
        </div>
        <p className="text-xs text-[#696969]">Bornes observées : {channels.coverage.first_month ?? '—'} → {channels.coverage.last_month ?? '—'} · {number(channels.coverage.tickets_read)} tickets lus · synchronisation : {syncLabel(channels.coverage.last_synced_at)}. Les mois non certifiés peuvent être incomplets ; une barre vide ne prouve pas l’absence d’activité. Les mois dont le volume est inférieur à 20 % de la médiane des six derniers mois complets affichés sont marqués « à vérifier » (signal de qualité, pas une preuve).</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Kpi title="Tickets Phone sur les 24 mois" value={number(channels.totals.phone)} /><Kpi title="Part Phone dans tous les tickets" value={number(channels.totals.phone_share_pct, ' %')} /><Kpi title="Appels estimés (hypothèse)" value={number(channels.totals.estimated_calls)} /><Kpi title="Moyenne estimée d’appels par mois" value={number(channels.totals.average_estimated_calls_per_month)} detail={`Moyenne sur les ${channels.months.length} mois affichés, y compris les mois partiels et non certifiés.`} /></div>
        <p className={note}>Estimation uniquement : tickets Phone × {number(channels.ratio)} appel par ticket (hypothèse : 2 tickets pour 1 appel, non validée). Cette conversion ne doit pas remplir les indicateurs d’appels réels des slides. {channels.limitations[1]}</p>
        <div className="max-h-[480px] overflow-auto"><table className="w-full min-w-[1100px] text-sm"><caption className="pb-2 text-left text-xs text-[#696969]">Volumes observés ; * période partielle ou non certifiée. Les zéros restent soumis à cette limitation.</caption><thead className="sticky top-0 bg-white text-xs"><tr><th className="px-3 py-2 text-left">Mois</th>{['Total', 'Courriel', 'Phone', 'Web', 'Messagerie', 'Autre', 'Part Phone', 'Appels estimés', 'Prise d’appels'].map(h => <th key={h} className={cell}>{h}</th>)}</tr></thead><tbody>{[...channels.months].reverse().map(row => <tr key={row.key} className={`border-t border-[#eeeaf3] ${row.phone_regime !== 'before' ? 'bg-[#f5f5f5]' : ''}`}><td className="whitespace-nowrap px-3 py-2">{label(row.key)}{!row.certified || row.partial_period ? ' *' : ''}{row.sparse_history ? ' · à vérifier' : ''}</td>{[row.total, row.email, row.phone, row.web, row.chat, row.autre].map((value, index) => <td key={index} className={cell}>{number(value)}</td>)}<td className={cell}>{number(row.phone_share_pct, ' %')}</td><td className={cell}>{number(row.estimated_calls)}</td><td className={`${cell} text-xs`}>{row.phone_regime === 'before' ? 'Avant arrêt' : row.phone_regime === 'transition' ? 'Transition mars–avril' : 'Après arrêt'}</td></tr>)}</tbody></table></div>
      </>}
    </section>
  </section>
}
