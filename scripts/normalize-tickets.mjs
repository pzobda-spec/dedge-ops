#!/usr/bin/env node
/**
 * normalize-tickets.mjs
 * Normalise les sujets, classification et catégorie de tous les tickets Zoho Desk
 * via OpenAI (gpt-4o-mini), batch de 10 tickets par appel.
 *
 * Usage:
 *   node --env-file=.env.local scripts/normalize-tickets.mjs          # dry-run
 *   node --env-file=.env.local scripts/normalize-tickets.mjs --execute
 *
 * Tickets ignorés : ceux dont le compte contient "Ringover"
 * Tickets sans compte : sujet commence par "Undefined — "
 *
 * Progression sauvegardée dans scripts/normalize-progress.json
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'

const EXECUTE = process.argv.includes('--execute')
const PROGRESS_FILE = new URL('./normalize-progress.json', import.meta.url).pathname

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

const PAGE_SIZE   = 100
const BATCH_SIZE  = 10
const RATE_MS     = 800  // pause entre batches Zoho PATCH

// ── Token management ────────────────────────────────────────────────────────

let _accessToken = null
let _tokenExpiry = 0

async function getAccessToken() {
  if (_accessToken && Date.now() < _tokenExpiry - 60_000) return _accessToken
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
  _accessToken = data.access_token
  _tokenExpiry = Date.now() + data.expires_in * 1000
  return _accessToken
}

// ── Zoho API helpers ─────────────────────────────────────────────────────────

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

// ── Fetch all tickets ────────────────────────────────────────────────────────

async function fetchAllTickets() {
  const tickets = []
  let offset = 0
  process.stdout.write('Fetching tickets')

  while (true) {
    let page
    try {
      const data = await zohoGet(
        `/tickets?limit=${PAGE_SIZE}&from=${offset}&sortBy=createdTime` +
        `&fields=id,subject,category,classification,contact,account,status`
      )
      page = data.data ?? []
    } catch (err) {
      if (offset === 0) throw err
      console.warn(`\nStop at offset ${offset}: ${err.message}`)
      break
    }
    if (page.length === 0) break
    tickets.push(...page)
    process.stdout.write('.')
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  console.log(`\nFetched ${tickets.length} tickets total`)
  return tickets
}

// ── Classify with AI (batch) ─────────────────────────────────────────────────

function buildClient(ticket) {
  const acct = ticket.account?.accountName
  if (acct) return acct
  const c = ticket.contact
  if (c) {
    const full = `${c.firstName || ''} ${c.lastName || ''}`.trim()
    if (full) return full
  }
  return 'Undefined'
}

const EMAIL_PREFIX = /^(fwd?|re|tr|fw)\s*:/i
const GREETING     = /^(bonjour|hello|hi|no subject|\(no subject\))/i

function isNormalized(subject) {
  if (!subject) return false
  // AI-normalized (em dash)
  if (/ — /.test(subject)) return true
  // User-normalized: "CLIENT - description" or "CLIENT - Type - description"
  if (!/ - /.test(subject)) return false
  const first = subject.split(' - ')[0].trim()
  if (EMAIL_PREFIX.test(first)) return false   // Fwd:, RE:, TR:…
  if (GREETING.test(first)) return false        // Bonjour, Hello…
  if (first.length > 55) return false           // Too long = a sentence, not a client name
  if (/^[a-zàâéèêëîïôùûü]/.test(first)) return false  // Starts lowercase = not a proper name
  return true
}

function isRingover(ticket) {
  const client = buildClient(ticket)
  return client.toLowerCase().includes('ringover') ||
    ticket.subject?.toLowerCase().includes('ringover')
}

function alreadyNormalized(ticket) {
  return /^.+ — .+$/.test(ticket.subject ?? '')
}

async function normalizeWithAI(batch) {
  const items = batch.map(t => ({
    id: t.id,
    subject: t.subject || '',
    client: buildClient(t),
    currentCategory: t.category || '',
    currentClassification: t.classification || '',
  }))

  const prompt = `You are normalizing Zoho Desk support tickets for LoungeUp, a hotel tech SaaS.
Return ONLY a JSON object: {"results": [...]} where each item has {id, subject, classification, category}.
Include one result per ticket, matching the same id.

Rules:
- subject: "{Client} — {short description in French, max 8 words}"
  - Use the client name exactly as provided. Keep "Undefined" if that's the client.
  - Description: lowercase French, concise, descriptive. No filler ("bonjour", "re:", "fwd:").
- classification: MUST be exactly one of: ${JSON.stringify(CLASSIFICATIONS)}
  - Problem = broken/not working; Question = info request/how-to; Task = setup/access/config; Feature = new feature request
- category: MUST be exactly one of: ${JSON.stringify(CATEGORIES)}

Tickets:
${items.map(t => `id=${t.id} | client="${t.client}" | subject="${t.subject}"`).join('\n')}`

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
  const raw = data.choices[0].message.content
  const parsed = JSON.parse(raw)
  const results = parsed.results ?? Object.values(parsed)[0]

  // Validate and sanitize
  return results.map(r => ({
    id: r.id,
    subject: r.subject || '',
    classification: CLASSIFICATIONS.includes(r.classification) ? r.classification : 'Question',
    category: CATEGORIES.includes(r.category) ? r.category : 'Other',
  }))
}

// ── Progress tracking ────────────────────────────────────────────────────────

function loadProgress() {
  if (!existsSync(PROGRESS_FILE)) return { done: [], skipped: [] }
  return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'))
}

function saveProgress(progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2))
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}`)
  console.log()

  const progress = loadProgress()
  const doneSet    = new Set(progress.done)
  const skippedSet = new Set(progress.skipped)

  const allTickets = await fetchAllTickets()

  // Filter to-process
  const toProcess = allTickets.filter(t => {
    if (doneSet.has(t.id) || skippedSet.has(t.id)) return false
    if (isRingover(t)) {
      skippedSet.add(t.id)
      return false
    }
    if (isNormalized(t.subject ?? '')) {
      skippedSet.add(t.id)
      return false
    }
    return true
  })

  console.log(`Already done   : ${doneSet.size}`)
  console.log(`Ringover skip  : ${skippedSet.size - (progress.skipped?.length ?? 0)} new`)
  console.log(`To normalize   : ${toProcess.length}`)
  console.log()

  if (toProcess.length === 0) {
    console.log('Nothing to do.')
    return
  }

  let processed = 0
  let errors = 0

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE)
    console.log(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1} / ${Math.ceil(toProcess.length / BATCH_SIZE)} (tickets ${i + 1}–${Math.min(i + BATCH_SIZE, toProcess.length)})`)

    let normalized
    try {
      normalized = await normalizeWithAI(batch)
    } catch (err) {
      console.error(`  AI error: ${err.message}`)
      errors++
      continue
    }

    const batchById = Object.fromEntries(batch.map(t => [t.id, t]))
    for (const result of normalized) {
      const ticket = batchById[result.id]
      if (!ticket) { console.warn(`  Unknown id ${result.id}`); continue }

      console.log(`  [${ticket.id}] ${ticket.subject?.slice(0, 50) ?? ''}`)
      console.log(`    → ${result.subject}  [${result.classification} | ${result.category}]`)

      if (EXECUTE) {
        try {
          await zohoPatch(ticket.id, {
            subject: result.subject,
            classification: result.classification,
            category: result.category,
          })
          doneSet.add(ticket.id)
          processed++
        } catch (err) {
          console.error(`    PATCH error: ${err.message}`)
          errors++
        }
        await sleep(RATE_MS)
      } else {
        doneSet.add(ticket.id)
        processed++
      }
    }

    // Save progress after each batch
    saveProgress({ done: [...doneSet], skipped: [...skippedSet] })
  }

  console.log(`\n── Summary ────────────────────────────────`)
  console.log(`Processed : ${processed}`)
  console.log(`Errors    : ${errors}`)
  console.log(`Skipped   : ${skippedSet.size} (Ringover)`)
  if (!EXECUTE) console.log('\nRe-run with --execute to apply changes.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
