import { unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'
import { fetchBugSummary } from '@/lib/linear/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const readSummary = unstable_cache(fetchBugSummary, ['dashboard-bugs-summary'], { revalidate: 300, tags: ['linear-issues'] })
export async function GET() {
  try { return NextResponse.json(await readSummary()) }
  catch { return NextResponse.json({ error: 'Le décompte Linear est indisponible.' }, { status: 502 }) }
}
