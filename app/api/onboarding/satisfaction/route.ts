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
    if (error) throw new Error(error.message)
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
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
