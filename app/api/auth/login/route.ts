import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

const CALLBACK_URL = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`

export async function POST(request: NextRequest) {
  const body = await request.json()
  const email: string = (body.email ?? '').trim().toLowerCase()

  if (!email) {
    return NextResponse.json({ status: 'error', error: 'Email requis' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Admin email bypass — always allowed, creates account if needed
  if (email === (process.env.ADMIN_EMAIL ?? '').toLowerCase()) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: CALLBACK_URL },
    })
    if (error) return NextResponse.json({ status: 'error', error: error.message }, { status: 500 })
    return NextResponse.json({ status: 'sent' })
  }

  // Check existing request
  const { data: existing } = await supabaseAdmin
    .from('access_requests')
    .select('status')
    .eq('email', email)
    .maybeSingle()

  if (existing?.status === 'approved') {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: CALLBACK_URL },
    })
    if (error) return NextResponse.json({ status: 'error', error: error.message }, { status: 500 })
    return NextResponse.json({ status: 'sent' })
  }

  if (existing?.status === 'pending') {
    return NextResponse.json({ status: 'pending' })
  }

  // New request — save and notify
  await supabaseAdmin.from('access_requests').insert({ email })

  return NextResponse.json({ status: 'pending' })
}
