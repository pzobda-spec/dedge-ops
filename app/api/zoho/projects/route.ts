import { unstable_cache } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { fetchProjects } from '@/lib/zoho/projectsClient'
import { ZOHO_PROJECTS_CACHE_SECONDS } from '@/lib/zoho/constants'
import { getCRMAccountsMap } from '@/lib/zoho/accountCache'
import { enrichProjectsWithClients } from '@/lib/onboarding/clientResolver'

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
    const [projects, crmAccounts] = await Promise.all([
      getProjectsData(status),
      getCRMAccountsMap().catch(error => {
        console.warn(
          '[zoho/projects] CRM enrichment unavailable:',
          error instanceof Error ? error.message : String(error),
        )
        return new Map()
      }),
    ])
    const enriched = enrichProjectsWithClients(projects, crmAccounts)
    return NextResponse.json({
      projects: enriched.projects,
      meta: { clientLinkage: enriched.meta },
    })
  } catch (err) {
    console.error('[zoho/projects] GET error:', err)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des projets Zoho' },
      { status: 500 },
    )
  }
}
