'use client'

import { useEffect, useState, useCallback } from 'react'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'

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
  { key: 'zohoDeskConfigured',     name: 'Zoho Desk',          type: 'OAuth2',         description: 'Tickets support, conversations, réponses', scope: 'ZohoDesk.tickets.READ · ZohoDesk.tickets.UPDATE · ZohoDesk.tickets.CREATE', envVars: ['ZOHO_REFRESH_TOKEN', 'ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET'] },
  { key: 'zohoCrmConfigured',      name: 'Zoho CRM',           type: 'OAuth2',         description: 'Comptes clients, segments MRR (lecture seule)', scope: 'ZohoCRM.modules.READ', envVars: ['ZOHO_CRM_REFRESH_TOKEN'] },
  { key: 'zohoProjectsConfigured', name: 'Zoho Projects',      type: 'OAuth2',         description: 'Projets onboarding, statuts, avancement', scope: 'ZohoProjects.portals.READ', envVars: ['ZOHO_PROJECTS_REFRESH_TOKEN'] },
  { key: 'zohoFormsConfigured',    name: 'Zoho Forms',         type: 'OAuth2',         description: 'Formulaires de satisfaction client', scope: 'ZohoForms.form.READ (partage le token Zoho Desk)', envVars: ['ZOHO_FORMS_SATISFACTION_FORM'] },
  { key: 'linearConfigured',       name: 'Linear',             type: 'API Token',      description: 'Dashboard Bugs — workspace loungeup, équipe BUGS', scope: 'Issues READ', envVars: ['LINEAR_API_KEY'] },
  { key: 'acuityConfigured',       name: 'Acuity Scheduling',  type: 'Credentials',    description: 'Sessions de formation, participants, calendriers', scope: 'Appointments READ · Calendars READ', envVars: ['ACUITY_USER_ID', 'ACUITY_API_KEY'] },
  { key: 'supabaseConfigured',     name: 'Supabase',           type: 'REST + Postgres', description: 'Base de données, cache, vecteurs pgvector', scope: 'Service role (full access backend)', envVars: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] },
  { key: 'openaiConfigured',       name: 'OpenAI',             type: 'API Key',        description: 'Actions IA sur les tickets, suggestions', scope: 'GPT-4o mini · Chat Completions · Embeddings (text-embedding-3-small)', envVars: ['OPENAI_API_KEY'] },
]

interface AppSetting {
  key: string
  value: string | null
  description: string | null
  updated_by: string | null
  updated_at: string
}

interface AnalyticsSyncResult {
  synced: number
  created: number
  updated: number
}

function StatusBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1c6437] bg-[#cff7dc] border border-[#86efac] px-2.5 py-1 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a] inline-block" />
      Connecté
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#b7221b] bg-[#fee3e2] border border-[#fca5a5] px-2.5 py-1 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-[#b7221b] inline-block" />
      Non configuré
    </span>
  )
}

const inputCls = 'mt-3 w-full rounded-lg border border-[#e2e2e2] px-3 py-2 text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#3b72d1]'

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
    setSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s))
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
      setError(err instanceof Error ? err.message : "Impossible d'enregistrer.")
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <p className="text-sm text-[#696969]">Chargement…</p>
  if (error && settings.length === 0) return <p className="text-sm text-[#696969]">{error}</p>

  return (
    <div className="space-y-3">
      {settings.map(setting => (
        <div key={setting.key} className="bg-white rounded-xl border border-[#e2e2e2] shadow-[0_4px_8px_rgba(0,0,0,0.06)] p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#1a1a1a]">{setting.key}</p>
              {setting.description && <p className="text-sm text-[#696969] mt-1">{setting.description}</p>}
              <input
                value={setting.value ?? ''}
                onChange={e => updateValue(setting.key, e.target.value)}
                className={inputCls}
              />
            </div>
            <button
              onClick={() => save(setting)}
              disabled={saving === setting.key}
              className="px-3 py-2 rounded-lg bg-[#59319f] text-white text-sm font-medium hover:bg-[#3f2175] disabled:opacity-50 transition-colors"
            >
              {saving === setting.key ? '…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      ))}
      {error && <p className="text-sm text-[#b7221b] bg-[#fee3e2] border border-[#fca5a5] rounded-lg px-3 py-2">{error}</p>}
      {message && <p className="text-sm text-[#1c6437] bg-[#cff7dc] border border-[#86efac] rounded-lg px-3 py-2">{message}</p>}
    </div>
  )
}

function AnalyticsSyncCard() {
  const { user, loading: userLoading } = useCurrentUser()
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function syncAnalytics() {
    setSyncing(true)
    setMessage(null)
    setError(null)

    const targets = [
      { name: 'Tickets', path: '/api/cron/sync-ticket-analytics' },
      { name: 'Linear', path: '/api/cron/sync-linear-analytics' },
    ]

    try {
      const responses = await Promise.allSettled(targets.map(async target => {
        const response = await fetch(target.path, { method: 'POST' })
        const body = await response.json().catch(() => ({})) as Partial<AnalyticsSyncResult> & { error?: string }
        if (!response.ok) {
          throw new Error(`${target.name} : ${body.error ?? `HTTP ${response.status}`}`)
        }
        return { name: target.name, result: body as AnalyticsSyncResult }
      }))

      const successes = responses.flatMap(response => response.status === 'fulfilled' ? [response.value] : [])
      const failures = responses.flatMap(response => response.status === 'rejected' ? [response.reason] : [])

      if (successes.length > 0) {
        setMessage(successes
          .map(({ name, result }) => `${name} : ${result.synced} synchronisé${result.synced > 1 ? 's' : ''} (${result.created} créé${result.created > 1 ? 's' : ''}, ${result.updated} mis à jour)`)
          .join(' · '))
      }
      if (failures.length > 0) {
        setError(failures
          .map(failure => failure instanceof Error ? failure.message : String(failure))
          .join(' · '))
      }
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'La synchronisation a échoué.')
    } finally {
      setSyncing(false)
    }
  }

  if (userLoading || user?.role !== 'admin') return null

  return (
    <div>
      <p className="text-xs font-bold text-[#696969] uppercase tracking-wide mb-4">Maintenance</p>
      <div className="bg-white rounded-xl border border-[#e2e2e2] shadow-[0_4px_8px_rgba(0,0,0,0.06)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#1a1a1a]">Données analytiques</h3>
            <p className="text-sm text-[#696969] mt-1">
              Actualise les 12 derniers mois de tickets Zoho Desk et d&apos;issues Linear sans attendre le cron quotidien.
            </p>
          </div>
          <button
            type="button"
            onClick={syncAnalytics}
            disabled={syncing}
            className="shrink-0 px-4 py-2 rounded-lg bg-[#59319f] text-white text-sm font-medium hover:bg-[#3f2175] disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {syncing ? 'Synchronisation…' : 'Synchroniser les données analytiques'}
          </button>
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-[#b7221b] bg-[#fee3e2] border border-[#fca5a5] rounded-lg px-3 py-2">{error}</p>}
        {message && <p className="mt-4 text-sm text-[#1c6437] bg-[#cff7dc] border border-[#86efac] rounded-lg px-3 py-2">{message}</p>}
      </div>
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

  return (
    <div style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'var(--bg-canvas)' }} className="min-h-screen">
      <div className="bg-white border-b border-[#e2e2e2] px-6 py-4">
        <h1 className="text-xl font-semibold text-[#1a1a1a]">Paramètres</h1>
        {!loading && !error && health && (
          <p className="text-sm text-[#696969] mt-0.5">
            {connectedCount}/{INTEGRATIONS.length} intégrations configurées
          </p>
        )}
        {loading && <p className="text-sm text-[#696969] mt-0.5">Vérification…</p>}
        {error && <p className="text-sm text-[#b7221b] mt-0.5">{error}</p>}
      </div>

      <div className="p-6 max-w-4xl space-y-8">
        <div>
          <p className="text-xs font-bold text-[#696969] uppercase tracking-wide mb-4">Paramètres de l&apos;application</p>
          <AppSettingsEditor />
        </div>

        <AnalyticsSyncCard />

        <div>
          <p className="text-xs font-bold text-[#696969] uppercase tracking-wide mb-4">Intégrations</p>
          {loading ? (
            <div className="py-12 text-center text-[#696969] text-sm">Vérification des intégrations…</div>
          ) : (
            <div className="space-y-3">
              {INTEGRATIONS.map(integration => (
                <div key={integration.key} className="bg-white rounded-xl border border-[#e2e2e2] shadow-[0_4px_8px_rgba(0,0,0,0.06)] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-sm font-semibold text-[#1a1a1a]">{integration.name}</h3>
                        <span className="text-xs text-[#696969] bg-[#f7f7f7] px-2 py-0.5 rounded font-mono">
                          {integration.type}
                        </span>
                      </div>
                      <p className="text-sm text-[#696969] mb-2">{integration.description}</p>
                      <p className="text-xs text-[#b0b0b0] font-mono">{integration.scope}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {integration.envVars.map(v => (
                          <span key={v} className="text-xs font-mono text-[#696969] bg-[#f7f7f7] border border-[#e2e2e2] px-1.5 py-0.5 rounded">
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex-shrink-0 pt-0.5">
                      {health ? <StatusBadge ok={health[integration.key]} /> : <span className="text-xs text-[#696969]">—</span>}
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
