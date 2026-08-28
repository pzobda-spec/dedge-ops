import { unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'
import { resolveOwnerName } from '@/lib/onboarding/constants'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const getSatisfaction = unstable_cache(
  async () => {
    const { data, error } = await supabaseAdmin
      .from('onboarding_satisfaction')
      .select('*')
      .order('submitted_at', { ascending: false })
    if (error) {
      if (isMissingSatisfactionTable(error)) {
        console.warn('[onboarding/satisfaction] onboarding_satisfaction table is missing; returning empty data set')
        return { data: [], tableAvailable: false }
      }
      throw new Error(error.message)
    }
    return {
      data: (data ?? []).map(row => ({
        ...row,
        owner: typeof row.owner === 'string' && row.owner.trim()
          ? resolveOwnerName(row.owner)
          : row.owner,
      })),
      tableAvailable: true,
    }
  },
  ['onboarding-satisfaction'],
  { tags: ['onboarding-satisfaction'], revalidate: 3600 },
)

export async function GET() {
  try {
    const result = await getSatisfaction()
    const configured = Boolean(
      process.env.ZOHO_REFRESH_TOKEN
      && process.env.ZOHO_FORMS_SATISFACTION_FORM
      && process.env.ZOHO_FORMS_SATISFACTION_REPORT
    )
    return NextResponse.json({ ...result, configured })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[onboarding/satisfaction] GET error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function isMissingSatisfactionTable(error: { code?: string; message?: string }) {
  return error.code === '42P01' || /onboarding_satisfaction/i.test(error.message ?? '')
}
