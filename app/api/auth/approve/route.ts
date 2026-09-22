import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { authErrorResponse, isRole, requireRole } from '@/lib/auth/roles'
import { provisionAccess, sendAccessLink } from '@/lib/auth/provision'

export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ['admin'])
    const body = await request.json().catch(() => ({}))
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!email || !['approve', 'reject'].includes(body.action)) {
      return NextResponse.json({ error: 'Email et action valides requis' }, { status: 400 })
    }
    const { data: accessRequest, error } = await supabaseAdmin.from('access_requests')
      .select('email,status,full_name').eq('email', email).maybeSingle()
    if (error) throw new Error(error.message)
    if (!accessRequest) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })
    if (body.action === 'reject') {
      const { data, error: rejectError } = await supabaseAdmin.from('access_requests')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('email', email).eq('status', 'pending').select('id')
      if (rejectError) throw new Error(rejectError.message)
      if (!data?.length) return NextResponse.json({ error: 'Cette demande a déjà été traitée.' }, { status: 409 })
      return NextResponse.json({ success: true })
    }
    if (!isRole(body.role)) return NextResponse.json({ error: 'Choisissez le rôle à attribuer.' }, { status: 400 })
    if (accessRequest.status === 'rejected') return NextResponse.json({ error: 'Cette demande a été refusée.' }, { status: 409 })
    const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : accessRequest.full_name
    const userId = await provisionAccess(email, fullName || null, body.role, true)
    const warning = await sendAccessLink(email, request.nextUrl.origin)
    return NextResponse.json({ success: true, user_id: userId, warning })
  } catch (err) {
    return authErrorResponse(err) ?? NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
