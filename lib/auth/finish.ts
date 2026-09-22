import { supabaseAdmin } from '@/lib/supabase/server'
import { getUserByEmail } from './roles'
import { homePathForRole, safeNextPath } from './paths'

export async function finishSignIn(email: string, next: unknown): Promise<string> {
  const user = await getUserByEmail(email)
  if (!user) return '/forbidden'
  // A login must never reactivate a deactivated account.
  const { error } = await supabaseAdmin.from('users')
    .update({ last_login_at: new Date().toISOString() }).eq('id', user.id).eq('active', true)
  if (error) throw new Error(error.message)
  return safeNextPath(next) ?? homePathForRole(user.role)
}
