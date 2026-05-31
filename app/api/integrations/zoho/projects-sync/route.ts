import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { syncOnboardingProjects } from '@/lib/onboarding/syncProjects'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function getActorEmail(): Promise<string | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data } = await supabase.auth.getUser()
  return data.user?.email ?? null
}

export async function POST(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get('project_id') ?? undefined
    const actorEmail = await getActorEmail()
    const result = await syncOnboardingProjects({ projectId, actorEmail })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[zoho/projects-sync] POST error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
