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

const productAreas = [
  'Tous les produits',
  'CRM Core',
  'Campaigns',
  'Guest Profile',
  'PMS',
  'WhatsApp',
  'Guest App',
]

export default function KnowledgePage() {
  const [articles, setArticles] = useState<KnowledgeArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterProduct, setFilterProduct] = useState('Tous les produits')

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
