import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { parseZohoDeskWebhook } from '@/lib/support/zohoWebhook'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ['admin'])
    const fixture = [{
      eventType: 'Ticket_Update',
      eventTime: Date.now(),
      orgId: process.env.ZOHO_ORG_ID ?? 'test-org',
      payload: { id: 'shadow-parser-test', subject: 'Test sans écriture' },
    }]
    const parsed = parseZohoDeskWebhook(fixture)
    return NextResponse.json({
      ok: parsed.length === 1 && parsed[0].ticketId === 'shadow-parser-test',
      mode: 'parser_only',
      persisted: false,
      external_writes: { zoho: false, linear: false, slack: false },
    })
  } catch (error) {
    return authErrorResponse(error)
      ?? NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
