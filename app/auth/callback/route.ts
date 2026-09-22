import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { safeNextPath } from '@/lib/auth/paths'
import { finishSignIn } from '@/lib/auth/finish'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))

  if (code) {
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

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const email = data.user?.email?.trim().toLowerCase()
      try {
        const destination = email ? await finishSignIn(email, next) : '/login?error=1'
        return NextResponse.redirect(new URL(destination, request.url))
      } catch {
        return NextResponse.redirect(new URL('/forbidden', request.url))
      }
    }
  }

  if (code || searchParams.has('error')) return NextResponse.redirect(new URL('/login?error=1', request.url))
  // Invitation / admin-issued links return tokens in the URL fragment. Browsers
  // carry that fragment through the redirect; it cannot be read on the server.
  const complete = new URL('/auth/complete', request.url)
  if (next) complete.searchParams.set('next', next)
  return NextResponse.redirect(complete)
}
