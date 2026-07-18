'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import Badge from '@/components/ui/Badge'
import type { AcuitySession } from '@/lib/acuity/client'

type TrainingSession = AcuitySession & {
  id?: string
  totalNoShow?: number
}

type Period = 'week' | '3m' | '6m' | 'all'
type LanguageFilter = 'all' | AcuitySession['language']
type StatusFilter = 'all' | AcuitySession['status']
type ParticipantStatus = AcuitySession['participants'][number]['status']

interface CopyFeedback {
  sessionKey: string
  status: 'success' | 'error'
}

interface SessionStats {
  totalSessions: number
  completedSessions: number
  scheduledSessions: number
  cancelledSessions: number
  activeRegistrations: number
  representedHotels: number
  averageRegistrations: number
  cancelledRegistrations: number
  cancellationRate: number
  noShows: number
}

const periodOptions: Array<{ value: Period; label: string }> = [
  { value: 'week', label: 'Vue hebdomadaire' },
  { value: '3m', label: 'Depuis 3 mois' },
  { value: '6m', label: 'Depuis 6 mois' },
  { value: 'all', label: 'Tout' },
]

const statusLabels: Record<AcuitySession['status'], string> = {
  scheduled: 'À venir',
  completed: 'Passée',
  cancelled: 'Annulée',
}

const statusColors: Record<AcuitySession['status'], string> = {
  scheduled: 'border-[#b9d0ef] bg-[#e8f1fc] text-[#2b5bb7]',
  completed: 'border-[#a7dfba] bg-[#e5f8eb] text-[#1c6437]',
  cancelled: 'border-[#d2d2d2] bg-[#f1f1f1] text-[#696969]',
}

const participantStatusColors: Record<ParticipantStatus, string> = {
  registered: 'text-[#1c6437]',
  cancelled: 'text-[#878787] line-through',
  no_show: 'font-medium text-[#903b07]',
}

const participantStatusLabels: Record<ParticipantStatus, string> = {
  registered: 'Inscrit',
  cancelled: 'Annulé',
  no_show: 'Absent/no-show',
}

function sessionKey(session: TrainingSession): string {
  return session.id ?? String(session.classID)
}

function sessionDomId(session: TrainingSession): string {
  return sessionKey(session).replace(/[^a-zA-Z0-9_-]/g, '-')
}

function registeredHotels(session: TrainingSession): string[] {
  return [...new Set(
    session.participants
      .filter(participant => participant.status === 'registered')
      .map(participant => participant.hotelName.trim())
      .filter(Boolean),
  )]
}

function noShowCount(session: TrainingSession): number {
  return Number.isFinite(session.totalNoShow) ? Math.max(0, session.totalNoShow ?? 0) : 0
}

function localIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getWeekDateRange() {
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const daysToMonday = startOfToday.getDay() === 0 ? 6 : startOfToday.getDay() - 1
  const thisMonday = new Date(startOfToday)
  thisMonday.setDate(startOfToday.getDate() - daysToMonday)
  const previousMonday = new Date(thisMonday)
  previousMonday.setDate(thisMonday.getDate() - 7)
  const previousSunday = new Date(thisMonday)
  previousSunday.setDate(thisMonday.getDate() - 1)
  const thisSunday = new Date(thisMonday)
  thisSunday.setDate(thisMonday.getDate() + 6)

  return {
    previousMonday: localIsoDate(previousMonday),
    previousSunday: localIsoDate(previousSunday),
    thisMonday: localIsoDate(thisMonday),
    thisSunday: localIsoDate(thisSunday),
  }
}

function formatWeekDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(`${iso}T12:00:00`))
}

function buildSessionsUrl(period: Period): string {
  if (period === 'week') {
    const { previousMonday, thisSunday } = getWeekDateRange()
    return `/api/acuity/sessions?minDate=${previousMonday}&maxDate=${thisSunday}`
  }
  if (period === 'all') return '/api/acuity/sessions?period=all'
  return `/api/acuity/sessions?period=recent&months=${period === '3m' ? 3 : 6}`
}

function buildCalendarUrl(session: TrainingSession): string {
  const start = new Date(session.datetime)
  const end = new Date(start.getTime() + session.duration * 60 * 1000)
  const formatCalendarDate = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const registeredParticipants = session.participants.filter(participant => participant.status === 'registered')
  const details = [
    `Formation D-EDGE CRM — ${session.language}`,
    `Animateur : ${session.calendar}`,
    '',
    'Participants :',
    ...registeredParticipants.map(participant => (
      `- ${participant.firstName} ${participant.lastName} (${participant.hotelName}) <${participant.email}>`
    )),
  ].join('\n')

  return `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: 'TEMPLATE',
    text: session.title,
    dates: `${formatCalendarDate(start)}/${formatCalendarDate(end)}`,
    details,
    add: registeredParticipants.map(participant => participant.email).join(','),
  })}`
}

function normalizeSearch(value: string): string {
  return value
    .toLocaleLowerCase('fr-FR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function sessionMatchesSearch(session: TrainingSession, query: string): boolean {
  if (!query) return true
  const participantText = session.participants.flatMap(participant => [
    participant.firstName,
    participant.lastName,
    participant.email,
    participant.hotelName,
  ])
  return normalizeSearch([
    session.title,
    session.theme,
    session.calendar,
    session.language,
    ...participantText,
  ].join(' ')).includes(query)
}

function computeStats(sessions: TrainingSession[]): SessionStats {
  const countedSessions = sessions.filter(session => !session.isDraft)
  const hotels = new Set<string>()
  const nonCancelledSessions = countedSessions.filter(session => session.status !== 'cancelled')
  let activeRegistrations = 0
  let cancelledRegistrations = 0
  let noShows = 0

  for (const session of countedSessions) {
    activeRegistrations += session.totalRegistered
    cancelledRegistrations += session.totalCancelled
    noShows += noShowCount(session)
    registeredHotels(session).forEach(hotel => hotels.add(hotel))
  }

  const cancellationBase = activeRegistrations + cancelledRegistrations + noShows
  return {
    totalSessions: countedSessions.length,
    completedSessions: countedSessions.filter(session => session.status === 'completed').length,
    scheduledSessions: countedSessions.filter(session => session.status === 'scheduled').length,
    cancelledSessions: countedSessions.filter(session => session.status === 'cancelled').length,
    activeRegistrations,
    representedHotels: hotels.size,
    averageRegistrations: nonCancelledSessions.length > 0 ? activeRegistrations / nonCancelledSessions.length : 0,
    cancelledRegistrations,
    cancellationRate: cancellationBase > 0 ? (cancelledRegistrations / cancellationBase) * 100 : 0,
    noShows,
  }
}

function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits }).format(value)
}

function plural(value: number, singular: string, pluralForm = `${singular}s`): string {
  return value === 1 ? singular : pluralForm
}

function StatusBadge({ status }: { status: AcuitySession['status'] }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusColors[status]}`}>
      {statusLabels[status]}
    </span>
  )
}

function KpiCard({
  label,
  value,
  subtitle,
  detail,
}: {
  label: string
  value: string
  subtitle: string
  detail?: string
}) {
  return (
    <article className="min-w-0 rounded-xl border border-[#e2e2e2] bg-white p-4 shadow-[0_4px_10px_rgba(36,25,55,0.05)]">
      <p className="min-h-8 text-xs font-semibold text-[#696969]">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-[#1a1a1a] tabular-nums">{value}</p>
      <p className="mt-2 text-xs text-[#696969]">{subtitle}</p>
      {detail && <p className="mt-0.5 text-[11px] text-[#8a8a8a]">{detail}</p>}
    </article>
  )
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
    >
      <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function AgendaAction({ session }: { session: TrainingSession }) {
  if (session.status !== 'scheduled') return null
  return (
    <a
      href={buildCalendarUrl(session)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#59319f] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#3f2175] focus:outline-none focus:ring-2 focus:ring-[#8064b3] focus:ring-offset-2"
    >
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 2v3m8-3v3M3 9h18M5 4h14a2 2 0 012 2v14H3V6a2 2 0 012-2Z" />
      </svg>
      Préparer dans Google Agenda
    </a>
  )
}

function SessionDetail({
  session,
  copyFeedback,
  onCopyHotels,
}: {
  session: TrainingSession
  copyFeedback: CopyFeedback | null
  onCopyHotels: (session: TrainingSession) => void
}) {
  const hotels = registeredHotels(session)
  const key = sessionKey(session)
  const feedback = copyFeedback?.sessionKey === key ? copyFeedback.status : null
  const noShows = noShowCount(session)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#696969]">
          <span>{session.totalRegistered} {plural(session.totalRegistered, 'inscription active')}</span>
          <span aria-hidden="true">·</span>
          <span>{session.totalCancelled} {plural(session.totalCancelled, 'annulation')}</span>
          <span aria-hidden="true">·</span>
          <span>{noShows} no-show</span>
          {session.capacity != null && (
            <>
              <span aria-hidden="true">·</span>
              <span>{session.capacity} places · {session.availableSlots ?? Math.max(0, session.capacity - session.totalRegistered)} restantes</span>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {hotels.length > 0 && (
            <button
              type="button"
              onClick={() => onCopyHotels(session)}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#8064b3] focus:ring-offset-2 ${feedback === 'error' ? 'border-[#efb4b0] bg-[#fff5f4] text-[#b7221b]' : 'border-[#ded8e8] bg-white text-[#59319f] hover:bg-[#f7f3fc]'}`}
            >
              {feedback === 'success'
                ? 'Hôtels copiés !'
                : feedback === 'error'
                  ? 'Copie impossible'
                  : `Copier les hôtels (${hotels.length})`}
            </button>
          )}
          <AgendaAction session={session} />
        </div>
      </div>

      {session.participants.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#d8d8d8] px-4 py-6 text-center text-sm text-[#878787]">
          {session.isDraft
            ? 'Brouillon privé : cette session n’est pas encore réservable.'
            : 'Aucun participant pour cette session.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[#ded8e8] bg-white">
          <div className="hidden grid-cols-[minmax(150px,1fr)_minmax(170px,1fr)_minmax(220px,1.4fr)_90px] gap-3 border-b border-[#e2e2e2] bg-[#f7f7f7] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#696969] lg:grid">
            <span>Hôtel</span>
            <span>Participant</span>
            <span>Email</span>
            <span>Statut</span>
          </div>
          <div className="divide-y divide-[#eeeeee]">
            {session.participants.map(participant => {
              const duplicate = Boolean(participant.hotelName) && session.duplicateHotels.includes(participant.hotelName)
              return (
                <div
                  key={participant.id}
                  className={`grid gap-1 px-3 py-3 text-sm lg:grid-cols-[minmax(150px,1fr)_minmax(170px,1fr)_minmax(220px,1.4fr)_90px] lg:items-center lg:gap-3 ${duplicate ? 'bg-[#fff7ed]' : 'bg-white'}`}
                >
                  <div className="min-w-0">
                    <span className="mr-2 text-[10px] font-semibold uppercase text-[#8a8a8a] lg:hidden">Hôtel</span>
                    <span className={duplicate ? 'font-semibold text-[#903b07]' : 'text-[#4a4a4a]'}>
                      {participant.hotelName || 'Non renseigné'}
                    </span>
                    {duplicate && <span className="ml-1.5 text-[10px] font-semibold text-[#903b07]">doublon</span>}
                  </div>
                  <div className={participantStatusColors[participant.status]}>
                    <span className="mr-2 text-[10px] font-semibold uppercase text-[#8a8a8a] lg:hidden">Participant</span>
                    {participant.firstName} {participant.lastName}
                  </div>
                  <div className={`min-w-0 break-all text-xs ${participantStatusColors[participant.status]}`}>
                    <span className="mr-2 text-[10px] font-semibold uppercase text-[#8a8a8a] lg:hidden">Email</span>
                    {participant.email}
                  </div>
                  <div className={`text-xs ${participantStatusColors[participant.status]}`}>
                    <span className="mr-2 text-[10px] font-semibold uppercase text-[#8a8a8a] lg:hidden">Statut</span>
                    {participantStatusLabels[participant.status]}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

interface SessionListProps {
  sessions: TrainingSession[]
  expandedId: string | null
  copyFeedback: CopyFeedback | null
  onToggle: (session: TrainingSession) => void
  onCopyHotels: (session: TrainingSession) => void
}

function DesktopSessionTable({
  sessions,
  expandedId,
  copyFeedback,
  onToggle,
  onCopyHotels,
}: SessionListProps) {
  return (
    <div className="hidden overflow-hidden rounded-xl border border-[#e2e2e2] bg-white shadow-[0_4px_10px_rgba(36,25,55,0.05)] lg:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <caption className="sr-only">Liste des sessions de formation</caption>
          <thead className="border-b border-[#e2e2e2] bg-[#f7f7f7]">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#696969]">Session</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#696969]">Animateur</th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#696969]">Inscriptions / capacité</th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#696969]">Hôtels représentés</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#696969]">Statut</th>
              <th scope="col" className="w-16 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#696969]">Détails</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eeeeee]">
            {sessions.map(session => {
              const key = sessionKey(session)
              const expanded = expandedId === key
              const detailId = `training-detail-desktop-${sessionDomId(session)}`
              return (
                <Fragment key={key}>
                  <tr className={expanded ? 'bg-[#faf8fd]' : 'bg-white hover:bg-[#faf8fd]'}>
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="w-[92px] shrink-0">
                          <p className="font-semibold text-[#1a1a1a]">{session.date}</p>
                          <p className="mt-0.5 text-xs text-[#696969]">{session.time}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-[#1a1a1a]">{session.title}</p>
                          <div className="mt-1">
                            <Badge label={session.language} variant={session.language.toLowerCase() as 'fr' | 'en' | 'es'} />
                            {session.visibility === 'private' && <span className="ml-2 inline-flex rounded-full border border-[#ead5a7] bg-[#fff8e8] px-2 py-0.5 text-[10px] font-semibold text-[#84550e]">Privée</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[#4a4a4a]">{session.calendar}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-[#1a1a1a]">
                      {session.totalRegistered}{session.capacity != null ? ` / ${session.capacity}` : ''}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#4a4a4a]">{registeredHotels(session).length}</td>
                    <td className="px-4 py-3"><StatusBadge status={session.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={detailId}
                        aria-label={`${expanded ? 'Masquer' : 'Afficher'} les inscriptions de ${session.title}`}
                        onClick={() => onToggle(session)}
                        className="inline-grid h-9 w-9 place-items-center rounded-lg border border-[#ded8e8] text-[#59319f] transition-colors hover:bg-[#f2ecfb] focus:outline-none focus:ring-2 focus:ring-[#8064b3] focus:ring-offset-2"
                      >
                        <Chevron expanded={expanded} />
                      </button>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="bg-[#faf8fd]">
                      <td colSpan={6} className="px-4 py-4">
                        <div id={detailId}>
                          <SessionDetail session={session} copyFeedback={copyFeedback} onCopyHotels={onCopyHotels} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MobileSessionCards({
  sessions,
  expandedId,
  copyFeedback,
  onToggle,
  onCopyHotels,
}: SessionListProps) {
  return (
    <div className="space-y-3 lg:hidden">
      {sessions.map(session => {
        const key = sessionKey(session)
        const expanded = expandedId === key
        const detailId = `training-detail-mobile-${sessionDomId(session)}`
        return (
          <article key={key} className="overflow-hidden rounded-xl border border-[#e2e2e2] bg-white shadow-[0_4px_10px_rgba(36,25,55,0.05)]">
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#696969]">{session.date} · {session.time}</p>
                  <h3 className="mt-1 font-semibold text-[#1a1a1a]">{session.title}</h3>
                  <div className="mt-2"><Badge label={session.language} variant={session.language.toLowerCase() as 'fr' | 'en' | 'es'} /></div>
                  {session.visibility === 'private' && <span className="mt-2 inline-flex rounded-full border border-[#ead5a7] bg-[#fff8e8] px-2 py-0.5 text-[10px] font-semibold text-[#84550e]">Privée</span>}
                </div>
                <StatusBadge status={session.status} />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-[#eeeeee] py-3 text-sm">
                <div className="col-span-2">
                  <dt className="text-xs text-[#878787]">Animateur</dt>
                  <dd className="mt-0.5 font-medium text-[#4a4a4a]">{session.calendar}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#878787]">Inscriptions / capacité</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-[#1a1a1a]">
                    {session.totalRegistered}{session.capacity != null ? ` / ${session.capacity}` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#878787]">Hôtels représentés</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-[#1a1a1a]">{registeredHotels(session).length}</dd>
                </div>
              </dl>

              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={detailId}
                onClick={() => onToggle(session)}
                className="mt-3 flex w-full items-center justify-between rounded-lg px-1 py-1 text-sm font-semibold text-[#59319f] focus:outline-none focus:ring-2 focus:ring-[#8064b3] focus:ring-offset-2"
              >
                <span>{expanded ? 'Masquer les inscriptions' : 'Voir les inscriptions'}</span>
                <Chevron expanded={expanded} />
              </button>
            </div>
            {expanded && (
              <div id={detailId} className="border-t border-[#e2e2e2] bg-[#faf8fd] p-4">
                <SessionDetail session={session} copyFeedback={copyFeedback} onCopyHotels={onCopyHotels} />
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

function SessionList(props: SessionListProps) {
  return (
    <>
      <DesktopSessionTable {...props} />
      <MobileSessionCards {...props} />
    </>
  )
}

function EmptySessions({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-[#d8d8d8] bg-white px-5 py-12 text-center">
      <p className="text-sm font-semibold text-[#4a4a4a]">
        {filtered ? 'Aucune session ne correspond à ces filtres.' : 'Aucune session trouvée pour cette période.'}
      </p>
      {filtered && <p className="mt-1 text-xs text-[#878787]">Modifiez ou réinitialisez les filtres pour élargir les résultats.</p>}
    </div>
  )
}

export default function TrainingsPage() {
  const [period, setPeriod] = useState<Period>('3m')
  const [sessions, setSessions] = useState<TrainingSession[]>([])
  const [sourceTruncated, setSourceTruncated] = useState(false)
  const [sourceDegraded, setSourceDegraded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryVersion, setRetryVersion] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [language, setLanguage] = useState<LanguageFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [animator, setAnimator] = useState('all')
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null)
  const requestSequence = useRef(0)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const requestId = ++requestSequence.current
    setLoading(true)
    setError(null)
    setExpandedId(null)
    setSourceTruncated(false)
    setSourceDegraded(false)

    async function loadSessions() {
      try {
        const response = await fetch(buildSessionsUrl(period), { signal: controller.signal })
        if (!response.ok) {
          const body = await response.json().catch(() => ({ error: response.statusText }))
          throw new Error(body.error ?? response.statusText)
        }
        const body = await response.json() as { sessions?: unknown; meta?: { truncated?: boolean; degraded?: boolean } }
        if (!Array.isArray(body.sessions)) throw new Error('Réponse Acuity invalide')
        if (requestId === requestSequence.current) {
          setSessions(body.sessions as TrainingSession[])
          setSourceTruncated(
            body.meta?.truncated === true || response.headers.get('X-Acuity-Truncated') === 'true',
          )
          setSourceDegraded(body.meta?.degraded === true)
        }
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return
        if (requestId === requestSequence.current) {
          setSessions([])
          setError(loadError instanceof Error ? loadError.message : 'Erreur inconnue')
        }
      } finally {
        if (requestId === requestSequence.current) setLoading(false)
      }
    }

    loadSessions()
    return () => controller.abort()
  }, [period, retryVersion])

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current)
  }, [])

  const animatorOptions = useMemo(() => (
    [...new Set(sessions.map(session => session.calendar).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'fr'))
  ), [sessions])

  useEffect(() => {
    if (animator !== 'all' && !animatorOptions.includes(animator)) setAnimator('all')
  }, [animator, animatorOptions])

  const normalizedQuery = normalizeSearch(search.trim())
  const filteredSessions = useMemo(() => sessions.filter(session => (
    sessionMatchesSearch(session, normalizedQuery)
    && (language === 'all' || session.language === language)
    && (status === 'all' || session.status === status)
    && (animator === 'all' || session.calendar === animator)
  )), [animator, language, normalizedQuery, sessions, status])

  const stats = useMemo(() => computeStats(filteredSessions), [filteredSessions])
  const draftCount = sessions.filter(session => session.isDraft).length
  const hasFilters = Boolean(search.trim()) || language !== 'all' || status !== 'all' || animator !== 'all'

  function resetFilters() {
    setSearch('')
    setLanguage('all')
    setStatus('all')
    setAnimator('all')
  }

  function toggleSession(session: TrainingSession) {
    const key = sessionKey(session)
    setExpandedId(current => current === key ? null : key)
  }

  async function copyHotels(session: TrainingSession) {
    const key = sessionKey(session)
    try {
      await navigator.clipboard.writeText(registeredHotels(session).join('\n'))
      setCopyFeedback({ sessionKey: key, status: 'success' })
    } catch {
      setCopyFeedback({ sessionKey: key, status: 'error' })
    }
    if (copyTimer.current) clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopyFeedback(null), 2500)
  }

  const sessionSubtitle = [
    `${stats.completedSessions} ${plural(stats.completedSessions, 'passée')}`,
    `${stats.scheduledSessions} à venir`,
    stats.cancelledSessions > 0 ? `${stats.cancelledSessions} ${plural(stats.cancelledSessions, 'annulée')}` : null,
  ].filter(Boolean).join(' · ')

  const weekRange = getWeekDateRange()
  const previousWeekSessions = filteredSessions
    .filter(session => {
      const day = localIsoDate(new Date(session.datetime))
      return day >= weekRange.previousMonday && day <= weekRange.previousSunday
    })
    .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
  const currentWeekSessions = filteredSessions
    .filter(session => {
      const day = localIsoDate(new Date(session.datetime))
      return day >= weekRange.thisMonday && day <= weekRange.thisSunday
    })
    .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
  const regularSessions = [...filteredSessions].sort((a, b) => (
    new Date(b.datetime).getTime() - new Date(a.datetime).getTime()
  ))

  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] text-[#1a1a1a]" style={{ fontFamily: 'var(--font-sans)' }}>
      <header className="border-b border-[#e2e2e2] bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8064b3]">Opérations</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Formations</h1>
            <p className="mt-1 text-sm text-[#696969]">
              {loading
                ? 'Chargement des sessions…'
                : error
                  ? 'Données indisponibles'
                  : `${stats.totalSessions} ${plural(stats.totalSessions, 'session')} sur la période${draftCount > 0 ? ` · ${draftCount} brouillon${draftCount > 1 ? 's' : ''} privé${draftCount > 1 ? 's' : ''}` : ''}`}
            </p>
          </div>

          <div className="flex max-w-full items-center gap-3 overflow-x-auto pb-1 lg:pb-0">
            <div role="group" aria-label="Période des formations" className="inline-flex min-w-max items-center gap-1 rounded-xl bg-[#f4f1f8] p-1">
              {periodOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={period === option.value}
                  onClick={() => setPeriod(option.value)}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#8064b3] focus:ring-offset-1 ${period === option.value ? 'bg-white text-[#59319f] shadow-sm' : 'text-[#696969] hover:text-[#3f2175]'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {loading && (
          <div className="space-y-6" aria-live="polite" aria-busy="true">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-xl border border-[#e2e2e2] bg-white" />)}
            </div>
            <div className="h-72 animate-pulse rounded-xl border border-[#e2e2e2] bg-white" />
          </div>
        )}

        {!loading && error && (
          <div role="alert" className="flex flex-col gap-3 rounded-xl border border-[#efc5c2] bg-[#fff8f8] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#8f2822]">Impossible de charger les sessions.</p>
              <p className="mt-1 text-xs text-[#a14a45]">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setRetryVersion(version => version + 1)}
              className="self-start rounded-lg border border-[#dca8a4] bg-white px-3 py-2 text-xs font-semibold text-[#8f2822] hover:bg-[#fff1f0] sm:self-auto"
            >
              Réessayer
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            <section aria-label="Indicateurs formations" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <KpiCard
                label={period === 'week' ? 'Sessions · 2 semaines' : 'Total sessions'}
                value={formatNumber(stats.totalSessions)}
                subtitle={sessionSubtitle || 'Aucune session'}
              />
              <KpiCard
                label="Inscriptions actives"
                value={formatNumber(stats.activeRegistrations)}
                subtitle={`${stats.cancelledRegistrations} ${plural(stats.cancelledRegistrations, 'annulation')}`}
              />
              <KpiCard
                label="Hôtels représentés"
                value={formatNumber(stats.representedHotels)}
                subtitle="Avec au moins une inscription active"
              />
              <KpiCard
                label="Moy. inscriptions/session"
                value={formatNumber(stats.averageRegistrations, 1)}
                subtitle="Par session non annulée"
              />
              <KpiCard
                label="Taux d’annulation des inscriptions"
                value={`${formatNumber(stats.cancellationRate, 1)} %`}
                subtitle={`${stats.cancelledRegistrations} sur ${stats.activeRegistrations + stats.cancelledRegistrations + stats.noShows} demandes`}
                detail={`${stats.noShows} no-show${stats.noShows === 1 ? '' : 's'} · suivi${stats.noShows === 1 ? '' : 's'} séparément`}
              />
            </section>

            {sourceTruncated && (
              <div role="status" className="rounded-xl border border-[#edc86b] bg-[#fff8e8] px-4 py-3 text-sm text-[#84550e]">
                <p className="font-semibold">Données Acuity partielles</p>
                <p className="mt-0.5 text-xs">La source a atteint sa limite de pagination. Les sessions et indicateurs affichés peuvent être incomplets.</p>
              </div>
            )}

            {sourceDegraded && (
              <div role="status" className="rounded-xl border border-[#edc86b] bg-[#fff8e8] px-4 py-3 text-sm text-[#84550e]">
                <p className="font-semibold">Disponibilités Acuity partielles</p>
                <p className="mt-0.5 text-xs">Les rendez-vous sont affichés, mais certaines sessions sans inscription peuvent manquer temporairement.</p>
              </div>
            )}

            <section aria-label="Recherche et filtres" className="rounded-xl border border-[#ded8e8] bg-white p-4 shadow-[0_4px_10px_rgba(36,25,55,0.04)]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-[#1a1a1a]">Sessions</h2>
                  <p className="mt-0.5 text-xs text-[#696969]">
                    {filteredSessions.length} sur {sessions.length} {plural(sessions.length, 'session')}
                  </p>
                </div>
                {hasFilters && (
                  <button type="button" onClick={resetFilters} className="text-xs font-semibold text-[#59319f] hover:underline">
                    Réinitialiser les filtres
                  </button>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(280px,2fr)_repeat(3,minmax(150px,1fr))]">
                <label className="block min-w-0">
                  <span className="mb-1 block text-xs font-semibold text-[#4a4a4a]">Rechercher</span>
                  <div className="relative">
                    <svg aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a8a8a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m2.35-5.65a8 8 0 11-16 0 8 8 0 0116 0Z" />
                    </svg>
                    <input
                      type="search"
                      value={search}
                      onChange={event => setSearch(event.target.value)}
                      placeholder="Formation, hôtel, participant…"
                      className="w-full rounded-lg border border-[#d8d8d8] bg-white py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-[#a1a1a1] focus:border-[#8064b3] focus:ring-2 focus:ring-[#e6dcf5]"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[#4a4a4a]">Langue</span>
                  <select value={language} onChange={event => setLanguage(event.target.value as LanguageFilter)} className="w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2.5 text-sm text-[#4a4a4a] outline-none focus:border-[#8064b3] focus:ring-2 focus:ring-[#e6dcf5]">
                    <option value="all">Toutes les langues</option>
                    <option value="FR">Français</option>
                    <option value="EN">Anglais</option>
                    <option value="ES">Espagnol</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[#4a4a4a]">Statut</span>
                  <select value={status} onChange={event => setStatus(event.target.value as StatusFilter)} className="w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2.5 text-sm text-[#4a4a4a] outline-none focus:border-[#8064b3] focus:ring-2 focus:ring-[#e6dcf5]">
                    <option value="all">Tous les statuts</option>
                    <option value="scheduled">À venir</option>
                    <option value="completed">Passée</option>
                    <option value="cancelled">Annulée</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[#4a4a4a]">Animateur</span>
                  <select value={animator} onChange={event => setAnimator(event.target.value)} className="w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2.5 text-sm text-[#4a4a4a] outline-none focus:border-[#8064b3] focus:ring-2 focus:ring-[#e6dcf5]">
                    <option value="all">Tous les animateurs</option>
                    {animatorOptions.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
              </div>
            </section>

            <span className="sr-only" aria-live="polite">
              {copyFeedback?.status === 'success' ? 'Liste des hôtels copiée.' : copyFeedback?.status === 'error' ? 'La copie a échoué.' : ''}
            </span>

            {filteredSessions.length === 0 ? (
              <EmptySessions filtered={hasFilters} />
            ) : period === 'week' ? (
              <div className="space-y-8">
                <section aria-labelledby="previous-week-title" className="space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h2 id="previous-week-title" className="text-base font-bold text-[#1a1a1a]">Semaine passée</h2>
                      <p className="mt-0.5 text-xs text-[#696969]">{formatWeekDate(weekRange.previousMonday)} → {formatWeekDate(weekRange.previousSunday)}</p>
                    </div>
                    <span className="text-xs font-semibold text-[#696969]">{previousWeekSessions.length} {plural(previousWeekSessions.length, 'session')}</span>
                  </div>
                  {previousWeekSessions.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[#d8d8d8] bg-white px-4 py-8 text-center text-sm text-[#878787]">Aucune session la semaine passée.</p>
                  ) : (
                    <SessionList sessions={previousWeekSessions} expandedId={expandedId} copyFeedback={copyFeedback} onToggle={toggleSession} onCopyHotels={copyHotels} />
                  )}
                </section>

                <section aria-labelledby="current-week-title" className="space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h2 id="current-week-title" className="text-base font-bold text-[#1a1a1a]">Cette semaine</h2>
                      <p className="mt-0.5 text-xs text-[#696969]">{formatWeekDate(weekRange.thisMonday)} → {formatWeekDate(weekRange.thisSunday)}</p>
                    </div>
                    <span className="text-xs font-semibold text-[#696969]">{currentWeekSessions.length} {plural(currentWeekSessions.length, 'session')}</span>
                  </div>
                  {currentWeekSessions.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[#d8d8d8] bg-white px-4 py-8 text-center text-sm text-[#878787]">Aucune session cette semaine.</p>
                  ) : (
                    <SessionList sessions={currentWeekSessions} expandedId={expandedId} copyFeedback={copyFeedback} onToggle={toggleSession} onCopyHotels={copyHotels} />
                  )}
                </section>
              </div>
            ) : (
              <SessionList sessions={regularSessions} expandedId={expandedId} copyFeedback={copyFeedback} onToggle={toggleSession} onCopyHotels={copyHotels} />
            )}
          </>
        )}
      </div>
    </main>
  )
}
