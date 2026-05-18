import { NextRequest, NextResponse } from 'next/server'
import { fetchTicketConversations } from '@/lib/zoho/client'
import { mapZohoConversation } from '@/lib/zoho/mapper'
import type { ZohoRawConversation } from '@/lib/zoho/mapper'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const response = await fetchTicketConversations(params.id)
    const rawConversations = (response.data || []) as ZohoRawConversation[]

    const conversations = rawConversations.map(item => mapZohoConversation(item, null))

    return NextResponse.json({ conversations })
  } catch (err) {
    console.error(`[zoho/tickets/${params.id}/conversations] GET error:`, err)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des conversations' },
      { status: 500 }
    )
  }
}
