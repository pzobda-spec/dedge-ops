import { NextRequest, NextResponse } from 'next/server'
import { fetchProjects } from '@/lib/zoho/projectsClient'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const status = searchParams.get('status') ?? undefined

    const projects = await fetchProjects({ status })

    return NextResponse.json({ projects })
  } catch (err) {
    console.error('[zoho/projects] GET error:', err)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des projets Zoho' },
      { status: 500 },
    )
  }
}
