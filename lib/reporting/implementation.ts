import { formatInTimeZone } from 'date-fns-tz'
import { TIME_ZONE } from './monthly'

export interface ReportingProject {
  id: string
  zoho_project_id: string
  actual_go_live: string | null
  zoho_status: string | null
  start_date?: string | null
  product?: string | null
  last_synced_at: string | null
}
export interface ReportingProjectEvent {
  project_id: string
  event_type: string
  occurred_at: string
  metadata: { from?: string | null; to?: string | null; zoho_status?: string | null } | null
}

export function implementationMetrics(projects: ReportingProject[], events: ReportingProjectEvent[], from: Date, to: Date, trackingStartedAt: string | null) {
  const projectIds = new Set(projects.map(project => project.id))
  const inPeriod = (value: string) => Date.parse(value) >= from.getTime() && Date.parse(value) < to.getTime()
  const firstDay = formatInTimeZone(from, TIME_ZONE, 'yyyy-MM-dd')
  const nextDay = formatInTimeZone(to, TIME_ZONE, 'yyyy-MM-dd')
  const validDay = (value: string | null) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const date = new Date(`${value}T12:00:00Z`)
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  }
  const progress = new Set<string>(), fromNotStarted = new Set<string>(), importedInProgress = new Set<string>(), observedLive = new Set<string>()
  for (const event of events) {
    if (!projectIds.has(event.project_id) || !inPeriod(event.occurred_at)) continue
    const metadata = event.metadata
    if (event.event_type === 'status_changed' && metadata?.to === 'in_progress' && metadata.from && metadata.from !== 'in_progress') {
      progress.add(event.project_id)
      if (metadata.from === 'not_started') fromNotStarted.add(event.project_id)
    }
    if (event.event_type === 'project_created' && metadata?.zoho_status === 'in_progress') importedInProgress.add(event.project_id)
    // Un import déjà Live n'est pas une transition observée (live → live ou null → live).
    if (event.event_type === 'go_live' && metadata?.to === 'live' && metadata.from && metadata.from !== 'live') observedLive.add(event.project_id)
  }
  let liveDated = 0, liveObserved = 0, liveUndated = 0
  const officialStarts = projects.filter(project => project.start_date && project.start_date >= firstDay && project.start_date < nextDay)
  for (const project of projects) {
    // Le champ Live date courant fait autorité, y compris après correction de l'événement canonique.
    if (validDay(project.actual_go_live)) {
      if (project.actual_go_live! >= firstDay && project.actual_go_live! < nextDay) liveDated++
    } else if (observedLive.has(project.id)) liveObserved++
    else if (project.zoho_status === 'live') liveUndated++
  }
  const labels: Record<string, string> = { not_started: 'Non démarré', in_progress: 'En cours', pending_client: 'En attente client', live: 'En production', blocked: 'Bloqué', standby: 'En pause', other: 'Autre' }
  const statuses = new Map<string, number>()
  projects.forEach(project => { const name = labels[project.zoho_status ?? ''] ?? 'Non renseigné'; statuses.set(name, (statuses.get(name) ?? 0) + 1) })
  return {
    in_progress: trackingStartedAt && Date.parse(trackingStartedAt) < to.getTime() ? fromNotStarted.size : null,
    official_starts: officialStarts.length,
    official_starts_crm: officialStarts.filter(project => !/dmbook/i.test(project.product ?? '')).length,
    official_starts_dmbook: officialStarts.filter(project => /dmbook/i.test(project.product ?? '')).length,
    status_transition_starts: fromNotStarted.size,
    in_progress_from_not_started: fromNotStarted.size,
    in_progress_resumed_or_other: progress.size - fromNotStarted.size,
    imported_in_progress_without_transition: [...importedInProgress].filter(id => !progress.has(id)).length,
    went_live: liveDated + liveObserved,
    live_dated: liveDated,
    live_observed_without_date: liveObserved,
    live_without_usable_date: liveUndated,
    project_count: projects.length,
    tracking_started_at: trackingStartedAt,
    tracking_covers_month: !!trackingStartedAt && Date.parse(trackingStartedAt) <= from.getTime(),
    last_synced_at: projects.map(project => project.last_synced_at).filter((value): value is string => !!value).sort().at(-1) ?? null,
    current_statuses: [...statuses].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  }
}
