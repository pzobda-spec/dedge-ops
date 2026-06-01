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

const inputCls = 'mt-1 w-full rounded-lg border border-[#e2e2e2] px-3 py-2 text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#3b72d1]'
const labelCls = 'text-xs font-semibold text-[#696969] uppercase tracking-wide'

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
    <div style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'var(--bg-canvas)' }} className="min-h-screen">
      <div className="bg-white border-b border-[#e2e2e2] px-6 py-4">
        <h1 className="text-xl font-semibold text-[#1a1a1a]">Mes paramètres</h1>
        <p className="text-sm text-[#696969] mt-0.5">Liens de réservation et signature utilisés dans l&apos;onboarding.</p>
      </div>

      <div className="p-6 max-w-3xl">
        {loading ? (
          <div className="py-12 text-sm text-[#696969]">Chargement…</div>
        ) : (
          <div className="bg-white border border-[#e2e2e2] shadow-[0_4px_8px_rgba(0,0,0,0.06)] rounded-xl p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-[#1a1a1a]">Liens de réservation</h2>
              <p className="text-sm text-[#696969] mt-1">Ces liens sont utilisés sur les boutons Acuity de la page projet.</p>
            </div>

            <label className="block">
              <span className={labelCls}>Lien Acuity 15 min</span>
              <input
                value={settings.acuity_link_15min ?? ''}
                onChange={e => update('acuity_link_15min', e.target.value)}
                className={inputCls}
                placeholder="https://app.acuityscheduling.com/schedule.php?owner=…"
              />
            </label>

            <label className="block">
              <span className={labelCls}>Lien Acuity 30 min</span>
              <input
                value={settings.acuity_link_30min ?? ''}
                onChange={e => update('acuity_link_30min', e.target.value)}
                className={inputCls}
              />
            </label>

            <label className="block">
              <span className={labelCls}>Lien Acuity 60 min</span>
              <input
                value={settings.acuity_link_60min ?? ''}
                onChange={e => update('acuity_link_60min', e.target.value)}
                className={inputCls}
              />
            </label>

            <label className="block">
              <span className={labelCls}>Langue par défaut</span>
              <select
                value={settings.default_language}
                onChange={e => update('default_language', e.target.value === 'en' ? 'en' : 'fr')}
                className={inputCls}
              >
                <option value="fr">FR</option>
                <option value="en">EN</option>
              </select>
            </label>

            <label className="block">
              <span className={labelCls}>Signature email</span>
              <textarea
                value={settings.signature ?? ''}
                onChange={e => update('signature', e.target.value)}
                rows={5}
                className={inputCls}
              />
            </label>

            {error && <p className="text-sm text-[#b7221b] bg-[#fee3e2] border border-[#fca5a5] rounded-lg px-3 py-2">{error}</p>}
            {message && <p className="text-sm text-[#1c6437] bg-[#cff7dc] border border-[#86efac] rounded-lg px-3 py-2">{message}</p>}

            <div className="flex justify-end">
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-[#59319f] text-white text-sm font-medium hover:bg-[#3f2175] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#3b72d1]"
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
