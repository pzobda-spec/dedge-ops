import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'
import { fetchTickets, fetchAccount, updateTicket } from '@/lib/zoho/client'
import { openai } from '@/lib/openai/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 290

const BATCH_SIZE = 10
const PAGE_SIZE = 100

const CLASSIFICATIONS = ['Question', 'Problem', 'Task', 'Feature'] as const
const CATEGORIES = [
  'Integration', 'Guest App', 'Guest profile', 'Hub de messagerie',
  'Campagne Email', 'Module de check-in', 'Module de commande',
  'Administrateur', 'Pages', 'Formulaires', 'Newsletters', 'WhatsApp',
  'Email delivery', 'Kiosque', 'Redirection wifi', 'Statistiques app',
  '2FA', 'Dmbook Pro', 'CSM', 'Other',
] as const

async function normalizeWithAI(
  batch: Array<{ id: string; subject: string; accountName: string }>
) {
  const prompt = `You are normalizing Zoho Desk support tickets for LoungeUp, a hotel tech SaaS.
Return ONLY a JSON object: {"results": [...]} where each item has {id, subject, classification, category}.

Rules:
- subject: "{Client} — {short description in French, max 8 words}"
  Use the client name exactly as provided.
  Description: lowercase French, concise, descriptive. No filler words.
- classification: MUST be exactly one of: ${JSON.stringify(CLASSIFICATIONS)}
  Problem=broken; Question=info request; Task=setup/access/config; Feature=new feature
- category: MUST be exactly one of: ${JSON.stringify(CATEGORIES)}

Tickets:
${batch.map(t => `id=${t.id} | client="${t.accountName}" | subject="${t.subject}"`).join('\n')}`

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

export async function POST() {
  try {
    // Fetch all tickets paginated (Zoho max 100/page)
    const allTickets: Awaited<ReturnType<typeof fetchTickets>>['data'] = []
    let from = 0
    while (true) {
      const page = await fetchTickets({ limit: PAGE_SIZE, from, sortBy: 'createdTime' })
      const rows = page.data ?? []
      allTickets.push(...rows)
      if (rows.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }

    // Keep only "Undefined — …" tickets that have an accountId
    const candidates = allTickets.filter(t =>
      (t.subject ?? '').startsWith('Undefined — ') &&
      t.accountId &&
      !t.account?.accountName  // already has embedded account → not Undefined by this bug
    )

    if (candidates.length === 0) {
      return NextResponse.json({ processed: 0, message: 'Aucun ticket "Undefined" avec accountId trouvé.' })
    }

    // Resolve account names — cache to avoid duplicate fetches
    const accountCache = new Map<string, string | null>()

    async function resolveAccountName(accountId: string): Promise<string | null> {
      if (accountCache.has(accountId)) return accountCache.get(accountId)!
      const acct = await fetchAccount(accountId)
      const name = acct?.accountName ?? null
      accountCache.set(accountId, name)
      return name
    }

    // Enrich candidates with resolved account names
    const enriched: Array<{ id: string; subject: string; accountName: string }> = []

    for (const ticket of candidates) {
      const name = await resolveAccountName(ticket.accountId!)
      if (name) enriched.push({ id: ticket.id, subject: ticket.subject, accountName: name })
    }

    if (enriched.length === 0) {
      return NextResponse.json({
        processed: 0,
        checked: candidates.length,
        message: `${candidates.length} ticket(s) vérifiés, aucun compte résolu.`,
      })
    }

    // Normalize + update in batches
    let processed = 0
    let errors = 0

    for (let i = 0; i < enriched.length; i += BATCH_SIZE) {
      const batch = enriched.slice(i, i + BATCH_SIZE)

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
      checked: candidates.length,
      resolved: enriched.length,
      errors,
      message: `${processed} ticket(s) corrigés${errors ? `, ${errors} erreur(s)` : ''} (${candidates.length} "Undefined" trouvés, ${enriched.length} avec compte résolu).`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[admin/fix-undefined-tickets]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
