/**
 * Fetch all "Stuck client" tickets in the Support dept and move them to "Solved".
 * Usage:
 *   node --env-file=.env.local scripts/bulk-solve-stuck-client.mjs          # dry-run
 *   node --env-file=.env.local scripts/bulk-solve-stuck-client.mjs --execute
 */

const ZOHO_TOKEN_URL = 'https://accounts.zoho.eu/oauth/v2/token'
const ZOHO_DESK_BASE = 'https://desk.zoho.eu/api/v1'
const SUPPORT_DEPT_ID = '5861000000007061'
const TARGET_STATUS = 'Stuck client'
const NEW_STATUS = 'Solved'

async function getAccessToken() {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
  })
  const res = await fetch(ZOHO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await res.json()
  if (data.error) throw new Error(`Token error: ${data.error}`)
  return data.access_token
}

async function zohoGet(path, token) {
  const res = await fetch(`${ZOHO_DESK_BASE}${path}`, {
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      orgId: process.env.ZOHO_ORG_ID,
    },
  })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`)
  return res.json()
}

async function zohoPatch(path, body, token) {
  const res = await fetch(`${ZOHO_DESK_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      orgId: process.env.ZOHO_ORG_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}: ${await res.text()}`)
  return res.json()
}

async function main() {
  const execute = process.argv.includes('--execute')

  console.log(`\n=== Bulk solve "Stuck client" tickets ===`)
  console.log(`Mode : ${execute ? 'EXÉCUTION' : 'DRY-RUN (ajoutez --execute pour appliquer)'}`)
  console.log(`Dept : ${SUPPORT_DEPT_ID}\n`)

  const token = await getAccessToken()
  console.log('Token OK')

  // Fetch all "Stuck client" tickets
  const allTickets = []
  let from = 0
  while (true) {
    const query = new URLSearchParams({
      limit: '100',
      from: String(from),
      departmentId: SUPPORT_DEPT_ID,
      status: TARGET_STATUS,
      sortBy: 'createdTime',
      fields: 'id,ticketNumber,subject,status,createdTime,contact,account',
    })
    const res = await zohoGet(`/tickets?${query}`, token)
    const page = res.data ?? []
    allTickets.push(...page)
    if (page.length < 100) break
    from += 100
  }

  if (allTickets.length === 0) {
    console.log('Aucun ticket "Stuck client" trouvé.')
    return
  }

  console.log(`${allTickets.length} ticket(s) "Stuck client" trouvé(s) :\n`)
  for (const t of allTickets) {
    const contact = t.contact ? `${t.contact.firstName ?? ''} ${t.contact.lastName ?? ''}`.trim() : '-'
    const account = t.account?.accountName ?? '-'
    console.log(`  #${t.ticketNumber}  ${t.subject}`)
    console.log(`         Contact: ${contact}  |  Compte: ${account}  |  Créé: ${t.createdTime}`)
  }

  if (!execute) {
    console.log(`\nDry-run terminé. Relancez avec --execute pour passer ces ${allTickets.length} tickets en "Solved".`)
    return
  }

  // Execute bulk update
  console.log(`\nMise à jour en cours...`)
  let success = 0
  let failed = 0
  for (const ticket of allTickets) {
    try {
      await zohoPatch(`/tickets/${ticket.id}`, { status: NEW_STATUS }, token)
      console.log(`  ✓ #${ticket.ticketNumber} → Solved`)
      success++
    } catch (err) {
      console.error(`  ✗ #${ticket.ticketNumber} — ${err.message}`)
      failed++
    }
  }

  console.log(`\nTerminé : ${success} passé(s) en Solved, ${failed} échec(s).`)
}

main().catch(err => {
  console.error('Erreur :', err.message)
  process.exit(1)
})
