import { NextRequest, NextResponse } from 'next/server'
import { getSessionUserEmail } from '@/lib/auth/session'
import { finishSignIn } from '@/lib/auth/finish'

export async function POST(request: NextRequest) {
  try {
    const email = await getSessionUserEmail()
    if (!email) return NextResponse.json({ error: 'Lien invalide ou expiré.' }, { status: 401 })
    const body = await request.json().catch(() => ({}))
    return NextResponse.json({ next: await finishSignIn(email, body.next) })
  } catch {
    return NextResponse.json({ error: 'Impossible de vérifier votre profil. Réessayez.' }, { status: 503 })
  }
}
