import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { isRole } from '@/lib/auth/roles'
import { safeNextPath, authCallbackUrl } from '@/lib/auth/paths'

function getCallbackUrl(request: NextRequest, next: string | null): string {
  const callback = new URL(authCallbackUrl(request.nextUrl.origin))
  if (next) callback.searchParams.set('next', next)
  return callback.toString()
}

async function sendOtp(email: string, callbackUrl: string, shouldCreateUser: boolean) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser, emailRedirectTo: callbackUrl },
  })
  return error
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return NextResponse.json({ status: 'error', error: 'Email invalide' }, { status: 400 })
    }
    const { data: profile, error: profileError } = await supabaseAdmin.from('users')
      .select('role,active').eq('email', email).maybeSingle()
    if (profileError) throw new Error(profileError.message)
    // Application access is the source of truth, including direct admin invitations.
    if (profile) {
      if (!profile.active || !isRole(profile.role)) {
        return NextResponse.json({ status: 'error', error: 'Compte désactivé. Contactez votre administrateur.' }, { status: 403 })
      }
      const error = await sendOtp(email, getCallbackUrl(request, safeNextPath(body.next)), false)
      if (error) throw new Error(error.message)
      return NextResponse.json({ status: 'sent' })
    }

    const { data: existing, error: dbError } = await supabaseAdmin.from('access_requests')
      .select('status').eq('email', email).maybeSingle()
    if (dbError) throw new Error(dbError.message)
    if (existing?.status === 'approved') {
      return NextResponse.json({ status: 'error', error: 'Votre demande est approuvée, mais votre profil doit être finalisé par un administrateur.' }, { status: 409 })
    }
    if (existing?.status === 'pending') return NextResponse.json({ status: 'pending' })
    if (existing?.status === 'rejected') {
      return NextResponse.json({ status: 'error', error: 'Votre demande a été refusée. Contactez votre administrateur.' }, { status: 403 })
    }
    if (!/^[^\s@]+@d-edge\.com$/.test(email)) {
      return NextResponse.json({ status: 'error', error: 'Les demandes d’accès sont réservées aux adresses @d-edge.com.' }, { status: 400 })
    }
    if (body.intent !== 'request') return NextResponse.json({ status: 'details_required' })
    const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : ''
    if (!fullName || fullName.length > 200 || !isRole(body.requested_role)) {
      return NextResponse.json({ status: 'error', error: 'Nom complet et niveau d’accès souhaité requis.' }, { status: 400 })
    }
    const { error: insertError } = await supabaseAdmin.from('access_requests').insert({
      email, full_name: fullName, requested_role: body.requested_role, status: 'pending',
    })
    if (insertError) {
      if (insertError.code === '23505') return NextResponse.json({ status: 'pending' })
      throw new Error(insertError.message)
    }
    return NextResponse.json({ status: 'pending' })
  } catch (error) {
    console.error('[auth/login]', error instanceof Error ? error.message : error)
    return NextResponse.json({ status: 'error', error: 'Connexion indisponible pour le moment. Réessayez dans quelques instants.' }, { status: 500 })
  }
}
