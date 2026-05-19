import { withAuth } from 'next-auth/middleware'

export default withAuth({
  pages: { signIn: '/login' },
})

export const config = {
  // Protect only UI pages — leave all /api/* routes unguarded
  // (API routes are called server-side or from authenticated client pages)
  matcher: ['/((?!api/|login|_next/static|_next/image|favicon.ico).*)'],
}
