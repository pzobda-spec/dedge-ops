'use client'

import { useEffect, useState } from 'react'

interface UserSettings {
  acuity_link_15min: string | null
  acuity_link_30min: string | null
  acuity_link_60min: string | null
  default_language: 'fr' | 'en'
  signature: string | null
}

const emptySettings: UserSettings = {
  acuity_link_15min: '',
  acuity_link_30min: '',
  acuity_link_60min: '',
  default_language: 'fr',
  signature: '',
}

export default function MySettingsPage() {
  const [settings, setSettings] = useState<UserSettings>(emptySettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings/me', { cache: 'no-store' })
      .then(async res => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
        setSettings({ ...emptySettings, ...(data.settings ?? {}) })
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Impossible de charger vos paramètres.'))
      .finally(() => setLoading(false))
  }, [])

  function update<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  async function save() {
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch('/api/settings/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setSettings({ ...emptySettings, ...(data.settings ?? {}) })
      setMessage('Paramètres enregistrés.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-slate-900">Mes paramètres</h1>
        <p className="text-sm text-slate-500 mt-0.5">Liens de réservation et signature utilisés dans l’onboarding.</p>
      </div>

      <div className="p-6 max-w-3xl">
        {loading ? (
          <div className="py-12 text-sm text-slate-400">Chargement…</div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Mes liens de réservation</h2>
              <p className="text-sm text-slate-500 mt-1">Ces liens sont utilisés sur les boutons Acuity de la page projet.</p>
            </div>

            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Lien Acuity 15 min</span>
              <input
                value={settings.acuity_link_15min ?? ''}
                onChange={e => update('acuity_link_15min', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                placeholder="https://app.acuityscheduling.com/schedule.php?owner=..."
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Lien Acuity 30 min</span>
              <input
                value={settings.acuity_link_30min ?? ''}
                onChange={e => update('acuity_link_30min', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Lien Acuity 60 min</span>
              <input
                value={settings.acuity_link_60min ?? ''}
                onChange={e => update('acuity_link_60min', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Langue par défaut</span>
              <select
                value={settings.default_language}
                onChange={e => update('default_language', e.target.value === 'en' ? 'en' : 'fr')}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="fr">FR</option>
                <option value="en">EN</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Signature email</span>
              <textarea
                value={settings.signature ?? ''}
                onChange={e => update('signature', e.target.value)}
                rows={5}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </label>

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            {message && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{message}</p>}

            <div className="flex justify-end">
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
