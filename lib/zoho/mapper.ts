// lib/zoho/mapper.ts
// Maps raw Zoho Desk API data to the app's internal format

export interface ZohoRawTicket {
  id: string
  ticketNumber: string
  subject: string
  status: string
  statusType?: string
  priority: string | null
  channel: string
  category?: string | null
  language?: string | null
  createdTime: string
  modifiedTime?: string
  customerResponseTime?: string | null
  dueDate?: string | null
  responseDueDate?: string | null
  commentCount?: string
  threadCount?: string | null
  closedTime?: string | null
  accountId?: string | null
  departmentId?: string | null
  contactId?: string | null
  assigneeId?: string | null
  sentiment?: string | { type?: string } | null
  contact?: {
    id: string
    firstName: string | null
    lastName: string | null
    email: string
    account?: { id: string; accountName: string } | null
  } | null
  account?: { id: string; accountName: string } | null
  assignee?: {
    id: string
    email?: string
    firstName?: string | null
    lastName?: string | null
  } | null
  lastThread?: {
    channel?: string
    isDraft?: boolean
    isForward?: boolean
    direction?: 'in' | 'out'
  } | null
  cf?: Record<string, unknown>
}

export interface ZohoRawConversation {
  id: string
  type?: string
  direction?: 'in' | 'out'
  contentType?: string
  createdTime: string
  summary?: string
  content?: string
  author?: {
    firstName?: string | null
    lastName?: string | null
    name?: string | null
    type?: string | null
  } | null
  fromEmailAddress?: string
  to?: string
  channel?: string
  visibility?: string
  hasAttach?: boolean
}

export interface ZohoMappedTicket {
  id: string
  externalId: string          // ticketNumber
  zohoInternalId: string      // Zoho's long numeric id
  subject: string
  status: 'open' | 'pending' | 'resolved' | 'reopened'
  zohoStatus: string          // original Zoho status label
  priority: 'urgent' | 'high' | 'medium' | 'low'
  productArea: string         // category as-is
  source: 'email' | 'chat' | 'phone'
  createdAt: string
  updatedAt: string
  lastClientMessageAt: string
  lastAgentReplyAt: string    // derived from lastThread direction
  sentiment: 'positive' | 'neutral' | 'negative'
  riskScore: number
  clientName: string          // contact name or account name
  clientEmail: string
  assigneeName: string
  language: string
  dueDate: string | null
  responseDueDate: string | null
  threadCount: number
  channel: string
  segment: 'Strategic' | 'Gold' | 'Silver' | 'Bronze' | null
}

export interface MappedConversation {
  id: string
  direction: 'in' | 'out'
  authorName: string
  authorType: 'client' | 'agent'
  summary: string
  content: string | null
  createdAt: string
  channel: string
  fromEmail: string
}

function mapStatus(zohoStatus: string): 'open' | 'pending' | 'resolved' | 'reopened' {
  switch (zohoStatus) {
    case 'Open': return 'open'
    case 'Managed': return 'pending'
    case 'Escalated': return 'open'
    case 'Pending': return 'pending'
    case 'Solved': return 'resolved'
    case 'Stuck client': return 'open'
    default: return 'open'
  }
}

function mapPriority(priority: string | null): 'urgent' | 'high' | 'medium' | 'low' {
  switch (priority) {
    case 'High': return 'high'
    case 'Urgent': return 'urgent'
    case 'Low': return 'low'
    default: return 'medium'
  }
}

function mapSource(channel: string): 'email' | 'chat' | 'phone' {
  const normalized = (channel || '').toUpperCase()
  if (normalized === 'EMAIL') return 'email'
  if (normalized === 'CHAT') return 'chat'
  if (normalized === 'PHONE') return 'phone'
  return 'email'
}

function mapSentiment(sentiment: string | { type?: string } | null | undefined): 'positive' | 'neutral' | 'negative' {
  if (!sentiment) return 'neutral'
  const raw = typeof sentiment === 'string' ? sentiment : (sentiment.type ?? '')
  switch (raw) {
    case 'Positive': return 'positive'
    case 'Negative': return 'negative'
    default: return 'neutral'
  }
}

function buildClientName(contact: ZohoRawTicket['contact'], account: ZohoRawTicket['account']): string {
  // Prefer account name from contact's nested account, then top-level account
  const accountName = contact?.account?.accountName || account?.accountName
  if (accountName) return accountName

  // Build from contact name parts
  if (contact) {
    const full = `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
    if (full) return full
    if (contact.email) return contact.email
  }
  return 'Inconnu'
}

function getHoursSince(dateStr: string): number {
  const now = new Date()
  const past = new Date(dateStr)
  return (now.getTime() - past.getTime()) / (1000 * 60 * 60)
}

function computeRiskScore(ticket: {
  priority: 'urgent' | 'high' | 'medium' | 'low'
  sentiment: 'positive' | 'neutral' | 'negative'
  status: 'open' | 'pending' | 'resolved' | 'reopened'
  lastClientMessageAt: string
  segment: 'Strategic' | 'Gold' | 'Silver' | 'Bronze' | null
}): number {
  let score = 0
  const hoursSinceClientMessage = getHoursSince(ticket.lastClientMessageAt)

  if (ticket.segment === 'Strategic') score += 40
  else if (ticket.segment === 'Gold') score += 30
  else if (ticket.segment === 'Silver') score += 15
  else if (ticket.segment === 'Bronze') score += 0
  else score += 10  // unknown segment

  if (hoursSinceClientMessage > 48) score += 25
  else if (hoursSinceClientMessage > 24) score += 15
  else if (hoursSinceClientMessage > 8) score += 8

  if (ticket.sentiment === 'negative') score += 20
  if (ticket.priority === 'urgent') score += 20
  else if (ticket.priority === 'high') score += 10
  if (ticket.status === 'reopened') score += 10

  return Math.min(score, 100)
}

export function mapZohoTicket(
  raw: ZohoRawTicket,
  segment: ZohoMappedTicket['segment'] = null
): ZohoMappedTicket {
  const status = mapStatus(raw.status)
  const priority = mapPriority(raw.priority)
  const source = mapSource(raw.channel)
  const sentiment = mapSentiment(raw.sentiment)

  const clientName = buildClientName(raw.contact, raw.account)
  const clientEmail = raw.contact?.email || ''

  const assigneeName = raw.assignee
    ? `${raw.assignee.firstName || ''} ${raw.assignee.lastName || ''}`.trim() || raw.assignee.email || ''
    : ''

  const createdAt = raw.createdTime
  const updatedAt = raw.modifiedTime || raw.createdTime

  // Determine last client / agent message times from lastThread direction
  // If lastThread.direction === 'in', the client spoke last
  // If lastThread.direction === 'out', the agent spoke last
  const direction = raw.lastThread?.direction
  let lastClientMessageAt: string
  let lastAgentReplyAt: string

  if (direction === 'in') {
    // Client spoke last — customerResponseTime is the client's latest message
    lastClientMessageAt = raw.customerResponseTime || updatedAt
    // Agent's last reply was before the client responded — approximate with createdAt
    lastAgentReplyAt = createdAt
  } else if (direction === 'out') {
    // Agent spoke last — use updatedAt as agent reply time
    lastAgentReplyAt = updatedAt
    lastClientMessageAt = raw.customerResponseTime || createdAt
  } else {
    lastClientMessageAt = raw.customerResponseTime || createdAt
    lastAgentReplyAt = createdAt
  }

  const partialTicket = { priority, sentiment, status, lastClientMessageAt, segment }
  const riskScore = computeRiskScore(partialTicket)

  return {
    id: raw.id,
    externalId: raw.ticketNumber,
    zohoInternalId: raw.id,
    subject: raw.subject,
    status,
    zohoStatus: raw.status,
    priority,
    productArea: raw.category || 'Autre',
    source,
    createdAt,
    updatedAt,
    lastClientMessageAt,
    lastAgentReplyAt,
    sentiment,
    riskScore,
    clientName,
    clientEmail,
    assigneeName,
    language: raw.language || '',
    dueDate: raw.dueDate || null,
    responseDueDate: raw.responseDueDate || null,
    threadCount: Number(raw.threadCount) || 0,
    channel: raw.channel,
    segment,
  }
}

export function mapZohoConversation(raw: ZohoRawConversation, content: string | null = null): MappedConversation {
  const direction: 'in' | 'out' = raw.direction === 'out' ? 'out' : 'in'
  const authorType: 'client' | 'agent' = direction === 'out' ? 'agent' : 'client'

  let authorName = ''
  if (raw.author) {
    authorName = raw.author.name ||
      `${raw.author.firstName || ''} ${raw.author.lastName || ''}`.trim() ||
      ''
  }
  if (!authorName) {
    authorName = authorType === 'agent' ? 'Agent' : 'Client'
  }

  const summary = raw.summary || raw.content || ''

  return {
    id: raw.id,
    direction,
    authorName,
    authorType,
    summary,
    content,
    createdAt: raw.createdTime,
    channel: raw.channel || '',
    fromEmail: raw.fromEmailAddress || '',
  }
}
