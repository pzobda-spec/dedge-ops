'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils/dates'

type KnowledgeArticle = {
  id: string
  title: string
  product_area: string
  problem: string
  created_at: string
}

type TicketRef = {
  id: string
  subject: string
  productArea: string
  clientName: string
  segment: string | null
  riskScore: number
  priority: string
}

type LinearRef = {
  identifier: string
  title: string
  status: string
  url: string
}

type Suggestion = {
  theme: string
  productArea: string
  rationale: string
  tickets: TicketRef[]
  linearIssue: LinearRef | null
  suggestKB: boolean
}

type SimilarIssue = {
  identifier: string
  title: string
  status: string
  assigneeName?: string | null
  updatedAt?: string
  url: string
  cause?: string
  solution?: string
  whySimilar: string
}

type FindSimilarResult = {
  verySimilar: SimilarIssue[]
  potentiallyRelated: SimilarIssue[]
  toCheck: SimilarIssue[]
  recommendation: string
}

const productAreas = [
  'Tous les produits',
  'CRM Core',
  'Campaigns',
  'Guest Profile',
  'PMS',
  'WhatsApp',
  'Guest App',
]

const STATUS_COLORS: Record<string, string> = {
  'In Progress': 'text-blue-600',
  'Todo': 'text-slate-500',
  'Backlog': 'text-slate-400',
  'Done': 'text-green-600',
  'Solved': 'text-green-600',
  'Cancelled': 'text-slate-400',
}

function LinearStatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? 'text-slate-500'
  return (
    <span className={`text-xs font-medium ${color}`}>{status}</span>
  )
}

export default function KnowledgePage() {
  const [articles, setArticles] = useState<KnowledgeArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterProduct, setFilterProduct] = useState('Tous les produits')

  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loadingSuggest, setLoadingSuggest] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/knowledge')
      .then(r => r.json())
      .then(data => setArticles(data.articles ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = articles.filter(a => {
    const matchesSearch =
      !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      (a.problem ?? '').toLowerCase().includes(search.toLowerCase())
    const matchesProduct =
      filterProduct === 'Tous les produits' || a.product_area === filterProduct
    return matchesSearch && matchesProduct
  })

  async function handleSuggest() {
    setLoadingSuggest(true)
    setSuggestError(null)
    setSuggestions([])
    try {
      const res = await fetch('/api/ai/suggest-tickets', { method: 'POST' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSuggestions(data.suggestions ?? [])
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoadingSuggest(false)
    }
  }


  return (
    <div>
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Base de connaissances</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? 'Chargement...' : `${articles.length} articles · ${filtered.length} affichés`}
          </p>
        </div>
        <Link href="/tickets" className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-700 transition-colors">
          Créer depuis un ticket
        </Link>
      </div>

      <div className="p-6 space-y-4">

        {/* Tickets suggérés IA */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <button
            onClick={() => setSuggestOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <span>
              Tickets suggérés par l&apos;IA
              <span className="ml-2 text-xs text-slate-400 font-normal">Zoho × Linear</span>
            </span>
            <svg className={`w-4 h-4 text-slate-400 transition-transform ${suggestOpen ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {suggestOpen && (
            <div className="border-t border-slate-100 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Analyse les tickets Zoho ouverts et les issues Linear pour identifier des patterns récurrents.
                </p>
                <button
                  onClick={handleSuggest}
                  disabled={loadingSuggest}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors"
                >
                  {loadingSuggest && (
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  {loadingSuggest ? 'Analyse en cours...' : 'Analyser les tickets ouverts'}
                </button>
              </div>

              {suggestError && (
                <p className="text-sm text-red-600">{suggestError}</p>
              )}

              {suggestions.length > 0 && (
                <div className="space-y-3">
                  {suggestions.map((s, i) => (
                    <div key={i} className={`rounded-lg border p-4 ${s.suggestKB ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-semibold text-slate-900">{s.theme}</span>
                            <Badge label={s.productArea} variant="default" />
                            {s.suggestKB && (
                              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                                KB recommandée
                              </span>
                            )}
                            {s.linearIssue && (
                              <a
                                href={s.linearIssue.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-mono text-blue-600 hover:underline"
                              >
                                {s.linearIssue.identifier}
                              </a>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 mb-2">{s.rationale}</p>

                          {s.linearIssue && (
                            <div className="flex items-center gap-2 mb-2 text-xs text-slate-500">
                              <span className="font-mono text-slate-400">{s.linearIssue.identifier}</span>
                              <span className="text-slate-300">·</span>
                              <LinearStatusBadge status={s.linearIssue.status} />
                              <span className="text-slate-300">·</span>
                              <span className="truncate max-w-xs">{s.linearIssue.title}</span>
                            </div>
                          )}

                          <div className="space-y-1">
                            {s.tickets.map(t => (
                              <Link
                                key={t.id}
                                href={`/tickets/${t.id}`}
                                className="flex items-center gap-2 text-xs text-slate-700 hover:text-slate-900 group"
                              >
                                <span className="text-slate-300">→</span>
                                <span className="group-hover:underline truncate">{t.subject}</span>
                                <span className="text-slate-400 flex-shrink-0">{t.clientName}</span>
                                {t.segment && (
                                  <span className="text-slate-400 flex-shrink-0">{t.segment}</span>
                                )}
                              </Link>
                            ))}
                          </div>
                        </div>

                        <div className="flex-shrink-0 flex items-center gap-2">
                          <span className="text-xs text-slate-400">{s.tickets.length} ticket{s.tickets.length > 1 ? 's' : ''}</span>
                          {s.tickets[0] && (
                            <Link
                              href={`/tickets/${s.tickets[0].id}`}
                              className="px-2 py-1 bg-slate-900 text-white rounded text-xs hover:bg-slate-700 transition-colors whitespace-nowrap"
                            >
                              Créer fiche KB
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!loadingSuggest && suggestions.length === 0 && !suggestError && (
                <p className="text-xs text-slate-400 text-center py-2">
                  Cliquez sur &quot;Analyser&quot; pour lancer l&apos;analyse IA.
                </p>
              )}
            </div>
          )}

        </div>

        {/* Search + filter */}
        <div className="flex gap-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un article..."
            className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm bg-white text-slate-700 placeholder-slate-400"
          />
          <select
            value={filterProduct}
            onChange={e => setFilterProduct(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white text-slate-700"
          >
            {productAreas.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
            <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            Chargement...
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.length === 0 ? (
              <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-400 text-sm">
                Aucun article trouvé
              </div>
            ) : (
              filtered.map(article => (
                <Link key={article.id} href={`/knowledge/${article.id}`}>
                  <div className="bg-white rounded-lg border border-slate-200 p-4 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge label={article.product_area} variant="default" />
                          <span className="text-xs text-slate-400">{formatDate(article.created_at)}</span>
                        </div>
                        <h2 className="text-sm font-semibold text-slate-900 mb-1">{article.title}</h2>
                        <p className="text-xs text-slate-500 line-clamp-2">{article.problem}</p>
                      </div>
                      <span className="ml-4 text-slate-400 text-sm">→</span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

