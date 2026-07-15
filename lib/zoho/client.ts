import { ZOHO_DESK_BASE_URL } from './constants'
import { createZohoTokenProvider } from './oauth'

// Auth: accounts.zoho.eu — Desk: desk.zoho.eu — client_id prefix: 1000.

const getAccessToken = createZohoTokenProvider({
  label: 'Zoho Desk',
  refreshTokenEnv: 'ZOHO_REFRESH_TOKEN',
  accessTokenEnv: 'ZOHO_ACCESS_TOKEN',
})

async function zohoFetch<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const token = await getAccessToken()

  const res = await fetch(`${ZOHO_DESK_BASE_URL}${path}`, {
    ...options,
    signal: AbortSignal.timeout(12000),
    cache: 'no-store',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      orgId: process.env.ZOHO_ORG_ID!,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  // On 401, force a token refresh and retry once
  if (res.status === 401 && retry) {
    await getAccessToken(true)
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
  email?: string | null
  subject: string
  status: string
  priority: string
  channel: string
  category?: string | null
  classification?: string | null
  createdTime: string
  modifiedTime: string
  closedTime?: string | null
  firstResponseTime?: string | number | null
  responseTime?: string | number | null
  reopenCount?: string | number | null
  customerResponseTime: string | null
  threadCount?: string | null
  departmentId?: string | null
  accountId?: string | null
  contactId?: string | null
  contact: { id: string; firstName: string; lastName: string; email: string; account?: { id: string; accountName: string } | null } | null
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
    fields: 'id,ticketNumber,email,subject,status,priority,channel,category,classification,createdTime,modifiedTime,closedTime,responseTime,customerResponseTime,threadCount,contact,account,accountId,assignee,sentiment,cf',
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

export async function updateTicket(
  ticketId: string,
  fields: Partial<Pick<ZohoTicket, 'status' | 'priority' | 'category' | 'subject'>> & { classification?: string }
): Promise<ZohoTicket> {
  return zohoFetch<ZohoTicket>(`/tickets/${ticketId}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  })
}

export async function fetchAccount(accountId: string): Promise<{ id: string; accountName: string } | null> {
  try {
    const data = await zohoFetch<{ id: string; accountName: string }>(`/accounts/${accountId}`)
    return data ?? null
  } catch {
    return null
  }
}

export interface ZohoDeskAccount {
  id: string
  accountName: string
}

export async function fetchAccounts(params: { limit?: number; from?: number } = {}): Promise<{ data: ZohoDeskAccount[] }> {
  const query = new URLSearchParams({
    limit: String(params.limit ?? 100),
    from: String(params.from ?? 0),
    sortBy: 'accountName',
  })
  return zohoFetch<{ data: ZohoDeskAccount[] }>(`/accounts?${query}`)
}
