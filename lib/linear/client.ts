const ENDPOINT = 'https://api.linear.app/graphql'

async function linearQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.LINEAR_API_KEY
  if (!apiKey) {
    throw new Error('LINEAR_API_KEY is not configured')
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) {
    throw new Error(`Linear API request failed (${res.status})`)
  }

  const json = await res.json() as { data?: T; errors?: unknown }
  if (json.errors) throw new Error(`Linear API error: ${JSON.stringify(json.errors)}`)
  if (!json.data) throw new Error('Linear API returned no data')
  return json.data
}

export type EscalationStatus =
  | 'to_qualify'
  | 'in_progress'
  | 'fix_ready'
  | 'waiting'
  | 'resolved'
  | 'sent'
  | 'client_to_inform'

export interface LinearIssue {
  id: string
  identifier: string
  title: string
  description: string | null
  linearState: string
  /** Canonical Linear workflow type (backlog, unstarted, started, completed, canceled). */
  stateType?: string
  status: EscalationStatus
  priority: number
  priorityLabel: string
  labels: string[]
  assigneeName: string | null
  creatorName?: string | null
  createdAt: string
  updatedAt: string
  completedAt?: string | null
  url: string
}

function mapStateToStatus(stateName: string, stateType?: string): EscalationStatus {
  const canonicalType = stateType?.toLowerCase()
  if (canonicalType === 'completed' || canonicalType === 'canceled' || canonicalType === 'cancelled') {
    return 'resolved'
  }
  if (canonicalType === 'started') return 'in_progress'
  if (canonicalType === 'backlog' || canonicalType === 'triage' || canonicalType === 'unstarted') {
    return 'to_qualify'
  }

  switch (stateName) {
    case 'Triage':
    case 'Todo':
    case 'Backlog':
      return 'to_qualify'
    case 'In Progress':
      return 'in_progress'
    case 'To Review':
    case 'In Review':
      return 'fix_ready'
    case 'Product Blocked':
    case 'Tech Blocked':
    case 'CSM Blocked':
      return 'waiting'
    case 'Solved':
    case 'Duplicate':
    case 'Done':
    case 'Cancelled':
    case 'Canceled':
      return 'resolved'
    default:
      return 'to_qualify'
  }
}

function mapPriorityLabel(priority: number): string {
  switch (priority) {
    case 1:
      return 'Urgent'
    case 2:
      return 'Haute'
    case 3:
      return 'Moyenne'
    case 4:
      return 'Basse'
    default:
      return '—'
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120)
}

interface RawIssue {
  id: string
  identifier: string
  title: string
  description: string | null
  state: { name: string; type: string }
  priority: number
  labels: { nodes: Array<{ name: string; color: string }> }
  assignee: { name: string } | null
  creator: { name: string } | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

function mapRawIssue(raw: RawIssue): LinearIssue {
  return {
    id: raw.id,
    identifier: raw.identifier,
    title: raw.title,
    description: raw.description,
    linearState: raw.state.name,
    stateType: raw.state.type,
    status: mapStateToStatus(raw.state.name, raw.state.type),
    priority: raw.priority,
    priorityLabel: mapPriorityLabel(raw.priority),
    labels: raw.labels.nodes.map(l => l.name),
    assigneeName: raw.assignee?.name ?? null,
    creatorName: raw.creator?.name ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    completedAt: raw.completedAt,
    url: `https://linear.app/loungeup/issue/${raw.identifier}/${slugify(raw.title)}`,
  }
}

const ISSUES_QUERY = `
  query FetchBugsIssues($first: Int) {
    issues(first: $first, filter: { team: { key: { eq: "BUGS" } } }, orderBy: updatedAt) {
      nodes {
        id identifier title description
        state { name type }
        priority
        labels { nodes { name color } }
        assignee { name }
        creator { name }
        createdAt updatedAt completedAt
      }
    }
  }
`

export async function fetchIssues(first = 250): Promise<LinearIssue[]> {
  const data = await linearQuery<{ issues: { nodes: RawIssue[] } }>(ISSUES_QUERY, { first })
  return data.issues.nodes.map(mapRawIssue)
}

const MEMBERS_QUERY = `
  query FetchLinearMembers($first: Int!) {
    users(first: $first) {
      nodes { name }
    }
  }
`

/** Returns the workspace member names used by the analytical creator filter. */
export async function fetchLinearMemberNames(): Promise<string[]> {
  const data = await linearQuery<{ users: { nodes: Array<{ name: string }> } }>(
    MEMBERS_QUERY,
    { first: 250 },
  )
  return [...new Set(data.users.nodes.map(user => user.name.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'fr'))
}

const ANALYTICS_ISSUES_QUERY = `
  query FetchBugsAnalyticsPage($first: Int!, $after: String) {
    issues(
      first: $first
      after: $after
      filter: { team: { key: { eq: "BUGS" } } }
      orderBy: updatedAt
    ) {
      nodes {
        title description
        state { name type }
        priority
        labels { nodes { name } }
        creator { name }
        createdAt completedAt
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`

interface RawAnalyticsIssue {
  title: string
  description: string | null
  state: { name: string; type: string }
  priority: number
  labels: { nodes: Array<{ name: string }> }
  creator: { name: string } | null
  createdAt: string
  completedAt: string | null
}

export interface LinearAnalyticsIssuePage {
  issues: LinearIssue[]
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
}

// Next 14's incremental cache rejects entries above 2 MiB. Leave generous
// headroom for the cache envelope and UTF-8 expansion.
const MAX_ANALYTICS_PAGE_BYTES = 1_500_000
const DEFAULT_ANALYTICS_PAGE_SIZE = 250

/**
 * Fetches one compact, cache-safe analytics page. If descriptions make a page
 * unusually large, the query is retried with a smaller page size. Cursors still
 * compose normally, so no issue is skipped between pages.
 */
export async function fetchIssuesAnalyticsPage(
  after: string | null,
  preferredPageSize = DEFAULT_ANALYTICS_PAGE_SIZE,
): Promise<LinearAnalyticsIssuePage> {
  let pageSize = Math.max(1, Math.min(250, Math.floor(preferredPageSize)))

  while (true) {
    const data = await linearQuery<{
      issues: {
        nodes: RawAnalyticsIssue[]
        pageInfo: { hasNextPage: boolean; endCursor: string | null }
      }
    }>(ANALYTICS_ISSUES_QUERY, { first: pageSize, after })

    const page: LinearAnalyticsIssuePage = {
      issues: data.issues.nodes.map(mapRawAnalyticsIssue),
      pageInfo: data.issues.pageInfo,
    }
    if (jsonByteLength(page) <= MAX_ANALYTICS_PAGE_BYTES) return page

    if (pageSize === 1) {
      throw new Error('A Linear issue is too large for the analytics cache')
    }
    pageSize = Math.max(1, Math.floor(pageSize / 2))
  }
}

function mapRawAnalyticsIssue(raw: RawAnalyticsIssue): LinearIssue {
  return {
    // Fields unused by analytics stay empty so cached pages do not pay for
    // identifiers, URLs, assignees or update timestamps.
    id: '',
    identifier: '',
    title: raw.title,
    description: raw.description,
    linearState: raw.state.name,
    stateType: raw.state.type,
    status: mapStateToStatus(raw.state.name, raw.state.type),
    priority: raw.priority,
    priorityLabel: '',
    labels: raw.labels.nodes.map(label => label.name),
    assigneeName: null,
    creatorName: raw.creator?.name ?? null,
    createdAt: raw.createdAt,
    updatedAt: '',
    completedAt: raw.completedAt,
    url: '',
  }
}

function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

const ISSUE_QUERY = `
  query FetchIssue($id: String!) {
    issue(id: $id) {
      id identifier title description
      state { name type }
      priority
      labels { nodes { name color } }
      assignee { name }
      creator { name }
      createdAt updatedAt completedAt
      comments {
        nodes {
          body
          createdAt
          user { name }
        }
      }
    }
  }
`

interface RawIssueWithComments extends RawIssue {
  comments: {
    nodes: Array<{ body: string; createdAt: string; user: { name: string } | null }>
  }
}

export async function fetchIssue(
  id: string
): Promise<LinearIssue & { comments: Array<{ body: string; createdAt: string; userName: string }> }> {
  const data = await linearQuery<{ issue: RawIssueWithComments }>(ISSUE_QUERY, { id })
  const raw = data.issue
  const base = mapRawIssue(raw)
  const comments = raw.comments.nodes.map(c => ({
    body: c.body,
    createdAt: c.createdAt,
    userName: c.user?.name ?? 'Inconnu',
  }))
  return { ...base, comments }
}

const CREATE_ISSUE_MUTATION = `
  mutation CreateIssue($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue {
        id identifier title description
        state { name type }
        priority
        labels { nodes { name color } }
        assignee { name }
        creator { name }
        createdAt updatedAt completedAt
      }
    }
  }
`

export async function createIssue(input: {
  title: string
  description: string
  priority?: number
  labelIds?: string[]
}): Promise<LinearIssue> {
  const data = await linearQuery<{
    issueCreate: { success: boolean; issue: RawIssue }
  }>(CREATE_ISSUE_MUTATION, {
    input: {
      teamId: 'b1277aa4-463c-4a52-bf2a-4f0130f07916',
      title: input.title,
      description: input.description,
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.labelIds && input.labelIds.length > 0 && { labelIds: input.labelIds }),
    },
  })

  if (!data.issueCreate.success) {
    throw new Error('Linear issueCreate returned success=false')
  }

  return mapRawIssue(data.issueCreate.issue)
}
