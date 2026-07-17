import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { isHardcodedAccessEmail } from '@/lib/auth/access'
import type { Role } from '@/lib/auth/roles'

// ─── Route restrictions ────────────────────────────────────────────────────────
// Each entry: if the request path matches a prefix, only the listed roles may access it.

const RESTRICTED_ROUTES: Array<{ prefixes: string[]; roles: Role[] }> = [
  // Admin + support only (onboarder and commercial_readonly are blocked)
  {
    prefixes: [
      '/dashboard',
      '/tickets', '/escalations', '/trainings',
      '/knowledge', '/reporting', '/assistant',
      '/api/tickets', '/api/escalations', '/api/trainings',
      '/api/analytics',
      '/api/zoho/tickets', '/api/linear/issues',
      '/api/knowledge', '/api/google',
    ],
    roles: ['admin', 'support'],
  },
  // Admin only
  {
    prefixes: ['/admin', '/api/admin'],
    roles: ['admin'],
  },
  // Onboarding scope: admin + onboarder + commercial_readonly
  {
    prefixes: [
      '/onboarding',
      '/api/onboarding',
      '/api/zoho/projects',
      '/api/acuity',
      '/api/ai/onboarding-summary',
      '/api/integrations/zoho',
    ],
    roles: ['admin', 'onboarder', 'commercial_readonly'],
  },
]

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

function homePathForRole(role: Role | null): string {
  if (role === 'onboarder' || role === 'commercial_readonly') return '/onboarding'
  return '/dashboard'
}

// ─── Middleware ────────────────────────────────────────────────────────────────

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
  const isPublic =
    path.startsWith('/login') ||
    path.startsWith('/auth') ||
    path.startsWith('/api/auth') ||
    path.startsWith('/api/cron') ||
    path.startsWith('/forbidden')

  // Not authenticated → redirect to login
  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Authenticated on root or login → redirect to role-appropriate home
  if (user && (path === '/' || path === '/login')) {
    const appUser = user.email ? await getMiddlewareUser(user.email) : null
    const role = appUser?.role ?? null
    const url = request.nextUrl.clone()
    url.pathname = homePathForRole(role)
    return NextResponse.redirect(url)
  }

  // Role-based access control on restricted routes
  if (user) {
    const allowedRoles = getAllowedRoles(path)
    if (allowedRoles) {
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
        url.pathname = homePathForRole(role)
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
