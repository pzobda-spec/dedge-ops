import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('access_requests')
    .select('id, email, requested_at, status')
    .order('requested_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(
    { requests: data ?? [] },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
