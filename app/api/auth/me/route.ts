import { NextResponse } from 'next/server'
import { isHardcodedAccessEmail } from '@/lib/auth/access'
import { getSessionUserEmail } from '@/lib/auth/session'
import { getUserByEmail } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

export async function GET() {
  const email = await getSessionUserEmail()
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await getUserByEmail(email)
  if (user) return NextResponse.json({ user })

  if (isHardcodedAccessEmail(email)) {
    console.warn(`[auth/me] fallback hardcoded access for ${email}`)
    return NextResponse.json({
      user: {
        id: email,
        email,
        full_name: null,
        role: 'admin',
        active: true,
      },
    })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
