'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import {
  AlertCircle,
  Box,
  Calendar,
  CheckCircle,
  FileText,
  Mail,
  Package,
  Phone,
  Plus,
  RefreshCw,
  Rocket,
  StickyNote,
  type LucideIcon,
} from 'lucide-react'
import { EVENT_TYPES, type EventCategory, type EventColor } from '@/lib/onboarding/eventTypes'
import type { ProjectEvent } from '@/lib/onboarding/events'
import { useLocale } from '@/lib/i18n/LocaleContext'
import type { Locale } from '@/lib/i18n/locale'

const ICONS: Record<string, LucideIcon> = {
  AlertCircle,
  Box,
  Calendar,
  CheckCircle,
  FileText,
  Mail,
  Package,
  Phone,
  Plus,
  RefreshCw,
  Rocket,
  StickyNote,
}

const colorClasses: Record<EventColor, { dot: string; text: string; bg: string }> = {
  gray: { dot: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-50' },
  blue: { dot: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50' },
  green: { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  orange: { dot: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50' },
  red: { dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' },
  purple: { dot: 'bg-purple-500', text: 'text-purple-700', bg: 'bg-purple-50' },
}

const categories: EventCategory[] = ['system', 'email', 'call', 'meeting', 'delivery', 'milestone', 'note']
const PAGE_SIZE = 50

function relativeDate(iso: string, locale: Locale) {
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: locale === 'en' ? enUS : fr })
}

function metadataSummary(event: ProjectEvent, locale: Locale, t: (text: string) => string): string | null {
  const metadata = event.metadata ?? {}
  if (event.event_type.startsWith('email_')) {
    const subject = typeof metadata.subject === 'string' ? metadata.subject : ''
    if (!subject) return null
    const truncated = subject.length > 60 ? `${subject.slice(0, 60)}...` : subject
    return `${t('Sujet')} : ${truncated}`
  }
  if (event.event_type === 'recap_generated') {
    const length = typeof metadata.transcript_length === 'number' ? metadata.transcript_length : null
    if (length === null) return null
    return locale === 'en' ? `Transcript of ${length} characters` : `Transcript de ${length} caractères`
  }
  if (event.event_type === 'kickoff_scheduled') return t('Lien Acuity 30 min ouvert')
  if (event.event_type === 'implementation_scheduled') return t('Lien Acuity 60 min ouvert')
  if (event.event_type === 'kickoff_completed' || event.event_type === 'implementation_completed') {
    const date = typeof metadata.appointment_datetime === 'string' ? metadata.appointment_datetime : null
    if (!date) return null
    const formatted = new Date(date).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR')
    return locale === 'en' ? `Meeting held on ${formatted}` : `RDV réalisé le ${formatted}`
  }
  return null
}

export default function Timeline({
  project_id,
  readonly = false,
  onTimelineChange,
}: {
  project_id: string
  readonly?: boolean
  onTimelineChange?: (events: ProjectEvent[]) => void
}) {
  const { locale, t } = useLocale()
  const [events, setEvents] = useState<ProjectEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategories, setSelectedCategories] = useState<Set<EventCategory>>(new Set())
  const [since, setSince] = useState('all')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function loadTimeline() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/onboarding/projects/${encodeURIComponent(project_id)}/timeline`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setEvents(data.events ?? [])
      onTimelineChange?.(data.events ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Impossible de charger la timeline.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTimeline()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project_id])

  const filteredEvents = useMemo(() => {
    const now = Date.now()
    const sinceDays = since === 'all' ? null : Number(since)
    return events.filter(event => {
      const meta = EVENT_TYPES[event.event_type]
      const categoryMatch = selectedCategories.size === 0 || selectedCategories.has(meta.category)
      const dateMatch = sinceDays === null || now - new Date(event.occurred_at).getTime() <= sinceDays * 86_400_000
      return categoryMatch && dateMatch
    })
  }, [events, selectedCategories, since])

  async function submitNote() {
    if (!note.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/onboarding/projects/${encodeURIComponent(project_id)}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'note_added',
          event_label: 'Note ajoutée',
          metadata: { note: note.trim() },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setNote('')
      setNoteOpen(false)
      await loadTimeline()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Erreur lors de l’ajout de la note.'))
    } finally {
      setSubmitting(false)
    }
  }

  function toggleCategory(category: EventCategory) {
    setVisibleCount(PAGE_SIZE)
    setSelectedCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {categories.map(category => (
            <button
              key={category}
              onClick={() => toggleCategory(category)}
              className={`text-xs px-2.5 py-1.5 rounded border transition-colors ${
                selectedCategories.has(category)
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {category}
            </button>
          ))}
          <select
            value={since}
            onChange={e => { setSince(e.target.value); setVisibleCount(PAGE_SIZE) }}
            className="text-xs px-2.5 py-1.5 rounded border border-slate-200 text-slate-600 bg-white"
          >
            <option value="all">{t('Toutes dates')}</option>
            <option value="7">{t('7 derniers jours')}</option>
            <option value="30">{t('30 derniers jours')}</option>
            <option value="90">{t('90 derniers jours')}</option>
          </select>
        </div>
        {!readonly && (
          <button
            onClick={() => setNoteOpen(true)}
            className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-colors"
          >
            {t('Ajouter une note')}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {filteredEvents.length === 0 ? (
        <div className="text-center py-10 text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl">
          {t('Aucune action enregistrée pour ce projet')}
        </div>
      ) : (
        <div className="relative pl-7">
          <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-200" />
          <div className="space-y-4">
            {filteredEvents.slice(0, visibleCount).map(event => {
              const meta = EVENT_TYPES[event.event_type]
              const colors = colorClasses[meta.color]
              const Icon = ICONS[meta.icon] ?? StickyNote
              const hasMetadata = event.metadata && Object.keys(event.metadata).length > 0
              const summary = metadataSummary(event, locale, t)
              return (
                <div key={event.id} className="relative">
                  <span className={`absolute -left-[1.35rem] top-2 h-4 w-4 rounded-full border-2 border-white ${colors.dot}`} />
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex h-7 w-7 items-center justify-center rounded ${colors.bg} ${colors.text}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <p className="text-sm font-semibold text-slate-900">{t(event.event_label || meta.label)}</p>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {relativeDate(event.occurred_at, locale)}
                          {event.actor_email ? ` · ${event.actor_email}` : ''}
                        </p>
                        {summary && <p className="text-xs text-slate-600 mt-2">{summary}</p>}
                      </div>
                      {hasMetadata && (
                        <button
                          onClick={() => setDetailsId(detailsId === event.id ? null : event.id)}
                          className="text-xs text-slate-500 hover:text-slate-900"
                        >
                          {t('Détails')}
                        </button>
                      )}
                    </div>
                    {detailsId === event.id && (
                      <pre className="mt-3 max-h-48 overflow-auto rounded bg-slate-50 p-3 text-xs text-slate-600">
                        {JSON.stringify(event.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {filteredEvents.length > visibleCount && (
            <button
              onClick={() => setVisibleCount(count => count + PAGE_SIZE)}
              className="mt-4 text-sm text-slate-600 hover:text-slate-900"
            >
              {t('Afficher plus')}
            </button>
          )}
        </div>
      )}

      {noteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-xl p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">{t('Ajouter une note')}</h3>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              placeholder={t('Note interne...')}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setNoteOpen(false)} className="px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                {t('Annuler')}
              </button>
              <button
                onClick={submitNote}
                disabled={submitting || !note.trim()}
                className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
              >
                {submitting ? t('Ajout...') : t('Ajouter')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
