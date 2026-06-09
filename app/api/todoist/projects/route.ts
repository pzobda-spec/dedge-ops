import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface ProjectWithCount {
  id: string
  name: string
  zoho_project_id: string | null
  last_synced_at: string | null
  todoist_comments: Array<{ count: number }>
}

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ['admin', 'onboarder', 'support', 'commercial_readonly'])
    const { data, error } = await supabaseAdmin
      .from('todoist_projects')
      .select('id, name, zoho_project_id, last_synced_at, todoist_comments(count)')
      .order('name')

    if (error) throw new Error(error.message)
    const projects = ((data ?? []) as ProjectWithCount[]).map(project => ({
      id: project.id,
      name: project.name,
      zoho_project_id: project.zoho_project_id,
      last_synced_at: project.last_synced_at,
      comment_count: project.todoist_comments[0]?.count ?? 0,
    }))

    return NextResponse.json({ projects })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
