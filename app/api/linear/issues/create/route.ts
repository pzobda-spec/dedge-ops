import { NextRequest, NextResponse } from 'next/server'
import { createIssue } from '@/lib/linear/client'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, description, priority, labelIds } = body

    if (!title || !description) {
      return NextResponse.json(
        { error: 'title and description are required' },
        { status: 400 }
      )
    }

    const issue = await createIssue({ title, description, priority, labelIds })
    return NextResponse.json(issue, { status: 201 })
  } catch (err) {
    console.error('Linear createIssue error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
