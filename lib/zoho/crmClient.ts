import { ZOHO_CRM_BASE_URL } from './constants'
import { createZohoTokenProvider } from './oauth'

const getAccessToken = createZohoTokenProvider({
  label: 'Zoho CRM',
  refreshTokenEnv: 'ZOHO_CRM_REFRESH_TOKEN',
})

/** Variante tolérant le 204 sans corps que renvoie `/search` quand aucun enregistrement ne correspond. */
async function crmFetchOrNull<T>(path: string): Promise<T | null> {
  const token = await getAccessToken()
  const res = await fetch(`${ZOHO_CRM_BASE_URL}${path}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  if (res.status === 204) return null
  if (!res.ok) throw new Error(`CRM API error ${res.status}: ${await res.text()}`)
  return res.json()
}

async function crmFetch<T>(path: string): Promise<T> {
  const data = await crmFetchOrNull<T>(path)
  if (data === null) throw new Error('CRM API error 204: réponse vide inattendue')
  return data
}

export type Segment = 'Strategic' | 'Gold' | 'Silver' | 'Bronze'

export interface CRMAccount {
  id: string
  name: string
  parentId: string | null
  parentName: string | null
  segment: Segment
  mrr: number
  country: string | null
  plan: string[]
  csm: string | null
  loungeUpClientId: string | null
  /** Id utilisateur Zoho du CSM (lookup CSM), clé de résolution la plus fiable. */
  csmUserId: string | null
  /** Account_Type, picklist Zoho. 'Client' identifie un compte signé. */
  accountType: string | null
  /** Sub_Start_date, 'YYYY-MM-DD'. Date de go-live prévue. */
  subStartDate: string | null
  /** Date_de_passation, 'YYYY-MM-DD'. Passation OB vers CSM déjà réalisée. */
  handoverDate: string | null
  /** Nombre_d_h_tels. Souvent vide, d'où le repli par comptage des comptes enfants. */
  hotelCount: number | null
  /** Created_Time ramené à 'YYYY-MM-DD'. */
  createdTime: string | null
}

/** Accepte 'YYYY-MM-DD' ou une date ISO complète ; ne fabrique jamais de date à partir d'une valeur non reconnue. */
function toIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null
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
  CSM: { id: string; name: string } | null
  Billing_Country: string | null
  LoungeUp_Client_ID: string | null
  Parent_Account: { id: string; name: string } | null
  Account_Type: string | null
  Sub_Start_date: string | null
  Date_de_passation: string | null
  Nombre_d_h_tels: number | null
  Created_Time: string | null
}

function mapRaw(a: RawCRMAccount): CRMAccount {
  const mrr = a.MRR_CSM_manual1 || a.MRR_Total || 0
  return {
    id: a.id,
    name: a.Account_Name,
    parentId: a.Parent_Account?.id ?? null,
    parentName: a.Parent_Account?.name ?? null,
    segment: segmentFromMRR(mrr),
    mrr,
    country: a.Billing_Country,
    plan: a.Plan ?? [],
    csm: a.CSM?.name ?? null,
    loungeUpClientId: a.LoungeUp_Client_ID,
    csmUserId: a.CSM?.id != null ? String(a.CSM.id) : null,
    accountType: typeof a.Account_Type === 'string' && a.Account_Type.trim() !== '' ? a.Account_Type.trim() : null,
    subStartDate: toIsoDate(a.Sub_Start_date),
    handoverDate: toIsoDate(a.Date_de_passation),
    hotelCount: typeof a.Nombre_d_h_tels === 'number' && Number.isFinite(a.Nombre_d_h_tels) && a.Nombre_d_h_tels > 0 ? a.Nombre_d_h_tels : null,
    createdTime: toIsoDate(a.Created_Time),
  }
}

const FIELDS =
  'Account_Name,MRR_Total,MRR_CSM_manual1,Plan,CSM,Billing_Country,LoungeUp_Client_ID,Parent_Account,Account_Type,Sub_Start_date,Date_de_passation,Nombre_d_h_tels,Created_Time'

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

export async function fetchAllCRMAccounts(options?: { includeZeroMrr?: boolean }): Promise<CRMAccount[]> {
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
  return options?.includeZeroMrr ? all : all.filter(a => a.mrr > 0)
}

/** Une opportunité gagnée du module Deals de Zoho CRM. */
export interface ZohoWonDeal {
  id: string
  dealName: string
  stage: string
  /** Closing_Date, 'YYYY-MM-DD'. */
  closingDate: string | null
}

interface RawZohoDeal {
  id: string
  Deal_Name: string
  Stage: string
  Closing_Date: string | null
}

const DEALS_FIELDS = 'Deal_Name,Stage,Closing_Date'

/**
 * Ne jamais joindre un deal gagné à un compte via `Account_Name` : sur les
 * deals `Won`, ce champ pointe vers un compte générique « D-EDGE »
 * (id `93025000000688535`) et non vers le client réel, qui n'apparaît que
 * dans le texte de `Deal_Name`. Les deals servent uniquement à confirmer
 * une signature et à dater `Closing_Date`.
 */
export async function fetchWonDeals(options?: { maxPages?: number }): Promise<{ deals: ZohoWonDeal[]; truncated: boolean }> {
  const maxPages = options?.maxPages ?? 25
  const criteria = encodeURIComponent('(Stage:equals:Won)')
  const deals: ZohoWonDeal[] = []
  let page = 1
  let truncated = false
  while (page <= maxPages) {
    const data = await crmFetchOrNull<{ data?: RawZohoDeal[]; info?: { more_records: boolean } }>(
      `/Deals/search?criteria=${criteria}&fields=${DEALS_FIELDS}&per_page=200&page=${page}`,
    )
    if (!data?.data?.length) break
    deals.push(
      ...data.data
        .filter(d => d.Stage === 'Won')
        .map(d => ({
          id: d.id,
          dealName: d.Deal_Name,
          stage: d.Stage,
          closingDate: toIsoDate(d.Closing_Date),
        }))
    )
    if (!data.info?.more_records) break
    if (page >= maxPages) {
      truncated = true
      break
    }
    page++
  }
  return { deals, truncated }
}
