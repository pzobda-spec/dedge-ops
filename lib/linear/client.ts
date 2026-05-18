const ENDPOINT = 'https://api.linear.app/graphql'

async function linearQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: process.env.LINEAR_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(`Linear API error: ${JSON.stringify(json.errors)}`)
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
  status: EscalationStatus
  priority: number
  priorityLabel: string
  labels: string[]
  assigneeName: string | null
  createdAt: string
  updatedAt: string
  url: string
}

function mapStateToStatus(stateName: string): EscalationStatus {
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
  createdAt: string
  updatedAt: string
}

function mapRawIssue(raw: RawIssue): LinearIssue {
  return {
    id: raw.id,
    identifier: raw.identifier,
    title: raw.title,
    description: raw.description,
    linearState: raw.state.name,
    status: mapStateToStatus(raw.state.name),
    priority: raw.priority,
    priorityLabel: mapPriorityLabel(raw.priority),
    labels: raw.labels.nodes.map(l => l.name),
    assigneeName: raw.assignee?.name ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
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
        createdAt updatedAt
      }
    }
  }
`

export async function fetchIssues(first = 100): Promise<LinearIssue[]> {
  const data = await linearQuery<{ issues: { nodes: RawIssue[] } }>(ISSUES_QUERY, { first })
  return data.issues.nodes.map(mapRawIssue)
}

const ISSUE_QUERY = `
  query FetchIssue($id: String!) {
    issue(id: $id) {
      id identifier title description
      state { name type }
      priority
      labels { nodes { name color } }
      assignee { name }
      createdAt updatedAt
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
        createdAt updatedAt
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
