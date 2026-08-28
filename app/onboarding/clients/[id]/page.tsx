'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { useParams } from 'next/navigation'
import type { ClientTypology, OnboardingProject, ProjectStatus } from '@/lib/zoho/projectsClient'
import { aggregateOnboardingClients } from '@/lib/onboarding/clientAggregation'
import { isExcludedOnboardingOwner, normalizeOnboardingProjectOwner } from '@/lib/onboarding/constants'
import { useLocale } from '@/lib/i18n/LocaleContext'

const typologyStyles: Record<ClientTypology, string> = {
  group: 'bg-[#eee7f8] text-[#59319f]',
  individual: 'bg-[#e8f1fc] text-[#2b5bb7]',
  unlinked: 'bg-[#fff7df] text-[#84550e]',
}

const statusStyles: Record<ProjectStatus, string> = {
  not_started: 'bg-[#f3f3f3] text-[#595959]',
  in_progress: 'bg-[#e8f1fc] text-[#2b5bb7]',
  pending_client: 'bg-[#fff7df] text-[#84550e]',
  live: 'bg-[#e5f8eb] text-[#1c6437]',
  blocked: 'bg-[#fff0ef] text-[#b7221b]',
  standby: 'bg-[#f3ecfb] text-[#6b3ba1]',
  other: 'bg-[#f3f3f3] text-[#696969]',
}

const statusLabels: Record<ProjectStatus, string> = {
  not_started: 'Non démarré',
  in_progress: 'En cours',
  pending_client: 'En attente client',
  live: 'Live',
  blocked: 'Bloqué',
  standby: 'Standby',
  other: 'Autre',
}

function typologyLabel(typology: ClientTypology): string {
  if (typology === 'group') return 'Groupe'
  if (typology === 'individual') return 'Individuel'
  return 'Non rattaché'
}

function clientIdMatchesRoute(clientId: string, routeId: string): boolean {
  return clientId === routeId || encodeURIComponent(clientId) === routeId
}

export default function OnboardingClientDetailPage() {
  const { t } = useLocale()
  const params = useParams<{ id: string }>()
  const clientId = params.id
  const [projects, setProjects] = useState<OnboardingProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/zoho/projects', { signal: controller.signal })
      .then(async response => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error ?? `${t('Erreur HTTP')} ${response.status}`)
        if (!Array.isArray(body.projects)) throw new Error(t('Réponse projets invalide'))
        return body.projects as OnboardingProject[]
      })
      .then(data => setProjects(data.map(normalizeOnboardingProjectOwner)))
      .catch(fetchError => {
        if (fetchError instanceof Error && fetchError.name === 'AbortError') return
        setError(fetchError instanceof Error ? fetchError.message : t('Impossible de charger ce client.'))
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [t])

  const client = useMemo(() => aggregateOnboardingClients(projects.filter(project => !isExcludedOnboardingOwner(project.ownerShort))).find(item => clientIdMatchesRoute(item.id, clientId)), [clientId, projects])

  if (loading) return <main className="min-h-screen bg-[var(--bg-canvas)] px-4 py-8"><div className="mx-auto h-80 max-w-7xl animate-pulse rounded-xl border border-[#e2e2e2] bg-white" /></main>

  if (error || !client) return (
    <main className="min-h-screen bg-[var(--bg-canvas)] px-4 py-12">
      <div className="mx-auto max-w-2xl rounded-xl border border-[#efb4b0] bg-white p-8 text-center">
        <h1 className="text-lg font-bold">{error ? t('Impossible de charger ce client.') : t('Client introuvable')}</h1>
        {error && <p className="mt-2 text-sm text-[#696969]">{error}</p>}
        <Link href="/onboarding/clients" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#59319f] hover:underline"><ArrowLeft size={15} />{t('Retour aux clients')}</Link>
      </div>
    </main>
  )

  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] text-[#1a1a1a]" style={{ fontFamily: 'var(--font-sans)' }}>
      <header className="border-b border-[#e2e2e2] bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <Link href="/onboarding/clients" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#59319f] hover:underline"><ArrowLeft size={14} />{t('Retour aux clients')}</Link>
              <div className="mt-3 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold tracking-tight">{client.name}</h1><span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${typologyStyles[client.typology]}`}>{t(typologyLabel(client.typology))}</span></div>
              <p className="mt-1 text-sm text-[#696969]">{client.properties.length} {t('propriétés')} · {client.projects.length} {t('projets')} · {client.products.length} {t('produits')}</p>
            </div>
            <nav className="inline-flex self-start rounded-lg border border-[#ded8e8] bg-[#f7f5fa] p-1" aria-label={t('Vues onboarding')}>
              <Link href="/onboarding" className="rounded-md px-3 py-1.5 text-xs font-semibold text-[#696969] hover:text-[#59319f]">{t('Liste')}</Link>
              <Link href="/onboarding/board" className="rounded-md px-3 py-1.5 text-xs font-semibold text-[#696969] hover:text-[#59319f]">Board</Link>
              <Link href="/onboarding/pilotage" className="rounded-md px-3 py-1.5 text-xs font-semibold text-[#696969] hover:text-[#59319f]">{t('Pilotage')}</Link>
              <Link href="/onboarding/clients" aria-current="page" className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-[#59319f] shadow-sm">{t('Clients')}</Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid gap-3 sm:grid-cols-3" aria-label={t('Synthèse client')}>
          <div className="rounded-xl border border-[#e2e2e2] bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-[#696969]">{t('Produits')}</p><p className="mt-2 text-sm font-semibold">{client.products.join(', ') || '—'}</p></div>
          <div className="rounded-xl border border-[#e2e2e2] bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-[#696969]">Owner(s)</p><p className="mt-2 text-sm font-semibold">{client.owners.join(', ')}</p></div>
          <div className="rounded-xl border border-[#e2e2e2] bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-[#696969]">{t('Avancement agrégé')}</p><p className="mt-2 text-2xl font-bold tabular-nums">{client.progress}%</p></div>
        </section>

        <section aria-labelledby="properties-heading">
          <h2 id="properties-heading" className="mb-3 text-lg font-bold">{t('Propriétés et produits')}</h2>
          <div className="space-y-3">{client.properties.map(property => (
            <article key={property.id} className="overflow-hidden rounded-xl border border-[#e2e2e2] bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-[#eeeeee] bg-[#fafafa] px-4 py-3"><h3 className="font-bold">{property.name}</h3><span className="text-xs text-[#696969]">{property.projects.length} {t(property.projects.length === 1 ? 'projet' : 'projets')}</span></div>
              <div className="divide-y divide-[#eeeeee]">{property.projects.map(project => (
                <div key={project.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(160px,1.5fr)_minmax(120px,1fr)_minmax(130px,1fr)_auto] sm:items-center">
                  <div><Link href={`/onboarding/${project.id}`} className="font-semibold hover:text-[#59319f] hover:underline">{project.product || t('Produit non renseigné')}</Link><p className="mt-1 text-xs text-[#696969]">{project.ownerShort || t('Non attribué')}</p></div>
                  <span className={`w-fit rounded-md px-2 py-1 text-xs font-semibold ${statusStyles[project.status]}`}>{t(statusLabels[project.status])}</span>
                  <div><div className="mb-1 flex justify-between text-xs text-[#696969]"><span>{t('Avancement')}</span><span className="font-semibold tabular-nums">{project.percentComplete}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#e8e8e8]"><div className="h-full rounded-full bg-[#59319f]" style={{ width: `${Math.min(Math.max(project.percentComplete, 0), 100)}%` }} /></div></div>
                  <div className="flex items-center gap-3"><Link href={`/onboarding/${project.id}`} className="text-xs font-semibold text-[#59319f] hover:underline">{t('Voir le détail')}</Link><a href={project.projectUrl} target="_blank" rel="noopener noreferrer" aria-label={t('Ouvrir dans Zoho')} className="text-[#696969] hover:text-[#59319f]"><ExternalLink size={15} /></a></div>
                </div>
              ))}</div>
            </article>
          ))}</div>
        </section>
      </div>
    </main>
  )
}
