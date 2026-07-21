'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Calendar, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react'
import type { OnboardingProjectDetail } from '@/lib/onboarding/projects'
import { formatDate } from '@/lib/utils/dates'
import { useLocale } from '@/lib/i18n/LocaleContext'

interface Appointment {
  acuity_id: number
  type_name: string
  datetime: string
  duration: number
  calendar: string
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
  client_name: string
}

interface UserSettings {
  acuity_link_15min?: string | null
  acuity_link_30min?: string | null
  acuity_link_60min?: string | null
}

export default function AcuityAppointments({
  project,
  onLogged,
  readonly = false,
}: {
  project: OnboardingProjectDetail
  onLogged?: () => void
  readonly?: boolean
}) {
  const { t } = useLocale()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [settings, setSettings] = useState<UserSettings>({})
  const [loading, setLoading] = useState(true)
  const [incomplete, setIncomplete] = useState(false)
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(!readonly)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [proposing, setProposing] = useState<'15min' | '30min' | '60min' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadAppointments = useCallback(async () => {
    setLoading(true)
    setAppointmentsError(null)
    setIncomplete(false)

    try {
      const response = await fetch(
        `/api/acuity/onboarding-appointments?project_id=${encodeURIComponent(project.id)}`,
        { cache: 'no-store' }
      )
      const payload = await response.json().catch(() => null) as {
        appointments?: unknown
        meta?: { truncated?: unknown }
        error?: string
      } | null

      if (!response.ok) {
        throw new Error(payload?.error || `${t('Impossible de charger les rendez-vous')} (HTTP ${response.status}).`)
      }
      if (!Array.isArray(payload?.appointments)) {
        throw new Error(t('La réponse Acuity est invalide.'))
      }

      setAppointments(payload.appointments as Appointment[])
      setIncomplete(payload.meta?.truncated === true)
    } catch (loadError) {
      setAppointments([])
      setAppointmentsError(
        loadError instanceof Error
          ? loadError.message
          : t('Impossible de charger les rendez-vous Acuity.')
      )
    } finally {
      setLoading(false)
    }
  }, [project.id, t])

  useEffect(() => {
    void loadAppointments()
  }, [loadAppointments])

  useEffect(() => {
    if (readonly) {
      setSettingsLoading(false)
      setSettingsError(null)
      return
    }

    let active = true
    setSettingsLoading(true)
    setSettingsError(null)
    fetch('/api/settings/me', { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json().catch(() => null) as {
          settings?: UserSettings
          error?: string
        } | null
        if (!response.ok) {
          throw new Error(payload?.error || `${t('Impossible de charger vos liens Acuity')} (HTTP ${response.status}).`)
        }
        if (active) setSettings(payload?.settings ?? {})
      })
      .catch(settingsLoadError => {
        if (!active) return
        setSettingsError(
          settingsLoadError instanceof Error
            ? settingsLoadError.message
            : t('Impossible de charger vos liens Acuity.')
        )
      })
      .finally(() => {
        if (active) setSettingsLoading(false)
      })

    return () => {
      active = false
    }
  }, [readonly, t])

  async function propose(type: '15min' | '30min' | '60min') {
    if (readonly || proposing) return

    setActionError(null)
    setMessage(null)
    const link = type === '15min'
      ? settings.acuity_link_15min
      : type === '30min'
        ? settings.acuity_link_30min
        : settings.acuity_link_60min

    if (!link) {
      setActionError(t('Configurez vos liens Acuity dans Paramètres > Mes paramètres.'))
      return
    }

    const eventType = type === '30min'
      ? 'kickoff_scheduled'
      : type === '60min'
        ? 'implementation_scheduled'
        : 'note_added'

    setProposing(type)
    window.open(link, '_blank', 'noopener,noreferrer')
    try {
      const res = await fetch(`/api/onboarding/projects/${encodeURIComponent(project.id)}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: eventType,
          event_label: type === '15min' ? t('Lien Acuity 15 min ouvert') : undefined,
          metadata: { acuity_type: type, action: 'booking_link_opened' },
        }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) {
        setActionError(data.error ?? `${t('Impossible de consigner l’action')} (HTTP ${res.status}).`)
        return
      }
      onLogged?.()
      setMessage(t('Le lien a été ouvert. Le client recevra une confirmation après réservation.'))
    } catch {
      setActionError(t('Le lien a été ouvert, mais l’action n’a pas pu être consignée dans la timeline.'))
    } finally {
      setProposing(null)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{t('Rendez-vous')}</h2>
          <p className="text-sm text-slate-500 mt-1">{t('RDV Acuity onboarding liés au projet.')}</p>
        </div>
        <Calendar className="h-5 w-5 text-slate-400" />
      </div>

      {loading ? (
        <div role="status" className="flex min-h-16 items-center gap-2 rounded-lg bg-slate-100 px-4 text-sm text-slate-600">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t('Chargement des rendez-vous Acuity…')}
        </div>
      ) : appointmentsError ? (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
            <span>{t('Les rendez-vous n’ont pas pu être chargés.')} {appointmentsError}</span>
          </span>
          <button
            type="button"
            onClick={() => void loadAppointments()}
            className="inline-flex min-h-9 items-center justify-center gap-2 self-start rounded-lg border border-red-300 bg-white px-3 py-1.5 font-medium hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 sm:self-auto"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t('Réessayer')}
          </button>
        </div>
      ) : (
        <>
          {incomplete && (
            <div role="status" className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
              <span>
                {t('Résultats Acuity incomplets : la limite de résultats a été atteinte. Certains rendez-vous peuvent manquer.')}
              </span>
            </div>
          )}

          {appointments.length === 0 ? (
            !incomplete && (
              <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-400">
                {t('Aucun RDV onboarding Acuity trouvé.')}
              </p>
            )
          ) : (
            <div className="space-y-2">
              {appointments.map(appt => (
                <div key={appt.acuity_id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{appt.type_name}</p>
                    <p className="text-xs text-slate-500">{formatDate(appt.datetime.slice(0, 10))} · {appt.duration} min · {appt.client_name}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                    appt.status === 'completed'
                      ? 'bg-slate-100 text-slate-600'
                      : appt.status === 'cancelled'
                        ? 'bg-red-50 text-red-700'
                        : appt.status === 'no_show'
                          ? 'bg-amber-50 text-amber-800'
                          : 'bg-blue-50 text-blue-700'
                  }`}>
                    {appt.status === 'completed'
                      ? t('passé')
                      : appt.status === 'cancelled'
                        ? t('annulé')
                        : appt.status === 'no_show'
                          ? t('absent')
                          : t('à venir')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {actionError && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{actionError}</p>}
      {message && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}

      {!readonly && (
        <div className="mt-4">
          {settingsError && (
            <p role="alert" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {t('Les liens de réservation ne sont pas disponibles.')} {settingsError}
            </p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => propose('15min')}
              disabled={settingsLoading || proposing !== null}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#59319f] disabled:cursor-wait disabled:opacity-50"
            >
              {proposing === '15min' ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ExternalLink className="h-4 w-4" aria-hidden="true" />}
              {t('Appel rapide')}
            </button>
            <button
              type="button"
              onClick={() => propose('30min')}
              disabled={settingsLoading || proposing !== null}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#59319f] disabled:cursor-wait disabled:opacity-50"
            >
              {proposing === '30min' ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ExternalLink className="h-4 w-4" aria-hidden="true" />}
              Kick-off
            </button>
            <button
              type="button"
              onClick={() => propose('60min')}
              disabled={settingsLoading || proposing !== null}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#59319f] disabled:cursor-wait disabled:opacity-50"
            >
              {proposing === '60min' ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ExternalLink className="h-4 w-4" aria-hidden="true" />}
              {t('Implémentation')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
