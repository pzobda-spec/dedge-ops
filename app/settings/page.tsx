'use client'

import { useEffect, useState, useCallback } from 'react'

interface HealthStatus {
  zohoDeskConfigured: boolean
  zohoCrmConfigured: boolean
  zohoProjectsConfigured: boolean
  linearConfigured: boolean
  acuityConfigured: boolean
  supabaseConfigured: boolean
  openaiConfigured: boolean
  zohoFormsConfigured: boolean
}

interface Integration {
  key: keyof HealthStatus
  name: string
  type: string
  description: string
  scope: string
  envVars: string[]
}

const INTEGRATIONS: Integration[] = [
  {
    key: 'zohoDeskConfigured',
    name: 'Zoho Desk',
    type: 'OAuth2',
    description: 'Tickets support, conversations, réponses',
    scope: 'ZohoDesk.tickets.READ · ZohoDesk.tickets.UPDATE · ZohoDesk.tickets.CREATE',
    envVars: ['ZOHO_REFRESH_TOKEN', 'ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET'],
  },
  {
    key: 'zohoCrmConfigured',
    name: 'Zoho CRM',
    type: 'OAuth2',
    description: 'Comptes clients, segments MRR (lecture seule)',
    scope: 'ZohoCRM.modules.READ',
    envVars: ['ZOHO_CRM_REFRESH_TOKEN'],
  },
  {
    key: 'zohoProjectsConfigured',
    name: 'Zoho Projects',
    type: 'OAuth2',
    description: 'Projets onboarding, statuts, avancement',
    scope: 'ZohoProjects.portals.READ',
    envVars: ['ZOHO_PROJECTS_REFRESH_TOKEN'],
  },
  {
    key: 'zohoFormsConfigured',
    name: 'Zoho Forms',
    type: 'OAuth2',
    description: 'Formulaires de satisfaction client',
    scope: 'ZohoForms.form.READ (partage le token Zoho Desk)',
    envVars: ['ZOHO_FORMS_SATISFACTION_FORM'],
  },
  {
    key: 'linearConfigured',
    name: 'Linear',
    type: 'API Token',
    description: 'Board Bug — workspace loungeup, équipe BUGS',
    scope: 'Issues READ · Issues CREATE · Issues UPDATE',
    envVars: ['LINEAR_API_TOKEN'],
  },
  {
    key: 'acuityConfigured',
    name: 'Acuity Scheduling',
    type: 'Credentials',
    description: 'Sessions de formation, participants, calendriers',
    scope: 'Appointments READ · Calendars READ',
    envVars: ['ACUITY_USER_ID', 'ACUITY_API_KEY'],
  },
  {
    key: 'supabaseConfigured',
    name: 'Supabase',
    type: 'REST + Postgres',
    description: 'Base de données, cache, vecteurs pgvector',
    scope: 'Service role (full access backend)',
    envVars: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
  },
  {
    key: 'openaiConfigured',
    name: 'OpenAI',
    type: 'API Key',
    description: 'Actions IA sur les tickets, suggestions',
    scope: 'GPT-4o mini · Chat Completions · Embeddings (text-embedding-3-small)',
    envVars: ['OPENAI_API_KEY'],
  },
]

interface AppSetting {
  key: string
  value: string | null
  description: string | null
  updated_by: string | null
  updated_at: string
}

function StatusBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
      Connecté
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
      Non configuré
    </span>
  )
}

function AppSettingsEditor() {
  const [settings, setSettings] = useState<AppSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/settings', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setSettings(data.settings ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les paramètres.')
      setSettings([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function updateValue(key: string, value: string) {
    setSettings(prev => prev.map(setting => setting.key === key ? { ...setting, value } : setting))
  }

  async function save(setting: AppSetting) {
    setSaving(setting.key)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setting),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setSettings(prev => prev.map(row => row.key === setting.key ? data.setting : row))
      setMessage('Paramètre enregistré.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer.')
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Chargement…</p>
  if (error && settings.length === 0) return <p className="text-sm text-slate-400">{error}</p>

  return (
    <div className="space-y-3">
      {settings.map(setting => (
        <div key={setting.key} className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900">{setting.key}</p>
              {setting.description && <p className="text-sm text-slate-500 mt-1">{setting.description}</p>}
              <input
                value={setting.value ?? ''}
                onChange={e => updateValue(setting.key, e.target.value)}
                className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <button
              onClick={() => save(setting)}
              disabled={saving === setting.key}
              className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
            >
              {saving === setting.key ? '…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      ))}
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      {message && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{message}</p>}
    </div>
  )
}

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings/health')
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
      .then((data: HealthStatus) => { setHealth(data); setLoading(false) })
      .catch(err => { console.error(err); setError('Impossible de vérifier les intégrations.'); setLoading(false) })
  }, [])

  const connectedCount = health ? Object.values(health).filter(Boolean).length : 0
  const totalCount = INTEGRATIONS.length

  return (
    <div>
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-slate-900">Paramètres</h1>
        {!loading && !error && health && (
          <p className="text-sm text-slate-500 mt-0.5">
            {connectedCount}/{totalCount} intégrations configurées
          </p>
        )}
        {loading && <p className="text-sm text-slate-400 mt-0.5">Vérification…</p>}
        {error && <p className="text-sm text-red-500 mt-0.5">{error}</p>}
      </div>

      <div className="p-6 max-w-4xl space-y-8">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-4">Intégrations externes</p>
          <AppSettingsEditor />
        </div>

        <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-4">Intégrations</p>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Vérification des intégrations…</div>
        ) : (
          <div className="space-y-3">
            {INTEGRATIONS.map(integration => (
              <div
                key={integration.key}
                className="bg-white rounded-xl border border-slate-200 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-sm font-semibold text-slate-900">{integration.name}</h3>
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded font-mono">
                        {integration.type}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mb-2">{integration.description}</p>
                    <p className="text-xs text-slate-400 font-mono">{integration.scope}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {integration.envVars.map(v => (
                        <span
                          key={v}
                          className="text-xs font-mono text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded"
                        >
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex-shrink-0 pt-0.5">
                    {health ? (
                      <StatusBadge ok={health[integration.key]} />
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
