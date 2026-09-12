import { normalizeStatus, normalizePriority, normalizeCategory, normalizeProduct, estimateFirstContactResolution } from './analyticsNormalization'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { ZOHO_ANALYTICS_API_BASE_URL } from './constants'
import { createZohoTokenProvider } from './oauth'

const getAccessToken = createZohoTokenProvider({
  label: 'Zoho Analytics',
  refreshTokenEnv: 'ZOHO_ANALYTICS_REFRESH_TOKEN',
})

const WORKSPACE_ID = process.env.ZOHO_ANALYTICS_WORKSPACE_ID ?? '29073000000611001'
const TICKETS_VIEW_ID = process.env.ZOHO_ANALYTICS_TICKETS_VIEW_ID ?? '29073000005126185'
const ORG_ID = process.env.ZOHO_ANALYTICS_ORG_ID
const DEPARTMENT_ID = '5861000000007061'

export interface ZohoAnalyticsTicket {
  ID?: string
  'Modified Time'?: string
  'Number of Reopen'?: string
  'Number of Threads'?: string
  'Created Time'?: string
  'Ticket Closed Time'?: string
  Department?: string
  Status?: string
  Priority?: string
  Channel?: string
  Subject?: string
  Category?: string
  Classifications?: string
  'Agent Responded Time'?: string
  'First Reply Time (hrs)'?: string
  'Is First Call Resolution'?: string
  'Account ID'?: string
}

function analyticsDate(value: string | undefined): string | null {
  if (!value?.trim()) return null
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/)
  if (!match) return null
  const date = fromZonedTime(`${value.trim().replace(' ', 'T')}`, 'Europe/Paris')
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function criteria(from: Date, to: Date, scope: 'closed' | 'activity'): string {
  const format = (date: Date) => formatInTimeZone(date, 'Europe/Paris', 'yyyy-MM-dd HH:mm:ss')
  const inWindow = (column: string) => `("Tickets (Zoho Desk)"."${column}" >= '${format(from)}' AND "Tickets (Zoho Desk)"."${column}" < '${format(to)}')`
  const window = scope === 'closed' ? inWindow('Ticket Closed Time') : `(${inWindow('Created Time')} OR ${inWindow('Ticket Closed Time')} OR ${inWindow('Modified Time')})`
  return `${window} AND "Tickets (Zoho Desk)"."Department" = '${DEPARTMENT_ID}'`
}

export async function fetchZohoAnalyticsTickets(from: Date, to: Date, scope: 'closed' | 'activity' = 'activity'): Promise<ZohoAnalyticsTicket[]> {
  if (!ORG_ID) throw new Error('ZOHO_ANALYTICS_ORG_ID is not configured')
  const config = {
    responseFormat: 'json', keyValueFormat: true,
    criteria: criteria(from, to, scope),
    selectedColumns: ['ID', 'Modified Time', 'Number of Reopen', 'Number of Threads', 'Created Time', 'Ticket Closed Time', 'Department', 'Status', 'Priority', 'Channel', 'Subject', 'Category', 'Classifications', 'Agent Responded Time', 'First Reply Time (hrs)', 'Is First Call Resolution', 'Account ID'],
  }
  const url = `${ZOHO_ANALYTICS_API_BASE_URL}/workspaces/${WORKSPACE_ID}/views/${TICKETS_VIEW_ID}/data?CONFIG=${encodeURIComponent(JSON.stringify(config))}`
  const token = await getAccessToken()
  const response = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}`, 'ZANALYTICS-ORGID': ORG_ID } })
  const body = await response.json().catch(() => null) as { data?: ZohoAnalyticsTicket[]; summary?: string; error?: string } | null
  if (!response.ok || !Array.isArray(body?.data)) throw new Error(`Zoho Analytics export failed: ${response.status} ${body?.error ?? body?.summary ?? 'réponse invalide'}`)
  return body.data as ZohoAnalyticsTicket[]
}

export function toTicketAnalyticsRow(row: ZohoAnalyticsTicket, now = new Date()) {
  const rawReply = row['First Reply Time (hrs)']?.trim()
  const firstReplyHours = rawReply ? Number(rawReply) : NaN
  const createdAt = analyticsDate(row['Created Time'])
  const replyMs = Number.isFinite(firstReplyHours) && firstReplyHours > 0 ? Math.round(firstReplyHours * 3_600_000) : null
  return {
    id: row.ID?.trim() ?? '',
    subject: row.Subject?.trim() || null,
    status: normalizeStatus(row.Status),
    priority: normalizePriority(row.Priority),
    category: normalizeCategory(row.Classifications ?? ''),
    classification: row.Classifications?.trim() || null,
    product_area: normalizeProduct(row.Category ?? '', row.Subject ?? ''),
    client_id: row['Account ID']?.trim() || null,
    created_at: createdAt,
    zoho_modified_at: analyticsDate(row['Modified Time']),
    resolved_at: analyticsDate(row['Ticket Closed Time']),
    // First Reply Time est ouvré (formule Analytics vérifiée).
    // Aucune date de première réponse calendaire ne peut en être déduite.
    first_response_at: null,
    first_response_time_ms: replyMs,
    first_contact_resolution: estimateFirstContactResolution(row['Number of Reopen'], row['Number of Threads']),
    source: row.Channel?.trim() || null,
    last_synced_at: now.toISOString(),
  }
}

export function fetchZohoAnalyticsClosedTickets(from: Date, to: Date) {
  return fetchZohoAnalyticsTickets(from, to, 'closed')
}
