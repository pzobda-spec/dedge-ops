import { revalidateTag } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { fetchTickets, updateTicket } from '@/lib/zoho/client'
import { openai } from '@/lib/openai/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 290

const BATCH_SIZE = 10
const MAX_TICKETS = 200

const CLASSIFICATIONS = ['Question', 'Problem', 'Task', 'Feature'] as const
const CATEGORIES = [
  'Integration', 'Guest App', 'Guest profile', 'Hub de messagerie',
  'Campagne Email', 'Module de check-in', 'Module de commande',
  'Administrateur', 'Pages', 'Formulaires', 'Newsletters', 'WhatsApp',
  'Email delivery', 'Kiosque', 'Redirection wifi', 'Statistiques app',
  '2FA', 'Dmbook Pro', 'CSM', 'Other',
] as const

function buildClient(ticket: Awaited<ReturnType<typeof fetchTickets>>['data'][number]) {
  if (ticket.account?.accountName) return ticket.account.accountName
  if (ticket.contact?.account?.accountName) return ticket.contact.account.accountName
  if (ticket.contact) {
    const full = `${ticket.contact.firstName ?? ''} ${ticket.contact.lastName ?? ''}`.trim()
    if (full) return full
  }
  return 'Undefined'
}

const EMAIL_PREFIX = /^(fwd?|re|tr|fw)\s*:/i
const GREETING = /^(bonjour|hello|hi|no subject|\(no subject\))/i

function isNormalized(subject: string) {
  if (!subject) return false
  if (/ — /.test(subject)) return true
  if (!/ - /.test(subject)) return false
  const first = subject.split(' - ')[0].trim()
  if (EMAIL_PREFIX.test(first)) return false
  if (GREETING.test(first)) return false
  if (first.length > 55) return false
  if (/^[a-zàâéèêëîïôùûü]/.test(first)) return false
  return true
}

function isRingover(ticket: Awaited<ReturnType<typeof fetchTickets>>['data'][number]) {
  const client = buildClient(ticket)
  return client.toLowerCase().includes('ringover') ||
    (ticket.subject ?? '').toLowerCase().includes('ringover')
}

async function normalizeWithAI(batch: Array<{ id: string; subject: string; client: string; category: string; classification: string }>) {
  const prompt = `You are normalizing Zoho Desk support tickets for LoungeUp, a hotel tech SaaS.
Return ONLY a JSON object: {"results": [...]} where each item has {id, subject, classification, category}.

Rules:
- subject: "{Client} — {short description in French, max 8 words}"
  Use client name as-is. Keep "Undefined" if that's the client.
  Description: lowercase French, concise. No filler words.
- classification: MUST be exactly one of: ${JSON.stringify(CLASSIFICATIONS)}
  Problem=broken; Question=info request; Task=setup/access/config; Feature=new feature
- category: MUST be exactly one of: ${JSON.stringify(CATEGORIES)}

Tickets:
${batch.map(t => `id=${t.id} | client="${t.client}" | subject="${t.subject}"`).join('\n')}`

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
  })

  const parsed = JSON.parse(res.choices[0].message.content ?? '{}')
  const results: Array<{ id: string; subject: string; classification: string; category: string }> =
    parsed.results ?? Object.values(parsed)[0] ?? []

  return results.map(r => ({
    id: r.id,
    subject: r.subject ?? '',
    classification: CLASSIFICATIONS.includes(r.classification as typeof CLASSIFICATIONS[number])
      ? r.classification : 'Question',
    category: CATEGORIES.includes(r.category as typeof CATEGORIES[number])
      ? r.category : 'Other',
  }))
}

export async function POST(_req: NextRequest) {
  try {
    // Fetch up to MAX_TICKETS tickets paginated (Zoho max 100/page)
    const PAGE_SIZE = 100
    const allRaw: Awaited<ReturnType<typeof fetchTickets>>['data'] = []
    let from = 0
    while (allRaw.length < MAX_TICKETS) {
      const page = await fetchTickets({ limit: PAGE_SIZE, from, sortBy: 'createdTime' })
      const rows = page.data ?? []
      allRaw.push(...rows)
      if (rows.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
    const tickets = allRaw.slice(0, MAX_TICKETS).filter(t => !isNormalized(t.subject ?? '') && !isRingover(t))

    if (tickets.length === 0) {
      return NextResponse.json({ processed: 0, skipped: 0, message: 'Tous les tickets récents sont déjà normalisés.' })
    }

    const toProcess = tickets.slice(0, MAX_TICKETS)
    let processed = 0
    let errors = 0

    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
      const batch = toProcess.slice(i, i + BATCH_SIZE).map(t => ({
        id: t.id,
        subject: t.subject ?? '',
        client: buildClient(t),
        category: t.category ?? '',
        classification: '',
      }))

      let normalized: Awaited<ReturnType<typeof normalizeWithAI>>
      try {
        normalized = await normalizeWithAI(batch)
      } catch {
        errors += batch.length
        continue
      }

      const batchById = Object.fromEntries(batch.map(b => [b.id, b]))
      for (const r of normalized) {
        if (!batchById[r.id]) continue
        try {
          await updateTicket(r.id, {
            subject: r.subject,
            classification: r.classification,
            category: r.category,
          } as Parameters<typeof updateTicket>[1])
          processed++
        } catch {
          errors++
        }
      }
    }

    revalidateTag('zoho-tickets')
    return NextResponse.json({
      processed,
      skipped: tickets.length - toProcess.length,
      errors,
      message: `${processed} ticket(s) normalisé(s)${errors ? `, ${errors} erreur(s)` : ''}.`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[admin/normalize-tickets]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
