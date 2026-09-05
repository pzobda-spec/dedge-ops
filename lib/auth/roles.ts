import { NextResponse } from 'next/server'
import { getSessionUserEmail } from './session'
import { supabaseAdmin } from '@/lib/supabase/server'

export type Role = 'admin' | 'onboarder' | 'support' | 'commercial_readonly' | 'csm_lead'

export interface AppUser {
  id: string
  email: string
  full_name: string | null
  role: Role
  active: boolean
}

export class AuthError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  onboarder: 'Onboarder',
  support: 'Support',
  commercial_readonly: 'Commercial',
  csm_lead: 'Team lead CSM',
}

export function isRole(value: unknown): value is Role {
  return value === 'admin' ||
    value === 'onboarder' ||
    value === 'support' ||
    value === 'commercial_readonly' ||
    value === 'csm_lead'
}

export async function getUserByEmail(email: string): Promise<AppUser | null> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return null

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, email, full_name, role, active')
    .eq('email', normalized)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data || data.active === false || !isRole(data.role)) return null
  return data as AppUser
}

export async function getCurrentUser(_req?: Request): Promise<AppUser | null> {
  const email = await getSessionUserEmail()
  return email ? getUserByEmail(email) : null
}

export async function requireRole(req: Request, allowedRoles: Role[]): Promise<AppUser> {
  const user = await getCurrentUser(req)
  if (!user) throw new AuthError('Unauthorized', 401)
  if (!allowedRoles.includes(user.role)) throw new AuthError('Forbidden', 403)
  return user
}

export async function isAdmin(email: string): Promise<boolean> {
  const user = await getUserByEmail(email)
  return user?.role === 'admin'
}

export async function isOnboarder(email: string): Promise<boolean> {
  const user = await getUserByEmail(email)
  return user?.role === 'onboarder'
}

export function authErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  return null
}
