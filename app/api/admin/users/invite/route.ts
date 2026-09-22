import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, isRole, requireRole } from '@/lib/auth/roles'
import { provisionAccess, sendAccessLink } from '@/lib/auth/provision'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ['admin'])
    const body = await req.json().catch(() => ({}))
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
    if (!isRole(body.role)) return NextResponse.json({ error: 'Rôle invalide' }, { status: 400 })
    if (!fullName || fullName.length > 200) return NextResponse.json({ error: 'Nom complet requis (200 caractères maximum)' }, { status: 400 })
    const userId = await provisionAccess(email, fullName, body.role, false)
    const warning = await sendAccessLink(email, req.nextUrl.origin)
    return NextResponse.json({ success: true, user_id: userId, warning })
  } catch (err) {
    return authErrorResponse(err) ?? NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
