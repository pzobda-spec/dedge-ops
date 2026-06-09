import { supabaseAdmin } from '@/lib/supabase/server'

export interface ProjectTodoistComment {
  id: string
  task_id: string
  task_name: string
  content: string
  posted_at: string
  author: string | null
}

interface TodoistTaskRow {
  id: string
  parent_id: string | null
  content: string
  zoho_project_id: string | null
}

interface TodoistCommentRow {
  id: string
  task_id: string
  content: string
  posted_at: string
  author: string | null
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

export async function getTodoistCommentsForZohoProject(
  zohoProjectId: string,
): Promise<ProjectTodoistComment[]> {
  const { data: tasksData, error: tasksError } = await supabaseAdmin
    .from('todoist_tasks')
    .select('id, parent_id, content, zoho_project_id')

  if (tasksError) throw new Error(tasksError.message)
  const tasks = (tasksData ?? []) as TodoistTaskRow[]
  const rootIds = tasks
    .filter(task => task.zoho_project_id === zohoProjectId)
    .map(task => task.id)
  if (rootIds.length === 0) return []

  const taskIds = descendantTaskIds(tasks, rootIds)
  const { data: commentsData, error: commentsError } = await supabaseAdmin
    .from('todoist_comments')
    .select('id, task_id, content, posted_at, author')
    .in('task_id', taskIds)
    .order('posted_at', { ascending: false })

  if (commentsError) throw new Error(commentsError.message)
  const taskNames = new Map(tasks.map(task => [task.id, task.content]))

  return ((commentsData ?? []) as TodoistCommentRow[]).map(comment => ({
    ...comment,
    task_name: taskNames.get(comment.task_id) ?? 'Todoist',
  }))
}
