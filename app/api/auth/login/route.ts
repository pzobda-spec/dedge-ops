import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

function getCallbackUrl(request: NextRequest): string {
  const host = request.headers.get('host') ?? ''
  if (host.startsWith('localhost') || host.startsWith('127.')) {
    return `http://${host}/auth/callback`
  }
  return 'https://dedge-ops-6zer.vercel.app/auth/callback'
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
  const body = await request.json()
  const email: string = (body.email ?? '').trim().toLowerCase()

  if (!email) {
    return NextResponse.json({ status: 'error', error: 'Email requis' }, { status: 400 })
  }

  const callbackUrl = getCallbackUrl(request)
  console.log('[auth/login] email:', email, '| callback:', callbackUrl)

  // Admin email bypass — always allowed, creates account if needed
  const adminEmail = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase()
  if (adminEmail && email === adminEmail) {
    console.log('[auth/login] admin bypass → sending OTP')
    const error = await sendOtp(email, callbackUrl, true)
    if (error) {
      console.error('[auth/login] OTP error (admin):', error.message)
      return NextResponse.json({ status: 'error', error: error.message }, { status: 500 })
    }
    return NextResponse.json({ status: 'sent' })
  }

  // Check existing request
  const { data: existing, error: dbError } = await supabaseAdmin
    .from('access_requests')
    .select('status')
    .eq('email', email)
    .maybeSingle()

  if (dbError) {
    console.error('[auth/login] DB error:', dbError.message)
    return NextResponse.json({ status: 'error', error: 'Erreur base de données: ' + dbError.message }, { status: 500 })
  }

  if (existing?.status === 'approved') {
    console.log('[auth/login] approved user → sending OTP')
    const error = await sendOtp(email, callbackUrl, false)
    if (error) {
      console.error('[auth/login] OTP error:', error.message)
      return NextResponse.json({ status: 'error', error: error.message }, { status: 500 })
    }
    return NextResponse.json({ status: 'sent' })
  }

  if (existing?.status === 'pending') {
    console.log('[auth/login] already pending')
    return NextResponse.json({ status: 'pending' })
  }

  // New request
  console.log('[auth/login] new access request for:', email)
  const { error: insertError } = await supabaseAdmin
    .from('access_requests')
    .insert({ email })

  if (insertError) {
    console.error('[auth/login] insert error:', insertError.message)
  }

  return NextResponse.json({ status: 'pending' })
}
