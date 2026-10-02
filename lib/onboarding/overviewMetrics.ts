import type { OnboardingProject } from '@/lib/zoho/projectsClient'

export interface OnboardingOverviewMetrics {
  active: number
  inProgress: number
  pending: number
  blocked: number
  standby: number
  starts: number
  goLives: number
  averageTtvDays: number | null
  ttvSamples: number
  ttvExcludedOverSixMonths: number
}

/** Current Zoho statuses, plus a go-live cohort based on the Zoho Live date field. */
export function getOnboardingOverviewMetrics(
  projects: readonly OnboardingProject[],
  month: string,
): OnboardingOverviewMetrics {
  const metrics: OnboardingOverviewMetrics = {
    active: 0,
    inProgress: 0,
    pending: 0,
    blocked: 0,
    standby: 0,
    starts: 0,
    goLives: 0,
    averageTtvDays: null,
    ttvSamples: 0,
    ttvExcludedOverSixMonths: 0,
  }
  let ttvTotalDays = 0

  for (const project of projects) {
    switch (project.status) {
      case 'in_progress': metrics.inProgress += 1; metrics.active += 1; break
      case 'pending_client': metrics.pending += 1; metrics.active += 1; break
      case 'blocked': metrics.blocked += 1; break
      case 'standby': metrics.standby += 1; break
    }

    if (project.startDate?.startsWith(`${month}-`)) metrics.starts += 1

    if (!project.actualGoLiveDate?.startsWith(`${month}-`)) continue
    metrics.goLives += 1

    if (!project.startDate) continue
    const [year, monthNumber, day] = project.startDate.split('-').map(Number)
    const lastDayOfCutoffMonth = new Date(Date.UTC(year, monthNumber + 6, 0)).getUTCDate()
    const sixMonthCutoff = Date.UTC(year, monthNumber + 5, Math.min(day, lastDayOfCutoffMonth))
    const liveTime = Date.parse(`${project.actualGoLiveDate}T00:00:00Z`)
    if (Number.isFinite(sixMonthCutoff) && liveTime > sixMonthCutoff) {
      metrics.ttvExcludedOverSixMonths += 1
      continue
    }
    const days = (liveTime - Date.parse(`${project.startDate}T00:00:00Z`)) / 86_400_000
    if (!Number.isFinite(days) || days < 0) continue
    ttvTotalDays += days
    metrics.ttvSamples += 1
  }

  if (metrics.ttvSamples > 0) metrics.averageTtvDays = ttvTotalDays / metrics.ttvSamples
  return metrics
}
