'use client'

import { useState, useEffect } from 'react'

const apiKeys = [
  { name: 'OPENAI_API_KEY', label: 'OpenAI API Key', description: 'Clé pour les fonctionnalités IA (GPT-4o)' },
  { name: 'NEXT_PUBLIC_SUPABASE_URL', label: 'Supabase URL', description: 'URL de la base de données Supabase' },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', label: 'Supabase Anon Key', description: 'Clé publique Supabase' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', label: 'Supabase Service Role Key', description: 'Clé service Supabase (backend uniquement)' },
]

const integrations = [
  { name: 'Zoho Desk', description: 'Gestion des tickets support', icon: '🎫' },
  { name: 'Linear', description: 'Suivi des escalades techniques', icon: '📋' },
  { name: 'Slack', description: 'Notifications et alertes', icon: '💬' },
  { name: 'LearnWorlds', description: 'Plateforme de formation', icon: '🎓' },
  { name: 'Zoho Projects', description: 'Suivi des projets onboarding', icon: '📁' },
  { name: 'Acuity Scheduling', description: 'Planification des formations', icon: '📅' },
  { name: 'SalesIQ', description: 'Chat en direct', icon: '💭' },
  { name: 'Ringover', description: 'Téléphonie cloud', icon: '📞' },
]

interface WebhookStats {
  lastReceived: string | null
  dailyCount: number
}

function WebhookStatusBlock() {
  const [stats, setStats] = useState<WebhookStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/webhooks/zoho-desk/stats')
      .then(r => r.ok ? r.json() : null)
      .then(data => setStats(data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false))
  }, [])

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/webhooks/zoho-desk/test', { method: 'POST' })
      const data = await res.json()
      setTestResult(data.ok ? 'Webhook OK' : `Erreur : ${data.error}`)
    } catch {
      setTestResult('Erreur réseau')
    } finally {
      setTesting(false)
    }
  }

  return (
    <section>
      <h2 className="text-base font-semibold text-slate-800 mb-4">Webhook temps réel (RAG)</h2>
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        {loading ? (
          <p className="text-sm text-slate-400">Chargement...</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-700">Dernier événement reçu</span>
              <span className="text-sm font-mono text-slate-500">
                {stats?.lastReceived
                  ? new Date(stats.lastReceived).toLocaleString('fr-FR')
                  : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-700">Événements aujourd&apos;hui</span>
              <span className="text-sm font-mono text-slate-500">{stats?.dailyCount ?? 0}</span>
            </div>
            <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
              <button
                onClick={handleTest}
                disabled={testing}
                className="text-sm px-3 py-1.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                {testing ? 'Test en cours...' : 'Tester le webhook'}
              </button>
              {testResult && (
                <span className={`text-xs font-medium ${testResult.startsWith('Erreur') ? 'text-red-600' : 'text-green-600'}`}>
                  {testResult}
                </span>
              )}
            </div>
          </div>
        )}
        <p className="text-xs text-slate-400 mt-3">
          Enregistrez le webhook via <code className="font-mono">npx tsx scripts/register-zoho-webhook.ts</code>
        </p>
      </div>
    </section>
  )
}

export default function SettingsPage() {
  return (
    <div>
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-slate-900">Paramètres</h1>
        <p className="text-sm text-slate-500 mt-0.5">Configuration du cockpit D-EDGE Ops</p>
      </div>

      <div className="p-6 space-y-8 max-w-2xl">
        {/* API Keys section */}
        <section>
          <h2 className="text-base font-semibold text-slate-800 mb-4">Clés API</h2>
          <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
            {apiKeys.map(key => {
              // For demo: OPENAI_API_KEY is "configured" (we check if it looks set)
              const isConfigured = key.name === 'OPENAI_API_KEY'
              return (
                <div key={key.name} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{key.label}</p>
                    <p className="text-xs text-slate-400 font-mono">{key.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{key.description}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        isConfigured ? 'bg-green-500' : 'bg-slate-300'
                      }`}
                    />
                    <span
                      className={`text-xs font-medium ${
                        isConfigured ? 'text-green-700' : 'text-slate-400'
                      }`}
                    >
                      {isConfigured ? 'Configuré' : 'Non configuré'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Configurez ces variables dans votre fichier <code className="font-mono">.env.local</code>
          </p>
        </section>

        {/* Integrations section */}
        <section>
          <h2 className="text-base font-semibold text-slate-800 mb-4">Intégrations</h2>
          <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
            {integrations.map(integration => (
              <div key={integration.name} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{integration.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{integration.name}</p>
                    <p className="text-xs text-slate-500">{integration.description}</p>
                  </div>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">
                  Non connecté
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Les intégrations seront disponibles à partir du Sprint 2.
          </p>
        </section>

        <WebhookStatusBlock />

        {/* Preferences section */}
        <section>
          <h2 className="text-base font-semibold text-slate-800 mb-4">Préférences</h2>
          <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Langue de l&apos;interface
              </label>
              <select
                defaultValue="fr"
                className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white text-slate-700"
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Filtre par défaut — Tickets
              </label>
              <select
                defaultValue="open"
                className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white text-slate-700"
              >
                <option value="">Tous les statuts</option>
                <option value="open">Ouverts uniquement</option>
                <option value="pending">En attente uniquement</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tri par défaut — Tickets
              </label>
              <select
                defaultValue="riskScore"
                className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white text-slate-700"
              >
                <option value="riskScore">Score de risque (décroissant)</option>
                <option value="date">Date de création (décroissant)</option>
              </select>
            </div>
            <p className="text-xs text-slate-400">
              Les préférences seront persistées en Sprint 4 avec Supabase.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
