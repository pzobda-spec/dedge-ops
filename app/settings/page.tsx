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

interface AccessRequest {
  id: string
  email: string
  requested_at: string
  status: string
}

function AccessRequests() {
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/pending', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setRequests(data.requests ?? [])
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Impossible de charger les demandes.')
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleAction(email: string, action: 'approve' | 'reject') {
    setActing(email)
    await fetch('/api/auth/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, action }),
    })
    await load()
    setActing(null)
  }

  const pending = requests.filter(r => r.status === 'pending')
  const others = requests.filter(r => r.status !== 'pending')

  if (loading) return <p className="text-sm text-slate-400">Chargement…</p>
  if (error) return (
    <p className="text-sm text-red-500">Impossible de charger les demandes d&apos;accès : {error}</p>
  )
  if (requests.length === 0) return (
    <p className="text-sm text-slate-400 italic">Aucune demande d&apos;accès.</p>
  )

  return (
    <div className="space-y-2">
      {pending.length > 0 && (
        <>
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">En attente</p>
          {pending.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-amber-200 p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-900">{r.email}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {new Date(r.requested_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleAction(r.email, 'approve')}
                  disabled={acting === r.email}
                  className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {acting === r.email ? '…' : 'Approuver'}
                </button>
                <button
                  onClick={() => handleAction(r.email, 'reject')}
                  disabled={acting === r.email}
                  className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
                >
                  Refuser
                </button>
              </div>
            </div>
          ))}
        </>
      )}
      {others.length > 0 && (
        <>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-4">Traitées</p>
          {others.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-4 opacity-70">
              <p className="text-sm text-slate-700">{r.email}</p>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                r.status === 'approved'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-100 text-slate-500'
              }`}>
                {r.status === 'approved' ? 'Approuvé' : 'Refusé'}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  )
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
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-4">Demandes d&apos;accès</p>
          <AccessRequests />
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
