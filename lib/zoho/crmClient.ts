const ZOHO_TOKEN_URL = 'https://accounts.zoho.eu/oauth/v2/token'
const ZOHO_CRM_BASE = 'https://www.zohoapis.eu/crm/v2'

let cachedToken: string | null = null
let tokenExpiresAt = 0

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    refresh_token: process.env.ZOHO_CRM_REFRESH_TOKEN!,
  })

  const res = await fetch(ZOHO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  const data = await res.json()
  if (!data.access_token) throw new Error(`CRM token error: ${JSON.stringify(data)}`)

  cachedToken = data.access_token
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000
  return cachedToken!
}

async function crmFetch<T>(path: string): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(`${ZOHO_CRM_BASE}${path}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  if (!res.ok) throw new Error(`CRM API error ${res.status}: ${await res.text()}`)
  return res.json()
}

export type Segment = 'Strategic' | 'Gold' | 'Silver' | 'Bronze'

export interface CRMAccount {
  id: string
  name: string
  segment: Segment
  mrr: number
  country: string | null
  plan: string[]
  csm: string | null
  loungeUpClientId: string | null
}

export function segmentFromMRR(mrr: number): Segment {
  if (mrr > 4000) return 'Strategic'
  if (mrr >= 750) return 'Gold'
  if (mrr >= 200) return 'Silver'
  return 'Bronze'
}

interface RawCRMAccount {
  id: string
  Account_Name: string
  MRR_Total: number | null
  MRR_CSM_manual1: number | null
  Plan: string[]
  CSM: { name: string } | null
  Billing_Country: string | null
  LoungeUp_Client_ID: string | null
}

function mapRaw(a: RawCRMAccount): CRMAccount {
  const mrr = a.MRR_CSM_manual1 || a.MRR_Total || 0
  return {
    id: a.id,
    name: a.Account_Name,
    segment: segmentFromMRR(mrr),
    mrr,
    country: a.Billing_Country,
    plan: a.Plan ?? [],
    csm: a.CSM?.name ?? null,
    loungeUpClientId: a.LoungeUp_Client_ID,
  }
}

const FIELDS = 'Account_Name,MRR_Total,MRR_CSM_manual1,Plan,CSM,Billing_Country,LoungeUp_Client_ID'

export async function fetchCRMAccounts(perPage = 200): Promise<CRMAccount[]> {
  const data = await crmFetch<{ data: RawCRMAccount[] }>(`/Accounts?fields=${FIELDS}&per_page=${perPage}`)
  return (data.data ?? []).map(mapRaw)
}

export async function fetchCRMAccountByName(name: string): Promise<CRMAccount | null> {
  const criteria = encodeURIComponent(`(Account_Name:equals:${name})`)
  const data = await crmFetch<{ data: RawCRMAccount[] }>(`/Accounts/search?criteria=${criteria}&fields=${FIELDS}`)
  const raw = data.data?.[0]
  return raw ? mapRaw(raw) : null
}

export async function fetchAllCRMAccounts(): Promise<CRMAccount[]> {
  const all: CRMAccount[] = []
  let page = 1
  while (true) {
    const data = await crmFetch<{ data: RawCRMAccount[]; info: { more_records: boolean } }>(
      `/Accounts?fields=${FIELDS}&per_page=200&page=${page}`
    )
    if (!data.data?.length) break
    all.push(...data.data.map(mapRaw))
    if (!data.info?.more_records) break
    page++
  }
  return all.filter(a => a.mrr > 0)
}
