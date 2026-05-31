import { NextResponse } from 'next/server'
import { getSessionUserEmail } from '@/lib/auth/session'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  const email = await getSessionUserEmail()
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabaseAdmin
    .from('users')
    .update({
      active: true,
      last_login_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('email', email.trim().toLowerCase())

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
