'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronRight, RotateCcw, Search } from 'lucide-react'
import type { ClientTypology, OnboardingProject } from '@/lib/zoho/projectsClient'
import { aggregateOnboardingClients, clientPropertyKey } from '@/lib/onboarding/clientAggregation'
import { isExcludedOnboardingOwner } from '@/lib/onboarding/constants'
import { useLocale } from '@/lib/i18n/LocaleContext'

type Scope = 'active' | 'all' | 'live'
type TypologyFilter = 'all' | ClientTypology

const typologyStyles: Record<ClientTypology, string> = {
  group: 'bg-[#eee7f8] text-[#59319f]',
  individual: 'bg-[#e8f1fc] text-[#2b5bb7]',
  unlinked: 'bg-[#fff7df] text-[#84550e]',
}

function typologyLabel(typology: ClientTypology): string {
  if (typology === 'group') return 'Groupe'
  if (typology === 'individual') return 'Individuel'
  return 'Non rattaché'
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR')
}

function ProgressBar({ value }: { value: number }) {
  const { t } = useLocale()
  return (
    <div className="flex min-w-[130px] items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e8e8e8]" role="progressbar" aria-label={t('Avancement agrégé')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <div className="h-full rounded-full bg-[#59319f]" style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} />
      </div>
      <span className="w-9 text-right text-xs font-semibold tabular-nums text-[#4a4a4a]">{value}%</span>
    </div>
  )
}

export default function OnboardingClientsPage() {
  const { t } = useLocale()
  const [projects, setProjects] = useState<OnboardingProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [scope, setScope] = useState<Scope>('active')
  const [typology, setTypology] = useState<TypologyFilter>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetch('/api/zoho/projects', { signal: controller.signal })
      .then(async response => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error ?? `${t('Erreur HTTP')} ${response.status}`)
        if (!Array.isArray(body.projects)) throw new Error(t('Réponse projets invalide'))
        return body.projects as OnboardingProject[]
      })
      .then(setProjects)
      .catch(fetchError => {
        if (fetchError instanceof Error && fetchError.name === 'AbortError') return
        setError(fetchError instanceof Error ? fetchError.message : t('Impossible de charger les clients.'))
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [retry, t])

  const scopedProjects = useMemo(() => projects
    .filter(project => !isExcludedOnboardingOwner(project.ownerShort))
    .filter(project => scope === 'all' || (scope === 'live' ? project.status === 'live' : project.status !== 'live' && project.status !== 'other')),
  [projects, scope])
  const clients = useMemo(() => aggregateOnboardingClients(scopedProjects), [scopedProjects])
  const visibleClients = useMemo(() => {
    const query = normalize(search.trim())
    return clients.filter(client => {
      if (typology !== 'all' && client.typology !== typology) return false
      if (!query) return true
      return normalize([client.name, ...client.properties.map(property => property.name), ...client.projects.map(project => project.hotelName), ...client.products, ...client.owners].join(' ')).includes(query)
    })
  }, [clients, search, typology])
  const kpis = useMemo(() => ({
    groups: clients.filter(client => client.typology === 'group').length,
    individuals: clients.filter(client => client.typology === 'individual').length,
    properties: new Set(scopedProjects.map(clientPropertyKey)).size,
    unlinked: clients.filter(client => client.typology === 'unlinked').length,
  }), [clients, scopedProjects])
  const hasFilters = scope !== 'active' || typology !== 'all' || Boolean(search.trim())

  function resetFilters() {
    setScope('active')
    setTypology('all')
    setSearch('')
  }

  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] text-[#1a1a1a]" style={{ fontFamily: 'var(--font-sans)' }}>
      <header className="border-b border-[#e2e2e2] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8064b3]">Onboarding</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{t('Clients onboarding')}</h1>
            <p className="mt-1 text-sm text-[#696969]">{t('Une vue consolidée des propriétés et produits de chaque client.')}</p>
          </div>
          <nav className="inline-flex self-start rounded-lg border border-[#ded8e8] bg-[#f7f5fa] p-1" aria-label={t('Vues onboarding')}>
            <Link href="/onboarding" className="rounded-md px-3 py-1.5 text-xs font-semibold text-[#696969] hover:text-[#59319f]">{t('Liste')}</Link>
            <Link href="/onboarding/board" className="rounded-md px-3 py-1.5 text-xs font-semibold text-[#696969] hover:text-[#59319f]">Board</Link>
            <Link href="/onboarding/pilotage" className="rounded-md px-3 py-1.5 text-xs font-semibold text-[#696969] hover:text-[#59319f]">{t('Pilotage')}</Link>
            <span aria-current="page" className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-[#59319f] shadow-sm">{t('Clients')}</span>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        {loading ? <div className="h-80 animate-pulse rounded-xl border border-[#e2e2e2] bg-white" aria-label={t('Chargement des clients…')} /> : error ? (
          <div role="alert" className="rounded-xl border border-[#efb4b0] bg-[#fff8f7] p-6 text-center">
            <p className="font-semibold text-[#8f211d]">{t('Impossible de charger les clients.')}</p>
            <p className="mt-1 text-sm text-[#a33b36]">{error}</p>
            <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-4 rounded-lg bg-[#59319f] px-4 py-2 text-sm font-semibold text-white">{t('Réessayer')}</button>
          </div>
        ) : <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={t('Indicateurs clients')}>
            {[
              [t('Groupes'), kpis.groups], [t('Individuels'), kpis.individuals], [t('Propriétés'), kpis.properties], [t('Non rattachés'), kpis.unlinked],
            ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#696969]">{label}</p><p className="mt-2 text-3xl font-bold tabular-nums">{value}</p></div>)}
          </section>

          <section className="rounded-xl border border-[#ded8e8] bg-white p-4 shadow-sm" aria-label={t('Filtres clients')}>
            <div className="grid gap-3 sm:grid-cols-3">
              <label><span className="mb-1 block text-xs font-semibold text-[#4a4a4a]">{t('Rechercher')}</span><span className="relative block"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a8a8a]" aria-hidden="true" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={t('Client, propriété, produit, owner…')} className="w-full rounded-lg border border-[#d8d8d8] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#8064b3] focus:ring-2 focus:ring-[#e6dcf5]" /></span></label>
              <label><span className="mb-1 block text-xs font-semibold text-[#4a4a4a]">{t('Périmètre')}</span><select value={scope} onChange={event => setScope(event.target.value as Scope)} className="w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2.5 text-sm"><option value="active">{t('Projets actifs')}</option><option value="all">{t('Tous les projets')}</option><option value="live">{t('Projets Live')}</option></select></label>
              <label><span className="mb-1 block text-xs font-semibold text-[#4a4a4a]">{t('Typologie client')}</span><select value={typology} onChange={event => setTypology(event.target.value as TypologyFilter)} className="w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2.5 text-sm"><option value="all">{t('Toutes les typologies')}</option><option value="group">{t('Groupe')}</option><option value="individual">{t('Individuel')}</option><option value="unlinked">{t('Non rattaché')}</option></select></label>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-[#696969]"><span>{visibleClients.length} {t('sur')} {clients.length} {t('clients')}</span>{hasFilters && <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1.5 font-semibold text-[#59319f] hover:underline"><RotateCcw size={13} aria-hidden="true" />{t('Réinitialiser')}</button>}</div>
          </section>

          {visibleClients.length === 0 ? <div className="rounded-xl border border-dashed border-[#d8d8d8] bg-white px-5 py-12 text-center"><AlertTriangle className="mx-auto text-[#a1a1a1]" size={22} aria-hidden="true" /><p className="mt-3 text-sm font-semibold">{t('Aucun client ne correspond à ces filtres.')}</p></div> : <>
            <div className="hidden overflow-hidden rounded-xl border border-[#e2e2e2] bg-white lg:block">
              <table className="w-full table-fixed text-left"><thead className="border-b border-[#e2e2e2] bg-[#fafafa] text-xs uppercase tracking-wide text-[#696969]"><tr><th className="w-[25%] px-4 py-3">{t('Client')}</th><th className="w-[12%] px-4 py-3">{t('Typologie')}</th><th className="w-[12%] px-4 py-3">{t('Propriétés')}</th><th className="w-[12%] px-4 py-3">{t('Projets')}</th><th className="w-[16%] px-4 py-3">{t('Produits')}</th><th className="w-[13%] px-4 py-3">Owner(s)</th><th className="w-[10%] px-4 py-3">{t('Avancement')}</th></tr></thead>
                <tbody className="divide-y divide-[#eeeeee]">{visibleClients.map(client => <tr key={client.id} className="hover:bg-[#faf8fd]"><td className="px-4 py-4"><Link href={`/onboarding/clients/${encodeURIComponent(client.id)}`} className="inline-flex items-center gap-1 font-semibold text-[#1a1a1a] hover:text-[#59319f]">{client.name}<ChevronRight size={14} aria-hidden="true" /></Link></td><td className="px-4 py-4"><span className={`rounded-md px-2 py-1 text-xs font-semibold ${typologyStyles[client.typology]}`}>{t(typologyLabel(client.typology))}</span></td><td className="px-4 py-4 text-sm tabular-nums">{client.properties.length}</td><td className="px-4 py-4 text-sm tabular-nums">{client.projects.length}</td><td className="px-4 py-4 text-xs text-[#4a4a4a]">{client.products.join(', ') || '—'}</td><td className="px-4 py-4 text-xs text-[#4a4a4a]">{client.owners.join(', ')}</td><td className="px-4 py-4"><ProgressBar value={client.progress} /></td></tr>)}</tbody>
              </table>
            </div>
            <div className="grid gap-3 lg:hidden">{visibleClients.map(client => <Link key={client.id} href={`/onboarding/clients/${encodeURIComponent(client.id)}`} className="rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><h2 className="font-bold">{client.name}</h2><span className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${typologyStyles[client.typology]}`}>{t(typologyLabel(client.typology))}</span></div><p className="mt-2 text-xs text-[#696969]">{client.properties.length} {t('propriétés')} · {client.projects.length} {t('projets')} · {client.products.join(', ') || '—'}</p><p className="mt-1 text-xs text-[#696969]">Owner(s) · {client.owners.join(', ')}</p><div className="mt-3"><ProgressBar value={client.progress} /></div></Link>)}</div>
          </>}
        </>}
      </div>
    </main>
  )
}
