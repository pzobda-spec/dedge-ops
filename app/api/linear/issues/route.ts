import { NextResponse } from 'next/server'
import { fetchIssues } from '@/lib/linear/client'

export async function GET() {
  try {
    const issues = await fetchIssues()
    return NextResponse.json({ issues })
  } catch (err) {
    console.error('Linear fetchIssues error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
