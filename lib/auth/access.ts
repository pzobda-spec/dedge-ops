const RESTRICTED_ACCESS_EMAILS = new Set([
  'pzobda@d-edge.com',
  'pablo.zobda@loungeup.com',
])

export function canAccessRestrictedOps(email: string | null | undefined): boolean {
  return RESTRICTED_ACCESS_EMAILS.has((email ?? '').trim().toLowerCase())
}

export function isHardcodedAccessEmail(email: string | null | undefined): boolean {
  return RESTRICTED_ACCESS_EMAILS.has((email ?? '').trim().toLowerCase())
}
