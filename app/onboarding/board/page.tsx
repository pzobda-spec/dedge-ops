'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ExternalLink, RotateCcw, Search } from 'lucide-react'
import type { OnboardingProject, ProjectStatus } from '@/lib/zoho/projectsClient'
import { formatDate } from '@/lib/utils/dates'
import { IMPLEMENTATION_GROUP, isExcludedOnboardingOwner } from '@/lib/onboarding/constants'

type AttentionFilter = 'all' | 'blocked' | 'overdue' | 'high_risk'
type ScopeFilter = 'active' | 'all' | 'live'

const columns: Array<{ status: ProjectStatus; label: string; empty: string }> = [
  { status: 'not_started', label: 'Non démarré', empty: 'Aucun projet à démarrer' },
  { status: 'in_progress', label: 'En cours', empty: 'Aucun projet en cours' },
  { status: 'pending_client', label: 'En attente client', empty: 'Aucune attente client' },
  { status: 'live', label: 'Live', empty: 'Aucun projet live' },
  { status: 'blocked', label: 'Bloqué', empty: 'Aucun projet bloqué' },
  { status: 'standby', label: 'Standby', empty: 'Aucun projet en standby' },
  { status: 'other', label: 'Autre', empty: 'Aucun autre projet' },
]

const statusColors: Record<ProjectStatus, { header: string; column: string; dot: string }> = {
  not_started: { header: 'border-[#d8d8d8] bg-[#f3f3f3] text-[#595959]', column: 'bg-[#f7f7f7]', dot: 'bg-[#878787]' },
  in_progress: { header: 'border-[#b9d0ef] bg-[#e8f1fc] text-[#2b5bb7]', column: 'bg-[#f3f7fd]', dot: 'bg-[#3b72d1]' },
  pending_client: { header: 'border-[#ead7a6] bg-[#fff7df] text-[#84550e]', column: 'bg-[#fffbef]', dot: 'bg-[#d58b28]' },
  live: { header: 'border-[#a7dfba] bg-[#e5f8eb] text-[#1c6437]', column: 'bg-[#f1fbf4]', dot: 'bg-[#1D9E75]' },
  blocked: { header: 'border-[#efb4b0] bg-[#fff0ef] text-[#b7221b]', column: 'bg-[#fff8f7]', dot: 'bg-[#d64545]' },
  standby: { header: 'border-[#d8c3ec] bg-[#f3ecfb] text-[#6b3ba1]', column: 'bg-[#faf7fd]', dot: 'bg-[#8b5db3]' },
  other: { header: 'border-[#d8d8d8] bg-[#f3f3f3] text-[#696969]', column: 'bg-[#f7f7f7]', dot: 'bg-[#a1a1a1]' },
}

const productColors: Record<string, string> = {
  LoungeUp: 'bg-[#e8f1fc] text-[#2b5bb7]',
  'Dmbook Pro': 'bg-[#eee7f8] text-[#59319f]',
  WhatsApp: 'bg-[#e5f8eb] text-[#1c6437]',
  'Mobile Keys': 'bg-[#f1f1f1] text-[#696969]',
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('fr-FR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function priorityScore(project: OnboardingProject): number {
  if (project.isBlocked) return 0
  if (project.riskLevel === 'critical') return 1
  if (project.riskLevel === 'high') return 2
  if (project.isOverdue) return 3
  if (project.status === 'pending_client') return 4
  return 5
}

function compareProjects(a: OnboardingProject, b: OnboardingProject): number {
  const priority = priorityScore(a) - priorityScore(b)
  if (priority !== 0) return priority
  if (a.endDate && b.endDate && a.endDate !== b.endDate) return a.endDate.localeCompare(b.endDate)
  if (a.endDate && !b.endDate) return -1
  if (!a.endDate && b.endDate) return 1
  return a.hotelName.localeCompare(b.hotelName, 'fr', { sensitivity: 'base' })
}

function productBadge(product: string): string {
  return productColors[product] ?? 'bg-[#f1f1f1] text-[#696969]'
}

function KpiCard({ label, value, subtitle, tone = 'default' }: {
  label: string
  value: number
  subtitle: string
  tone?: 'default' | 'danger' | 'warning' | 'success'
}) {
  const toneClass = {
    default: 'text-[#1a1a1a]',
    danger: 'text-[#b7221b]',
    warning: 'text-[#903b07]',
    success: 'text-[#1c6437]',
  }[tone]

  return (
    <article className="min-w-0 rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-[0_4px_10px_rgba(36,25,55,0.05)]">
      <p className="min-h-8 text-xs font-semibold text-[#696969]">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-2 text-xs text-[#878787]">{subtitle}</p>
    </article>
  )
}

function ProjectCard({ project }: { project: OnboardingProject }) {
  const highRisk = project.riskLevel === 'high' || project.riskLevel === 'critical'
  const progress = Math.min(Math.max(project.percentComplete, 0), 100)

  return (
    <article className={`rounded-xl bg-white p-3.5 shadow-[0_3px_9px_rgba(36,25,55,0.08)] transition-shadow hover:shadow-[0_6px_16px_rgba(36,25,55,0.13)] ${project.isBlocked ? 'border-2 border-[#e46d67]' : 'border border-[#ded8e8]'}`}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/onboarding/${project.id}`} className="min-w-0 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8064b3]">
          <h3 className="line-clamp-2 text-sm font-bold leading-5 text-[#1a1a1a]">{project.hotelName}</h3>
        </Link>
        <a
          href={project.projectUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Ouvrir ${project.hotelName} dans Zoho Projects`}
          title="Ouvrir dans Zoho Projects"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[#ded8e8] text-[#696969] hover:border-[#c7b4e3] hover:bg-[#f5f0fb] hover:text-[#59319f] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8064b3]"
        >
          <ExternalLink aria-hidden="true" size={13} />
        </a>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {project.product && <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${productBadge(project.product)}`}>{project.product}</span>}
        {project.isBlocked && <span className="rounded-md bg-[#fff0ef] px-2 py-0.5 text-[11px] font-semibold text-[#b7221b]">Bloqué</span>}
        {project.isOverdue && <span className="rounded-md bg-[#fff7df] px-2 py-0.5 text-[11px] font-semibold text-[#84550e]">Go-live dépassé</span>}
        {highRisk && <span className="rounded-md bg-[#fff2e8] px-2 py-0.5 text-[11px] font-semibold text-[#903b07]">Risque {project.riskLevel === 'critical' ? 'critique' : 'élevé'}</span>}
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="text-[#878787]">Progression déclarée</span>
          <span className="font-semibold tabular-nums text-[#4a4a4a]">{progress} %</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#e7e3ea]">
          <div className={`h-full rounded-full ${project.isBlocked ? 'bg-[#d64545]' : 'bg-[#59319f]'}`} style={{ width: `${progress}%` }} />
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-[#eeeeee] pt-3 text-[11px]">
        <div className="min-w-0">
          <dt className="text-[#878787]">Owner</dt>
          <dd className="truncate font-semibold text-[#4a4a4a]">{project.ownerShort || 'Non attribué'}</dd>
        </div>
        <div className="text-right">
          <dt className="text-[#878787]">Go-live cible</dt>
          <dd className={`font-semibold tabular-nums ${project.isOverdue ? 'text-[#b7221b]' : 'text-[#4a4a4a]'}`}>
            {project.endDate ? formatDate(project.endDate) : 'Non renseigné'}
          </dd>
        </div>
      </dl>

      <Link href={`/onboarding/${project.id}`} className="mt-3 inline-flex text-xs font-semibold text-[#59319f] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8064b3]">
        Voir le détail
      </Link>
    </article>
  )
}

export default function OnboardingBoardPage() {
  const [projects, setProjects] = useState<OnboardingProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryVersion, setRetryVersion] = useState(0)
  const [scope, setScope] = useState<ScopeFilter>('active')
  const [owner, setOwner] = useState('all')
  const [product, setProduct] = useState('all')
  const [attention, setAttention] = useState<AttentionFilter>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch('/api/zoho/projects', { signal: controller.signal })
      .then(async response => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error ?? `Erreur HTTP ${response.status}`)
        if (!Array.isArray(body.projects)) throw new Error('Réponse projets invalide')
        return body.projects as OnboardingProject[]
      })
      .then(data => setProjects(data))
      .catch(fetchError => {
        if (fetchError instanceof Error && fetchError.name === 'AbortError') return
        setError(fetchError instanceof Error ? fetchError.message : 'Impossible de charger les projets.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [retryVersion])

  const baseProjects = useMemo(
    () => projects.filter(project => !isExcludedOnboardingOwner(project.ownerShort)),
    [projects],
  )
  const ownerOptions = useMemo(
    () => [...new Set([...IMPLEMENTATION_GROUP, ...baseProjects.map(project => project.ownerShort).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'fr')),
    [baseProjects],
  )
  const productOptions = useMemo(
    () => [...new Set(baseProjects.map(project => project.product).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')),
    [baseProjects],
  )

  const visibleProjects = useMemo(() => {
    const query = normalize(search.trim())
    return baseProjects.filter(project => {
      const scopeMatches = scope === 'all'
        || (scope === 'active' && project.status !== 'live' && project.status !== 'other')
        || (scope === 'live' && project.status === 'live')
      const ownerMatches = owner === 'all'
        || (owner === 'implementation'
          ? (IMPLEMENTATION_GROUP as readonly string[]).includes(project.ownerShort ?? '')
          : project.ownerShort === owner)
      const productMatches = product === 'all' || project.product === product
      const attentionMatches = attention === 'all'
        || (attention === 'blocked' && project.isBlocked)
        || (attention === 'overdue' && project.isOverdue)
        || (attention === 'high_risk' && (project.riskLevel === 'high' || project.riskLevel === 'critical'))
      const searchMatches = !query || normalize([
        project.hotelName,
        project.product,
        project.ownerShort,
        project.accountCRMName ?? '',
      ].join(' ')).includes(query)
      return scopeMatches && ownerMatches && productMatches && attentionMatches && searchMatches
    })
  }, [attention, baseProjects, owner, product, scope, search])

  const activeCount = visibleProjects.filter(project => project.status !== 'live' && project.status !== 'other').length
  const blockedCount = visibleProjects.filter(project => project.isBlocked).length
  const overdueCount = visibleProjects.filter(project => project.isOverdue).length
  const highRiskCount = visibleProjects.filter(project => project.riskLevel === 'high' || project.riskLevel === 'critical').length
  const portfolioLabel = scope === 'active' ? 'Projets actifs' : scope === 'live' ? 'Projets Live' : 'Projets affichés'
  const portfolioValue = scope === 'active' ? activeCount : visibleProjects.length
  const portfolioSubtitle = scope === 'active' ? 'Hors Live et Autre' : scope === 'live' ? 'Statut Live' : 'Tous statuts distincts'
  const hasFilters = scope !== 'active' || owner !== 'all' || product !== 'all' || attention !== 'all' || Boolean(search.trim())

  function resetFilters() {
    setScope('active')
    setOwner('all')
    setProduct('all')
    setAttention('all')
    setSearch('')
  }

  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] text-[#1a1a1a]" style={{ fontFamily: 'var(--font-sans)' }}>
      <header className="border-b border-[#e2e2e2] bg-white">
        <div className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8064b3]">Onboarding</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Board projets</h1>
          <p className="mt-1 text-sm text-[#696969]">
            {loading ? 'Chargement des projets…' : error ? 'Données indisponibles' : `${baseProjects.length} projets · ${new Set(baseProjects.map(project => project.hotelName)).size} comptes`}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-[1800px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {loading ? (
          <div className="space-y-5" aria-busy="true" aria-live="polite">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl border border-[#e2e2e2] bg-white" />)}
            </div>
            <div className="h-96 animate-pulse rounded-xl border border-[#e2e2e2] bg-white" />
          </div>
        ) : error ? (
          <div role="alert" className="flex flex-col gap-3 rounded-xl border border-[#efb4b0] bg-[#fff8f7] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-[#8f211d]">Impossible de charger le board.</p>
              <p className="mt-1 text-sm text-[#a33b36]">{error}</p>
            </div>
            <button type="button" onClick={() => setRetryVersion(value => value + 1)} className="self-start rounded-lg border border-[#d98984] bg-white px-3 py-2 text-xs font-semibold text-[#8f211d] hover:bg-[#fff1f0] sm:self-auto">
              Réessayer
            </button>
          </div>
        ) : (
          <>
            <section aria-label="Indicateurs du board" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard label={portfolioLabel} value={portfolioValue} subtitle={portfolioSubtitle} />
              <KpiCard label="À débloquer" value={blockedCount} subtitle="Statut Bloqué" tone={blockedCount > 0 ? 'danger' : 'success'} />
              <KpiCard label="Go-live dépassé" value={overdueCount} subtitle="Cible passée, hors Live" tone={overdueCount > 0 ? 'danger' : 'success'} />
              <KpiCard label="Risque élevé ou critique" value={highRiskCount} subtitle="Selon le niveau déclaré" tone={highRiskCount > 0 ? 'warning' : 'success'} />
            </section>

            <section aria-label="Filtres du board" className="rounded-xl border border-[#ded8e8] bg-white p-4 shadow-[0_4px_10px_rgba(36,25,55,0.04)]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold">Projets</h2>
                  <p className="mt-0.5 text-xs text-[#696969]">{visibleProjects.length} sur {baseProjects.length}</p>
                </div>
                {hasFilters && (
                  <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#59319f] hover:underline">
                    <RotateCcw aria-hidden="true" size={13} /> Réinitialiser
                  </button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(260px,2fr)_repeat(4,minmax(150px,1fr))]">
                <label className="block min-w-0">
                  <span className="mb-1 block text-xs font-semibold text-[#4a4a4a]">Rechercher</span>
                  <span className="relative block">
                    <Search aria-hidden="true" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a8a8a]" />
                    <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Hôtel, compte, produit…" className="w-full rounded-lg border border-[#d8d8d8] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#8064b3] focus:ring-2 focus:ring-[#e6dcf5]" />
                  </span>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[#4a4a4a]">Périmètre</span>
                  <select value={scope} onChange={event => setScope(event.target.value as ScopeFilter)} className="w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#8064b3] focus:ring-2 focus:ring-[#e6dcf5]">
                    <option value="active">Projets actifs</option>
                    <option value="all">Tous les projets</option>
                    <option value="live">Projets Live</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[#4a4a4a]">Owner</span>
                  <select value={owner} onChange={event => setOwner(event.target.value)} className="w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#8064b3] focus:ring-2 focus:ring-[#e6dcf5]">
                    <option value="all">Tous les owners</option>
                    <option value="implementation">Équipe Implémentation</option>
                    {ownerOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[#4a4a4a]">Produit</span>
                  <select value={product} onChange={event => setProduct(event.target.value)} className="w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#8064b3] focus:ring-2 focus:ring-[#e6dcf5]">
                    <option value="all">Tous les produits</option>
                    {productOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[#4a4a4a]">Attention requise</span>
                  <select value={attention} onChange={event => setAttention(event.target.value as AttentionFilter)} className="w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#8064b3] focus:ring-2 focus:ring-[#e6dcf5]">
                    <option value="all">Tous les projets</option>
                    <option value="blocked">Bloqués</option>
                    <option value="overdue">Go-live dépassé</option>
                    <option value="high_risk">Risque élevé ou critique</option>
                  </select>
                </label>
              </div>
            </section>

            {visibleProjects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#d8d8d8] bg-white px-5 py-12 text-center">
                <AlertTriangle aria-hidden="true" className="mx-auto text-[#a1a1a1]" size={22} />
                <p className="mt-3 text-sm font-semibold text-[#4a4a4a]">Aucun projet ne correspond à ces filtres.</p>
                <button type="button" onClick={resetFilters} className="mt-2 text-xs font-semibold text-[#59319f] hover:underline">Réinitialiser les filtres</button>
              </div>
            ) : (
              <section aria-label="Board par statut" className="overflow-x-auto pb-3">
                <div className="flex min-w-max snap-x snap-mandatory gap-4">
                  {columns.map(column => {
                    const items = visibleProjects.filter(project => project.status === column.status).sort(compareProjects)
                    const colors = statusColors[column.status]
                    return (
                      <section key={column.status} aria-labelledby={`board-${column.status}`} className="w-[285px] shrink-0 snap-start">
                        <div className={`flex items-center justify-between rounded-t-xl border border-b-0 px-3.5 py-2.5 ${colors.header}`}>
                          <h2 id={`board-${column.status}`} className="flex items-center gap-2 text-xs font-bold">
                            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${colors.dot}`} />
                            {column.label}
                          </h2>
                          <span className="rounded-full bg-white/75 px-2 py-0.5 text-xs font-bold tabular-nums">{items.length}</span>
                        </div>
                        <div className={`min-h-36 space-y-2.5 rounded-b-xl border border-t-0 p-2.5 ${colors.column}`}>
                          {items.length === 0
                            ? <p className="px-3 py-8 text-center text-xs text-[#a1a1a1]">{column.empty}</p>
                            : items.map(project => <ProjectCard key={project.id} project={project} />)}
                        </div>
                      </section>
                    )
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}
