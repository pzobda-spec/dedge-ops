import { supabaseAdmin } from '@/lib/supabase/server'
import {
  matchTodoistToZoho,
  type TodoistProjectForMatching,
  type ZohoProjectForMatching,
} from '@/lib/todoist/matching'
import {
  fetchTodoistComments,
  fetchTodoistProjects,
  fetchTodoistTasks,
  type TodoistComment,
  type TodoistProject,
  type TodoistTask,
} from './client'

export interface TodoistSyncResult {
  synced_projects: number
  synced_comments: number
}

interface CachedTodoistProject {
  id: string
  zoho_project_id: string | null
}

interface CachedCandidate {
  todoist_project_id: string
  zoho_project_id: string
  status: 'pending' | 'confirmed' | 'rejected'
}

interface ZohoProjectRow {
  zoho_project_id: string | null
  hotel_name: string | null
}

interface CachedTodoistTask {
  id: string
  content: string
  zoho_project_id: string | null
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

async function upsertComments(projectId: string, comments: TodoistComment[]): Promise<void> {
  const rows = comments.map(comment => ({
    id: comment.id,
    task_id: comment.taskId,
    project_id: projectId,
    content: comment.content,
    posted_at: comment.postedAt,
    author: comment.author,
    raw: comment.raw,
  }))

  for (const rowsChunk of chunk(rows, 500)) {
    const { error } = await supabaseAdmin
      .from('todoist_comments')
      .upsert(rowsChunk, { onConflict: 'id' })
    if (error) throw new Error(error.message)
  }
}

async function upsertTasks(tasks: TodoistTask[]): Promise<void> {
  const rows = tasks.map(task => ({
    id: task.id,
    project_id: task.projectId,
    parent_id: task.parentId,
    content: task.content,
    raw: task.raw,
  }))

  for (const rowsChunk of chunk(rows, 500)) {
    const { error } = await supabaseAdmin
      .from('todoist_tasks')
      .upsert(rowsChunk, { onConflict: 'id' })
    if (error) throw new Error(error.message)
  }
}

async function syncProject(token: string, project: TodoistProject, syncedAt: string): Promise<number> {
  const tasks = await fetchTodoistTasks(token, project.id)
  await upsertTasks(tasks)
  const commentResults = await Promise.allSettled(
    tasks.map(task => fetchTodoistComments(token, task.id)),
  )

  const failures = commentResults.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  )
  if (failures.length > 0) {
    const firstReason = failures[0].reason
    throw firstReason instanceof Error ? firstReason : new Error(String(firstReason))
  }

  const comments = commentResults.flatMap(result =>
    result.status === 'fulfilled' ? result.value : [],
  )
  await upsertComments(project.id, comments)

  const { error } = await supabaseAdmin
    .from('todoist_projects')
    .update({ last_synced_at: syncedAt })
    .eq('id', project.id)
  if (error) throw new Error(error.message)

  return comments.length
}

async function persistTaskMatches(zohoProjects: ZohoProjectForMatching[]): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('todoist_tasks')
    .select('id, content, zoho_project_id')
    .is('parent_id', null)

  if (error) throw new Error(error.message)
  const tasks = (data ?? []) as CachedTodoistTask[]
  const linkedTaskIds = new Set(
    tasks.filter(task => task.zoho_project_id).map(task => task.id),
  )
  const matches = matchTodoistToZoho(
    tasks
      .filter(task => !linkedTaskIds.has(task.id))
      .map(task => ({ id: task.id, name: task.content })),
    zohoProjects,
  )

  const automaticMatches = matches.filter(
    match => match.status === 'auto_matched' && match.zohoProjectId,
  )
  await Promise.all(automaticMatches.map(async match => {
    const { error: updateError } = await supabaseAdmin
      .from('todoist_tasks')
      .update({ zoho_project_id: match.zohoProjectId })
      .eq('id', match.todoistProjectId)
      .is('zoho_project_id', null)
    if (updateError) throw new Error(updateError.message)
  }))
}

async function persistMatches(projects: TodoistProjectForMatching[]): Promise<void> {
  const [
    { data: cachedData, error: cachedError },
    { data: zohoData, error: zohoError },
    { data: candidateData, error: candidateError },
  ] = await Promise.all([
    supabaseAdmin.from('todoist_projects').select('id, zoho_project_id'),
    supabaseAdmin.from('onboarding_projects').select('zoho_project_id, hotel_name').not('zoho_project_id', 'is', null),
    supabaseAdmin.from('todoist_match_candidates').select('todoist_project_id, zoho_project_id, status'),
  ])

  if (cachedError) throw new Error(cachedError.message)
  if (zohoError) throw new Error(zohoError.message)
  if (candidateError) throw new Error(candidateError.message)

  const cachedProjects = (cachedData ?? []) as CachedTodoistProject[]
  const zohoRows = (zohoData ?? []) as ZohoProjectRow[]
  const candidates = (candidateData ?? []) as CachedCandidate[]
  const linkedTodoistIds = new Set(
    cachedProjects
      .filter(project => project.zoho_project_id)
      .map(project => project.id),
  )

  const zohoProjects: ZohoProjectForMatching[] = zohoRows.flatMap(project =>
    project.zoho_project_id && project.hotel_name
      ? [{ id: project.zoho_project_id, name: project.hotel_name }]
      : [],
  )
  const matches = matchTodoistToZoho(
    projects.filter(project => !linkedTodoistIds.has(project.id)),
    zohoProjects,
  )

  const automaticMatches = matches.filter(
    match => match.status === 'auto_matched' && match.zohoProjectId,
  )
  await Promise.all(automaticMatches.map(async match => {
    const { error } = await supabaseAdmin
      .from('todoist_projects')
      .update({ zoho_project_id: match.zohoProjectId })
      .eq('id', match.todoistProjectId)
      .is('zoho_project_id', null)
    if (error) throw new Error(error.message)
  }))

  const candidateStatus = new Map(
    candidates.map(candidate => [
      `${candidate.todoist_project_id}:${candidate.zoho_project_id}`,
      candidate.status,
    ]),
  )
  const reviewRows = matches.flatMap(match => {
    if (match.status !== 'needs_review' || !match.zohoProjectId) return []
    const key = `${match.todoistProjectId}:${match.zohoProjectId}`
    return [{
      todoist_project_id: match.todoistProjectId,
      zoho_project_id: match.zohoProjectId,
      score: match.score,
      status: candidateStatus.get(key) ?? 'pending',
      updated_at: new Date().toISOString(),
    }]
  })

  if (reviewRows.length > 0) {
    const { error } = await supabaseAdmin
      .from('todoist_match_candidates')
      .upsert(reviewRows, { onConflict: 'todoist_project_id,zoho_project_id' })
    if (error) throw new Error(error.message)
  }

  await persistTaskMatches(zohoProjects)
}

export async function syncTodoist(): Promise<TodoistSyncResult> {
  const token = process.env.TODOIST_API_KEY
  if (!token) throw new Error('TODOIST_API_KEY is not configured')

  const projects = await fetchTodoistProjects(token)
  const syncedAt = new Date().toISOString()
  const projectRows = projects.map(project => ({
    id: project.id,
    name: project.name,
    raw: project.raw,
  }))

  const { error: projectsError } = await supabaseAdmin
    .from('todoist_projects')
    .upsert(projectRows, { onConflict: 'id' })
  if (projectsError) throw new Error(projectsError.message)

  const results = await Promise.allSettled(
    projects.map(project => syncProject(token, project, syncedAt)),
  )
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  )
  if (failures.length > 0) {
    const firstReason = failures[0].reason
    throw firstReason instanceof Error ? firstReason : new Error(String(firstReason))
  }

  await persistMatches(projects)

  return {
    synced_projects: results.length,
    synced_comments: results.reduce(
      (total, result) => total + (result.status === 'fulfilled' ? result.value : 0),
      0,
    ),
  }
}
