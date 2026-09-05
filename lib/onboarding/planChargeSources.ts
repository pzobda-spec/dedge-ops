/**
 * Chargement des données réelles du plan de charge OB / CSM, depuis Zoho
 * (CRM, Projects) et Supabase (rosters, overrides). Assemble les entrées
 * consommées par `buildPlanChargePipeline` et `runAssignmentEngine`, tous
 * deux purs : ce module est la seule brique à faire de l'I/O.
 */

import { unstable_cache } from 'next/cache'
import { formatInTimeZone } from 'date-fns-tz'
import { fetchAllCRMAccounts, fetchWonDeals, type CRMAccount, type ZohoWonDeal } from '@/lib/zoho/crmClient'
import { fetchAllZohoProjects, type OnboardingProject } from '@/lib/zoho/projectsClient'
import { supabaseAdmin } from '@/lib/supabase/server'
import { isAvailability, isObRole, type Availability, type ObRole } from '@/lib/onboarding/capacityModel'
import type { ObMember, CsmMember } from '@/lib/onboarding/assignmentEngine'
import type { CsmDirectoryEntry } from '@/lib/onboarding/csmDirectory'
import type { AccountAssignmentOverride } from '@/lib/onboarding/pipeline'

/** Fuseau métier du plan de charge. */
const PLAN_CHARGE_TIME_ZONE = 'Europe/Paris'

export const PLAN_CHARGE_ZOHO_CACHE_TAG = 'onboarding-plan-charge-zoho'
export const PLAN_CHARGE_CACHE_TAG = 'onboarding-plan-charge'
export const PLAN_CHARGE_ZOHO_CACHE_SECONDS = 900

/** Résultat complet du chargement des sources du plan de charge. */
export interface PlanChargeSources {
  accounts: CRMAccount[]
  projects: OnboardingProject[]
  wonDeals: ZohoWonDeal[]
  dealsTruncated: boolean
  obRoster: ObMember[]
  csmRoster: CsmMember[]
  csmDirectory: CsmDirectoryEntry[]
  overrides: AccountAssignmentOverride[]
  /** Anomalies non bloquantes rencontrées au chargement, à afficher plutôt qu'à taire. */
  warnings: string[]
}

/** Postgres : relation absente (table pas encore migrée). */
function isMissingTableError(error: { code?: string; message?: string }): boolean {
  return error.code === '42P01'
}

/** Trois appels Zoho, en cache partagé : comptes (y compris MRR nul), projets et deals gagnés. */
const getPlanChargeZohoSources = unstable_cache(
  async () => {
    const [accounts, projects, wonDealsResult] = await Promise.all([
      fetchAllCRMAccounts({ includeZeroMrr: true }),
      fetchAllZohoProjects(),
      fetchWonDeals(),
    ])
    return {
      accounts,
      projects,
      wonDeals: wonDealsResult.deals,
      dealsTruncated: wonDealsResult.truncated,
    }
  },
  ['onboarding-plan-charge-zoho'],
  { tags: [PLAN_CHARGE_ZOHO_CACHE_TAG], revalidate: PLAN_CHARGE_ZOHO_CACHE_SECONDS },
)

/** Date métier du jour au format 'YYYY-MM-DD', fuseau Europe/Paris. */
export function planChargeReferenceDate(): string {
  return formatInTimeZone(new Date(), PLAN_CHARGE_TIME_ZONE, 'yyyy-MM-dd')
}

/** Horizon de projection : `count` mois consécutifs à partir du mois courant, format 'YYYY-MM'. */
export function planChargeMonths(count = 6): string[] {
  const referenceDate = planChargeReferenceDate()
  const [yearStr, monthStr] = referenceDate.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr) // 1-12

  const months: string[] = []
  for (let i = 0; i < count; i++) {
    const totalMonths = (month - 1) + i
    const y = year + Math.floor(totalMonths / 12)
    const m = (totalMonths % 12) + 1
    months.push(`${y}-${String(m).padStart(2, '0')}`)
  }
  return months
}

/** Charge le roster OB depuis `ob_capacity_rules`. */
async function loadObRoster(warnings: string[]): Promise<ObMember[]> {
  const { data, error } = await supabaseAdmin
    .from('ob_capacity_rules')
    .select('owner, role, max_projects, availability')
    .order('owner', { ascending: true })

  if (error) {
    if (isMissingTableError(error)) {
      warnings.push('Table ob_capacity_rules absente : roster OB vide.')
      return []
    }
    throw new Error(error.message)
  }

  return (data ?? []).map(row => {
    let role: ObRole = 'junior'
    if (isObRole(row.role)) {
      role = row.role
    } else {
      warnings.push(`Rôle OB invalide pour ${row.owner} ("${row.role}") : repli sur "junior".`)
    }

    let availability: Availability = 'full'
    if (isAvailability(row.availability)) {
      availability = row.availability
    } else {
      warnings.push(`Disponibilité invalide pour ${row.owner} ("${row.availability}") : repli sur "full".`)
    }

    return {
      name: row.owner,
      role,
      maxProjects: Number(row.max_projects),
      availability,
    }
  })
}

/** Charge le roster CSM et l'annuaire de résolution de noms depuis `csm_capacity_rules`. */
async function loadCsmRosterAndDirectory(
  warnings: string[],
): Promise<{ csmRoster: Omit<CsmMember, 'currentMonthBasePoints'>[]; csmDirectory: CsmDirectoryEntry[] }> {
  const { data, error } = await supabaseAdmin
    .from('csm_capacity_rules')
    .select('csm_name, monthly_capacity_points, availability, zoho_user_id, zoho_aliases')
    .order('csm_name', { ascending: true })

  if (error) {
    if (isMissingTableError(error)) {
      warnings.push('Table csm_capacity_rules absente : roster CSM vide.')
      return { csmRoster: [], csmDirectory: [] }
    }
    throw new Error(error.message)
  }

  const csmRoster: Omit<CsmMember, 'currentMonthBasePoints'>[] = []
  const csmDirectory: CsmDirectoryEntry[] = []

  for (const row of data ?? []) {
    let availability: Availability = 'full'
    if (isAvailability(row.availability)) {
      availability = row.availability
    } else {
      warnings.push(`Disponibilité invalide pour ${row.csm_name} ("${row.availability}") : repli sur "full".`)
    }

    csmRoster.push({
      name: row.csm_name,
      monthlyCapacityPoints: Number(row.monthly_capacity_points),
      availability,
    })

    csmDirectory.push({
      csmName: row.csm_name,
      zohoUserId: row.zoho_user_id,
      aliases: row.zoho_aliases ?? [],
    })
  }

  return { csmRoster, csmDirectory }
}

/** Charge les overrides manuels par compte depuis `account_assignments`. */
async function loadOverrides(warnings: string[]): Promise<AccountAssignmentOverride[]> {
  const { data, error } = await supabaseAdmin
    .from('account_assignments')
    .select('account_id, ob_owner, ob_locked, csm_name, csm_locked')

  if (error) {
    if (isMissingTableError(error)) {
      warnings.push('Table account_assignments absente : aucun override manuel appliqué.')
      return []
    }
    throw new Error(error.message)
  }

  return (data ?? []).map(row => ({
    accountId: row.account_id,
    obOwner: row.ob_owner,
    obLocked: row.ob_locked,
    csmName: row.csm_name,
    csmLocked: row.csm_locked,
  }))
}

/**
 * Points de départ du mois courant pour chaque CSM, à partir de
 * `onboarding_projects`.
 *
 * INTERPRÉTATION (spec §4.3, à valider avec le métier) : « la charge déjà
 * attribuée ce mois » est ici comprise comme les points dont l'attribution
 * CSM (`csm_assigned_at`) est tombée dans le mois courant — pas les points
 * des comptes dont le go-live tombe ce mois-ci. On retient donc la date
 * d'attribution du CSM, pas la date de go-live.
 *
 * Les bornes du mois sont comparées en UTC alors que la date de référence est
 * calculée en Europe/Paris. L'écart ne concerne que les attributions faites
 * dans les toutes premières heures d'un mois ; il est assumé plutôt que
 * masqué par une fausse précision.
 */
async function loadCurrentMonthBasePoints(
  referenceDate: string,
  warnings: string[],
): Promise<Map<string, number>> {
  const [year, month] = referenceDate.split('-').map(Number)
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 }
  const monthEnd = `${nextMonth.y}-${String(nextMonth.m).padStart(2, '0')}-01`

  const { data, error } = await supabaseAdmin
    .from('onboarding_projects')
    .select('csm_name, csm_assignment_points, csm_assigned_at')
    .gte('csm_assigned_at', monthStart)
    .lt('csm_assigned_at', monthEnd)

  if (error) {
    if (isMissingTableError(error)) {
      warnings.push('Table onboarding_projects absente : points de départ CSM du mois courant ignorés.')
      return new Map()
    }
    throw new Error(error.message)
  }

  const totals = new Map<string, number>()
  for (const row of data ?? []) {
    if (!row.csm_name || row.csm_assignment_points === null || row.csm_assignment_points === undefined) continue
    totals.set(row.csm_name, (totals.get(row.csm_name) ?? 0) + Number(row.csm_assignment_points))
  }
  return totals
}

export async function loadPlanChargeSources(): Promise<PlanChargeSources> {
  const warnings: string[] = []
  const referenceDate = planChargeReferenceDate()

  const [zohoSources, obRoster, csmRosterAndDirectory, overrides, currentMonthBasePoints] = await Promise.all([
    getPlanChargeZohoSources(),
    loadObRoster(warnings),
    loadCsmRosterAndDirectory(warnings),
    loadOverrides(warnings),
    loadCurrentMonthBasePoints(referenceDate, warnings),
  ])

  if (zohoSources.dealsTruncated) {
    warnings.push('La liste des deals gagnés Zoho est tronquée (plafond de pagination atteint) : partielle.')
  }

  const csmRoster: CsmMember[] = csmRosterAndDirectory.csmRoster.map(member => ({
    ...member,
    currentMonthBasePoints: currentMonthBasePoints.get(member.name) ?? 0,
  }))

  return {
    accounts: zohoSources.accounts,
    projects: zohoSources.projects,
    wonDeals: zohoSources.wonDeals,
    dealsTruncated: zohoSources.dealsTruncated,
    obRoster,
    csmRoster,
    csmDirectory: csmRosterAndDirectory.csmDirectory,
    overrides,
    warnings,
  }
}
