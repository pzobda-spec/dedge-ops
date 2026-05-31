'use client'

import { useEffect, useState } from 'react'
import { Copy, ExternalLink, X } from 'lucide-react'
import type { OnboardingProjectDetail } from '@/lib/onboarding/projects'

interface RecapModalProps {
  project: OnboardingProjectDetail
  onClose: () => void
  onLogged?: () => void
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function RecapModal({ project, onClose, onLogged }: RecapModalProps) {
  const [transcript, setTranscript] = useState('')
  const [hotel, setHotel] = useState(project.hotel_name ?? '')
  const [meetingDate, setMeetingDate] = useState(todayDate())
  const [onboarderEmail, setOnboarderEmail] = useState(project.owner_email ?? '')
  const [gemUrl, setGemUrl] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings/me', { cache: 'no-store' })
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then(data => {
        if (data.settings?.user_email) setOnboarderEmail(data.settings.user_email)
      })
      .catch(() => undefined)

    fetch('/api/app-settings/gemini-recap', { cache: 'no-store' })
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then(data => setGemUrl(data.value ?? ''))
      .catch(() => setGemUrl(''))
  }, [])

  const context = `Hôtel : ${hotel}
Date du RDV : ${meetingDate}
Onboarder : ${onboarderEmail}

Transcript :
${transcript}`

  async function copyContext() {
    await navigator.clipboard.writeText(context)
    setMessage('Contexte copié.')
  }

  async function openGem() {
    setError(null)
    if (!gemUrl) {
      setError('Gem non configuré, voir Paramètres > Intégrations')
      return
    }

    const res = await fetch(`/api/onboarding/projects/${encodeURIComponent(project.id)}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'recap_generated',
        metadata: {
          transcript_length: transcript.length,
          meeting_date: meetingDate,
          hotel,
        },
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? `HTTP ${res.status}`)
      return
    }

    onLogged?.()
    window.open(gemUrl, '_blank')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white border border-slate-200 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Récap du RDV d’implémentation</h3>
            <p className="text-sm text-slate-500 mt-1">{project.hotel_name ?? 'Projet onboarding'}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Hôtel</span>
              <input value={hotel} onChange={e => setHotel(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Date du RDV</span>
              <input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Onboarder</span>
              <input value={onboarderEmail} onChange={e => setOnboarderEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Collez le transcript du RDV</span>
            <textarea value={transcript} onChange={e => setTranscript(e.target.value)} rows={12} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" />
          </label>
          {message && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{message}</p>}
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={copyContext} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Copy className="h-4 w-4" />
              Copier le contexte
            </button>
            <button onClick={openGem} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700">
              <ExternalLink className="h-4 w-4" />
              Ouvrir le Gem
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
