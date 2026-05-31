import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, isRole, requireRole } from '@/lib/auth/roles'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ['admin'])
    const body = await req.json().catch(() => ({}))
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const role = isRole(body.role) ? body.role : null
    const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : null

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
    }
    if (!role) return NextResponse.json({ error: 'Rôle invalide' }, { status: 400 })

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (existingError) throw new Error(existingError.message)
    if (existing) return NextResponse.json({ error: 'Cet email existe déjà dans users' }, { status: 409 })

    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin}/auth/callback?next=/onboarding`
    const invited = await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo })
    if (invited.error) {
      return NextResponse.json({ error: `Invitation Supabase impossible: ${invited.error.message}` }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .insert({
        id: invited.data.user?.id ?? crypto.randomUUID(),
        email,
        full_name: fullName || null,
        role,
        active: false,
        invited_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true, user_id: data.id })
  } catch (err) {
    return authErrorResponse(err) ?? NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
