import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data: latest } = await supabaseAdmin
      .from('webhook_events')
      .select('processed_at')
      .order('processed_at', { ascending: false })
      .limit(1)
      .single()

    const { count } = await supabaseAdmin
      .from('webhook_events')
      .select('*', { count: 'exact', head: true })
      .gte('processed_at', today.toISOString())

    return NextResponse.json({
      lastReceived: latest?.processed_at ?? null,
      dailyCount: count ?? 0,
    })
  } catch (err) {
    console.error('[webhook/stats]', err)
    return NextResponse.json({ lastReceived: null, dailyCount: 0 })
  }
}
