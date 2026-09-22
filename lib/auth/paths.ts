import type { Role } from './roles'

export function homePathForRole(role: Role | null): string {
  if (role === 'csm_lead') return '/csm/pilotage'
  if (role === 'onboarder' || role === 'commercial_readonly') return '/onboarding'
  return '/dashboard'
}

export function safeNextPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20]/.test(value)) return null
  return value
}

export function authCallbackUrl(origin: string): string {
  return `${(process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, '')}/auth/callback`
}
