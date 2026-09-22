import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['admin'])
    const { data, error } = await supabaseAdmin.from('access_requests')
      .select('id, email, full_name, requested_role, approved_role, requested_at, status')
      .order('requested_at', { ascending: false })
    if (error) throw new Error(error.message)
    return NextResponse.json({ requests: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return authErrorResponse(err) ?? NextResponse.json({ error: 'Impossible de charger les demandes.' }, { status: 500 })
  }
}
