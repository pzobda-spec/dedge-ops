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
import {
  isAvailability,
  isObRole,
  DEFAULT_WEIGHT_RULES,
  type Availability,
  type ObRole,
  type AssignmentWeightRule,
} from '@/lib/onboarding/capacityModel'
import type { ObMember, CsmMember } from '@/lib/onboarding/assignmentEngine'
import type { CsmDirectoryEntry } from '@/lib/onboarding/csmDirectory'
import type { AccountAssignmentOverride } from '@/lib/onboarding/pipeline'
import { loadTicketCountsByAccountName, type TicketHealthCounts } from '@/lib/csm/ticketHealth'

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
  /** Barème de poids OB/CSM, chargé depuis `csm_assignment_rules` (repli sur `DEFAULT_WEIGHT_RULES` sinon). */
  weightRules: AssignmentWeightRule[]
  /** Compteurs de tickets Desk par nom de compte normalisé, pour la santé de compte CSM. */
  ticketsByAccountName: Map<string, TicketHealthCounts>
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

/** Charge le barème de poids OB/CSM depuis `csm_assignment_rules`. Repli sur `DEFAULT_WEIGHT_RULES` si absente ou vide. */
async function loadWeightRules(warnings: string[]): Promise<AssignmentWeightRule[]> {
  const { data, error } = await supabaseAdmin
    .from('csm_assignment_rules')
    .select('tier, customer_type, dmbook_only, points')

  if (error) {
    if (isMissingTableError(error)) {
      warnings.push('Table csm_assignment_rules absente : repli sur le barème de poids par défaut.')
      return [...DEFAULT_WEIGHT_RULES]
    }
    throw new Error(error.message)
  }

  if (!data || data.length === 0) {
    warnings.push('Barème csm_assignment_rules vide : repli sur le barème de poids par défaut.')
    return [...DEFAULT_WEIGHT_RULES]
  }

  return data.map(row => ({
    tier: row.tier,
    customerType: row.customer_type,
    dmbookOnly: row.dmbook_only,
    points: Number(row.points),
  }))
}

export async function loadPlanChargeSources(): Promise<PlanChargeSources> {
  const warnings: string[] = []
  const referenceDate = planChargeReferenceDate()

  const [zohoSources, obRoster, csmRosterAndDirectory, overrides, weightRules, ticketsByAccountName] = await Promise.all([
    getPlanChargeZohoSources(),
    loadObRoster(warnings),
    loadCsmRosterAndDirectory(warnings),
    loadOverrides(warnings),
    loadWeightRules(warnings),
    loadTicketCountsByAccountName(referenceDate, warnings),
  ])

  if (zohoSources.dealsTruncated) {
    warnings.push('La liste des deals gagnés Zoho est tronquée (plafond de pagination atteint) : partielle.')
  }

  const currentMonth = referenceDate.slice(0, 7)
  // Les points de départ du mois courant ne sont PAS calculés ici : ils dépendent
  // du pipeline (un compte encore au pipeline ne doit pas peser deux fois). C'est
  // `computePlanCharge` de `@/lib/onboarding/planCharge` qui les injecte.
  const csmRoster: CsmMember[] = csmRosterAndDirectory.csmRoster.map(member => ({ ...member }))

  return {
    accounts: zohoSources.accounts,
    projects: zohoSources.projects,
    wonDeals: zohoSources.wonDeals,
    dealsTruncated: zohoSources.dealsTruncated,
    obRoster,
    csmRoster,
    csmDirectory: csmRosterAndDirectory.csmDirectory,
    overrides,
    weightRules,
    ticketsByAccountName,
    warnings,
  }
}
