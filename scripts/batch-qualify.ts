/**
 * Batch-qualify old Pending/Managed tickets via GPT, then update category + classification in Zoho.
 * Usage: npx tsx --env-file=.env.local scripts/batch-qualify.ts
 */

import OpenAI from 'openai'

const ZOHO_TOKEN_URL = 'https://accounts.zoho.eu/oauth/v2/token'
const ZOHO_DESK_BASE = 'https://desk.zoho.eu/api/v1'
const SUPPORT_DEPT_ID = '5861000000007061'
const PAGE_SIZE = 100
const TARGET_STATUSES = new Set(['Pending', 'Managed'])
const THREE_MONTHS_MS = 90 * 24 * 3600 * 1000
const BATCH_SIZE = 20

// ---------------------------------------------------------------------------
// Zoho auth
// ---------------------------------------------------------------------------

let cachedToken: string | null = null
let tokenExpiresAt = 0

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
  })
  const res = await fetch(ZOHO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await res.json()
  if (data.error) throw new Error(`Token error: ${data.error}`)
  cachedToken = data.access_token
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000
  return cachedToken!
}

async function zohoFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken()
  const res = await fetch(`${ZOHO_DESK_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      orgId: process.env.ZOHO_ORG_ID!,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) throw new Error(`Zoho ${res.status}: ${await res.text()}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Fetch affected tickets
// ---------------------------------------------------------------------------

interface RawTicket {
  id: string
  ticketNumber: string
  subject: string
  status: string
  createdTime: string
  account?: { accountName: string } | null
  contact?: { firstName?: string | null; lastName?: string | null } | null
}

async function getAffectedTickets(): Promise<RawTicket[]> {
  const cutoff = new Date(Date.now() - THREE_MONTHS_MS)
  const affected: RawTicket[] = []
  let from = 0

  while (true) {
    const res = await zohoFetch<{ data: RawTicket[] }>(
      `/tickets?limit=${PAGE_SIZE}&from=${from}&departmentId=${SUPPORT_DEPT_ID}&sortBy=createdTime` +
      `&fields=id,ticketNumber,subject,status,createdTime,contact,account`
    )
    const page = res.data ?? []
    for (const t of page) {
      if (TARGET_STATUSES.has(t.status) && new Date(t.createdTime) < cutoff) {
        affected.push(t)
      }
    }
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return affected
}

// ---------------------------------------------------------------------------
// AI classification
// ---------------------------------------------------------------------------

interface Qualification {
  id: string
  type: string
  category: string
  description: string
}

async function classifyBatch(
  openai: OpenAI,
  tickets: { id: string; subject: string; client: string }[]
): Promise<Qualification[]> {
  const prompt = `Tu es un expert support SaaS hôtelier (D-EDGE CRM / LoungeUp).
Classe chaque ticket de support. Réponds UNIQUEMENT avec un tableau JSON valide, sans markdown ni texte autour.

Règles :
- "type" : "Bug" | "Problème" | "Question"
  - Bug = dysfonctionnement technique avéré
  - Problème = incident, urgence, anomalie signalée
  - Question = demande d'info, de config, de conseil
- "category" : choisis parmi ces valeurs EXACTES :
  "Integration PMS" | "Guest App" | "Campagnes Marketing" | "WhatsApp" | "Bluetooth / Clés" | "Configuration" | "Connectivité" | "Exports / Données" | "Onboarding" | "CSM" | "Other"
- "description" : 1 phrase courte en français (max 80 chars)

Tickets :
${JSON.stringify(tickets, null, 2)}

Format attendu : [{"id":"...","type":"...","category":"...","description":"..."}]`

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = res.choices[0].message.content ?? '[]'
  try {
    return JSON.parse(content)
  } catch {
    const match = content.match(/\[[\s\S]*\]/)
    if (match) return JSON.parse(match[0])
    console.error('  [WARN] JSON parse failed for batch, skipping')
    return []
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  console.log('Fetching affected tickets...')
  const tickets = await getAffectedTickets()
  console.log(`Found ${tickets.length} Pending/Managed tickets older than 90 days\n`)

  // Classify in batches
  const qualifications: Record<string, Qualification> = {}
  const batches = Math.ceil(tickets.length / BATCH_SIZE)

  for (let i = 0; i < tickets.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const batch = tickets.slice(i, i + BATCH_SIZE)
    process.stdout.write(`  Classifying batch ${batchNum}/${batches} (${batch.length} tickets)... `)

    const input = batch.map(t => ({
      id: t.id,
      subject: t.subject,
      client: t.account?.accountName || `${t.contact?.firstName ?? ''} ${t.contact?.lastName ?? ''}`.trim() || '—',
    }))

    const results = await classifyBatch(openai, input)
    for (const r of results) qualifications[r.id] = r
    console.log('done')
  }

  console.log(`\nClassified ${Object.keys(qualifications).length}/${tickets.length} tickets`)
  console.log('Updating Zoho tickets...\n')

  let ok = 0
  let failed = 0

  for (const t of tickets) {
    const q = qualifications[t.id]
    const clientName = t.account?.accountName || `${t.contact?.firstName ?? ''} ${t.contact?.lastName ?? ''}`.trim() || '—'

    if (!q) {
      console.log(`  SKIP  #${t.ticketNumber} — no classification`)
      failed++
      continue
    }

    try {
      await zohoFetch(`/tickets/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ category: q.category, classification: q.type }),
      })
      console.log(`  OK    #${t.ticketNumber.padStart(6)} | ${q.type.padEnd(10)} | ${q.category.padEnd(30)} | ${clientName.slice(0, 25).padEnd(25)} | ${q.description}`)
      ok++
    } catch (e) {
      console.log(`  ERR   #${t.ticketNumber} — ${e}`)
      failed++
    }
  }

  console.log(`\n${'='.repeat(80)}`)
  console.log(`Résultat : ${ok} mis à jour, ${failed} échecs`)

  // Summary by category
  const byCat: Record<string, number> = {}
  const byType: Record<string, number> = {}
  for (const q of Object.values(qualifications)) {
    byCat[q.category] = (byCat[q.category] ?? 0) + 1
    byType[q.type] = (byType[q.type] ?? 0) + 1
  }
  console.log('\nPar type :')
  for (const [k, v] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(15)} ${v}`)
  }
  console.log('\nPar catégorie :')
  for (const [k, v] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(30)} ${v}`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
