import { createHmac, timingSafeEqual } from 'crypto'

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function secret(): string {
  const value = process.env.MCP_CONFIRMATION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!value) throw new Error('MCP_CONFIRMATION_SECRET manquant.')
  return value
}

function signature(actorEmail: string, expiresAt: number, payload: unknown): string {
  return createHmac('sha256', secret())
    .update(`${actorEmail}\n${expiresAt}\n${stable(payload)}`)
    .digest('base64url')
}

export function createConfirmationToken(actorEmail: string, payload: unknown): string {
  const expiresAt = Date.now() + 15 * 60 * 1000
  return `${expiresAt}.${signature(actorEmail, expiresAt, payload)}`
}

export function verifyConfirmationToken(actorEmail: string, payload: unknown, token: string): boolean {
  const [rawExpiresAt, provided] = token.split('.', 2)
  const expiresAt = Number(rawExpiresAt)
  if (!provided || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return false
  const expected = signature(actorEmail, expiresAt, payload)
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  return a.length === b.length && timingSafeEqual(a, b)
}
