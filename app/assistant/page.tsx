'use client'

import { useState, useEffect } from 'react'
import type { ZohoMappedTicket } from '@/lib/zoho/mapper'
import ActionButton from '@/components/ui/ActionButton'

const quickActions = [
  { label: 'Résumer un ticket',    prompt: 'Résume le ticket ZD-1001 pour moi.' },
  { label: 'Rédiger une réponse',  prompt: 'Rédige une réponse professionnelle au client pour le ticket ZD-1001.' },
  { label: 'Créer un ticket tech', prompt: "Crée un ticket d'escalade technique pour le ticket ZD-1001." },
  { label: 'Créer une fiche KB',   prompt: 'Crée une fiche de base de connaissances à partir du ticket ZD-1001.' },
  { label: 'Analyser un mois',     prompt: 'Analyse les métriques du mois de mai 2026.' },
  { label: 'Préparer une formation', prompt: 'Prépare le contenu pour une formation CRM Core en français.' },
]

type HistoryItem = { prompt: string; result: string; timestamp: string }

export default function AssistantPage() {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [output, setOutput] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [copied, setCopied] = useState(false)
  const [sampleTicket, setSampleTicket] = useState<ZohoMappedTicket | null>(null)

  useEffect(() => {
    fetch('/api/zoho/tickets?limit=1')
      .then(r => r.json())
      .then(data => setSampleTicket(data.tickets?.[0] ?? null))
      .catch(() => {})
  }, [])

  useEffect(() => {
    try {
      const stored = localStorage.getItem('assistant_history')
      if (stored) setHistory(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])

  function saveToHistory(p: string, result: string) {
    const item: HistoryItem = { prompt: p, result, timestamp: new Date().toISOString() }
    const updated = [item, ...history].slice(0, 5)
    setHistory(updated)
    try { localStorage.setItem('assistant_history', JSON.stringify(updated)) } catch { /* ignore */ }
  }

  async function handleSubmit() {
    if (!prompt.trim()) return
    setLoading(true)
    setOutput(null)

    const ticket = sampleTicket
    if (!ticket) {
      setOutput('Aucun ticket disponible pour le contexte.')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/ai/summarize-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: ticket.zohoInternalId,
          subject: ticket.subject,
          clientName: ticket.clientName,
          segment: ticket.segment ?? 'Gold',
          productArea: ticket.productArea,
          conversationHistory: `Demande : "${prompt}"`,
          ageHours: Math.round((Date.now() - new Date(ticket.createdAt).getTime()) / 3600000),
        }),
      })
      const data = await res.json()
      const resultStr = JSON.stringify(data, null, 2)
      setOutput(resultStr)
      saveToHistory(prompt, resultStr)
    } catch {
      const errStr = 'Erreur lors de la génération. Vérifiez la clé API OpenAI.'
      setOutput(errStr)
      saveToHistory(prompt, errStr)
    } finally {
      setLoading(false)
    }
  }

  function handleCopy() {
    if (!output) return
    navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'var(--bg-canvas)' }} className="min-h-screen">
      <div className="bg-white border-b border-[#e2e2e2] px-6 py-4">
        <h1 className="text-xl font-semibold text-[#1a1a1a]">Assistant IA</h1>
        <p className="text-sm text-[#696969] mt-0.5">
          Génération assistée · Résumés, réponses, escalades, fiches KB
        </p>
      </div>

      <div className="p-6 space-y-6 max-w-3xl">
        {/* Quick action chips */}
        <div>
          <p className="text-xs text-[#696969] uppercase font-semibold mb-2">Actions rapides</p>
          <div className="flex flex-wrap gap-2">
            {quickActions.map(action => (
              <button
                key={action.label}
                onClick={() => setPrompt(action.prompt)}
                className="px-3 py-1.5 bg-white border border-[#e2e2e2] rounded-full text-sm text-[#4a4a4a] hover:bg-[#f7f4fd] hover:border-[#c0a4f0] hover:text-[#59319f] transition-colors"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div>
          <label className="block text-sm font-medium text-[#4a4a4a] mb-2">
            Que voulez-vous faire ?
          </label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={4}
            placeholder="Décrivez votre demande ou choisissez une action rapide ci-dessus…"
            className="w-full border border-[#e2e2e2] rounded-lg px-3 py-2 text-sm text-[#1a1a1a] placeholder:text-[#b0b0b0] resize-none focus:outline-none focus:ring-2 focus:ring-[#3b72d1]"
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit() }}
          />
          <p className="text-xs text-[#b0b0b0] mt-1">Cmd+Enter pour soumettre</p>
        </div>

        <ActionButton label="Générer" onClick={handleSubmit} loading={loading} disabled={!prompt.trim()} />

        {/* Output panel */}
        {(loading || output) && (
          <div className="bg-white rounded-xl border border-[#e2e2e2] shadow-[0_4px_8px_rgba(0,0,0,0.06)] p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#4a4a4a]">Résultat</h2>
              {output && (
                <button
                  onClick={handleCopy}
                  className="text-xs px-3 py-1 bg-[#f7f7f7] text-[#696969] rounded hover:bg-[#e2e2e2] transition-colors"
                >
                  {copied ? 'Copié !' : 'Copier'}
                </button>
              )}
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-[#696969]">
                <div className="w-4 h-4 border-2 border-[#e2e2e2] border-t-[#59319f] rounded-full animate-spin" />
                Génération en cours…
              </div>
            ) : (
              <pre className="text-xs bg-[#f7f7f7] rounded-lg p-3 overflow-auto max-h-80 text-[#4a4a4a] whitespace-pre-wrap">
                {output}
              </pre>
            )}
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-[#4a4a4a] mb-3">
              Historique récent ({history.length})
            </h2>
            <div className="space-y-2">
              {history.map((item, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl border border-[#e2e2e2] p-3 cursor-pointer hover:bg-[#f7f4fd] hover:border-[#c0a4f0] transition-colors"
                  onClick={() => { setPrompt(item.prompt); setOutput(item.result) }}
                >
                  <p className="text-sm font-medium text-[#4a4a4a] line-clamp-1">{item.prompt}</p>
                  <p className="text-xs text-[#696969] mt-0.5">
                    {new Date(item.timestamp).toLocaleString('fr-FR')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
