import { ZOHO_PROJECTS_API_BASE_URL, ZOHO_PROJECTS_API_V3_BASE_URL } from './constants'
import { createZohoTokenProvider } from './oauth'
import { resolveOwnerName } from '@/lib/onboarding/constants'

const PORTAL_ID = process.env.ZOHO_PROJECTS_PORTAL_ID!
const BASE = `${ZOHO_PROJECTS_API_BASE_URL}/portal/${PORTAL_ID}`
// La v2 (`BASE`) n'expose les jalons que projet par projet, soit 711 appels
// sur le portail actuel. La v3 les expose à l'échelle du portail en une
// pagination unique : seul endpoint praticable pour le calcul de retard.
const BASE_V3 = `${ZOHO_PROJECTS_API_V3_BASE_URL}/portal/${PORTAL_ID}`

const getAccessToken = createZohoTokenProvider({
  label: 'Zoho Projects',
  refreshTokenEnv: 'ZOHO_PROJECTS_REFRESH_TOKEN',
})

async function projectsFetch<T>(path: string): Promise<T> {
  async function request(forceRefresh = false): Promise<Response> {
    const token = await getAccessToken(forceRefresh)
    return fetch(`${BASE}${path}`, {
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
  }

  let res = await request()
  // A token can expire between the local expiry check and the request. Refresh
  // once explicitly instead of turning a transient 401 into a failed dashboard.
  if (res.status === 401) res = await request(true)

  if (!res.ok) {
    throw new Error(`Zoho Projects API error ${res.status}: ${await res.text()}`)
  }

  // Zoho returns an empty 204 response for a page past the last project.
  if (res.status === 204) return { projects: [] } as T

  return res.json()
}

/** Nombre de tentatives sur limitation de débit, la première incluse. */
const V3_RATE_LIMIT_MAX_ATTEMPTS = 3
const V3_RATE_LIMIT_BASE_DELAY_MS = 1_000
const V3_RATE_LIMIT_MAX_DELAY_MS = 30_000

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function projectsV3Fetch<T>(path: string): Promise<T> {
  async function request(forceRefresh = false): Promise<Response> {
    const token = await getAccessToken(forceRefresh)
    return fetch(`${BASE_V3}${path}`, {
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
  }

  let res = await request()
  // Même logique de rafraîchissement que projectsFetch : un token peut expirer
  // entre la vérification locale et la requête.
  if (res.status === 401) res = await request(true)

  // Repli sur limitation de débit. La pagination des jalons enchaîne une
  // vingtaine d'appels séquentiels dans un cron quotidien : sans repli, un 429
  // interrompt la collecte. On réessaie trois fois en attente exponentielle, en
  // respectant l'en-tête Retry-After quand Zoho le fournit.
  //
  // Après trois échecs, on abandonne en levant : la mesure du jour est alors
  // ABSENTE, jamais partielle. Une mesure absente est honnête, une mesure
  // tronquée présentée comme complète ment.
  for (let attempt = 1; attempt <= V3_RATE_LIMIT_MAX_ATTEMPTS && res.status === 429; attempt += 1) {
    const retryAfterHeader = Number(res.headers.get('retry-after'))
    const retryAfterMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
      ? retryAfterHeader * 1000
      : V3_RATE_LIMIT_BASE_DELAY_MS * 2 ** (attempt - 1)
    await sleep(Math.min(retryAfterMs, V3_RATE_LIMIT_MAX_DELAY_MS))
    res = await request()
  }

  if (res.status === 429) {
    throw new Error(
      `Zoho Projects API v3 rate limited after ${V3_RATE_LIMIT_MAX_ATTEMPTS} attempts: collecte abandonnée, aucune donnée partielle renvoyée`,
    )
  }

  if (!res.ok) {
    throw new Error(`Zoho Projects API v3 error ${res.status}: ${await res.text()}`)
  }

  if (res.status === 204) return {} as T

  return res.json()
}

// Zoho Projects web URL constants (hash-based SPA routing)
const PORTAL_SLUG = 'loungeup'
const PORTFOLIO_ID = '31465000000078005'

export function buildZohoProjectUrl(projectId: string): string {
  return `https://projects.zoho.eu/portal/${PORTAL_SLUG}#allprojects/${PORTFOLIO_ID}/proj-detail/${projectId}`
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
  | 'standby'
  | 'other'

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical' | null
export type ClientTypology = 'group' | 'individual' | 'unlinked'

export interface OnboardingProject {
  id: string
  name: string
  hotelName: string
  product: string
  status: ProjectStatus
  statusLabel: string
  ownerName: string
  ownerEmail: string | null
  ownerShort: string
  startDate: string | null
  endDate: string | null
  actualGoLiveDate: string | null
  percentComplete: number
  riskLevel: RiskLevel
  implementationLanguage: string | null
  pms: string | null
  csmName: string | null
  accountCRMId: string | null
  accountCRMName: string | null
  clientPropertyId: string | null
  clientPropertyName: string | null
  clientType: string | null   // e.g. 'Groupe' | 'Individuel' — from custom field 'Type'
  clientId: string | null
  clientName: string | null
  clientIsGroup: boolean
  clientTypology: ClientTypology
  isOverdue: boolean
  isBlocked: boolean
  projectUrl: string
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
  account?: {
    record_id?: number | string
  } | null
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
    case 'Standby':
      return 'standby'
    default:
      return 'other'
  }
}

/** Convert Zoho's "MM-DD-YYYY" (or an ISO date) to "YYYY-MM-DD", or null. */
function convertDate(zohoDate: string | undefined): string | null {
  const value = zohoDate?.trim()
  if (!value) return null

  let year: number
  let month: number
  let day: number
  const usMatch = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value)
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)

  if (usMatch) {
    month = Number(usMatch[1])
    day = Number(usMatch[2])
    year = Number(usMatch[3])
  } else if (isoMatch) {
    year = Number(isoMatch[1])
    month = Number(isoMatch[2])
    day = Number(isoMatch[3])
  } else {
    return null
  }

  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }

  return parsed.toISOString().slice(0, 10)
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

  const ownerShort = resolveOwnerName(raw.owner_name?.split(' ')[0] ?? raw.owner_name ?? '', raw.owner_email)

  const startDate = convertDate(raw.start_date)
  const endDate = convertDate(raw.end_date)

  const today = new Date().toISOString().slice(0, 10)
  const isOverdue = endDate !== null && endDate < today && status !== 'live'
  const isBlocked = status === 'blocked'

  const cf = raw.custom_fields
  const actualGoLiveDate = convertDate(getCustomField(cf, 'Live date'))

  const riskRaw = getCustomField(cf, 'Risk level')
  const riskLevel = parseRiskLevel(riskRaw)

  const implementationLanguage = getCustomField(cf, 'Implementation language') ?? null

  const pmsRaw = getCustomField(cf, 'PMS') ?? null
  const pms = pmsRaw === '0_No PMS' || pmsRaw === null ? null : pmsRaw

  const csmName = getCustomField(cf, 'CSM') ?? null

  const clientTypeRaw = getCustomField(cf, 'Type') ?? getCustomField(cf, 'Groupe') ?? getCustomField(cf, 'Client type') ?? null
  const clientType = clientTypeRaw

  const accountRaw = getCustomField(cf, 'Account')
  const accountCRMId = raw.account?.record_id != null
    ? String(raw.account.record_id)
    : null
  let accountCRMName: string | null = null
  if (accountRaw && accountRaw.includes(' - ')) {
    const candidate = accountRaw.split(' - ').slice(1).join(' - ').trim()
    if (candidate && candidate !== 'D-EDGE') {
      accountCRMName = candidate
    }
  }

  const id = String(raw.id_string ?? raw.id)

  return {
    id,
    name: raw.name,
    hotelName,
    product: raw.group_name ?? '',
    status,
    statusLabel,
    ownerName: ownerShort === 'Winli' ? 'Winli' : raw.owner_name,
    ownerEmail: raw.owner_email ?? null,
    ownerShort,
    startDate,
    endDate,
    actualGoLiveDate,
    percentComplete: raw.project_percent ?? 0,
    riskLevel,
    implementationLanguage,
    pms,
    csmName,
    accountCRMId,
    accountCRMName,
    clientPropertyId: null,
    clientPropertyName: null,
    clientType,
    clientId: null,
    clientName: null,
    clientIsGroup: false,
    clientTypology: 'unlinked',
    isOverdue,
    isBlocked,
    projectUrl: buildZohoProjectUrl(id),
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchProjects(options?: {
  status?: string
  range?: number
}): Promise<OnboardingProject[]> {
  const requestedRange = options?.range ?? 100
  const range = Math.min(Math.max(Math.trunc(requestedRange), 1), 100)
  const byId = new Map<string, OnboardingProject>()

  let index = 1
  let pages = 0
  while (true) {
    const query = new URLSearchParams({
      range: String(range),
      index: String(index),
      ...(options?.status ? { status: options.status } : {}),
    })

    const data = await projectsFetch<ProjectsListResponse>(`/projects/?${query}`)
    const batch = data.projects
    if (!Array.isArray(batch)) {
      throw new Error('Zoho Projects API returned an invalid projects payload')
    }

    for (const raw of batch) {
      const project = mapProject(raw)
      byId.set(project.id, project)
    }

    if (batch.length < range) break
    index += range
    pages += 1
    if (pages >= 1_000) {
      throw new Error('Zoho Projects pagination exceeded the safety limit')
    }
  }

  return Array.from(byId.values())
}

export async function fetchAllZohoProjects(): Promise<OnboardingProject[]> {
  return fetchProjects()
}

// ---------------------------------------------------------------------------
// Jalons (v3)
// ---------------------------------------------------------------------------

export interface ZohoMilestone {
  id: string
  /** Nom brut renvoyé par Zoho, entités HTML incluses. */
  name: string
  projectId: string
  projectName: string
  startDate: string | null
  endDate: string | null
  completedOn: string | null
  isClosed: boolean
  ownerName: string | null
  ownerEmail: string | null
}

interface RawMilestoneOwner {
  first_name?: string
  last_name?: string
  email?: string
}

interface RawMilestoneProject {
  id?: number | string
  name?: string
}

interface RawMilestoneStatus {
  name?: string
  is_closed?: boolean
}

interface RawMilestone {
  id: number | string
  name: string
  start_date?: string
  end_date?: string
  completed_on?: string
  status_type?: string
  status?: RawMilestoneStatus
  owner?: RawMilestoneOwner
  project?: RawMilestoneProject
}

interface RawPageInfo {
  has_next_page?: boolean
}

interface MilestonesResponse {
  milestones?: RawMilestone[]
  page_info?: RawPageInfo[]
}

function mapMilestone(raw: RawMilestone): ZohoMilestone {
  const isClosed = raw.status_type
    ? raw.status_type === 'closed'
    : raw.status?.is_closed ?? false

  const first = raw.owner?.first_name?.trim() ?? ''
  const last = raw.owner?.last_name?.trim() ?? ''
  const ownerName = first || last ? `${first} ${last}`.trim() : null

  return {
    id: String(raw.id),
    name: raw.name,
    projectId: raw.project?.id != null ? String(raw.project.id) : '',
    projectName: raw.project?.name ?? '',
    startDate: convertDate(raw.start_date),
    endDate: convertDate(raw.end_date),
    completedOn: convertDate(raw.completed_on),
    isClosed,
    ownerName,
    ownerEmail: raw.owner?.email ?? null,
  }
}

export async function fetchAllZohoMilestones(options?: { maxPages?: number }): Promise<{
  milestones: ZohoMilestone[]
  truncated: boolean
}> {
  const maxPages = options?.maxPages ?? 40
  const perPage = 200
  const milestones: ZohoMilestone[] = []

  let page = 1
  let pagesFetched = 0
  let truncated = false

  while (true) {
    const query = new URLSearchParams({ page: String(page), per_page: String(perPage) })
    const data = await projectsV3Fetch<MilestonesResponse>(`/milestones?${query}`)
    const batch = data.milestones
    if (!Array.isArray(batch)) {
      throw new Error('Zoho Projects API v3 returned an invalid milestones payload')
    }

    for (const raw of batch) {
      milestones.push(mapMilestone(raw))
    }

    pagesFetched += 1
    const hasNextPage = data.page_info?.[0]?.has_next_page ?? false
    if (!hasNextPage) break

    if (pagesFetched >= maxPages) {
      truncated = true
      break
    }

    page += 1
  }

  return { milestones, truncated }
}
