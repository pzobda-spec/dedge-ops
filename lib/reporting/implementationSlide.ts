import type { readCaseMonthly } from './source'

type Cases = Awaited<ReturnType<typeof readCaseMonthly>> | null
type Metric = { label: string; value: string }
export type SlideGroup = { title: string; metrics: Metric[] }

const number = (value: number | null | undefined, suffix = '') => value == null
  ? '—'
  : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value)}${suffix}`

export function implementationSlideGroups(cases: Cases): SlideGroup[] {
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
    caseGroup('welcome', 'Welcome cases (CRM)'),
    caseGroup('setup', 'Setup cases'),
  ]
}

export function implementationSlideCopyLines(cases: Cases): string[] {
  return implementationSlideGroups(cases).map(group =>
    `${group.title} : ${group.metrics.map(metric => `${metric.label} ${metric.value}`).join(' ; ')}.`)
}
