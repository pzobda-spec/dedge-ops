import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { isHardcodedAccessEmail } from '@/lib/auth/access'
import type { Role } from '@/lib/auth/roles'

// ─── Route restrictions ────────────────────────────────────────────────────────
// Each entry: if the request path matches a prefix, only the listed roles may access it.

const RESTRICTED_ROUTES: Array<{ prefixes: string[]; roles: Role[] }> = [
  // Admin surfaces must be matched before their broader read scopes.
  {
    prefixes: ['/admin', '/api/admin'],
    roles: ['admin'],
  },
  {
    prefixes: ['/api/acuity/sessions'],
    roles: ['admin', 'support'],
  },
  // Admin + support only (onboarder and commercial_readonly are blocked)
  {
    prefixes: [
      '/dashboard',
      '/tickets', '/escalations', '/trainings',
      '/knowledge', '/reporting', '/assistant',
      '/api/tickets', '/api/escalations', '/api/trainings',
      '/api/analytics', '/api/reporting',
      '/api/support',
      '/api/zoho/tickets', '/api/linear/issues',
      '/api/knowledge', '/api/google',
    ],
    roles: ['admin', 'support'],
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

const AUTH_FETCH_TIMEOUT_MS = 10_000
const AUTH_VERIFICATION_TIMEOUT_MS = 12_000
const ROLE_LOOKUP_TIMEOUT_MS = 4_000

function middlewareFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(AUTH_FETCH_TIMEOUT_MS),
  })
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
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
  const startedAt = Date.now()
  try {
    const res = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(ROLE_LOOKUP_TIMEOUT_MS),
    })

    if (!res.ok) return null
    const rows = await res.json().catch(() => []) as MiddlewareUser[]
    return rows[0] ?? null
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      msg: 'middleware user lookup failed',
      ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    }))
    return null
  }
}

function homePathForRole(role: Role | null): string {
  if (role === 'onboarder' || role === 'commercial_readonly') return '/onboarding'
  return '/dashboard'
}

// ─── Middleware ────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const startedAt = Date.now()
  const path = request.nextUrl.pathname
  const bypassAuthentication =
    path.startsWith('/auth') ||
    path.startsWith('/api/auth') ||
    path.startsWith('/api/mcp') ||
    path.startsWith('/.well-known/oauth-protected-resource') ||
    path.startsWith('/oauth/consent') ||
    path.startsWith('/api/cron') ||
    path === '/api/webhooks/zoho-desk' ||
    path.startsWith('/api/webhooks/zoho-forms') ||
    path.startsWith('/forbidden')

  if (bypassAuthentication) return NextResponse.next()

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: middlewareFetch },
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

  let userEmail: string | null = null
  try {
    const { data, error } = await withTimeout(
      supabase.auth.getUser(),
      AUTH_VERIFICATION_TIMEOUT_MS,
    )
    const email = data.user?.email
    if (!error && email) userEmail = email.trim().toLowerCase()
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      msg: 'middleware auth verification failed',
      path: request.nextUrl.pathname,
      ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    }))
  }

  const isPublic = path.startsWith('/login')

  // Not authenticated → redirect to login
  if (!userEmail && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Authenticated on root or login → redirect to role-appropriate home
  if (userEmail && (path === '/' || path === '/login')) {
    const appUser = isHardcodedAccessEmail(userEmail) ? null : await getMiddlewareUser(userEmail)
    const role = appUser?.role ?? (isHardcodedAccessEmail(userEmail) ? 'admin' : null)
    const url = request.nextUrl.clone()
    url.pathname = homePathForRole(role)
    return NextResponse.redirect(url)
  }

  // Role-based access control on restricted routes
  if (userEmail) {
    const allowedRoles = getAllowedRoles(path)
    if (allowedRoles) {
      const fallbackAllowed = isHardcodedAccessEmail(userEmail)
      const appUser = fallbackAllowed ? null : await getMiddlewareUser(userEmail)

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
