import { NextRequest, NextResponse } from 'next/server'
import { fetchTickets } from '@/lib/zoho/client'
import { mapZohoTicket } from '@/lib/zoho/mapper'
import { fetchIssues } from '@/lib/linear/client'
import { createJsonCompletion } from '@/lib/openai/json'
import { ZOHO_SUPPORT_DEPARTMENT_ID } from '@/lib/zoho/constants'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { subject, productArea, conversationHistory, zohoInternalId } = body as {
      subject: string
      productArea?: string
      conversationHistory?: string
      zohoInternalId?: string
    }

    if (!subject?.trim()) {
      return NextResponse.json({ error: 'subject requis' }, { status: 400 })
    }

    // Fetch Zoho tickets (all statuses — want resolved ones too for historical context)
    // and Linear issues in parallel
    const [zohoRes, linearRes] = await Promise.allSettled([
      Promise.all([
        fetchTickets({ limit: 100, from: 0, departmentId: ZOHO_SUPPORT_DEPARTMENT_ID, sortBy: 'modifiedTime' }),
        fetchTickets({ limit: 100, from: 0, departmentId: ZOHO_SUPPORT_DEPARTMENT_ID, sortBy: 'modifiedTime', status: 'Solved' }),
      ]),
      fetchIssues(100),
    ])

    const rawZohoTickets: ReturnType<typeof mapZohoTicket>[] = []
    if (zohoRes.status === 'fulfilled') {
      const [open, solved] = zohoRes.value
      const allRaw = [...(open.data ?? []), ...(solved.data ?? [])]
      for (const t of allRaw) {
        const mapped = mapZohoTicket(t, null)
        // Exclude the current ticket itself
        if (mapped.zohoInternalId !== zohoInternalId) {
          rawZohoTickets.push(mapped)
        }
      }
    }

    const zohoForPrompt = rawZohoTickets
      .map(t => ({
        id: t.zohoInternalId,
        externalId: t.externalId,
        subject: t.subject,
        productArea: t.productArea,
        status: t.zohoStatus,
        clientName: t.clientName,
        segment: t.segment,
        createdAt: t.createdAt,
      }))

    const linearIssues = linearRes.status === 'fulfilled' ? linearRes.value : []
    const linearForPrompt = linearIssues.map(i => ({
      identifier: i.identifier,
      title: i.title,
      description: i.description ? i.description.slice(0, 300) : null,
      labels: i.labels,
      status: i.linearState,
      assigneeName: i.assigneeName,
      updatedAt: i.updatedAt,
      url: i.url,
    }))

    const result = await createJsonCompletion({
      systemPrompt: `Tu es un assistant support SaaS chargé de trouver des cas similaires déjà traités.

SOURCES DISPONIBLES (par ordre de priorité) :
1. TICKETS ZOHO (source principale) — historique des tickets support clients
2. ISSUES LINEAR BUGS (source secondaire) — bugs formellement escaladés à la tech

ÉTAPES :
1. Analyse le ticket courant (titre, produit, conversation) : composant touché, symptôme, comportement observé, mots-clés techniques.

2. Cherche d'abord dans les TICKETS ZOHO :
   - Même produit/module (poids fort)
   - Même symptôme ou message d'erreur (poids fort)
   - Même cause probable (poids fort)
   - Vocabulaire similaire (poids moyen)

3. Puis cherche dans les ISSUES LINEAR comme complément :
   - Utile si un bug similaire a été escaladé et résolu côté tech
   - Donne la cause et solution si documentées

4. Classe les résultats en 3 catégories :
   - verySimilar : cause racine ou symptôme quasi-identique
   - potentiallyRelated : même zone, symptômes proches
   - toCheck : mots-clés communs mais lien à confirmer

FORMAT DE RÉPONSE — objet JSON avec :
- verySimilar: array (max 4) d'objets :
  { source: "zoho"|"linear", identifier: string, title: string, status: string, clientName?: string, assigneeName?: string, url?: string, cause: string, solution: string, whySimilar: string }
- potentiallyRelated: array (max 3) mêmes champs
- toCheck: array (max 2) mêmes champs (cause/solution peuvent être "non documenté")
- recommendation: string (recommandation finale en français — doublon probable, solution réutilisable, ou nouveau problème)

Pour les tickets Zoho : url = null, identifier = numéro de ticket (externalId), clientName = nom client.
Pour les issues Linear : url = lien Linear, identifier = identifiant BUGS-XXX.
Réponds uniquement en JSON valide, sans markdown.`,
      userContent: {
        currentTicket: {
          subject,
          productArea: productArea || null,
          conversationHistory: conversationHistory || null,
        },
        zohoTickets: zohoForPrompt,
        linearIssues: linearForPrompt,
      },
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[ai/find-similar-bug] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
