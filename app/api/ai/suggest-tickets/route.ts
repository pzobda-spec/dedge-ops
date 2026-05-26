import { NextResponse } from 'next/server'
import { fetchTickets } from '@/lib/zoho/client'
import { mapZohoTicket } from '@/lib/zoho/mapper'
import { fetchIssues } from '@/lib/linear/client'
import { createJsonCompletion } from '@/lib/openai/json'
import { ZOHO_SUPPORT_DEPARTMENT_ID } from '@/lib/zoho/constants'

export const dynamic = 'force-dynamic'

const CLOSED = new Set(['Fermé', 'Closed', 'Solved'])

export async function POST() {
  try {
    const [ticketsRes, issuesRes] = await Promise.allSettled([
      fetchTickets({ limit: 50, status: 'Open', departmentId: ZOHO_SUPPORT_DEPARTMENT_ID, sortBy: 'modifiedTime' }),
      fetchIssues(100),
    ])

    const rawTickets = ticketsRes.status === 'fulfilled' ? (ticketsRes.value.data ?? []) : []
    const linearIssues = issuesRes.status === 'fulfilled' ? issuesRes.value : []

    const tickets = rawTickets
      .filter(t => !CLOSED.has(t.status))
      .map(t => mapZohoTicket(t, null))
      .map(t => ({
        id: t.zohoInternalId,
        subject: t.subject,
        productArea: t.productArea,
        clientName: t.clientName,
        segment: t.segment,
        riskScore: t.riskScore,
        priority: t.priority,
      }))

    const openLinear = linearIssues
      .filter(i => i.status !== 'resolved')
      .map(i => ({
        identifier: i.identifier,
        title: i.title,
        labels: i.labels,
        status: i.linearState,
        url: i.url,
      }))

    const raw = await createJsonCompletion<{
      suggestions?: Array<{
        theme: string
        productArea: string
        rationale: string
        zohoTicketIds: string[]
        linearIdentifier: string | null
        suggestKB: boolean
      }>
    }>({
      systemPrompt: `Tu es un analyste support SaaS pour une CRM hôtelière.
Tu reçois une liste de tickets Zoho support ouverts et d'issues Linear (bugs/escalades non résolus).
Identifie des clusters de tickets Zoho qui traitent du même problème ou thème, en recoupant avec les issues Linear existantes.
Retourne un objet JSON avec un tableau "suggestions" (max 6 entrées), chaque entrée ayant :
- theme: string (titre court du problème identifié, en français)
- productArea: string
- rationale: string (1-2 phrases en français expliquant le pattern et pourquoi ces tickets sont liés)
- zohoTicketIds: string[] (ids des tickets Zoho concernés)
- linearIdentifier: string | null (identifier de l'issue Linear correspondante si trouvée, ex: "BUGS-42")
- suggestKB: boolean (true si le problème est récurrent et mérite une fiche KB)
Trie par pertinence décroissante (volume + criticité segment).
Réponds uniquement en JSON valide, sans markdown.`,
      userContent: { tickets, linearIssues: openLinear },
    })

    const suggestions = (raw.suggestions ?? []).map(s => {
      const matchedTickets = tickets.filter(t => s.zohoTicketIds.includes(t.id))
      const matchedLinear = openLinear.find(i => i.identifier === s.linearIdentifier) ?? null
      return {
        theme: s.theme,
        productArea: s.productArea,
        rationale: s.rationale,
        tickets: matchedTickets,
        linearIssue: matchedLinear
          ? { identifier: matchedLinear.identifier, title: matchedLinear.title, status: matchedLinear.status, url: matchedLinear.url }
          : null,
        suggestKB: s.suggestKB,
      }
    })

    return NextResponse.json({ suggestions })
  } catch (err) {
    console.error('[ai/suggest-tickets] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
