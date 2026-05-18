import { NextRequest, NextResponse } from 'next/server'
import { postTicketReply } from '@/lib/zoho/client'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json() as { content: string; contentType?: 'html' | 'plainText' }

    if (!body.content || !body.content.trim()) {
      return NextResponse.json(
        { error: 'Le contenu de la réponse est requis' },
        { status: 400 }
      )
    }

    await postTicketReply(params.id, {
      content: body.content,
      contentType: body.contentType ?? 'html',
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(`[zoho/tickets/${params.id}/reply] POST error:`, err)
    return NextResponse.json(
      { error: 'Erreur lors de l\'envoi de la réponse' },
      { status: 500 }
    )
  }
}
