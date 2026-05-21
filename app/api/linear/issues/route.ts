import { unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'
import { fetchIssues } from '@/lib/linear/client'

export const dynamic = 'force-dynamic'

const getIssuesData = unstable_cache(
  async () => fetchIssues(),
  ['linear-issues'],
  { revalidate: 300, tags: ['linear-issues'] }
)

export async function GET() {
  try {
    const issues = await getIssuesData()
    return NextResponse.json({ issues })
  } catch (err) {
    console.error('Linear fetchIssues error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
