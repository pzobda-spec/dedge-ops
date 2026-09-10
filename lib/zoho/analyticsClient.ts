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

function criteria(from: Date, to: Date): string {
  const format = (date: Date) => formatInTimeZone(date, 'Europe/Paris', 'yyyy-MM-dd HH:mm:ss')
  return `"Tickets (Zoho Desk)"."Ticket Closed Time" >= '${format(from)}' AND "Tickets (Zoho Desk)"."Ticket Closed Time" < '${format(to)}' AND "Tickets (Zoho Desk)"."Department" = '${DEPARTMENT_ID}'`
}

export async function fetchZohoAnalyticsClosedTickets(from: Date, to: Date): Promise<ZohoAnalyticsTicket[]> {
  if (!ORG_ID) throw new Error('ZOHO_ANALYTICS_ORG_ID is not configured')
  const config = {
    responseFormat: 'json', keyValueFormat: true,
    criteria: criteria(from, to),
    selectedColumns: ['ID', 'Created Time', 'Ticket Closed Time', 'Department', 'Status', 'Priority', 'Channel', 'Subject', 'Category', 'Classifications', 'Agent Responded Time', 'First Reply Time (hrs)', 'Is First Call Resolution', 'Account ID'],
  }
  const url = `${ZOHO_ANALYTICS_API_BASE_URL}/workspaces/${WORKSPACE_ID}/views/${TICKETS_VIEW_ID}/data?CONFIG=${encodeURIComponent(JSON.stringify(config))}`
  const token = await getAccessToken()
  const response = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}`, 'ZANALYTICS-ORGID': ORG_ID } })
  const body = await response.json().catch(() => null) as { data?: ZohoAnalyticsTicket[]; summary?: string; error?: string } | null
  if (!response.ok || !Array.isArray(body?.data)) throw new Error(`Zoho Analytics export failed: ${response.status} ${body?.error ?? body?.summary ?? 'réponse invalide'}`)
  return body.data as ZohoAnalyticsTicket[]
}

export function toTicketAnalyticsRow(row: ZohoAnalyticsTicket, now = new Date()) {
  const firstReplyHours = Number(row['First Reply Time (hrs)'])
  return {
    id: row.ID?.trim() ?? '',
    subject: row.Subject?.trim() || null,
    status: row.Status?.trim() || null,
    priority: row.Priority?.trim() || null,
    category: row.Category?.trim() || null,
    classification: row.Classifications?.trim() || null,
    product_area: row.Category?.trim() || null,
    client_id: row['Account ID']?.trim() || null,
    created_at: analyticsDate(row['Created Time']),
    resolved_at: analyticsDate(row['Ticket Closed Time']),
    first_response_at: analyticsDate(row['Agent Responded Time']),
    first_response_time_ms: Number.isFinite(firstReplyHours) && firstReplyHours >= 0 ? Math.round(firstReplyHours * 3_600_000) : null,
    first_contact_resolution: row['Is First Call Resolution']?.trim().toLowerCase() === 'yes' ? true : row['Is First Call Resolution']?.trim().toLowerCase() === 'no' ? false : null,
    source: row.Channel?.trim() || null,
    last_synced_at: now.toISOString(),
  }
}
