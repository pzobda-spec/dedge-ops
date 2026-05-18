import { NextRequest, NextResponse } from 'next/server'
import { openai } from '@/lib/openai/client'
import { fetchTickets, searchKBArticles, fetchTicketConversationSummaries } from '@/lib/zoho/client'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const SUPPORT_DEPT_ID = '5861000000007061'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { ticketId, subject, clientName, segment, productArea, issueDescription, tone } = body

  // Gather context from 3 sources in parallel
  const [zohoKBRes, localKBRes, resolvedTicketsRes] = await Promise.allSettled([
    // 1. Zoho Desk native KB — search by subject keywords
    searchKBArticles(subject, 5),

    // 2. Our Supabase KB — articles for the same product area
    supabaseAdmin
      .from('knowledge_articles')
      .select('title, problem, solution, client_reply_template')
      .eq('product_area', productArea)
      .limit(5),

    // 3. Recent resolved Zoho tickets in the same dept
    fetchTickets({ limit: 50, from: 0, departmentId: SUPPORT_DEPT_ID, status: 'Solved', sortBy: 'modifiedTime' }),
  ])

  // Zoho KB articles
  const zohoKBArticles = zohoKBRes.status === 'fulfilled'
    ? zohoKBRes.value.map(a => ({
        title: a.title,
        summary: a.summary?.slice(0, 300) ?? null,
      }))
    : []

  // Our Supabase KB articles
  const localKBArticles = localKBRes.status === 'fulfilled' && !localKBRes.value.error
    ? (localKBRes.value.data ?? [])
    : []

  // Find resolved tickets with same category — fetch top 3 conversations
  const resolvedTickets = resolvedTicketsRes.status === 'fulfilled'
    ? (resolvedTicketsRes.value.data ?? [])
        .filter(t => t.cf?.['Category'] === productArea || t.status === 'Solved')
        .slice(0, 3)
    : []

  const resolvedWithConvs = await Promise.all(
    resolvedTickets.map(async t => {
      const convs = await fetchTicketConversationSummaries(t.id)
      return {
        subject: t.subject,
        status: t.status,
        conversations: convs.slice(0, 4),
      }
    })
  )

  // Build context block for the prompt
  const contextParts: string[] = []

  if (zohoKBArticles.length > 0) {
    contextParts.push(
      '## Articles Zoho Desk Knowledge Base\n' +
      zohoKBArticles
        .map(a => `**${a.title}**${a.summary ? `\n${a.summary}` : ''}`)
        .join('\n\n')
    )
  }

  if (localKBArticles.length > 0) {
    contextParts.push(
      '## Fiches KB internes\n' +
      localKBArticles
        .map(a => `**${a.title}**\nProblème : ${a.problem}\nSolution : ${a.solution}${a.client_reply_template ? `\nTemplate réponse : ${a.client_reply_template.slice(0, 300)}` : ''}`)
        .join('\n\n')
    )
  }

  if (resolvedWithConvs.length > 0 && resolvedWithConvs.some(t => t.conversations.length > 0)) {
    contextParts.push(
      '## Tickets similaires résolus (conversations)\n' +
      resolvedWithConvs
        .filter(t => t.conversations.length > 0)
        .map(t =>
          `**Ticket : "${t.subject}"** (${t.status})\n` +
          t.conversations
            .map(c => `[${c.direction === 'out' ? 'Agent' : 'Client'} - ${c.authorName}] ${c.summary}`)
            .join('\n')
        )
        .join('\n\n')
    )
  }

  const knowledgeContext = contextParts.length > 0
    ? `\n\nCONTEXTE BASE DE CONNAISSANCES :\n${contextParts.join('\n\n')}`
    : ''

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Tu es un expert support SaaS pour une CRM hôtelière (D-EDGE / LoungeUp).
Tu dois rédiger un draft de réponse client basé sur :
1. Les articles de la knowledge base Zoho Desk (source principale)
2. Les fiches KB internes (source principale)
3. Les conversations de tickets similaires déjà résolus (pour s'inspirer du ton et des solutions appliquées)

Règles :
- Baser la réponse sur les articles et tickets similaires fournis — ne pas inventer de solutions
- Si une solution est connue : la décrire clairement et précisément
- Si investigation nécessaire : le dire clairement sans donner d'ETA
- Jamais blâmer le client
- Ton professionnel mais humain
- Répondre dans la langue du ticket (français ou anglais)
- Si des templates de réponse KB existent, s'en inspirer

Retourne un objet JSON :
- subject: string (objet email si nécessaire)
- body: string (réponse complète, prête à envoyer)
- sources: string[] (titres des sources utilisées)
- tone: string`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          ticket: { ticketId, subject, clientName, segment, productArea, issueDescription, tone },
          knowledgeContext,
        }),
      },
    ],
    response_format: { type: 'json_object' },
  })

  const result = JSON.parse(completion.choices[0].message.content || '{}')

  // Attach metadata for UI display
  result._context = {
    zohoKBCount: zohoKBArticles.length,
    localKBCount: localKBArticles.length,
    similarTicketsCount: resolvedWithConvs.filter(t => t.conversations.length > 0).length,
  }

  return NextResponse.json(result)
}
