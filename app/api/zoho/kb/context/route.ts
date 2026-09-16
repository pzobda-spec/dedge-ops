import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { fetchKBContext } from '@/lib/zoho/kb'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['admin', 'support'])
    return NextResponse.json(await fetchKBContext())
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('[zoho/kb/context]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Impossible de charger la configuration KB' },
      { status: 500 },
    )
  }
}
