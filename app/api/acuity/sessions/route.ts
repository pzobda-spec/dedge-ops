import { NextRequest, NextResponse } from 'next/server'
import { fetchSessions, fetchUpcomingSessions, fetchRecentSessions } from '@/lib/acuity/client'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const period = searchParams.get('period') ?? 'recent'
    const months = parseInt(searchParams.get('months') ?? '3', 10)

    let sessions
    if (period === 'upcoming') {
      sessions = await fetchUpcomingSessions()
    } else if (period === 'all') {
      sessions = await fetchSessions()
    } else {
      // default: 'recent'
      sessions = await fetchRecentSessions(months)
    }

    return NextResponse.json({ sessions })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
