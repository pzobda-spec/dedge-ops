import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { createJsonCompletion } from '@/lib/openai/json'
import {
  fetchKBSeoAuditPage,
  fetchKBTranslationDetail,
  KB_TARGET_LOCALES,
  updateKBTranslationMetadata,
  type KBLocale,
} from '@/lib/zoho/kb'
import { htmlToPlainText } from '@/lib/zoho/htmlSanitizer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface GeneratedMetadata {
  translations?: Record<string, {
    seoTitle?: unknown
    seoDescription?: unknown
    seoKeywords?: unknown
    tags?: unknown
  }>
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} manquant`)
  return value.trim().slice(0, maxLength)
}

function parseTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const tags = value.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    .map(tag => tag.trim()).slice(0, 12)
  if (tags.length === 0) throw new Error('Tags générés manquants')
  return tags
}

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['admin'])
    const { searchParams } = new URL(request.url)
    const from = Number(searchParams.get('from') ?? 1)
    const limit = Number(searchParams.get('limit') ?? 5)
    return NextResponse.json(await fetchKBSeoAuditPage(from, limit))
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('[zoho/kb/seo] audit', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Audit SEO impossible' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ['admin'])
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  try {
    const body = await request.json() as { articleId?: unknown; locales?: unknown }
    const articleId = String(body.articleId ?? '')
    if (!/^\d+$/.test(articleId)) return NextResponse.json({ error: 'articleId invalide' }, { status: 400 })
    const requestedLocales = Array.isArray(body.locales) ? body.locales : KB_TARGET_LOCALES
    const locales = requestedLocales.filter((locale): locale is KBLocale =>
      typeof locale === 'string' && KB_TARGET_LOCALES.includes(locale as KBLocale))
    const detailResults = await Promise.allSettled(locales.map(locale => fetchKBTranslationDetail(articleId, locale)))
    const details = detailResults
      .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchKBTranslationDetail>>> => result.status === 'fulfilled')
      .map(result => result.value)
      .filter(detail => !detail.isLocked)
    if (details.length === 0) return NextResponse.json({ error: 'Aucune traduction modifiable trouvée' }, { status: 404 })

    const incomplete = details.filter(detail =>
      !detail.seo.title?.trim() || !detail.seo.description?.trim() || !detail.seo.keywords?.trim() || !detail.seo.isEnabled || detail.tags.length === 0)
    if (incomplete.length === 0) return NextResponse.json({ articleId, updatedLocales: [], skipped: true })

    const generated = await createJsonCompletion<GeneratedMetadata>({
      systemPrompt: [
        'Tu es expert SEO pour la base de connaissances D-EDGE CRM.',
        'Génère uniquement les métadonnées factuelles à partir de chaque article, dans sa langue.',
        'Pour chaque locale fournie, retourne seoTitle, seoDescription, seoKeywords sous forme de chaîne séparée par des virgules, et tags sous forme de tableau.',
        'N’invente aucune fonctionnalité. Titres SEO concis, descriptions utiles et naturelles.',
        'Retourne un JSON strict {translations:{fr:{...},en:{...},es:{...}}}.',
      ].join(' '),
      userContent: {
        translations: incomplete.map(detail => ({
          locale: detail.locale,
          title: detail.title,
          content: htmlToPlainText(detail.answer).slice(0, 8_000),
        })),
      },
    })

    const updatedLocales: string[] = []
    for (const detail of incomplete) {
      const metadata = generated.translations?.[detail.locale]
      if (!metadata) throw new Error(`Métadonnées ${detail.locale} manquantes`)
      await updateKBTranslationMetadata(detail, {
        seoTitle: requiredText(metadata.seoTitle, `seoTitle ${detail.locale}`, 250),
        seoDescription: requiredText(metadata.seoDescription, `seoDescription ${detail.locale}`, 500),
        seoKeywords: requiredText(metadata.seoKeywords, `seoKeywords ${detail.locale}`, 500),
        tags: parseTags(metadata.tags),
      })
      updatedLocales.push(detail.locale)
    }

    return NextResponse.json({ articleId, updatedLocales, skipped: false })
  } catch (error) {
    console.error('[zoho/kb/seo] update', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Mise à jour SEO impossible' }, { status: 502 })
  }
}
