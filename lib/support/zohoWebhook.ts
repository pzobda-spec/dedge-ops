import { createHash } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'

export interface ZohoDeskWebhookEvent {
  eventType: string
  eventTime: string | number | null
  orgId: string | null
  payload: Record<string, unknown>
  ticketId: string | null
  dedupeKey: string
}

let remoteKeySet: ReturnType<typeof createRemoteJWKSet> | null = null

export async function verifyZohoDeskJwt(token: string): Promise<void> {
  const orgId = requiredEnv('ZOHO_ORG_ID')
  const webhookId = requiredEnv('ZOHO_WEBHOOK_ID')
  const jwksUrl = process.env.ZOHO_WEBHOOK_JWKS_URL
    ?? 'https://desk.zoho.com/.well-known/jwks.json'
  remoteKeySet ??= createRemoteJWKSet(new URL(jwksUrl), {
    cooldownDuration: 60_000,
    timeoutDuration: 2_500,
  })
  await jwtVerify(token, remoteKeySet, {
    algorithms: ['RS256'],
    issuer: `orgId:${orgId}`,
    audience: `webhookId:${webhookId}`,
    clockTolerance: 5,
  })
}

export function parseZohoDeskWebhook(body: unknown): ZohoDeskWebhookEvent[] {
  if (!Array.isArray(body)) throw new Error('Zoho webhook body must be an array')
  if (body.length > 100) throw new Error('Zoho webhook batch exceeds 100 events')

  return body.map((value, index) => {
    if (!isRecord(value)) throw new Error(`Invalid Zoho webhook event at index ${index}`)
    const payload = isRecord(value.payload) ? value.payload : {}
    const eventType = stringValue(value.eventType) ?? 'unknown'
    const eventTime = typeof value.eventTime === 'string' || typeof value.eventTime === 'number'
      ? value.eventTime
      : null
    const orgId = stringValue(value.orgId)
    const ticketId = extractTicketId(payload)
    const stableInput = JSON.stringify({ eventType, eventTime, orgId, ticketId, payload })
    return {
      eventType,
      eventTime,
      orgId,
      payload,
      ticketId,
      dedupeKey: createHash('sha256').update(stableInput).digest('hex'),
    }
  })
}

export function eventTimeIso(value: string | number | null): string | null {
  if (value === null) return null
  const numeric = typeof value === 'number' ? value : Number(value)
  const parsed = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1_000 : numeric)
    : new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
}

function extractTicketId(payload: Record<string, unknown>): string | null {
  const ticket = isRecord(payload.ticket) ? payload.ticket : null
  return stringValue(payload.id)
    ?? stringValue(payload.ticketId)
    ?? stringValue(ticket?.id)
    ?? null
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
