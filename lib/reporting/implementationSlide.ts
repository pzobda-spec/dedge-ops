import type { readCaseMonthly, readImplementation } from './source'

type Projects = Awaited<ReturnType<typeof readImplementation>> | null
type Cases = Awaited<ReturnType<typeof readCaseMonthly>> | null
type Metric = { label: string; value: string }
export type SlideGroup = { title: string; metrics: Metric[] }

const number = (value: number | null | undefined, suffix = '') => value == null
  ? '—'
  : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value)}${suffix}`

export function implementationSlideGroups(projects: Projects, cases: Cases): SlideGroup[] {
  const started = projects?.official_starts_crm ?? null
  const live = projects?.crm_went_live ?? null
  const statuses = projects?.crm_current_statuses
  const caseGroup = (type: 'welcome' | 'setup', title: string): SlideGroup => {
    const row = cases?.[type]
    return { title, metrics: [
      { label: 'Opened', value: number(row?.opened) },
      { label: 'Closed', value: number(row?.closed) },
      { label: 'Closed / opened (%)', value: number(row?.closed_opened_pct, ' %') },
      { label: 'Average age', value: number(row?.avg_age_days, ' j') },
    ] }
  }
  return [
    { title: 'Zoho Projects (new)', metrics: [
      { label: 'Started', value: number(started) },
      { label: 'Live', value: number(live) },
      { label: 'Started / Live (%)', value: number(started == null || !live ? null : started / live * 100, ' %') },
      { label: 'Average age', value: number(projects?.crm_live_average_age_days, ' j') },
    ] },
    { title: 'Zoho Projects (current)', metrics: [
      { label: 'Blocked', value: number(statuses?.blocked) },
      { label: 'Standby', value: number(statuses?.standby) },
      { label: 'Pending', value: number(statuses?.pending_client) },
      { label: 'In Progress', value: number(statuses?.in_progress) },
    ] },
    caseGroup('welcome', 'Welcome cases (CRM)'),
    caseGroup('setup', 'Setup cases'),
  ]
}

export function implementationSlideCopyLines(projects: Projects, cases: Cases): string[] {
  return implementationSlideGroups(projects, cases).map(group =>
    `${group.title} : ${group.metrics.map(metric => `${metric.label} ${metric.value}`).join(' ; ')}.`)
}
