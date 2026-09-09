import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { supabaseAdmin } from '@/lib/supabase/server'
import { fetchAllPages } from '@/lib/supabase/pagination'
import { summarizeBacklog } from '@/lib/support/backlog'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ['admin', 'support'])
    const { data, error } = await fetchAllPages((from, to) => supabaseAdmin.from('ticket_analytics')
      .select('created_at,last_synced_at,product_area,client_name')
      .in('status', ['Open', 'Pending']).order('id').range(from, to))
    if (error) throw new Error(error.message)
    return NextResponse.json({ ...summarizeBacklog(data ?? []), generatedAt: new Date().toISOString() })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Stock support indisponible.' }, { status: 500 })
  }
}
