const TODOIST_API_BASE_URL = 'https://api.todoist.com/api/v1'
const MAX_CONCURRENT_REQUESTS = 10
const PAGE_SIZE = 200

type JsonObject = Record<string, unknown>

export interface TodoistProject {
  id: string
  name: string
  raw: JsonObject
}

export interface TodoistTask {
  id: string
  projectId: string
  parentId: string | null
  content: string
  raw: JsonObject
}

export interface TodoistComment {
  id: string
  taskId: string
  content: string
  postedAt: string
  author: string | null
  raw: JsonObject
}

interface PaginatedResponse {
  results: unknown[]
  next_cursor: string | null
}

class RequestLimiter {
  private activeRequests = 0
  private readonly queue: Array<() => void> = []

  async run<T>(request: () => Promise<T>): Promise<T> {
    if (this.activeRequests >= MAX_CONCURRENT_REQUESTS) {
      await new Promise<void>(resolve => this.queue.push(resolve))
    }

    this.activeRequests += 1
    try {
      return await request()
    } finally {
      this.activeRequests -= 1
      this.queue.shift()?.()
    }
  }
}

const requestLimiter = new RequestLimiter()

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizeString(value: string): string {
  let sanitized = ''

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit === 0) continue

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1)
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        sanitized += value[index] + value[index + 1]
        index += 1
      } else {
        sanitized += '\ufffd'
      }
      continue
    }

    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      sanitized += '\ufffd'
      continue
    }

    sanitized += value[index]
  }

  return sanitized
}

function sanitizeJsonValue(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeString(value)
  if (Array.isArray(value)) return value.map(sanitizeJsonValue)
  if (!isJsonObject(value)) return value

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      sanitizeString(key),
      sanitizeJsonValue(nestedValue),
    ]),
  )
}

function sanitizeJsonObject(value: JsonObject): JsonObject {
  return sanitizeJsonValue(value) as JsonObject
}

function requiredString(record: JsonObject, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || !value) {
    throw new Error(`Todoist response is missing ${key}`)
  }
  return sanitizeString(value)
}

function optionalString(record: JsonObject, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' && value ? sanitizeString(value) : null
}

function parseProject(value: unknown): TodoistProject {
  if (!isJsonObject(value)) throw new Error('Invalid Todoist project response')
  return {
    id: requiredString(value, 'id'),
    name: requiredString(value, 'name'),
    raw: sanitizeJsonObject(value),
  }
}

function parseTask(value: unknown): TodoistTask {
  if (!isJsonObject(value)) throw new Error('Invalid Todoist task response')
  return {
    id: requiredString(value, 'id'),
    projectId: requiredString(value, 'project_id'),
    parentId: optionalString(value, 'parent_id'),
    content: requiredString(value, 'content'),
    raw: sanitizeJsonObject(value),
  }
}

function commentAuthor(record: JsonObject): string | null {
  const postedBy = record.posted_by
  if (isJsonObject(postedBy)) {
    return optionalString(postedBy, 'name') ?? optionalString(postedBy, 'email')
  }
  return optionalString(record, 'author')
}

function parseComment(value: unknown, taskId: string): TodoistComment {
  if (!isJsonObject(value)) throw new Error('Invalid Todoist comment response')
  const responseTaskId = optionalString(value, 'task_id') ?? optionalString(value, 'item_id')

  return {
    id: requiredString(value, 'id'),
    taskId: responseTaskId ?? taskId,
    content: requiredString(value, 'content'),
    postedAt: requiredString(value, 'posted_at'),
    author: commentAuthor(value),
    raw: sanitizeJsonObject(value),
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function fetchWithRetry(url: URL, token: string, retryOnRateLimit: boolean): Promise<Response> {
  const response = await requestLimiter.run(() =>
    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    }),
  )

  if (response.status === 429 && retryOnRateLimit) {
    await wait(2_000)
    return fetchWithRetry(url, token, false)
  }

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Todoist API ${response.status}: ${detail || response.statusText}`)
  }

  return response
}

function parsePage(value: unknown): PaginatedResponse {
  if (Array.isArray(value)) {
    return { results: value, next_cursor: null }
  }

  if (!isJsonObject(value) || !Array.isArray(value.results)) {
    throw new Error('Invalid paginated Todoist response')
  }

  return {
    results: value.results,
    next_cursor: typeof value.next_cursor === 'string' ? value.next_cursor : null,
  }
}

async function fetchAll<T>(
  path: string,
  token: string,
  parseItem: (value: unknown) => T,
): Promise<T[]> {
  const items: T[] = []
  let cursor: string | null = null

  do {
    const url = new URL(`${TODOIST_API_BASE_URL}${path}`)
    url.searchParams.set('limit', String(PAGE_SIZE))
    if (cursor) url.searchParams.set('cursor', cursor)

    const response = await fetchWithRetry(url, token, true)
    const page = parsePage(await response.json())
    items.push(...page.results.map(parseItem))
    cursor = page.next_cursor
  } while (cursor)

  return items
}

export function fetchTodoistProjects(token: string): Promise<TodoistProject[]> {
  return fetchAll('/projects', token, parseProject)
}

export function fetchTodoistTasks(token: string, projectId: string): Promise<TodoistTask[]> {
  return fetchAll(
    `/tasks?project_id=${encodeURIComponent(projectId)}`,
    token,
    parseTask,
  )
}

export function fetchTodoistComments(token: string, taskId: string): Promise<TodoistComment[]> {
  return fetchAll(
    `/comments?task_id=${encodeURIComponent(taskId)}`,
    token,
    value => parseComment(value, taskId),
  )
}
