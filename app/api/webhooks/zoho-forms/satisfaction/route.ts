import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { resolveOwnerName } from '@/lib/onboarding/constants'

export const dynamic = 'force-dynamic'

/** Receives Zoho Forms submission webhooks for the onboarding satisfaction form. */
export async function POST(req: NextRequest) {
  const expected = process.env.ZOHO_FORMS_WEBHOOK_SECRET
  if (!expected || req.nextUrl.searchParams.get('token') !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json() as Record<string, unknown>
    const value = (...keys: string[]) => keys.map(k => body[k]).find(v => v != null && String(v).trim() !== '')
    const score = (...keys: string[]) => {
      const n = Number(value(...keys) ?? 0)
      return Number.isFinite(n) ? Math.min(5, Math.max(0, n)) : 0
    }
    const id = String(value('Entry_Id', 'entry_id', 'id', 'ID') ?? `${Date.now()}`)
    const row = {
      zoho_id: id,
      establishment: String(value('Your establishment', 'Establishment', 'Etablissement') ?? ''),
      respondent_name: String(value('Name', 'Respondent') ?? ''),
      owner: resolveOwnerName(String(value('Task Owner', 'Owner') ?? '')),
      score_global: score('Global satisfaction', 'Score_global'),
      score_onboarding: score('Onboarding', 'Score_onboarding'),
      score_simplicity: score('Simplicity of implementation', 'Score_simplicite'),
      score_tool: score('Tool performance', 'Score_outil'),
      score_training: score('Trainings', 'Score_formation'),
      comment: value('Please help us to improve !', 'Comment', 'Commentaire') ? String(value('Please help us to improve !', 'Comment', 'Commentaire')) : null,
      submitted_at: String(value('Added Time', 'submitted_at', 'Date') ?? new Date().toISOString()),
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabaseAdmin.from('onboarding_satisfaction').upsert(row, { onConflict: 'zoho_id' })
    if (error) throw error
    return NextResponse.json({ ok: true, zoho_id: id })
  } catch (error) {
    console.error('[zoho-forms-webhook]', error)
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
  }
}
