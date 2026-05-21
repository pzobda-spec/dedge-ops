'use client'

import { useState, useCallback, useEffect } from 'react'
import Badge from '@/components/ui/Badge'
import type { AcuitySession } from '@/lib/acuity/client'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const statusLabels: Record<string, string> = {
  scheduled: 'À venir',
  completed: 'Passée',
  cancelled: 'Annulée',
}

const statusColors: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-slate-100 text-slate-600',
}

const participantStatusLabels: Record<string, string> = {
  registered: 'Inscrit',
  cancelled: 'Annulé',
}

const participantStatusColors: Record<string, string> = {
  registered: 'text-green-700',
  cancelled: 'text-slate-400 line-through',
}

type Period = '3m' | '6m' | 'all' | 'week'

const periodOptions: { value: Period; label: string; months?: number }[] = [
  { value: 'week', label: 'Rapport semaine' },
  { value: '3m', label: '3 derniers mois', months: 3 },
  { value: '6m', label: '6 derniers mois', months: 6 },
  { value: 'all', label: 'Tout' },
]

function getWeekDateRange() {
  const today = new Date()
  const dow = today.getDay()
  const daysToMon = dow === 0 ? 6 : dow - 1
  const thisMon = new Date(today)
  thisMon.setDate(today.getDate() - daysToMon)
  const prevMon = new Date(thisMon)
  prevMon.setDate(thisMon.getDate() - 7)
  const prevSun = new Date(thisMon)
  prevSun.setDate(thisMon.getDate() - 1)
  const thisSun = new Date(thisMon)
  thisSun.setDate(thisMon.getDate() + 6)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { prevMon: fmt(prevMon), prevSun: fmt(prevSun), thisMon: fmt(thisMon), thisSun: fmt(thisSun) }
}

function fmtWeekLabel(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCalendarUrl(session: AcuitySession): string {
  const start = new Date(session.datetime)
  const end = new Date(start.getTime() + session.duration * 60 * 1000)

  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')

  const registeredEmails = session.participants
    .filter(p => p.status === 'registered')
    .map(p => p.email)
    .join(',')

  const details = [
    `Formation D-EDGE CRM — ${session.language}`,
    `Animateur : ${session.calendar}`,
    '',
    'Participants :',
    ...session.participants
      .filter(p => p.status === 'registered')
      .map(p => `- ${p.firstName} ${p.lastName} (${p.hotelName}) <${p.email}>`),
  ].join('\n')

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: session.title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details,
    add: registeredEmails,
  })

  return `https://calendar.google.com/calendar/render?${params}`
}

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------

function computeStats(sessions: AcuitySession[]) {
  const byLanguage = { FR: 0, EN: 0, ES: 0 }
  const themeCount: Record<string, number> = {}
  const hotelSet = new Set<string>()
  let totalParticipants = 0

  for (const s of sessions) {
    byLanguage[s.language] = (byLanguage[s.language] || 0) + 1
    themeCount[s.theme] = (themeCount[s.theme] || 0) + 1
    s.uniqueHotels.forEach(h => hotelSet.add(h))
    totalParticipants += s.totalRegistered
  }

  const topThemes = Object.entries(themeCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }))

  return {
    byLanguage,
    topThemes,
    totalUniqueHotels: hotelSet.size,
    totalSessions: sessions.length,
    totalParticipants,
  }
}

// ---------------------------------------------------------------------------
// MeetPanel
// ---------------------------------------------------------------------------

function MeetPanel({ session }: { session: AcuitySession }) {
  const registeredCount = session.participants.filter(p => p.status === 'registered').length
  const calendarUrl = buildCalendarUrl(session)

  return (
    <div className="mb-4 flex items-center gap-3">
      <a
        href={calendarUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
        </svg>
        Créer événement Google Meet
      </a>
      <span className="text-xs text-slate-500">
        Ouvre Google Calendar avec {registeredCount} participant{registeredCount !== 1 ? 's' : ''} pré-ajouté{registeredCount !== 1 ? 's' : ''} — enregistrez pour générer le lien Meet et envoyer les invitations
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TrainingsPage() {
  const [period, setPeriod] = useState<Period>('3m')
  const [sessions, setSessions] = useState<AcuitySession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const loadSessions = useCallback(async (p: Period) => {
    setLoading(true)
    setError(null)
    setExpandedId(null)
    try {
      const option = periodOptions.find(o => o.value === p)!
      let url: string
      if (p === 'week') {
        const { prevMon, thisSun } = getWeekDateRange()
        url = `/api/acuity/sessions?minDate=${prevMon}&maxDate=${thisSun}`
      } else if (p === 'all') {
        url = '/api/acuity/sessions?period=all'
      } else {
        url = `/api/acuity/sessions?period=recent&months=${option.months}`
      }
      const res = await fetch(url)
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(body.error ?? res.statusText)
      }
      const data = await res.json()
      setSessions(data.sessions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSessions(period)
  }, [period, loadSessions])

  const stats = computeStats(sessions)

  return (
    <div>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Formations</h1>
          {!loading && !error && (
            <p className="text-sm text-slate-500 mt-0.5">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</p>
          )}
        </div>

        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {periodOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                period === opt.value
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="text-slate-500 text-sm">Chargement des sessions…</div>
            </div>
          )}
          {!loading && error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              Erreur lors du chargement des données : {error}
            </div>
          )}
          {!loading && !error && period === 'week' && (() => {
            const { prevMon, prevSun, thisMon, thisSun } = getWeekDateRange()
            const prevWeekSessions = sessions.filter(s => {
              const d = s.datetime.slice(0, 10)
              return d >= prevMon && d <= prevSun
            })
            const thisWeekSessions = sessions.filter(s => {
              const d = s.datetime.slice(0, 10)
              return d >= thisMon && d <= thisSun
            })
            const renderSessionList = (list: typeof sessions, showMeet: boolean) =>
              list.map(s => {
                const reg = s.participants.filter(p => p.status === 'registered')
                const hotels = reg.map(p => p.hotelName).filter(Boolean) as string[]
                const uniqueHotels = [...new Set(hotels)]
                const date = new Date(s.datetime).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' })
                const time = new Date(s.datetime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                return (
                  <div key={s.classID} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-sm font-semibold text-slate-900">
                        {s.title}
                        <span className="font-normal text-slate-400"> · {date} {time} · {s.language} · {s.calendar}</span>
                      </span>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {uniqueHotels.length > 0 && (
                          <button
                            onClick={() => navigator.clipboard.writeText(uniqueHotels.join('\n'))}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Copier hôtels ({uniqueHotels.length})
                          </button>
                        )}
                        {showMeet && (
                          <a href={buildCalendarUrl(s)} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline">
                            Google Meet ↗
                          </a>
                        )}
                      </div>
                    </div>
                    {reg.length > 0 ? (
                      <ul className="mt-1.5 space-y-0.5 pl-2">
                        {reg.map((p, i) => (
                          <li key={i} className="text-sm text-slate-700">
                            {p.firstName} {p.lastName}{p.hotelName ? ` · ${p.hotelName}` : ''}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm text-slate-400 pl-2">Aucun inscrit</p>
                    )}
                  </div>
                )
              })

            return (
              <div className="space-y-6 max-w-3xl">
                {/* Previous week */}
                <div>
                  <h2 className="text-sm font-bold text-slate-700 mb-3">
                    Semaine passée — {fmtWeekLabel(prevMon)} → {fmtWeekLabel(prevSun)}
                    <span className="font-normal text-slate-400 ml-2">{prevWeekSessions.length} session{prevWeekSessions.length !== 1 ? 's' : ''}</span>
                  </h2>
                  {prevWeekSessions.length === 0
                    ? <p className="text-sm text-slate-400">Aucune session la semaine passée.</p>
                    : <div className="space-y-3">{renderSessionList(prevWeekSessions, false)}</div>
                  }
                </div>

                {/* This week */}
                <div>
                  <h2 className="text-sm font-bold text-slate-700 mb-3">
                    Cette semaine — {fmtWeekLabel(thisMon)} → {fmtWeekLabel(thisSun)}
                    <span className="font-normal text-slate-400 ml-2">{thisWeekSessions.length} session{thisWeekSessions.length !== 1 ? 's' : ''}</span>
                  </h2>
                  {thisWeekSessions.length === 0
                    ? <p className="text-sm text-slate-400">Aucune session prévue cette semaine.</p>
                    : <div className="space-y-3">{renderSessionList([...thisWeekSessions].sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()), true)}</div>
                  }
                </div>
              </div>
            )
          })()}

          {!loading && !error && period !== 'week' && (
            <>
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                {sessions.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm">
                    Aucune session trouvée pour cette période.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Thème</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Langue</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Animateur</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Inscrits</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Hôtels uniques</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Annulés</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sessions.map(s => {
                        const isExpanded = expandedId === s.classID
                        return (
                          <>
                            <tr
                              key={s.classID}
                              className="hover:bg-slate-50 cursor-pointer transition-colors"
                              onClick={() => setExpandedId(isExpanded ? null : s.classID)}
                            >
                              <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                                <div className="font-medium">{s.date}</div>
                                <div className="text-xs text-slate-400">{s.time}</div>
                              </td>
                              <td className="px-4 py-3 max-w-xs">
                                <span className="font-medium text-slate-900 line-clamp-2">{s.title}</span>
                              </td>
                              <td className="px-4 py-3">
                                <Badge
                                  label={s.language}
                                  variant={s.language.toLowerCase() as 'fr' | 'en' | 'es'}
                                />
                              </td>
                              <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{s.calendar}</td>
                              <td className="px-4 py-3 text-center font-medium text-slate-900">{s.totalRegistered}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={s.duplicateHotels.length > 0 ? 'text-amber-600 font-medium' : 'text-slate-700'}>
                                  {s.uniqueHotels.length}
                                  {s.duplicateHotels.length > 0 && (
                                    <span className="ml-1 text-xs">(⚠️ doublons)</span>
                                  )}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                {s.totalCancelled > 0
                                  ? <span className="text-slate-500">{s.totalCancelled}</span>
                                  : <span className="text-slate-300">0</span>}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColors[s.status]}`}>
                                  {statusLabels[s.status]}
                                </span>
                              </td>
                            </tr>

                            {isExpanded && (
                              <tr key={`${s.classID}-detail`} className="bg-slate-50">
                                <td colSpan={8} className="px-4 py-4">
                                  <h3 className="text-sm font-semibold text-slate-700 mb-3">
                                    Détail des inscriptions — {s.title}
                                  </h3>
                                  <MeetPanel session={s} />
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="text-xs text-slate-500 uppercase">
                                        <th className="text-left pb-2 pr-4">Hôtel</th>
                                        <th className="text-left pb-2 pr-4">Participant</th>
                                        <th className="text-left pb-2 pr-4">Email</th>
                                        <th className="text-left pb-2">Statut</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {s.participants.map((p, i) => {
                                        const isDuplicate = s.duplicateHotels.includes(p.hotelName)
                                        return (
                                          <tr key={i} className={isDuplicate ? 'bg-amber-50' : ''}>
                                            <td className="py-1.5 pr-4">
                                              <span className={isDuplicate ? 'text-amber-700 font-medium' : 'text-slate-700'}>
                                                {p.hotelName}
                                                {isDuplicate && (
                                                  <span className="ml-1 text-xs text-amber-500">doublon</span>
                                                )}
                                              </span>
                                            </td>
                                            <td className={`py-1.5 pr-4 ${participantStatusColors[p.status]}`}>
                                              {p.firstName} {p.lastName}
                                            </td>
                                            <td className={`py-1.5 pr-4 text-xs ${participantStatusColors[p.status]}`}>
                                              {p.email}
                                            </td>
                                            <td className="py-1.5">
                                              <span className={`text-xs ${participantStatusColors[p.status]}`}>
                                                {participantStatusLabels[p.status]}
                                              </span>
                                            </td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            )}
                          </>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Vue d&apos;ensemble</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Sessions</span>
                      <span className="text-sm font-semibold text-slate-900">{stats.totalSessions}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Participants</span>
                      <span className="text-sm font-semibold text-slate-900">{stats.totalParticipants}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Hôtels formés</span>
                      <span className="text-sm font-semibold text-slate-900">{stats.totalUniqueHotels}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Par langue</h3>
                  <div className="space-y-2">
                    {(Object.entries(stats.byLanguage) as [string, number][])
                      .filter(([, count]) => count > 0)
                      .sort((a, b) => b[1] - a[1])
                      .map(([lang, count]) => (
                        <div key={lang} className="flex items-center justify-between">
                          <Badge label={lang} variant={lang.toLowerCase() as 'fr' | 'en' | 'es'} />
                          <span className="text-sm font-medium text-slate-700">{count} session{count !== 1 ? 's' : ''}</span>
                        </div>
                      ))}
                    {Object.values(stats.byLanguage).every(c => c === 0) && (
                      <p className="text-sm text-slate-400">Aucune donnée</p>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Top 3 thèmes</h3>
                  <div className="space-y-2">
                    {stats.topThemes.length === 0 && (
                      <p className="text-sm text-slate-400">Aucune donnée</p>
                    )}
                    {stats.topThemes.map((t, i) => (
                      <div key={t.name} className="flex items-center justify-between gap-2">
                        <span className="text-sm text-slate-700 truncate">
                          {i + 1}. {t.name}
                        </span>
                        <span className="text-sm font-medium text-slate-500 shrink-0">{t.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
    </div>
  )
}

