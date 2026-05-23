import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { email, action } = await request.json()

  if (!email) return NextResponse.json({ error: 'Email requis' }, { status: 400 })

  if (action === 'reject') {
    await supabaseAdmin
      .from('access_requests')
      .update({ status: 'rejected' })
      .eq('email', email)
    return NextResponse.json({ success: true })
  }

  let callbackUrl: string
  if (process.env.NEXT_PUBLIC_APP_URL) {
    callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/auth/callback`
  } else {
    const host = request.headers.get('host') ?? ''
    const proto = host.startsWith('localhost') ? 'http' : 'https'
    callbackUrl = `${proto}://${host}/auth/callback`
  }
  console.log('[auth/approve] callbackUrl:', callbackUrl)

  // Approve: invite the user in Supabase Auth (creates account + sends invite email)
  const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: callbackUrl,
  })

  if (inviteError && !inviteError.message.toLowerCase().includes('already')) {
    console.error('Invite error:', inviteError)
    return NextResponse.json({ error: inviteError.message }, { status: 500 })
  }

  await supabaseAdmin
    .from('access_requests')
    .update({ status: 'approved' })
    .eq('email', email)

  return NextResponse.json({ success: true })
}
