import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ['admin'])
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email, full_name, role, active, invited_at, last_login_at, created_at, updated_at')
      .order('active', { ascending: false })
      .order('invited_at', { ascending: false, nullsFirst: false })

    if (error) throw new Error(error.message)
    return NextResponse.json({ users: data ?? [] })
  } catch (err) {
    return authErrorResponse(err) ?? NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
