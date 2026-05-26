import { unstable_cache } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { fetchSessions, fetchUpcomingSessions, fetchRecentSessions } from '@/lib/acuity/client'
import { ACUITY_SESSIONS_CACHE_SECONDS } from '@/lib/zoho/constants'

export const dynamic = 'force-dynamic'

const getSessionsData = unstable_cache(
  async (period: string, months: number, minDate: string, maxDate: string) => {
    if (minDate || maxDate) {
      return fetchSessions({ minDate: minDate || undefined, maxDate: maxDate || undefined })
    } else if (period === 'upcoming') {
      return fetchUpcomingSessions()
    } else if (period === 'all') {
      return fetchSessions()
    } else {
      return fetchRecentSessions(months)
    }
  },
  ['acuity-sessions'],
  { revalidate: ACUITY_SESSIONS_CACHE_SECONDS, tags: ['acuity-sessions'] }
)

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const period = searchParams.get('period') ?? 'recent'
    const months = parseInt(searchParams.get('months') ?? '3', 10)
    const minDate = searchParams.get('minDate') ?? ''
    const maxDate = searchParams.get('maxDate') ?? ''

    const sessions = await getSessionsData(period, months, minDate, maxDate)
    return NextResponse.json({ sessions })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
