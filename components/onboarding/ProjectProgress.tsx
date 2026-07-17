'use client'

import type { ProjectEvent, ProjectEventType } from '@/lib/onboarding/events'

const PROGRESS_BY_EVENT: Partial<Record<ProjectEventType, number>> = {
  project_created: 5,
  first_contact_call: 15,
  kickoff_completed: 30,
  content_received: 50,
  implementation_completed: 70,
  v1_delivered: 85,
  go_live: 100,
}

export default function ProjectProgress({
  timeline,
  zohoStatus,
}: {
  timeline: ProjectEvent[]
  zohoStatus?: string | null
}) {
  const timelineProgress = timeline.reduce((max, event) => {
    return Math.max(max, PROGRESS_BY_EVENT[event.event_type] ?? 0)
  }, 0)
  // Zoho is the source of truth: a Live project is complete even when its
  // historical go-live event has not been backfilled yet.
  const progress = zohoStatus === 'live' ? 100 : timelineProgress
  const isBlocked = timeline.some(event => event.event_type === 'project_blocked') || zohoStatus === 'blocked'

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Progression</p>
          <p className="text-sm font-medium text-slate-900 mt-1">{progress}% complet</p>
        </div>
        <div className="flex items-center gap-2">
          {zohoStatus && (
            <span className="text-xs font-medium px-2 py-1 rounded bg-slate-100 text-slate-600">
              {zohoStatus}
            </span>
          )}
          {isBlocked && (
            <span className="text-xs font-medium px-2 py-1 rounded bg-red-100 text-red-700">
              Bloqué
            </span>
          )}
        </div>
      </div>
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isBlocked ? 'bg-red-500' : 'bg-emerald-500'}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
