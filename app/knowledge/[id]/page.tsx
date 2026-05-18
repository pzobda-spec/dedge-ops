'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Badge from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils/dates'

type KnowledgeArticle = {
  id: string
  title: string
  product_area: string
  problem: string
  symptoms: string[]
  causes: string[]
  checks: string[]
  solution: string
  client_reply_template: string
  source_ticket_id: string | null
  created_at: string
}

export default function KnowledgeArticlePage() {
  const params = useParams()
  const router = useRouter()
  const articleId = params.id as string

  const [article, setArticle] = useState<KnowledgeArticle | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({})
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch(`/api/knowledge/${articleId}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null }
        return r.json()
      })
      .then(data => { if (data) setArticle(data) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [articleId])

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
        Chargement...
      </div>
    )
  }

  if (notFound || !article) {
    return (
      <div className="p-6">
        <p className="text-slate-500">Article introuvable.</p>
        <button onClick={() => router.back()} className="mt-4 text-sm text-blue-600 underline">Retour</button>
      </div>
    )
  }

  function toggleCheck(index: number) {
    setCheckedItems(prev => ({ ...prev, [index]: !prev[index] }))
  }

  function copyTemplate() {
    navigator.clipboard.writeText(article!.client_reply_template)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-2 mb-1">
          <button onClick={() => router.back()} className="text-sm text-slate-500 hover:text-slate-700 mr-2">
            ← Retour
          </button>
          <Badge label={article.product_area} variant="default" />
          <span className="text-xs text-slate-400">{formatDate(article.created_at)}</span>
        </div>
        <h1 className="text-xl font-semibold text-slate-900">{article.title}</h1>
      </div>

      <div className="p-6 space-y-6 max-w-3xl">
        <section>
          <h2 className="text-base font-semibold text-slate-800 mb-2">Problème</h2>
          <p className="text-sm text-slate-700 bg-white rounded-lg border border-slate-200 p-4 leading-relaxed">
            {article.problem}
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-800 mb-2">Symptômes</h2>
          <ul className="space-y-1">
            {(article.symptoms ?? []).map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="text-slate-400 mt-0.5">•</span>{s}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-800 mb-2">Causes fréquentes</h2>
          <ul className="space-y-1">
            {(article.causes ?? []).map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="text-orange-400 mt-0.5">⚠</span>{c}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-800 mb-2">Vérifications à effectuer</h2>
          <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
            {(article.checks ?? []).map((check, i) => (
              <label key={i} className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  checked={checkedItems[i] || false}
                  onChange={() => toggleCheck(i)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 cursor-pointer"
                />
                <span className={`text-sm ${checkedItems[i] ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                  {check}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {Object.values(checkedItems).filter(Boolean).length} / {(article.checks ?? []).length} vérifications effectuées
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-800 mb-2">Solution</h2>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-900 leading-relaxed">{article.solution}</p>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold text-slate-800">Template de réponse client</h2>
            <button
              onClick={copyTemplate}
              className="text-xs px-3 py-1.5 bg-slate-900 text-white rounded-md hover:bg-slate-700 transition-colors"
            >
              {copied ? '✓ Copié !' : 'Copier'}
            </button>
          </div>
          <pre className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed overflow-auto">
            {article.client_reply_template}
          </pre>
        </section>

        {article.source_ticket_id && (
          <p className="text-xs text-slate-400">Source : ticket {article.source_ticket_id}</p>
        )}
      </div>
    </div>
  )
}
