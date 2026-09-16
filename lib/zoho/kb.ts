import { zohoFetch } from './client'

export const KB_TARGET_LOCALES = ['fr', 'en', 'es'] as const
export type KBLocale = (typeof KB_TARGET_LOCALES)[number]

interface ZohoHelpCenterLocale {
  locale: string
  status: string
  type: string
  name: string
}

interface ZohoHelpCenter {
  id: string
  name: string
  isDefault: boolean
  isMultilingualEnabled: boolean
  primaryLocale: string
  locales: string[]
  helpCenterLocales: ZohoHelpCenterLocale[]
}

interface ZohoCategoryTranslation {
  locale: string
  name: string
  description?: string | null
}

interface ZohoCategoryNode {
  id: string
  name: string
  locale?: string
  status?: string
  rootCategoryId?: string
  parentCategoryId?: string | null
  translations?: ZohoCategoryTranslation[]
  children?: ZohoCategoryNode[]
}

export interface KBCategoryOption {
  id: string
  name: string
  path: string
  rootCategoryId: string
  parentCategoryId: string | null
  status: string
}

export interface KBContext {
  helpCenterId: string
  helpCenterName: string
  primaryLocale: string
  enabledLocales: string[]
  categories: KBCategoryOption[]
}

export interface KBLocalizedDraft {
  title: string
  answer: string
  seoTitle: string
  seoDescription: string
  seoKeywords: string
  tags: string[]
  permalink: string
}

export interface KBArticleDraftPackage {
  categoryId: string
  categoryPath: string
  translations: Record<KBLocale, KBLocalizedDraft>
}

interface ZohoArticleResponse {
  id: string
  locale?: string
  sourceLocale?: string
  authorId?: string
  webUrl?: string
  portalUrl?: string
  title?: string
  status?: string
  answer?: string | null
  tags?: string[]
  seo?: {
    keywords?: string | null
    isEnabled?: boolean
    description?: string | null
    title?: string | null
  }
  availableLocaleTranslations?: Array<{
    locale?: string
    href?: string
    webUrl?: string
    isLocked?: boolean
    isTrashed?: boolean
  }>
}

export interface KBSeoAuditTranslation {
  locale: KBLocale
  title: string
  status: string
  isLocked: boolean
  missing: Array<'seoTitle' | 'seoDescription' | 'seoKeywords' | 'tags' | 'seoEnabled'>
}

export interface KBSeoAuditArticle {
  id: string
  title: string
  status: string
  translations: KBSeoAuditTranslation[]
}

export interface KBSeoAuditPage {
  from: number
  limit: number
  hasMore: boolean
  articles: KBSeoAuditArticle[]
}

export interface KBTranslationDetail {
  articleId: string
  locale: KBLocale
  sourceLocale: string
  title: string
  answer: string
  status: string
  isLocked: boolean
  tags: string[]
  seo: {
    title: string | null
    description: string | null
    keywords: string | null
    isEnabled: boolean
  }
}

export interface CreatedKBTranslation {
  locale: KBLocale
  title: string
  status: string
  zohoAgentUrl: string | null
  portalUrl: string | null
}

export interface CreatedKBArticle {
  articleId: string
  categoryId: string
  categoryPath: string
  sourceLocale: string
  translations: CreatedKBTranslation[]
  warnings: string[]
}

let cachedContext: { expiresAt: number; value: KBContext } | null = null

function asDataArray<T>(value: { data?: T[] } | T[]): T[] {
  return Array.isArray(value) ? value : value.data ?? []
}

function flattenLeaves(node: ZohoCategoryNode, ancestors: string[] = []): KBCategoryOption[] {
  const pathParts = [...ancestors, node.name.trim()]
  const children = node.children ?? []
  if (children.length > 0) return children.flatMap(child => flattenLeaves(child, pathParts))

  return [{
    id: String(node.id),
    name: node.name.trim(),
    path: pathParts.join(' › '),
    rootCategoryId: String(node.rootCategoryId ?? node.id),
    parentCategoryId: node.parentCategoryId ? String(node.parentCategoryId) : null,
    status: node.status ?? 'UNKNOWN',
  }]
}

export async function fetchKBContext(force = false): Promise<KBContext> {
  if (!force && cachedContext && cachedContext.expiresAt > Date.now()) return cachedContext.value

  const [helpCenterResponse, rootResponse] = await Promise.all([
    zohoFetch<{ data?: ZohoHelpCenter[] }>('/helpCenters?include=translateSettings'),
    zohoFetch<{ data?: ZohoCategoryNode[] }>('/kbRootCategories?from=1&limit=700&locale=fr'),
  ])

  const helpCenters = asDataArray(helpCenterResponse)
  const helpCenter = helpCenters.find(item => item.isDefault) ?? helpCenters[0]
  if (!helpCenter) throw new Error('Aucun Help Center Zoho Desk disponible')

  const enabledLocales = (helpCenter.helpCenterLocales ?? [])
    .filter(item => item.status === 'ACCESIBLE_IN_HELPCENTER')
    .map(item => item.locale)

  const missingLocales = KB_TARGET_LOCALES.filter(locale => !enabledLocales.includes(locale))
  if (missingLocales.length > 0) {
    throw new Error(`Locales Zoho manquantes: ${missingLocales.join(', ')}`)
  }

  const roots = asDataArray(rootResponse)
  const trees = await Promise.all(roots.map(async root => {
    const response = await zohoFetch<ZohoCategoryNode | { data?: ZohoCategoryNode }>(
      `/kbRootCategories/${encodeURIComponent(root.id)}/categoryTree?locale=${encodeURIComponent(helpCenter.primaryLocale)}&sortBy=order&includeTrash=false`,
    )
    return 'data' in response && response.data ? response.data : response as ZohoCategoryNode
  }))

  const value: KBContext = {
    helpCenterId: String(helpCenter.id),
    helpCenterName: helpCenter.name,
    primaryLocale: helpCenter.primaryLocale,
    enabledLocales,
    categories: trees.flatMap(tree => flattenLeaves(tree)),
  }
  cachedContext = { expiresAt: Date.now() + 5 * 60 * 1000, value }
  return value
}

function articlePayload(draft: KBLocalizedDraft) {
  return {
    title: draft.title,
    answer: draft.answer,
    status: 'Draft',
    permission: 'ALL',
    tags: draft.tags,
    permalink: draft.permalink,
    seoTitle: draft.seoTitle,
    seoKeywords: draft.seoKeywords,
    seoDescription: draft.seoDescription,
    isSEOEnabled: true,
  }
}

export async function createTrilingualKBArticle(draft: KBArticleDraftPackage): Promise<CreatedKBArticle> {
  const context = await fetchKBContext()
  const primaryLocale = context.primaryLocale as KBLocale
  if (!KB_TARGET_LOCALES.includes(primaryLocale)) {
    throw new Error(`Langue principale Zoho non prise en charge: ${context.primaryLocale}`)
  }

  const sourceDraft = draft.translations[primaryLocale]
  const source = await zohoFetch<ZohoArticleResponse>('/articles', {
    method: 'POST',
    body: JSON.stringify({ categoryId: draft.categoryId, ...articlePayload(sourceDraft) }),
  })
  if (!source.id) throw new Error('Zoho n’a pas renvoyé l’identifiant du nouvel article')
  if (!source.authorId) throw new Error('Zoho n’a pas renvoyé l’auteur requis pour les traductions')

  const created = new Map<string, ZohoArticleResponse>([[primaryLocale, source]])
  const warnings: string[] = []
  for (const locale of KB_TARGET_LOCALES) {
    if (locale === primaryLocale) continue
    const localized = draft.translations[locale]
    try {
      const translation = await zohoFetch<ZohoArticleResponse>(`/articles/${encodeURIComponent(source.id)}/translations`, {
        method: 'POST',
        body: JSON.stringify({
          locale,
          authorId: source.authorId,
          translationState: 'UP-TO-DATE',
          ...articlePayload(localized),
        }),
      })
      created.set(locale, translation)
    } catch (error) {
      warnings.push(`${locale}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  try {
    const translationResponse = await zohoFetch<{ data?: ZohoArticleResponse[] }>(
      `/articles/${encodeURIComponent(source.id)}/translations?from=1&limit=50`,
    )
    for (const translation of translationResponse.data ?? []) {
      if (translation.locale) created.set(translation.locale, translation)
    }
  } catch (error) {
    warnings.push(`Vérification des traductions: ${error instanceof Error ? error.message : String(error)}`)
  }

  return {
    articleId: String(source.id),
    categoryId: draft.categoryId,
    categoryPath: draft.categoryPath,
    sourceLocale: primaryLocale,
    warnings,
    translations: KB_TARGET_LOCALES.map(locale => {
      const value = created.get(locale)
      return {
        locale,
        title: draft.translations[locale].title,
        status: value?.status ?? 'Draft',
        zohoAgentUrl: value?.webUrl ?? (locale === primaryLocale ? source.webUrl ?? null : null),
        portalUrl: value?.portalUrl ?? (locale === primaryLocale ? source.portalUrl ?? null : null),
      }
    }),
  }
}

function seoMissing(detail: KBTranslationDetail): KBSeoAuditTranslation['missing'] {
  const missing: KBSeoAuditTranslation['missing'] = []
  if (!detail.seo.title?.trim()) missing.push('seoTitle')
  if (!detail.seo.description?.trim()) missing.push('seoDescription')
  if (!detail.seo.keywords?.trim()) missing.push('seoKeywords')
  if (detail.tags.length === 0) missing.push('tags')
  if (!detail.seo.isEnabled) missing.push('seoEnabled')
  return missing
}

export async function fetchKBTranslationDetail(articleId: string, locale: KBLocale): Promise<KBTranslationDetail> {
  const value = await zohoFetch<ZohoArticleResponse>(
    `/articles/${encodeURIComponent(articleId)}/translations/${encodeURIComponent(locale)}`,
  )
  return {
    articleId,
    locale,
    sourceLocale: value.sourceLocale ?? locale,
    title: value.title ?? '',
    answer: value.answer ?? '',
    status: value.status ?? 'Unknown',
    isLocked: value.availableLocaleTranslations?.find(item => item.locale === locale)?.isLocked ?? false,
    tags: Array.isArray(value.tags) ? value.tags : [],
    seo: {
      title: value.seo?.title ?? null,
      description: value.seo?.description ?? null,
      keywords: value.seo?.keywords ?? null,
      isEnabled: value.seo?.isEnabled === true,
    },
  }
}

export async function fetchKBSeoAuditPage(from = 1, limit = 5): Promise<KBSeoAuditPage> {
  const safeFrom = Math.max(1, Math.floor(from))
  const safeLimit = Math.min(10, Math.max(1, Math.floor(limit)))
  const response = await zohoFetch<{ data?: ZohoArticleResponse[] }>(
    `/articles?from=${safeFrom}&limit=${safeLimit}`,
  )
  const rows = response.data ?? []
  const articles = await Promise.all(rows.map(async article => {
    const locales = (article.availableLocaleTranslations ?? [])
      .map(item => item.locale)
      .filter((locale): locale is KBLocale => KB_TARGET_LOCALES.includes(locale as KBLocale))
    const translations = await Promise.all(locales.map(async locale => {
      const detail = await fetchKBTranslationDetail(article.id, locale)
      return {
        locale,
        title: detail.title,
        status: detail.status,
        isLocked: detail.isLocked,
        missing: seoMissing(detail),
      }
    }))
    return {
      id: article.id,
      title: article.title ?? '',
      status: article.status ?? 'Unknown',
      translations,
    }
  }))
  return { from: safeFrom, limit: safeLimit, hasMore: rows.length === safeLimit, articles }
}

export async function updateKBTranslationMetadata(
  detail: KBTranslationDetail,
  metadata: { seoTitle: string; seoDescription: string; seoKeywords: string; tags: string[] },
): Promise<void> {
  const payload: Record<string, unknown> = { isSEOEnabled: true }
  if (!detail.seo.title?.trim()) payload.seoTitle = metadata.seoTitle
  if (!detail.seo.description?.trim()) payload.seoDescription = metadata.seoDescription
  if (!detail.seo.keywords?.trim()) payload.seoKeywords = metadata.seoKeywords
  if (detail.tags.length === 0) payload.tags = metadata.tags
  if (Object.keys(payload).length === 1 && detail.seo.isEnabled) return

  const path = detail.locale === detail.sourceLocale
    ? `/articles/${encodeURIComponent(detail.articleId)}`
    : `/articles/${encodeURIComponent(detail.articleId)}/translations/${encodeURIComponent(detail.locale)}?createVersion=false`
  await zohoFetch(path, { method: 'PATCH', body: JSON.stringify(payload) })
}
