import { NextRequest, NextResponse } from 'next/server'
import { fetchThreadContent } from '@/lib/zoho/client'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; threadId: string } }
) {
  try {
    const thread = await fetchThreadContent(params.id, params.threadId)
    return NextResponse.json({ content: thread.content || null })
  } catch (err) {
    console.error(`[zoho/tickets/${params.id}/threads/${params.threadId}] GET error:`, err)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération du thread' },
      { status: 500 }
    )
  }
}
