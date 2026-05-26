import { unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'
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
        return []
      }
      throw new Error(error.message)
    }
    return data ?? []
  },
  ['onboarding-satisfaction'],
  { tags: ['onboarding-satisfaction'], revalidate: 3600 },
)

export async function GET() {
  try {
    const data = await getSatisfaction()
    return NextResponse.json({ data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[onboarding/satisfaction] GET error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function isMissingSatisfactionTable(error: { code?: string; message?: string }) {
  return error.code === '42P01' || /onboarding_satisfaction/i.test(error.message ?? '')
}
