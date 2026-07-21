import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getUserByEmail } from '@/lib/auth/roles'

export async function POST(request: Request) {
  const formData = await request.formData()
  const authorizationId = formData.get('authorization_id')
  const decision = formData.get('decision')
  if (typeof authorizationId !== 'string' || !authorizationId) {
    return NextResponse.json({ error: 'authorization_id requis' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  const appUser = user?.email ? await getUserByEmail(user.email) : null
  if (!appUser) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const response = decision === 'approve'
    ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })
  if (response.error || !response.data) {
    return NextResponse.json({ error: response.error?.message ?? 'Décision OAuth impossible' }, { status: 400 })
  }
  return NextResponse.redirect(response.data.redirect_url)
}
