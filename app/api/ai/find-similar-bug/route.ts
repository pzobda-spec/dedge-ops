import { NextRequest, NextResponse } from 'next/server'
import { fetchIssues } from '@/lib/linear/client'
import { openai } from '@/lib/openai/client'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { subject, description, productArea, conversationHistory } = body as {
      subject: string
      description?: string
      productArea?: string
      conversationHistory?: string
    }

    if (!subject?.trim()) {
      return NextResponse.json({ error: 'subject requis' }, { status: 400 })
    }

    // Fetch all Linear BUGS issues — no status filter so we get resolved ones too
    const allIssues = await fetchIssues(150)

    const issuesForPrompt = allIssues.map(i => ({
      identifier: i.identifier,
      title: i.title,
      description: i.description ? i.description.slice(0, 300) : null,
      labels: i.labels,
      status: i.linearState,
      assigneeName: i.assigneeName,
      updatedAt: i.updatedAt,
      url: i.url,
    }))

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Tu es un assistant chargé de trouver des bugs similaires déjà traités dans le board BUGS.

ÉTAPES À SUIVRE :
1. ANALYSE DU TICKET COURANT
   - Lis le titre, la description et le produit du ticket
   - Identifie les éléments clés : composant/module concerné, message d'erreur, comportement observé
   - Extrais 3 à 5 mots-clés ou expressions techniques distinctifs

2. ÉVALUATION DE LA SIMILARITÉ
   Pour chaque issue Linear, évalue la pertinence selon :
   - Même composant/module touché (poids fort)
   - Même message d'erreur ou symptôme (poids fort)
   - Même cause racine probable (poids fort)
   - Labels communs (poids moyen)
   - Vocabulaire similaire (poids faible)

   Classe en 3 catégories :
   - verySimilar : cause racine ou symptôme quasi-identique
   - potentiallyRelated : même zone, symptômes proches
   - toCheck : mots-clés communs mais lien à confirmer

3. FORMAT DE RÉPONSE
   Retourne un objet JSON avec :
   - verySimilar: array (max 3) d'objets { identifier, title, status, assigneeName, updatedAt, url, cause, solution, whySimilar }
   - potentiallyRelated: array (max 3) d'objets { identifier, title, status, url, whySimilar }
   - toCheck: array (max 2) d'objets { identifier, title, status, url, whySimilar }
   - recommendation: string (recommandation finale en français)

   Pour cause et solution : extrais-les de la description de l'issue (ou indique "non documenté" si absent).
   Réponds uniquement en JSON valide, sans markdown.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            currentTicket: { subject, description: description || null, productArea: productArea || null, conversationHistory: conversationHistory || null },
            linearIssues: issuesForPrompt,
          }),
        },
      ],
      response_format: { type: 'json_object' },
    })

    const result = JSON.parse(completion.choices[0].message.content || '{}')
    return NextResponse.json(result)
  } catch (err) {
    console.error('[ai/find-similar-bug] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
