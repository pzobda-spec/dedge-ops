import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { syncTodoist } from '../_lib/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ['admin', 'onboarder'])
    return NextResponse.json(await syncTodoist())
  } catch (error) {
    console.error('[todoist/sync] POST error:', error)
    return authErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
