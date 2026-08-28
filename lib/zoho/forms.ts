import { ZOHO_FORMS_BASE_URL } from './constants'
import { createZohoTokenProvider } from './oauth'

// Requires ZohoForms.form.READ scope on ZOHO_REFRESH_TOKEN
// Form/report link names come from the Zoho Forms URL — adjust via env vars if needed
const FORM_LINK_NAME = process.env.ZOHO_FORMS_SATISFACTION_FORM ?? 'SatisfactionOnboarding'
const REPORT_LINK_NAME = process.env.ZOHO_FORMS_SATISFACTION_REPORT ?? 'SatisfactionOnboarding_Report'

const getAccessToken = createZohoTokenProvider({
  label: 'Zoho Forms',
  refreshTokenEnv: 'ZOHO_REFRESH_TOKEN',
})

export interface SatisfactionResponse {
  id: string
  establishment: string
  respondent_name: string
  owner: string
  score_global: number
  score_onboarding: number
  score_simplicity: number
  score_tool: number
  score_training: number
  comment: string | null
  submitted_at: string
}

function parseScore(val: unknown): number {
  const n = typeof val === 'number' ? val : parseFloat(String(val ?? '0'))
  return isNaN(n) ? 0 : Math.min(5, Math.max(0, n))
}

function pick(record: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = record[k]
    if (v != null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

// Field name mapping: keys must match actual Zoho Forms field labels — adjust after first API call
function mapRecord(raw: Record<string, unknown>, id: string): SatisfactionResponse {
  return {
    id,
    establishment: pick(raw, 'Your establishment', 'Etablissement', 'Establishment', 'Hotel', 'Hôtel', 'Nom_etablissement'),
    respondent_name: pick(raw, 'Name', 'Prenom_Nom', 'Prénom_Nom', 'Nom_complet', 'Respondent', 'Prénom et Nom'),
    owner: pick(raw, 'Onboarder', 'Owner', 'Chargé_de_projet', 'CSM', 'Responsable'),
    score_global: parseScore(raw['Global satisfaction'] ?? raw['Note_globale'] ?? raw['Score_global'] ?? raw['Note globale'] ?? raw['Global']),
    score_onboarding: parseScore(raw['Onboarding'] ?? raw['Note_onboarding'] ?? raw['Score_onboarding']),
    score_simplicity: parseScore(raw['Simplicity of implementation'] ?? raw['Note_simplicite'] ?? raw['Note_simplicité'] ?? raw['Simplicite'] ?? raw['Simplicité']),
    score_tool: parseScore(raw['Tool performance'] ?? raw['Note_outil'] ?? raw['Score_outil'] ?? raw['Outil']),
    score_training: parseScore(raw['Trainings'] ?? raw['Note_formation'] ?? raw['Score_formation'] ?? raw['Formation']),
    comment: pick(raw, 'Please help us to improve !', 'Commentaire', 'Comment', 'Remarques', 'Avis') || null,
    submitted_at: pick(raw, 'Added Time', 'Submitted_On', 'submitted_at', 'Date', 'Created_Time') || new Date().toISOString(),
  }
}

export async function fetchSatisfactionResponses(): Promise<SatisfactionResponse[]> {
  const token = await getAccessToken()
  const all: SatisfactionResponse[] = []
  let page = 1

  while (true) {
    const params = new URLSearchParams({ page: String(page), per_page: '100' })
    const url = `${ZOHO_FORMS_BASE_URL}/form/${FORM_LINK_NAME}/report/${REPORT_LINK_NAME}/records?${params}`

    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    })
    if (!res.ok) throw new Error(`Zoho Forms API error ${res.status}: ${await res.text()}`)

    const data = await res.json()
    const records: Record<string, unknown>[] = data.records ?? data.data ?? data.result?.records ?? []
    if (records.length === 0) break

    for (const rec of records) {
      const id = String(rec['Entry_Id'] ?? rec['id'] ?? `${page}_${all.length}`)
      all.push(mapRecord(rec, id))
    }

    if (records.length < 100) break
    page++
  }

  return all
}
