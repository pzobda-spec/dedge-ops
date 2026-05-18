import { NextResponse } from 'next/server'
import { getCRMAccountsMap } from '@/lib/zoho/accountCache'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const map = await getCRMAccountsMap()
    const accounts = Array.from(map.values())
    return NextResponse.json({ accounts })
  } catch (err) {
    console.error('[zoho/accounts] GET error:', err)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des comptes CRM' },
      { status: 500 }
    )
  }
}
