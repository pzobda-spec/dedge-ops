const RESTRICTED_ACCESS_EMAILS = new Set([
  'pzobda@d-edge.com',
])

export function canAccessRestrictedOps(email: string | null | undefined): boolean {
  return RESTRICTED_ACCESS_EMAILS.has((email ?? '').trim().toLowerCase())
}

