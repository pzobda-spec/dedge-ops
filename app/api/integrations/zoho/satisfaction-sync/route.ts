import { revalidateTag } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { isHardcodedAccessEmail } from '@/lib/auth/access'
import { AuthError, authErrorResponse, requireRole } from '@/lib/auth/roles'
import { getSessionUserEmail } from '@/lib/auth/session'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function requireSyncAccess(req: NextRequest): Promise<void> {
  try {
    await requireRole(req, ['admin', 'onboarder'])
  } catch (error) {
    // Match the hardcoded admin fallback used by the onboarding detail page.
    if (error instanceof AuthError && error.status === 401) {
      const email = await getSessionUserEmail()
      if (email && isHardcodedAccessEmail(email)) return
    }
    throw error
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireSyncAccess(req)
    // Zoho Forms' report URL is not exposed as a supported historical API.
    // Historical rows are imported once from CSV; new rows arrive through the
    // Zoho Forms webhook. The button remains useful as a freshness check.
    const { count, error } = await supabaseAdmin
      .from('onboarding_satisfaction')
      .select('zoho_id', { count: 'exact', head: true })
    if (error) throw new Error(error.message)

    revalidateTag('onboarding-satisfaction')
    return NextResponse.json({ synced: count ?? 0, message: `${count ?? 0} réponse(s) disponibles (webhook Zoho Forms actif).` })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[satisfaction-sync]', msg)
    return authErrorResponse(err) ?? NextResponse.json({ error: msg }, { status: 500 })
  }
}
