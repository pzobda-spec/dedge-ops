const ZOHO_TOKEN_URL = 'https://accounts.zoho.eu/oauth/v2/token'
const PORTAL_ID = process.env.ZOHO_PROJECTS_PORTAL_ID!
const BASE = `https://projectsapi.zoho.eu/restapi/portal/${PORTAL_ID}`

let cachedToken: string | null = null
let tokenExpiresAt = 0

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    refresh_token: process.env.ZOHO_PROJECTS_REFRESH_TOKEN!,
  })

  const res = await fetch(ZOHO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!res.ok) {
    throw new Error(`Zoho Projects token refresh failed: ${res.status} ${await res.text()}`)
  }

  const data = await res.json()

  if (data.error) {
    throw new Error(`Zoho Projects token error: ${data.error}`)
  }

  cachedToken = data.access_token
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000

  return cachedToken!
}

async function projectsFetch<T>(path: string): Promise<T> {
  const token = await getAccessToken()

  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    throw new Error(`Zoho Projects API error ${res.status}: ${await res.text()}`)
  }

  return res.json()
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProjectStatus =
  | 'in_progress'
  | 'not_started'
  | 'pending_client'
  | 'live'
  | 'blocked'
  | 'other'

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical' | null

export interface OnboardingProject {
  id: string
  name: string
  hotelName: string
  product: string
  status: ProjectStatus
  statusLabel: string
  ownerName: string
  ownerShort: string
  startDate: string | null
  endDate: string | null
  percentComplete: number
  riskLevel: RiskLevel
  implementationLanguage: string | null
  pms: string | null
  csmName: string | null
  accountCRMName: string | null
  clientType: string | null   // e.g. 'Groupe' | 'Individuel' — from custom field 'Type'
  isOverdue: boolean
  isBlocked: boolean
}

// ---------------------------------------------------------------------------
// Raw API shape
// ---------------------------------------------------------------------------

interface RawCustomField {
  [key: string]: string
}

interface RawProject {
  id: number | string
  id_string?: string
  name: string
  status: string
  custom_status_name?: string
  owner_name: string
  owner_email?: string
  start_date?: string
  end_date?: string
  project_percent?: number
  group_name?: string
  custom_fields?: RawCustomField[]
}

interface ProjectsListResponse {
  projects?: RawProject[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapStatus(label: string | undefined): ProjectStatus {
  switch (label) {
    case 'In Progress':
      return 'in_progress'
    case 'Not started':
      return 'not_started'
    case 'Pending (client)':
      return 'pending_client'
    case 'Live':
      return 'live'
    case 'Blocked':
      return 'blocked'
    default:
      return 'other'
  }
}

/** Convert "MM-DD-YYYY" to "YYYY-MM-DD" ISO string, or null */
function convertDate(zohoDate: string | undefined): string | null {
  if (!zohoDate) return null
  const parts = zohoDate.split('-')
  if (parts.length !== 3) return null
  const [mm, dd, yyyy] = parts
  return `${yyyy}-${mm}-${dd}`
}

function parseRiskLevel(value: string | undefined): RiskLevel {
  if (!value) return null
  const v = value.toLowerCase()
  if (v.includes('low')) return 'low'
  if (v.includes('medium')) return 'medium'
  if (v.includes('high')) return 'high'
  if (v.includes('critical') || v.includes('bloqué')) return 'critical'
  return null
}

function getCustomField(fields: RawCustomField[] | undefined, key: string): string | undefined {
  if (!fields) return undefined
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(field, key)) {
      return field[key]
    }
  }
  return undefined
}

function mapProject(raw: RawProject): OnboardingProject {
  const statusLabel = raw.custom_status_name ?? raw.status ?? ''
  const status = mapStatus(statusLabel)

  const hotelName = raw.name.includes(' : ')
    ? raw.name.split(' : ')[0]
    : raw.name

  const ownerShort = raw.owner_name?.split(' ')[0] ?? raw.owner_name ?? ''

  const startDate = convertDate(raw.start_date)
  const endDate = convertDate(raw.end_date)

  const today = new Date().toISOString().slice(0, 10)
  const isOverdue = endDate !== null && endDate < today && status !== 'live'
  const isBlocked = status === 'blocked'

  const cf = raw.custom_fields

  const riskRaw = getCustomField(cf, 'Risk level')
  const riskLevel = parseRiskLevel(riskRaw)

  const implementationLanguage = getCustomField(cf, 'Implementation language') ?? null

  const pmsRaw = getCustomField(cf, 'PMS') ?? null
  const pms = pmsRaw === '0_No PMS' || pmsRaw === null ? null : pmsRaw

  const csmName = getCustomField(cf, 'CSM') ?? null

  const clientTypeRaw = getCustomField(cf, 'Type') ?? getCustomField(cf, 'Groupe') ?? getCustomField(cf, 'Client type') ?? null
  const clientType = clientTypeRaw

  const accountRaw = getCustomField(cf, 'Account')
  let accountCRMName: string | null = null
  if (accountRaw && accountRaw.includes(' - ')) {
    const candidate = accountRaw.split(' - ').slice(1).join(' - ').trim()
    if (candidate && candidate !== 'D-EDGE') {
      accountCRMName = candidate
    }
  }

  return {
    id: String(raw.id_string ?? raw.id),
    name: raw.name,
    hotelName,
    product: raw.group_name ?? '',
    status,
    statusLabel,
    ownerName: raw.owner_name,
    ownerShort,
    startDate,
    endDate,
    percentComplete: raw.project_percent ?? 0,
    riskLevel,
    implementationLanguage,
    pms,
    csmName,
    accountCRMName,
    clientType,
    isOverdue,
    isBlocked,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchProjects(options?: {
  status?: string
  range?: number
}): Promise<OnboardingProject[]> {
  const range = options?.range ?? 100
  const all: OnboardingProject[] = []

  let index = 1
  while (true) {
    const query = new URLSearchParams({
      range: String(range),
      index: String(index),
      ...(options?.status ? { status: options.status } : {}),
    })

    const data = await projectsFetch<ProjectsListResponse>(`/projects/?${query}`)
    const batch = data.projects ?? []

    all.push(...batch.map(mapProject))

    if (batch.length < range) break
    index += range
  }

  return all
}
