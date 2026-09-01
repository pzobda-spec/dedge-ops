import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { measureFalsePositives } from '@/lib/support/urgency/metrics'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['admin', 'support'])
    return NextResponse.json({ mode: 'shadow', ...(await measureFalsePositives()) })
  } catch (error) {
    return authErrorResponse(error)
      ?? NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
