#!/usr/bin/env node
/**
 * fix-undefined-tickets.mjs
 * Renormalise les tickets dont le sujet commence par "Undefined — "
 * en fetchant le compte du contact via /contacts/{id} pour chaque ticket.
 *
 * Usage:
 *   node --env-file=.env.local scripts/fix-undefined-tickets.mjs          # dry-run (pas d'appels OpenAI)
 *   node --env-file=.env.local scripts/fix-undefined-tickets.mjs --execute
 */

const EXECUTE = process.argv.includes('--execute')

const ZOHO_CLIENT_ID     = process.env.ZOHO_CLIENT_ID
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN
const ZOHO_ORG_ID        = process.env.ZOHO_ORG_ID
const OPENAI_API_KEY     = process.env.OPENAI_API_KEY

const CLASSIFICATIONS = ['Question', 'Problem', 'Task', 'Feature']
const CATEGORIES = [
  'Integration', 'Guest App', 'Guest profile', 'Hub de messagerie',
  'Campagne Email', 'Module de check-in', 'Module de commande',
  'Administrateur', 'Pages', 'Formulaires', 'Newsletters', 'WhatsApp',
  'Email delivery', 'Kiosque', 'Redirection wifi', 'Statistiques app',
  '2FA', 'Dmbook Pro', 'CSM', 'Other',
]

const PAGE_SIZE  = 100
const BATCH_SIZE = 10
const RATE_MS    = 400

// ── Token ────────────────────────────────────────────────────────────────────

let _token = null
let _tokenExpiry = 0

async function getAccessToken() {
  if (_token && Date.now() < _tokenExpiry - 60_000) return _token
  const res = await fetch('https://accounts.zoho.eu/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      refresh_token: ZOHO_REFRESH_TOKEN,
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`)
  _token = data.access_token
  _tokenExpiry = Date.now() + data.expires_in * 1000
  return _token
}

async function zohoGet(path) {
  const token = await getAccessToken()
  const res = await fetch(`https://desk.zoho.eu/api/v1${path}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}`, orgId: ZOHO_ORG_ID },
  })
  if (!res.ok) throw new Error(`Zoho GET ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

async function zohoPatch(ticketId, fields) {
  const token = await getAccessToken()
  const res = await fetch(`https://desk.zoho.eu/api/v1/tickets/${ticketId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      orgId: ZOHO_ORG_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(fields),
  })
  if (!res.ok) throw new Error(`Zoho PATCH ${ticketId} → ${res.status} ${await res.text()}`)
  return res.json()
}

// Cache contact lookups to avoid redundant calls
const contactCache = new Map()

async function getContactAccountName(contactId) {
  if (!contactId) return null
  if (contactCache.has(contactId)) return contactCache.get(contactId)
  try {
    const data = await zohoGet(`/contacts/${contactId}`)
    const name = data.account?.accountName ?? null
    contactCache.set(contactId, name)
    return name
  } catch {
    contactCache.set(contactId, null)
    return null
  }
}

// ── Fetch all tickets ────────────────────────────────────────────────────────

async function fetchAllTickets() {
  const tickets = []
  let offset = 0
  process.stdout.write('Fetching tickets')
  while (true) {
    const data = await zohoGet(
      `/tickets?limit=${PAGE_SIZE}&from=${offset}&sortBy=createdTime` +
      `&fields=id,subject,category,classification,contact,account,status`
    )
    const page = data.data ?? []
    if (page.length === 0) break
    tickets.push(...page)
    process.stdout.write('.')
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  console.log(`\nFetched ${tickets.length} tickets total`)
  return tickets
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ── AI normalization ─────────────────────────────────────────────────────────

async function normalizeWithAI(batch) {
  const prompt = `You are normalizing Zoho Desk support tickets for LoungeUp, a hotel tech SaaS.
Return ONLY a JSON object: {"results": [...]} where each item has {id, subject, classification, category}.

Rules:
- subject: "{Client} — {short description in French, max 8 words}"
  Use the client name exactly as provided. Keep "Undefined" only if truly no client name.
  Description: lowercase French, concise. No filler words.
- classification: MUST be exactly one of: ${JSON.stringify(CLASSIFICATIONS)}
- category: MUST be exactly one of: ${JSON.stringify(CATEGORIES)}

Tickets:
${batch.map(t => `id=${t.id} | client="${t.resolvedClient}" | subject="${t.subject}"`).join('\n')}`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`)
  const data = await res.json()
  const parsed = JSON.parse(data.choices[0].message.content)
  const results = parsed.results ?? Object.values(parsed)[0]

  return results.map(r => ({
    id: r.id,
    subject: r.subject || '',
    classification: CLASSIFICATIONS.includes(r.classification) ? r.classification : 'Question',
    category: CATEGORIES.includes(r.category) ? r.category : 'Other',
  }))
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}\n`)

  const allTickets = await fetchAllTickets()

  const undefinedTickets = allTickets.filter(t =>
    (t.subject ?? '').startsWith('Undefined — ')
  )

  console.log(`Tickets "Undefined — " trouvés : ${undefinedTickets.length}`)
  if (undefinedTickets.length === 0) { console.log('Rien à faire.'); return }

  // Resolve client names via /contacts/{id}
  console.log('\nRésolution des comptes via /contacts/{id}...')
  let resolved = 0
  const enriched = []

  for (let i = 0; i < undefinedTickets.length; i++) {
    const t = undefinedTickets[i]
    const contactId = t.contact?.id
    const accountName = await getContactAccountName(contactId)
    const resolvedClient = accountName ?? (
      t.contact
        ? `${t.contact.firstName || ''} ${t.contact.lastName || ''}`.trim() || null
        : null
    )

    if (resolvedClient && resolvedClient !== 'Undefined') resolved++

    enriched.push({ ...t, resolvedClient: resolvedClient || 'Undefined' })

    if ((i + 1) % 50 === 0) {
      process.stdout.write(`  ${i + 1}/${undefinedTickets.length} contacts résolus (${resolved} avec compte)\r`)
      await sleep(100)
    }
  }
  console.log(`\n  ${resolved} / ${undefinedTickets.length} tickets ont un compte résolu`)

  const toProcess = enriched.filter(t => t.resolvedClient !== 'Undefined')
  const stillUndefined = enriched.filter(t => t.resolvedClient === 'Undefined')

  console.log(`  Toujours sans compte : ${stillUndefined.length} (ignorés)\n`)

  if (toProcess.length === 0) {
    console.log('Aucun ticket à renormaliser.')
    return
  }

  if (!EXECUTE) {
    console.log('DRY-RUN — aperçu (10 premiers) :')
    for (const t of toProcess.slice(0, 10)) {
      console.log(`  [${t.id}] "${t.subject}" → client: "${t.resolvedClient}"`)
    }
    console.log(`\nRe-run avec --execute pour appliquer les ${toProcess.length} tickets.`)
    return
  }

  // Execute: normalize with AI and patch
  let processed = 0
  let errors = 0

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE)
    console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1} / ${Math.ceil(toProcess.length / BATCH_SIZE)}`)

    let normalized
    try {
      normalized = await normalizeWithAI(batch)
    } catch (err) {
      console.error(`  AI error: ${err.message}`)
      errors++
      continue
    }

    const byId = Object.fromEntries(batch.map(t => [t.id, t]))
    for (const result of normalized) {
      const ticket = byId[result.id]
      if (!ticket) continue
      console.log(`  [${ticket.id}] ${ticket.subject?.slice(0, 55)}`)
      console.log(`    → ${result.subject}  [${result.classification} | ${result.category}]`)

      try {
        await zohoPatch(ticket.id, {
          subject: result.subject,
          classification: result.classification,
          category: result.category,
        })
        processed++
      } catch (err) {
        console.error(`    PATCH error: ${err.message}`)
        errors++
      }
      await sleep(RATE_MS)
    }
  }

  console.log(`\n── Résumé ─────────────────────────────────`)
  console.log(`Traités : ${processed} / Erreurs : ${errors}`)
}

main().catch(err => { console.error(err); process.exit(1) })
