import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Role } from './roles'
import { authCallbackUrl } from './paths'

export async function findAuthUser(email: string) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw new Error(error.message)
    const user = data.users.find(user => user.email?.toLowerCase() === email)
    if (user) return user
    if (data.users.length < 100) return null
  }
}

// No email until the profile and approval have been committed.
export async function ensureAuthUser(email: string, fullName: string | null) {
  const existing = await findAuthUser(email)
  if (existing) return existing
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email, email_confirm: false, user_metadata: { full_name: fullName },
  })
  if (!error && data.user) return data.user
  if (error?.code === 'email_exists' || error?.code === 'user_already_exists') {
    const concurrent = await findAuthUser(email)
    if (concurrent) return concurrent
  }
  throw new Error(error?.message ?? 'Création du compte impossible')
}

export async function provisionAccess(email: string, fullName: string | null, role: Role, requestOnly: boolean) {
  const authUser = await ensureAuthUser(email, fullName)
  const { data, error } = await supabaseAdmin.rpc('approve_app_access', {
    p_email: email, p_auth_id: authUser.id, p_full_name: fullName,
    p_role: role, p_request_only: requestOnly,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function sendAccessLink(email: string, origin: string): Promise<string | null> {
  // The recipient opens this link in their browser, without the admin's PKCE cookie.
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, flowType: 'implicit' },
  })
  try {
    const { error } = await client.auth.signInWithOtp({
      email, options: { shouldCreateUser: false, emailRedirectTo: authCallbackUrl(origin) },
    })
    return error ? 'Accès créé, mais l’email n’a pas pu être envoyé. L’utilisateur peut demander un lien depuis la page de connexion.' : null
  } catch {
    return 'Accès créé, mais l’envoi de l’email a échoué. L’utilisateur peut demander un lien depuis la page de connexion.'
  }
}
