'use client'

import { useEffect, useState } from 'react'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'

interface CategoryOption {
  id: string
  name: string
  path: string
  status: string
}

interface KBContext {
  helpCenterName: string
  primaryLocale: string
  enabledLocales: string[]
  categories: CategoryOption[]
}

interface GeneratedTranslation {
  locale: 'fr' | 'en' | 'es'
  title: string
  status: string
  zohoAgentUrl: string | null
  portalUrl: string | null
}

interface GenerationResult {
  article: {
    articleId: string
    categoryId: string
    categoryPath: string
    sourceLocale: string
    translations: GeneratedTranslation[]
    warnings: string[]
  }
}

interface SeoAuditTranslation {
  locale: 'fr' | 'en' | 'es'
  title: string
  status: string
  isLocked: boolean
  missing: string[]
}

interface SeoAuditArticle {
  id: string
  title: string
  status: string
  translations: SeoAuditTranslation[]
}

interface SeoAuditPage {
  from: number
  limit: number
  hasMore: boolean
  articles: SeoAuditArticle[]
}

const LOCALE_LABELS: Record<string, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
}

export default function ZohoKnowledgeGeneratorPage() {
  const { user } = useCurrentUser()
  const [context, setContext] = useState<KBContext | null>(null)
  const [contextError, setContextError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [html, setHtml] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [seoAudit, setSeoAudit] = useState<SeoAuditPage | null>(null)
  const [seoLoading, setSeoLoading] = useState(false)
  const [seoError, setSeoError] = useState<string | null>(null)
  const [seoUpdatingId, setSeoUpdatingId] = useState<string | null>(null)
  const [seoBulkUpdating, setSeoBulkUpdating] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/api/zoho/kb/context', { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'Impossible de charger Zoho Desk')
        return payload as KBContext
      })
      .then(payload => { if (active) setContext(payload) })
      .catch(loadError => {
        if (active) setContextError(loadError instanceof Error ? loadError.message : 'Erreur inconnue')
      })
    return () => { active = false }
  }, [])

  const hasStrongTag = /<\/?strong\b/i.test(html)
  const canSubmit = Boolean(title.trim() && html.trim() && context && !submitting)

  async function generateArticle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    setResult(null)
    try {
      const response = await fetch('/api/zoho/kb/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, html, categoryId: categoryId || undefined }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'La génération a échoué')
      setResult(payload as GenerationResult)
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Erreur inconnue')
    } finally {
      setSubmitting(false)
    }
  }

  async function loadSeoAudit(from = 1) {
    setSeoLoading(true)
    setSeoError(null)
    try {
      const response = await fetch(`/api/zoho/kb/seo?from=${from}&limit=5`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Audit SEO impossible')
      setSeoAudit(payload as SeoAuditPage)
    } catch (auditError) {
      setSeoError(auditError instanceof Error ? auditError.message : 'Erreur inconnue')
    } finally {
      setSeoLoading(false)
    }
  }

  async function optimizeSeo(article: SeoAuditArticle) {
    const locales = article.translations.filter(translation => translation.missing.length > 0 && !translation.isLocked).map(translation => translation.locale)
    if (locales.length === 0) return
    setSeoUpdatingId(article.id)
    setSeoError(null)
    try {
      const response = await fetch('/api/zoho/kb/seo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: article.id, locales }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Mise à jour SEO impossible')
      await loadSeoAudit(seoAudit?.from ?? 1)
    } catch (updateError) {
      setSeoError(updateError instanceof Error ? updateError.message : 'Erreur inconnue')
    } finally {
      setSeoUpdatingId(null)
    }
  }

  async function optimizeCurrentSeoBatch() {
    if (!seoAudit) return
    const candidates = seoAudit.articles.filter(article =>
      article.translations.some(translation => translation.missing.length > 0 && !translation.isLocked))
    if (candidates.length === 0) return
    setSeoBulkUpdating(true)
    setSeoError(null)
    try {
      for (const article of candidates) {
        setSeoUpdatingId(article.id)
        const locales = article.translations
          .filter(translation => translation.missing.length > 0 && !translation.isLocked)
          .map(translation => translation.locale)
        const response = await fetch('/api/zoho/kb/seo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ articleId: article.id, locales }),
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(`${article.title}: ${payload.error ?? 'Mise à jour SEO impossible'}`)
      }
      await loadSeoAudit(seoAudit.from)
    } catch (bulkError) {
      setSeoError(bulkError instanceof Error ? bulkError.message : 'Erreur inconnue')
    } finally {
      setSeoUpdatingId(null)
      setSeoBulkUpdating(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)]">
      <header className="border-b border-[#e2e2e2] bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-[#1a1a1a]">Générer un article Zoho KB</h1>
        <p className="mt-1 text-sm text-[#696969]">
          Création en brouillon en français, anglais et espagnol, avec catégorie et SEO.
        </p>
      </header>

      <main className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form onSubmit={generateArticle} className="space-y-5 rounded-xl border border-[#e2e2e2] bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
          <div>
            <label htmlFor="kb-title" className="mb-1.5 block text-sm font-semibold text-[#1a1a1a]">Titre source</label>
            <input
              id="kb-title"
              value={title}
              onChange={event => setTitle(event.target.value)}
              maxLength={250}
              required
              placeholder="Ex. Configurer une campagne automatisée"
              className="w-full rounded-lg border border-[#d8d8d8] px-3 py-2.5 text-sm outline-none focus:border-[#8064b3] focus:ring-2 focus:ring-[#e6dcf5]"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label htmlFor="kb-html" className="text-sm font-semibold text-[#1a1a1a]">Contenu HTML source</label>
              <span className="text-xs text-[#8a8a8a]">Les balises &lt;strong&gt; sont retirées automatiquement</span>
            </div>
            <textarea
              id="kb-html"
              value={html}
              onChange={event => setHtml(event.target.value)}
              required
              rows={20}
              spellCheck={false}
              placeholder={'<h2>Objectif</h2>\n<p>Votre contenu…</p>\n<!-- IMAGE À AJOUTER ICI -->'}
              className="w-full resize-y rounded-lg border border-[#d8d8d8] px-3 py-3 font-mono text-sm leading-6 outline-none focus:border-[#8064b3] focus:ring-2 focus:ring-[#e6dcf5]"
            />
            {hasStrongTag && (
              <p className="mt-1.5 text-xs text-[#8a5a00]">Des balises &lt;strong&gt; ont été détectées : leur contenu sera conservé, mais les balises seront supprimées.</p>
            )}
          </div>

          <div>
            <label htmlFor="kb-category" className="mb-1.5 block text-sm font-semibold text-[#1a1a1a]">Catégorie</label>
            <select
              id="kb-category"
              value={categoryId}
              onChange={event => setCategoryId(event.target.value)}
              disabled={!context}
              className="w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#8064b3] focus:ring-2 focus:ring-[#e6dcf5] disabled:bg-[#f5f5f5]"
            >
              <option value="">Choix automatique de la catégorie la plus précise</option>
              {context?.categories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.path}{category.status === 'HIDE_IN_HELPCENTER' ? ' · interne' : ''}
                </option>
              ))}
            </select>
            {contextError && <p className="mt-1.5 text-xs text-[#b7221b]">{contextError}</p>}
          </div>

          <div className="rounded-lg border border-[#d9c8f3] bg-[#f7f2ff] px-4 py-3 text-xs leading-5 text-[#4d2b82]">
            Les trois versions sont créées en <span className="font-semibold">brouillon</span>. Aucune publication automatique. Après génération, ouvrez chaque fiche Zoho pour positionner vos images puis relire et publier.
          </div>

          {error && <p role="alert" className="rounded-lg border border-[#fca5a5] bg-[#fee3e2] px-4 py-3 text-sm text-[#b7221b]">{error}</p>}

          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex min-w-44 items-center justify-center gap-2 rounded-lg bg-[#59319f] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#3f2175] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
            {submitting ? 'Génération et création…' : 'Générer l’article'}
          </button>
        </form>

        <aside className="space-y-4">
          <section className="rounded-xl border border-[#e2e2e2] bg-white p-5">
            <h2 className="text-sm font-semibold text-[#1a1a1a]">Configuration Zoho</h2>
            {context ? (
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between gap-4"><dt className="text-[#696969]">Help Center</dt><dd className="text-right font-medium">{context.helpCenterName}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-[#696969]">Langue source</dt><dd className="font-medium">{LOCALE_LABELS[context.primaryLocale] ?? context.primaryLocale}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-[#696969]">Traductions</dt><dd className="font-medium">FR · EN · ES</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-[#696969]">Catégories feuilles</dt><dd className="font-medium">{context.categories.length}</dd></div>
              </dl>
            ) : (
              <p className="mt-3 text-xs text-[#696969]">Chargement de l’arbre KB…</p>
            )}
          </section>

          {result && (
            <section className="rounded-xl border border-[#b7dfc5] bg-[#f1fbf4] p-5">
              <h2 className="text-sm font-semibold text-[#1c6437]">Brouillons créés</h2>
              <p className="mt-1 text-xs leading-5 text-[#386348]">{result.article.categoryPath}</p>
              {result.article.warnings.length > 0 ? (
                <div className="mt-3 rounded-lg border border-[#f7d878] bg-[#fffaeb] px-3 py-2 text-xs text-[#8a5a00]">
                  Article source créé, mais certaines opérations restent à vérifier : {result.article.warnings.join(' · ')}
                </div>
              ) : null}
              <div className="mt-4 space-y-3">
                {result.article.translations.map(translation => (
                  <div key={translation.locale} className="rounded-lg border border-[#d4eadb] bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold uppercase text-[#59319f]">{translation.locale}</span>
                      <span className="text-[11px] text-[#696969]">{translation.status}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-[#1a1a1a]">{translation.title}</p>
                    {translation.zohoAgentUrl ? (
                      <a
                        href={translation.zohoAgentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex text-xs font-semibold text-[#59319f] hover:underline"
                      >
                        Ouvrir dans Zoho et ajouter les images →
                      </a>
                    ) : (
                      <p className="mt-2 text-xs text-[#8a8a8a]">Lien agent non renvoyé par Zoho.</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>

        {user?.role === 'admin' ? (
          <section className="space-y-4 rounded-xl border border-[#e2e2e2] bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.05)] xl:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-[#1a1a1a]">Métadonnées et SEO des articles existants</h2>
                <p className="mt-1 text-sm text-[#696969]">Audit par lots de 5. Seuls les champs manquants sont générés ; le titre et le contenu des articles restent inchangés.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {seoAudit ? (
                  <button
                    type="button"
                    onClick={optimizeCurrentSeoBatch}
                    disabled={seoBulkUpdating || seoUpdatingId !== null}
                    className="rounded-lg bg-[#59319f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3f2175] disabled:opacity-50"
                  >
                    {seoBulkUpdating ? 'Optimisation du lot…' : 'Compléter tout ce lot'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => loadSeoAudit(seoAudit?.from ?? 1)}
                  disabled={seoLoading || seoBulkUpdating}
                  className="rounded-lg border border-[#d8d8d8] bg-white px-4 py-2 text-sm font-semibold text-[#4a4a4a] hover:bg-[#f7f7f7] disabled:opacity-50"
                >
                  {seoLoading ? 'Audit en cours…' : seoAudit ? 'Rafraîchir le lot' : 'Lancer l’audit'}
                </button>
              </div>
            </div>

            {seoError ? <p role="alert" className="rounded-lg border border-[#fca5a5] bg-[#fee3e2] px-4 py-3 text-sm text-[#b7221b]">{seoError}</p> : null}

            {seoAudit ? (
              <div className="space-y-3">
                {seoAudit.articles.map(article => {
                  const missingCount = article.translations.reduce((total, translation) => total + translation.missing.length, 0)
                  const canOptimize = article.translations.some(translation => translation.missing.length > 0 && !translation.isLocked)
                  return (
                    <article key={article.id} className="rounded-lg border border-[#e2e2e2] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-[#1a1a1a]">{article.title}</h3>
                            <span className="rounded-full bg-[#f2f2f2] px-2 py-0.5 text-[11px] text-[#696969]">{article.status}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {article.translations.map(translation => (
                              <span key={translation.locale} className={`rounded-full px-2 py-1 text-[11px] ${translation.missing.length === 0 ? 'bg-[#e8f6ed] text-[#1c6437]' : 'bg-[#fffaeb] text-[#8a5a00]'}`}>
                                {translation.locale.toUpperCase()} · {translation.isLocked ? 'verrouillé' : translation.missing.length === 0 ? 'complet' : `${translation.missing.length} manquant(s)`}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => optimizeSeo(article)}
                          disabled={!canOptimize || seoUpdatingId !== null}
                          className="rounded-lg bg-[#59319f] px-3 py-2 text-xs font-semibold text-white hover:bg-[#3f2175] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {seoUpdatingId === article.id ? 'Optimisation…' : missingCount === 0 ? 'Déjà complet' : 'Compléter le SEO'}
                        </button>
                      </div>
                    </article>
                  )
                })}

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => loadSeoAudit(Math.max(1, seoAudit.from - seoAudit.limit))}
                    disabled={seoAudit.from <= 1 || seoLoading}
                    className="rounded-lg border border-[#d8d8d8] px-3 py-2 text-xs font-semibold disabled:opacity-40"
                  >
                    ← Précédents
                  </button>
                  <span className="text-xs text-[#696969]">Articles {seoAudit.from} à {seoAudit.from + seoAudit.articles.length - 1}</span>
                  <button
                    type="button"
                    onClick={() => loadSeoAudit(seoAudit.from + seoAudit.limit)}
                    disabled={!seoAudit.hasMore || seoLoading}
                    className="rounded-lg border border-[#d8d8d8] px-3 py-2 text-xs font-semibold disabled:opacity-40"
                  >
                    Suivants →
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  )
}
