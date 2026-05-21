import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'
import { fetchSatisfactionResponses } from '@/lib/zoho/forms'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
  try {
    const responses = await fetchSatisfactionResponses()

    if (responses.length === 0) {
      return NextResponse.json({ synced: 0, message: 'Aucune réponse trouvée dans Zoho Forms.' })
    }

    const rows = responses.map(r => ({
      zoho_id: r.id,
      establishment: r.establishment,
      respondent_name: r.respondent_name,
      owner: r.owner,
      score_global: r.score_global,
      score_onboarding: r.score_onboarding,
      score_simplicity: r.score_simplicity,
      score_tool: r.score_tool,
      score_training: r.score_training,
      comment: r.comment,
      submitted_at: r.submitted_at,
    }))

    const { error } = await supabaseAdmin
      .from('onboarding_satisfaction')
      .upsert(rows, { onConflict: 'zoho_id' })

    if (error) throw new Error(error.message)

    revalidateTag('onboarding-satisfaction')
    return NextResponse.json({ synced: rows.length, message: `${rows.length} réponse(s) synchronisée(s).` })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[satisfaction-sync]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
