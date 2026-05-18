const ZOHO_TOKEN_URL = 'https://accounts.zoho.eu/oauth/v2/token'
const ZOHO_DESK_BASE = 'https://desk.zoho.eu/api/v1'
// Auth: accounts.zoho.eu — Desk: desk.zoho.eu — client_id prefix: 1000.

let cachedToken: string | null = null
let tokenExpiresAt = 0

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
  })

  const res = await fetch(ZOHO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!res.ok) {
    throw new Error(`Zoho token refresh failed: ${res.status} ${await res.text()}`)
  }

  const data = await res.json()

  if (data.error) {
    throw new Error(`Zoho token error: ${data.error}`)
  }

  cachedToken = data.access_token
  // expires_in is in seconds; refresh 60s early
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000

  return cachedToken!
}

async function zohoFetch<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const token = await getAccessToken()

  const res = await fetch(`${ZOHO_DESK_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      orgId: process.env.ZOHO_ORG_ID!,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  // On 401, force a token refresh and retry once
  if (res.status === 401 && retry) {
    cachedToken = null
    tokenExpiresAt = 0
    return zohoFetch<T>(path, options, false)
  }

  if (!res.ok) {
    throw new Error(`Zoho Desk API error ${res.status}: ${await res.text()}`)
  }

  return res.json()
}

export interface ZohoTicket {
  id: string
  ticketNumber: string
  subject: string
  status: string
  priority: string
  channel: string
  createdTime: string
  modifiedTime: string
  customerResponseTime: string | null
  departmentId?: string | null
  contact: { id: string; firstName: string; lastName: string; email: string } | null
  account: { id: string; accountName: string } | null
  assignee: { id: string; firstName: string; lastName: string } | null
  sentiment: { type: string } | null
  cf: Record<string, unknown>
}

export interface ZohoTicketsResponse {
  data: ZohoTicket[]
  count: number
}

export async function fetchTickets(params: {
  limit?: number
  from?: number
  status?: string
  sortBy?: string
  departmentId?: string
} = {}): Promise<ZohoTicketsResponse> {
  const query = new URLSearchParams({
    limit: String(params.limit ?? 50),
    from: String(params.from ?? 0),
    ...(params.status && { status: params.status }),
    ...(params.departmentId && { departmentId: params.departmentId }),
    sortBy: params.sortBy ?? 'createdTime',
    fields: 'id,ticketNumber,subject,status,priority,channel,createdTime,modifiedTime,customerResponseTime,contact,account,assignee,sentiment,cf',
  })

  return zohoFetch<ZohoTicketsResponse>(`/tickets?${query}`)
}

export async function fetchTicket(ticketId: string): Promise<ZohoTicket> {
  return zohoFetch<ZohoTicket>(`/tickets/${ticketId}`)
}

export async function fetchTicketConversations(ticketId: string): Promise<{ data: Array<{ id: string; type: string; content: string; author: { name: string; type: string }; createdTime: string }> }> {
  return zohoFetch(`/tickets/${ticketId}/conversations`)
}

export async function fetchThreadContent(ticketId: string, threadId: string): Promise<{ content: string; attachments: unknown[] }> {
  return zohoFetch(`/tickets/${ticketId}/threads/${threadId}`)
}

export async function postTicketReply(ticketId: string, body: { content: string; contentType?: 'html' | 'plainText' }): Promise<unknown> {
  return zohoFetch(`/tickets/${ticketId}/sendReply`, {
    method: 'POST',
    body: JSON.stringify({ content: body.content, contentType: body.contentType ?? 'html' }),
  })
}

export interface ZohoKBArticle {
  id: string
  title: string
  summary: string | null
  answer: string | null
}

export async function searchKBArticles(query: string, limit = 5): Promise<ZohoKBArticle[]> {
  try {
    const params = new URLSearchParams({ searchStr: query, type: 'Article', limit: String(limit) })
    const res = await zohoFetch<{ data: ZohoKBArticle[] }>(`/search?${params}`)
    return res.data ?? []
  } catch {
    return []
  }
}

export async function fetchTicketConversationSummaries(ticketId: string): Promise<Array<{ direction: string; summary: string; authorName: string }>> {
  try {
    const res = await zohoFetch<{ data: Array<{ direction: string; summary?: string; content?: string; author?: { name?: string; firstName?: string; lastName?: string } }> }>(`/tickets/${ticketId}/conversations`)
    return (res.data ?? []).map(c => ({
      direction: c.direction ?? 'in',
      summary: (c.summary || c.content || '').slice(0, 400),
      authorName: c.author?.name || `${c.author?.firstName ?? ''} ${c.author?.lastName ?? ''}`.trim() || 'Inconnu',
    })).filter(c => c.summary)
  } catch {
    return []
  }
}

export async function updateTicket(ticketId: string, fields: Partial<Pick<ZohoTicket, 'status' | 'priority'>>): Promise<ZohoTicket> {
  return zohoFetch<ZohoTicket>(`/tickets/${ticketId}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  })
}
