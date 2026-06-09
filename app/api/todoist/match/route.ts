import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { supabaseAdmin } from '@/lib/supabase/server'

type MatchAction = 'confirm' | 'reject'

interface MatchRequestBody {
  todoist_project_id: string
  zoho_project_id: string
  action: MatchAction
}

function isMatchRequestBody(value: unknown): value is MatchRequestBody {
  if (typeof value !== 'object' || value === null) return false
  const body = value as Record<string, unknown>
  return typeof body.todoist_project_id === 'string' &&
    typeof body.zoho_project_id === 'string' &&
    (body.action === 'confirm' || body.action === 'reject')
}

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ['admin', 'onboarder'])
    const body: unknown = await req.json()
    if (!isMatchRequestBody(body)) {
      return NextResponse.json({ error: 'Invalid match review payload' }, { status: 400 })
    }

    if (body.action === 'confirm') {
      const { error: projectError } = await supabaseAdmin
        .from('todoist_projects')
        .update({ zoho_project_id: body.zoho_project_id })
        .eq('id', body.todoist_project_id)
      if (projectError) throw new Error(projectError.message)

      const { error: otherCandidatesError } = await supabaseAdmin
        .from('todoist_match_candidates')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('todoist_project_id', body.todoist_project_id)
        .eq('status', 'pending')
      if (otherCandidatesError) throw new Error(otherCandidatesError.message)
    }

    const { data, error } = await supabaseAdmin
      .from('todoist_match_candidates')
      .update({
        status: body.action === 'confirm' ? 'confirmed' : 'rejected',
        updated_at: new Date().toISOString(),
      })
      .eq('todoist_project_id', body.todoist_project_id)
      .eq('zoho_project_id', body.zoho_project_id)
      .select('todoist_project_id, zoho_project_id, score, status')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return NextResponse.json({ error: 'Match candidate not found' }, { status: 404 })

    return NextResponse.json({ candidate: data })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
