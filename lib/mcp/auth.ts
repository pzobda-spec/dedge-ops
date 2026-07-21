import { timingSafeEqual } from 'crypto'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js'
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js'
import { getUserByEmail, type AppUser } from '@/lib/auth/roles'
import { supabaseAdmin } from '@/lib/supabase/server'

export const MCP_READ_SCOPE = 'onboarding:read'
export const MCP_WRITE_SCOPE = 'onboarding:write'

export type McpToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function scopesForUser(user: AppUser): string[] {
  const scopes = [MCP_READ_SCOPE]
  if (user.role === 'admin' || user.role === 'onboarder') scopes.push(MCP_WRITE_SCOPE)
  return scopes
}

async function appUserForEmail(email: string | null | undefined): Promise<AppUser | null> {
  if (!email) return null
  return getUserByEmail(email).catch(() => null)
}

export async function verifyMcpToken(
  _request: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined

  const localToken = process.env.MCP_API_TOKEN
  if (localToken && secureEqual(bearerToken, localToken)) {
    const user = await appUserForEmail(process.env.MCP_DEFAULT_USER_EMAIL)
    if (!user) return undefined
    return {
      token: bearerToken,
      clientId: 'dedge-ops-local-mcp',
      scopes: scopesForUser(user),
      extra: { userId: user.id, userEmail: user.email, userRole: user.role },
    }
  }

  const { data, error } = await supabaseAdmin.auth.getUser(bearerToken)
  if (error || !data.user?.email) return undefined

  const user = await appUserForEmail(data.user.email)
  if (!user) return undefined

  return {
    token: bearerToken,
    clientId: typeof data.user.app_metadata?.client_id === 'string'
      ? data.user.app_metadata.client_id
      : data.user.id,
    scopes: scopesForUser(user),
    extra: { userId: user.id, userEmail: user.email, userRole: user.role },
  }
}

export function requireMcpActor(extra: McpToolExtra, write = false): AppUser {
  const email = extra.authInfo?.extra?.userEmail
  const id = extra.authInfo?.extra?.userId
  const role = extra.authInfo?.extra?.userRole
  const hasScope = extra.authInfo?.scopes.includes(write ? MCP_WRITE_SCOPE : MCP_READ_SCOPE)

  if (!hasScope || typeof email !== 'string' || typeof id !== 'string') {
    throw new Error(write ? 'Droit d’écriture Onboarding requis.' : 'Authentification MCP requise.')
  }
  if (role !== 'admin' && role !== 'onboarder' && role !== 'support' && role !== 'commercial_readonly') {
    throw new Error('Rôle MCP invalide.')
  }

  return { id, email, role, full_name: null, active: true }
}
