import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { isHardcodedAccessEmail } from '@/lib/auth/access'
import type { Role } from '@/lib/auth/roles'

const RESTRICTED_ROUTES: Array<{ prefixes: string[]; roles: Role[] }> = [
  {
    prefixes: [
      '/onboarding',
      '/trainings',
      '/tickets',
      '/api/onboarding',
      '/api/integrations/zoho',
      '/api/zoho/projects',
      '/api/acuity',
      '/api/google/meet',
    ],
    roles: ['admin', 'onboarder', 'support'],
  },
  {
    prefixes: ['/admin', '/api/admin'],
    roles: ['admin'],
  },
  {
    prefixes: ['/settings/me'],
    roles: ['admin', 'onboarder', 'support', 'commercial_readonly'],
  },
]

interface MiddlewareUser {
  email: string
  role: Role
  active: boolean
}

function getAllowedRoles(path: string): Role[] | null {
  const match = RESTRICTED_ROUTES.find(route =>
    route.prefixes.some(prefix => path === prefix || path.startsWith(prefix + '/'))
  )
  return match?.roles ?? null
}

async function getMiddlewareUser(email: string): Promise<MiddlewareUser | null> {
  const normalized = email.trim().toLowerCase()
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/users?select=email,role,active&email=eq.${encodeURIComponent(normalized)}&limit=1`
  const res = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    cache: 'no-store',
  })

  if (!res.ok) return null
  const rows = await res.json().catch(() => []) as MiddlewareUser[]
  return rows[0] ?? null
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const allowedRoles = getAllowedRoles(path)
  const isPublic =
    path.startsWith('/login') ||
    path.startsWith('/auth') ||
    path.startsWith('/api/auth') ||
    path.startsWith('/api/cron') ||
    path.startsWith('/forbidden')

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && path === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  if (user && allowedRoles) {
    const appUser = user.email ? await getMiddlewareUser(user.email) : null
    const fallbackAllowed = !appUser && isHardcodedAccessEmail(user.email)

    if (!appUser && !fallbackAllowed) {
      if (path.startsWith('/api/')) {
        return NextResponse.json({ error: 'Utilisateur non autorisé' }, { status: 403 })
      }

      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    if (appUser && !appUser.active) {
      if (path.startsWith('/api/')) {
        return NextResponse.json({ error: 'Compte inactif' }, { status: 403 })
      }

      const url = request.nextUrl.clone()
      url.pathname = '/forbidden'
      return NextResponse.redirect(url)
    }

    const role = appUser?.role ?? 'admin'
    if (!allowedRoles.includes(role)) {
      if (path.startsWith('/api/')) {
        return NextResponse.json({ error: 'Accès restreint' }, { status: 403 })
      }

      const url = request.nextUrl.clone()
      url.pathname = '/forbidden'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
