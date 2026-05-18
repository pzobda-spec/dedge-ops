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

  // Suggest tickets state
  const [activePanel, setActivePanel] = useState<'suggest' | 'similar' | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loadingSuggest, setLoadingSuggest] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)

  // Find similar bug state
  const [similarSubject, setSimilarSubject] = useState('')
  const [similarDesc, setSimilarDesc] = useState('')
  const [similarProduct, setSimilarProduct] = useState('')
  const [loadingSimilar, setLoadingSimilar] = useState(false)
  const [similarResult, setSimilarResult] = useState<FindSimilarResult | null>(null)
  const [similarError, setSimilarError] = useState<string | null>(null)

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

  async function handleFindSimilar() {
    if (!similarSubject.trim()) return
    setLoadingSimilar(true)
    setSimilarError(null)
    setSimilarResult(null)
    try {
      const res = await fetch('/api/ai/find-similar-bug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: similarSubject,
          description: similarDesc || undefined,
          productArea: similarProduct || undefined,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSimilarResult(data)
    } catch (err) {
      setSimilarError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoadingSimilar(false)
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

        {/* AI assistant panels */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="flex border-b border-slate-100">
            <button
              onClick={() => setActivePanel(activePanel === 'suggest' ? null : 'suggest')}
              className={`flex-1 px-4 py-3 text-sm font-medium text-left transition-colors ${
                activePanel === 'suggest'
                  ? 'bg-slate-50 text-slate-900 border-b-2 border-slate-900'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Tickets suggérés
              <span className="ml-2 text-xs text-slate-400 font-normal">Zoho × Linear</span>
            </button>
            <button
              onClick={() => setActivePanel(activePanel === 'similar' ? null : 'similar')}
              className={`flex-1 px-4 py-3 text-sm font-medium text-left transition-colors ${
                activePanel === 'similar'
                  ? 'bg-slate-50 text-slate-900 border-b-2 border-slate-900'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Find similar bug
              <span className="ml-2 text-xs text-slate-400 font-normal">Rechercher dans BUGS</span>
            </button>
          </div>

          {/* Suggest panel */}
          {activePanel === 'suggest' && (
            <div className="p-4 space-y-4">
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

          {/* Find similar bug panel */}
          {activePanel === 'similar' && (
            <div className="p-4 space-y-4">
              <p className="text-xs text-slate-500">
                Entrez le titre du ticket courant pour trouver des bugs similaires dans le board Linear BUGS (tous statuts inclus).
              </p>

              <div className="space-y-2">
                <input
                  type="text"
                  value={similarSubject}
                  onChange={e => setSimilarSubject(e.target.value)}
                  placeholder="Titre / sujet du ticket..."
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-700 placeholder-slate-400"
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleFindSimilar() }}
                />
                <div className="flex gap-2">
                  <textarea
                    value={similarDesc}
                    onChange={e => setSimilarDesc(e.target.value)}
                    placeholder="Description / contexte (optionnel)..."
                    rows={2}
                    className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-700 placeholder-slate-400 resize-none"
                  />
                  <select
                    value={similarProduct}
                    onChange={e => setSimilarProduct(e.target.value)}
                    className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white text-slate-700 self-start"
                  >
                    <option value="">Produit (optionnel)</option>
                    {productAreas.slice(1).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">Cmd+Enter pour lancer</p>
                  <button
                    onClick={handleFindSimilar}
                    disabled={loadingSimilar || !similarSubject.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors"
                  >
                    {loadingSimilar && (
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    {loadingSimilar ? 'Recherche en cours...' : 'Rechercher'}
                  </button>
                </div>
              </div>

              {similarError && (
                <p className="text-sm text-red-600">{similarError}</p>
              )}

              {similarResult && (
                <div className="space-y-4">
                  {/* Very similar */}
                  {similarResult.verySimilar.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                        Très similaire
                      </h3>
                      <div className="space-y-2">
                        {similarResult.verySimilar.map((issue, i) => (
                          <SimilarIssueCard key={i} issue={issue} level="very" />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Potentially related */}
                  {similarResult.potentiallyRelated.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                        Potentiellement lié
                      </h3>
                      <div className="space-y-2">
                        {similarResult.potentiallyRelated.map((issue, i) => (
                          <SimilarIssueCard key={i} issue={issue} level="related" />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* To check */}
                  {similarResult.toCheck.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                        À vérifier
                      </h3>
                      <div className="space-y-2">
                        {similarResult.toCheck.map((issue, i) => (
                          <SimilarIssueCard key={i} issue={issue} level="check" />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommendation */}
                  {similarResult.recommendation && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-blue-900">{similarResult.recommendation}</p>
                    </div>
                  )}

                  {similarResult.verySimilar.length === 0 &&
                    similarResult.potentiallyRelated.length === 0 &&
                    similarResult.toCheck.length === 0 && (
                    <p className="text-sm text-slate-500 text-center py-4">
                      Aucun bug similaire trouvé dans Linear BUGS.
                    </p>
                  )}
                </div>
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

function SimilarIssueCard({ issue, level }: { issue: SimilarIssue; level: 'very' | 'related' | 'check' }) {
  const borderColor = level === 'very' ? 'border-orange-200 bg-orange-50' : 'border-slate-200 bg-white'
  const icon = level === 'very' ? '🎯' : level === 'related' ? '🔍' : '💡'

  return (
    <div className={`rounded-lg border p-3 ${borderColor}`}>
      <div className="flex items-start gap-2">
        <span className="text-sm flex-shrink-0 mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <a
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-blue-600 hover:underline flex-shrink-0"
            >
              {issue.identifier}
            </a>
            <span className="text-sm font-medium text-slate-900 truncate">{issue.title}</span>
            <LinearStatusBadge status={issue.status} />
          </div>
          {issue.whySimilar && (
            <p className="text-xs text-slate-600 mb-1">{issue.whySimilar}</p>
          )}
          {issue.cause && issue.cause !== 'non documenté' && (
            <p className="text-xs text-slate-500">
              <span className="font-medium">Cause :</span> {issue.cause}
            </p>
          )}
          {issue.solution && issue.solution !== 'non documenté' && (
            <p className="text-xs text-slate-500">
              <span className="font-medium">Solution :</span> {issue.solution}
            </p>
          )}
          {issue.assigneeName && (
            <p className="text-xs text-slate-400 mt-1">{issue.assigneeName}</p>
          )}
        </div>
      </div>
    </div>
  )
}
