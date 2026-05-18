/**
 * Register the Zoho Desk webhook for ticket events.
 * Run once: npx tsx scripts/register-zoho-webhook.ts
 *
 * Required env vars: ZOHO_WEBHOOK_SECRET, NEXT_PUBLIC_APP_URL
 * (plus the standard ZOHO_* auth vars in .env.local)
 */

import 'dotenv/config'

const ZOHO_DESK_BASE = 'https://desk.zoho.eu/api/v1'
const ZOHO_TOKEN_URL = 'https://accounts.zoho.eu/oauth/v2/token'

async function getToken(): Promise<string> {
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
  return data.access_token
}

async function main() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const secret = process.env.ZOHO_WEBHOOK_SECRET

  if (!appUrl || !secret) {
    console.error('Missing NEXT_PUBLIC_APP_URL or ZOHO_WEBHOOK_SECRET in env')
    process.exit(1)
  }

  const webhookUrl = `${appUrl}/api/webhooks/zoho-desk`
  const token = await getToken()

  const body = {
    name: 'Dedge Ops RAG Webhook',
    url: webhookUrl,
    events: ['ticket.created', 'ticket.statusChanged'],
    headers: [{ name: 'x-zoho-webhook-token', value: secret }],
    departmentId: process.env.ZOHO_SUPPORT_DEPT_ID ?? '5861000000007061',
  }

  const res = await fetch(`${ZOHO_DESK_BASE}/webhooks`, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      orgId: process.env.ZOHO_ORG_ID!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  console.log('Response:', JSON.stringify(data, null, 2))

  if (data.id) {
    console.log(`\nWebhook registered! ID: ${data.id}`)
    console.log(`Add to .env.local: ZOHO_WEBHOOK_ID=${data.id}`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
