'use client'

import { useEffect, useState } from 'react'
import { Calendar, ExternalLink } from 'lucide-react'
import type { OnboardingProjectDetail } from '@/lib/onboarding/projects'
import { formatDate } from '@/lib/utils/dates'

interface Appointment {
  acuity_id: number
  type_name: string
  datetime: string
  duration: number
  calendar: string
  status: 'scheduled' | 'completed' | 'cancelled'
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
}: {
  project: OnboardingProjectDetail
  onLogged?: () => void
}) {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [settings, setSettings] = useState<UserSettings>({})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.allSettled([
      fetch(`/api/acuity/onboarding-appointments?project_id=${encodeURIComponent(project.id)}`, { cache: 'no-store' })
        .then(res => res.ok ? res.json() : Promise.reject(res.status)),
      fetch('/api/settings/me', { cache: 'no-store' })
        .then(res => res.ok ? res.json() : Promise.reject(res.status)),
    ]).then(([appointmentsRes, settingsRes]) => {
      if (appointmentsRes.status === 'fulfilled') setAppointments(appointmentsRes.value.appointments ?? [])
      if (settingsRes.status === 'fulfilled') setSettings(settingsRes.value.settings ?? {})
    }).finally(() => setLoading(false))
  }, [project.id])

  async function propose(type: '15min' | '30min' | '60min') {
    setError(null)
    setMessage(null)
    const link = type === '15min'
      ? settings.acuity_link_15min
      : type === '30min'
        ? settings.acuity_link_30min
        : settings.acuity_link_60min

    if (!link) {
      setError('Configurez vos liens Acuity dans Paramètres > Mes paramètres')
      return
    }

    const eventType = type === '30min'
      ? 'kickoff_scheduled'
      : type === '60min'
        ? 'implementation_scheduled'
        : 'note_added'

    window.open(link, '_blank')
    const res = await fetch(`/api/onboarding/projects/${encodeURIComponent(project.id)}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: eventType,
        event_label: type === '15min' ? 'Lien Acuity 15 min ouvert' : undefined,
        metadata: { acuity_type: type, action: 'booking_link_opened' },
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? `HTTP ${res.status}`)
      return
    }
    onLogged?.()
    setMessage('Le lien a été ouvert. Le client recevra une confirmation après réservation.')
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Rendez-vous</h2>
          <p className="text-sm text-slate-500 mt-1">RDV Acuity onboarding liés au projet.</p>
        </div>
        <Calendar className="h-5 w-5 text-slate-400" />
      </div>

      {loading ? (
        <div className="h-16 bg-slate-100 rounded-lg animate-pulse" />
      ) : appointments.length === 0 ? (
        <p className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg p-4">Aucun RDV onboarding Acuity trouvé.</p>
      ) : (
        <div className="space-y-2">
          {appointments.map(appt => (
            <div key={appt.acuity_id} className="flex items-center justify-between gap-3 border border-slate-100 rounded-lg p-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{appt.type_name}</p>
                <p className="text-xs text-slate-500">{formatDate(appt.datetime.slice(0, 10))} · {appt.duration} min · {appt.client_name}</p>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                appt.status === 'completed'
                  ? 'bg-slate-100 text-slate-600'
                  : appt.status === 'cancelled'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-blue-50 text-blue-700'
              }`}>
                {appt.status === 'completed' ? 'passé' : appt.status === 'cancelled' ? 'annulé' : 'à venir'}
              </span>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      {message && <p className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{message}</p>}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button onClick={() => propose('15min')} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <ExternalLink className="h-4 w-4" />
          Appel rapide
        </button>
        <button onClick={() => propose('30min')} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <ExternalLink className="h-4 w-4" />
          Kick-off
        </button>
        <button onClick={() => propose('60min')} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <ExternalLink className="h-4 w-4" />
          Implémentation
        </button>
      </div>
    </div>
  )
}
