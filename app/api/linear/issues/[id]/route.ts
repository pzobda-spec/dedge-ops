import { NextRequest, NextResponse } from 'next/server'
import { fetchIssue } from '@/lib/linear/client'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const issue = await fetchIssue(params.id)
    return NextResponse.json(issue)
  } catch (err) {
    console.error('Linear fetchIssue error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
