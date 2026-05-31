import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, isRole, requireRole } from '@/lib/auth/roles'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const currentUser = await requireRole(req, ['admin'])
    const body = await req.json().catch(() => ({}))

    if (currentUser.id === params.id && isRole(body.role) && body.role !== 'admin') {
      return NextResponse.json({ error: 'Vous ne pouvez pas vous rétrograder.' }, { status: 400 })
    }
    if (currentUser.id === params.id && body.active === false) {
      return NextResponse.json({ error: 'Vous ne pouvez pas désactiver votre propre compte.' }, { status: 400 })
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (isRole(body.role)) patch.role = body.role
    if (typeof body.active === 'boolean') patch.active = body.active
    if (typeof body.full_name === 'string') patch.full_name = body.full_name.trim() || null

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(patch)
      .eq('id', params.id)
      .select('id, email, full_name, role, active, invited_at, last_login_at, created_at, updated_at')
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ user: data })
  } catch (err) {
    return authErrorResponse(err) ?? NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const currentUser = await requireRole(req, ['admin'])
    if (currentUser.id === params.id) {
      return NextResponse.json({ error: 'Vous ne pouvez pas désactiver votre propre compte.' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('users')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', params.id)

    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true })
  } catch (err) {
    return authErrorResponse(err) ?? NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
