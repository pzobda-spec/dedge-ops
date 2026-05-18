import { supabaseAdmin } from '@/lib/supabase/server'
import { fetchTicket, fetchTicketConversations, fetchThreadContent } from '@/lib/zoho/client'
import { mapZohoTicket } from '@/lib/zoho/mapper'
import { getCRMAccountsMap, matchAccountByName } from '@/lib/zoho/accountCache'

const OPENAI_EMBED_URL = 'https://api.openai.com/v1/embeddings'
const EMBED_MODEL = 'text-embedding-3-small'

async function embed(text: string): Promise<number[]> {
  const res = await fetch(OPENAI_EMBED_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  })
  if (!res.ok) throw new Error(`Embedding error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.data[0].embedding
}

function truncate(text: string, maxChars = 6000): string {
  return text.length > maxChars ? text.slice(0, maxChars) : text
}

export async function ingestSingleTicket(zohoTicketId: string): Promise<void> {
  const raw = await fetchTicket(zohoTicketId)

  const clientName = raw.account?.accountName || raw.contact?.lastName || ''
  const crmMap = await getCRMAccountsMap().catch(() => new Map())
  const crmAccount = matchAccountByName(clientName, crmMap)
  const segment = crmAccount?.segment ?? null
  const ticket = mapZohoTicket(raw, segment)

  // Delete existing chunks for this ticket before re-ingesting
  await supabaseAdmin.from('ticket_chunks').delete().eq('ticket_id', zohoTicketId)

  const chunks: Array<{ chunk_type: string; content: string }> = []

  // Chunk 1: subject + description (cf.description if available)
  const description = (raw.cf?.['cf_description'] as string) || ''
  const subjectChunk = `Sujet : ${raw.subject}\n${description}`.trim()
  chunks.push({ chunk_type: 'subject_and_description', content: subjectChunk })

  // Chunk 2+: thread messages
  let resolutionContent = ''
  try {
    const { data: conversations } = await fetchTicketConversations(zohoTicketId)
    for (const conv of conversations ?? []) {
      if (conv.type === 'thread' || conv.type === 'reply') {
        try {
          const thread = await fetchThreadContent(zohoTicketId, conv.id)
          const body = thread.content || ''
          if (!body.trim()) continue

          const isResolution =
            raw.status === 'Closed' || raw.status === 'Solved' || raw.status === 'Fermé'

          if (isResolution && conv.author?.type === 'agent') {
            resolutionContent = body
          } else {
            const label = conv.author?.type === 'agent' ? 'Agent' : 'Client'
            chunks.push({
              chunk_type: 'thread',
              content: truncate(`[${label}] ${body}`),
            })
          }
        } catch {
          // skip unreadable thread
        }
      }
    }
  } catch {
    // conversations unavailable — continue with subject chunk only
  }

  if (resolutionContent) {
    chunks.push({ chunk_type: 'resolution', content: truncate(resolutionContent) })
  }

  // Embed and upsert each chunk
  for (const chunk of chunks) {
    const embedding = await embed(chunk.content)
    await supabaseAdmin.from('ticket_chunks').insert({
      ticket_id: zohoTicketId,
      chunk_type: chunk.chunk_type,
      content: chunk.content,
      embedding,
      zoho_status: ticket.zohoStatus,
      product_area: ticket.productArea,
      segment,
    })
  }
}
