import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { createJsonCompletion } from '@/lib/openai/json'
import {
  createTrilingualKBArticle,
  fetchKBContext,
  KB_TARGET_LOCALES,
  type KBArticleDraftPackage,
  type KBLocale,
  type KBLocalizedDraft,
} from '@/lib/zoho/kb'
import { containsStrongTag, sanitizeKnowledgeHtml } from '@/lib/zoho/kbHtml'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface RequestBody {
  title?: unknown
  html?: unknown
  categoryId?: unknown
}

interface GeneratedPackage {
  categoryId?: unknown
  translations?: unknown
}

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} est requis`)
  const trimmed = value.trim()
  if (trimmed.length > maxLength) throw new Error(`${field} dépasse ${maxLength} caractères`)
  return trimmed
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} doit être une liste`)
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim())
    .slice(0, 12)
}

function parseLocalizedDraft(value: unknown, locale: KBLocale): KBLocalizedDraft {
  if (!value || typeof value !== 'object') throw new Error(`Traduction ${locale} manquante`)
  const record = value as Record<string, unknown>
  const answer = sanitizeKnowledgeHtml(requiredString(record.answer, `HTML ${locale}`, 120_000))
  if (containsStrongTag(answer)) throw new Error(`La traduction ${locale} contient une balise <strong>`)
  return {
    title: requiredString(record.title, `Titre ${locale}`, 250),
    answer,
    seoTitle: requiredString(record.seoTitle, `Titre SEO ${locale}`, 250),
    seoDescription: requiredString(record.seoDescription, `Description SEO ${locale}`, 500),
    seoKeywords: requiredString(record.seoKeywords, `Mots-clés SEO ${locale}`, 500),
    tags: stringList(record.tags, `Tags ${locale}`),
    permalink: requiredString(record.permalink, `Permalien ${locale}`, 250),
  }
}

function parsePackage(value: GeneratedPackage, allowedCategoryIds: Set<string>, categoryPaths: Map<string, string>): KBArticleDraftPackage {
  const categoryId = String(value.categoryId ?? '')
  if (!allowedCategoryIds.has(categoryId)) throw new Error('La catégorie générée n’existe pas dans Zoho')
  if (!value.translations || typeof value.translations !== 'object') throw new Error('Traductions générées manquantes')
  const translations = value.translations as Record<string, unknown>
  return {
    categoryId,
    categoryPath: categoryPaths.get(categoryId) ?? categoryId,
    translations: Object.fromEntries(KB_TARGET_LOCALES.map(locale => [
      locale,
      parseLocalizedDraft(translations[locale], locale),
    ])) as Record<KBLocale, KBLocalizedDraft>,
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ['admin', 'support'])
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  try {
    const body = await request.json() as RequestBody
    const title = requiredString(body.title, 'Le titre', 250)
    const html = sanitizeKnowledgeHtml(requiredString(body.html, 'Le contenu HTML', 120_000))
    const context = await fetchKBContext()
    const allowedCategoryIds = new Set(context.categories.map(category => category.id))
    const categoryPaths = new Map(context.categories.map(category => [category.id, category.path]))
    const requestedCategoryId = typeof body.categoryId === 'string' && body.categoryId
      ? body.categoryId
      : null
    if (requestedCategoryId && !allowedCategoryIds.has(requestedCategoryId)) {
      return NextResponse.json({ error: 'Catégorie Zoho invalide' }, { status: 400 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY non configurée' }, { status: 503 })
    }

    const generated = await createJsonCompletion<GeneratedPackage>({
      systemPrompt: [
        'Tu es éditeur senior de la base de connaissances D-EDGE CRM pour l’hôtellerie.',
        'À partir d’un titre et d’un HTML source en français, produis un package d’article en français, anglais et espagnol.',
        'Préserve la structure et le sens, améliore la clarté sans inventer de procédure.',
        'Le HTML doit rester éditable dans Zoho Desk et ne doit jamais contenir de balise <strong>.',
        'N’ajoute aucune image et conserve les emplacements ou marqueurs d’image déjà présents.',
        'Choisis uniquement un categoryId fourni, et obligatoirement une catégorie feuille.',
        'Pour chaque locale fr, en, es retourne: title, answer, seoTitle, seoDescription, seoKeywords (chaîne séparée par des virgules), tags (tableau), permalink.',
        'Les permaliens doivent être courts, en minuscules, sans accents, avec des tirets.',
        'Retourne seulement un JSON strict: {categoryId, translations:{fr:{...},en:{...},es:{...}}}.',
      ].join(' '),
      userContent: {
        requestedCategoryId,
        categoryRule: requestedCategoryId
          ? 'Utilise exactement requestedCategoryId.'
          : 'Choisis la catégorie feuille la plus précise parmi categoryOptions.',
        categoryOptions: context.categories.map(category => ({
          id: category.id,
          path: category.path,
          visibility: category.status,
        })),
        source: { title, html },
      },
    })

    if (requestedCategoryId) generated.categoryId = requestedCategoryId
    const draft = parsePackage(generated, allowedCategoryIds, categoryPaths)
    const article = await createTrilingualKBArticle(draft)
    return NextResponse.json({ article, generated: draft }, { status: 201 })
  } catch (error) {
    console.error('[zoho/kb/generate]', error)
    const message = error instanceof Error ? error.message : 'Impossible de générer l’article'
    const status = /requis|invalide|manquant|dépasse|contient/.test(message) ? 400 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
