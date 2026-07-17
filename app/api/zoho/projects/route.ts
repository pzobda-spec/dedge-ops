import { unstable_cache } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { fetchProjects } from '@/lib/zoho/projectsClient'
import { ZOHO_PROJECTS_CACHE_SECONDS } from '@/lib/zoho/constants'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const getProjectsData = unstable_cache(
  async (status: string) => fetchProjects({ status: status || undefined }),
  ['zoho-projects'],
  { revalidate: ZOHO_PROJECTS_CACHE_SECONDS, tags: ['zoho-projects'] }
)

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const status = searchParams.get('status') ?? ''
    const projects = await getProjectsData(status)
    return NextResponse.json({ projects })
  } catch (err) {
    console.error('[zoho/projects] GET error:', err)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des projets Zoho' },
      { status: 500 },
    )
  }
}
