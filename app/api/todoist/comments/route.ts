import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface TodoistProjectRow {
  id: string
  name: string
  zoho_project_id: string | null
}

interface MatchCandidateRow {
  todoist_project_id: string
  zoho_project_id: string
  score: number
}

interface TodoistTaskRow {
  id: string
  parent_id: string | null
  content: string
  zoho_project_id: string | null
}

function descendantTaskIds(tasks: TodoistTaskRow[], rootIds: string[]): string[] {
  const selectedIds = new Set(rootIds)
  let addedTask = true

  while (addedTask) {
    addedTask = false
    for (const task of tasks) {
      if (task.parent_id && selectedIds.has(task.parent_id) && !selectedIds.has(task.id)) {
        selectedIds.add(task.id)
        addedTask = true
      }
    }
  }

  return [...selectedIds]
}

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ['admin', 'onboarder', 'support', 'commercial_readonly'])
    const projectId = req.nextUrl.searchParams.get('project_id')
    const zohoProjectId = req.nextUrl.searchParams.get('zoho_project_id')
    if (!projectId && !zohoProjectId) {
      return NextResponse.json(
        { error: 'project_id or zoho_project_id is required' },
        { status: 400 },
      )
    }

    let projectQuery = supabaseAdmin
      .from('todoist_projects')
      .select('id, name, zoho_project_id')
      .limit(1)

    projectQuery = projectId
      ? projectQuery.eq('id', projectId)
      : projectQuery.eq('zoho_project_id', zohoProjectId!)

    const { data: projectData, error: projectError } = await projectQuery.maybeSingle()
    if (projectError) throw new Error(projectError.message)
    let project = (projectData as TodoistProjectRow | null) ?? null
    let taskIds: string[] = []

    if (zohoProjectId) {
      const { data: tasksData, error: tasksError } = await supabaseAdmin
        .from('todoist_tasks')
        .select('id, parent_id, content, zoho_project_id')
      if (tasksError) throw new Error(tasksError.message)

      const tasks = (tasksData ?? []) as TodoistTaskRow[]
      const matchedTasks = tasks.filter(task => task.zoho_project_id === zohoProjectId)
      if (matchedTasks.length > 0) {
        taskIds = descendantTaskIds(tasks, matchedTasks.map(task => task.id))
        project = {
          id: matchedTasks[0].id,
          name: matchedTasks[0].content,
          zoho_project_id: zohoProjectId,
        }
      }
    }

    const { data: commentsData, error: commentsError } = project
      ? taskIds.length > 0
        ? await supabaseAdmin
            .from('todoist_comments')
            .select('id, task_id, project_id, content, posted_at, author')
            .in('task_id', taskIds)
            .order('posted_at', { ascending: false })
        : await supabaseAdmin
          .from('todoist_comments')
          .select('id, task_id, project_id, content, posted_at, author')
          .eq('project_id', project.id)
          .order('posted_at', { ascending: false })
      : { data: [], error: null }
    if (commentsError) throw new Error(commentsError.message)

    let pendingCandidates: Array<MatchCandidateRow & { todoist_project_name: string }> = []
    if (zohoProjectId) {
      const { data: candidateData, error: candidateError } = await supabaseAdmin
        .from('todoist_match_candidates')
        .select('todoist_project_id, zoho_project_id, score')
        .eq('zoho_project_id', zohoProjectId)
        .eq('status', 'pending')
        .order('score', { ascending: false })
      if (candidateError) throw new Error(candidateError.message)

      const candidates = (candidateData ?? []) as MatchCandidateRow[]
      const todoistIds = candidates.map(candidate => candidate.todoist_project_id)
      const { data: namesData, error: namesError } = todoistIds.length > 0
        ? await supabaseAdmin.from('todoist_projects').select('id, name').in('id', todoistIds)
        : { data: [], error: null }
      if (namesError) throw new Error(namesError.message)

      const names = new Map(
        ((namesData ?? []) as Array<{ id: string; name: string }>)
          .map(row => [row.id, row.name]),
      )
      pendingCandidates = candidates.map(candidate => ({
        ...candidate,
        todoist_project_name: names.get(candidate.todoist_project_id) ?? 'Todoist',
      }))
    }

    return NextResponse.json({
      matched_project: project,
      comments: commentsData ?? [],
      pending_candidates: pendingCandidates,
    })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
