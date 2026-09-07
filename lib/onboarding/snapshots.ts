/**
 * Snapshots quotidiens de la charge OB et du portefeuille CSM.
 *
 * `onboarding_workload_snapshots` existe depuis la migration 026 et n'a
 * jamais été alimentée. Sans cet historique, ni rétention ni tendance ne
 * sont calculables sur le plan de charge : chaque jour non capté est perdu
 * définitivement, il n'existe aucun moyen de le reconstituer a posteriori.
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { loadPlanChargeSources } from '@/lib/onboarding/planChargeSources'
import { countActiveProjectsByOwner, CAPACITY_THRESHOLD } from '@/lib/onboarding/workload'
import { effectiveCapacity } from '@/lib/onboarding/capacityModel'
import { buildCsmAccountRows } from '@/lib/csm/dashboard'

const WORKLOAD_TABLE = 'onboarding_workload_snapshots'
const PORTFOLIO_TABLE = 'csm_portfolio_snapshots'
const UNASSIGNED_CSM_NAME = 'Non attribué'
const UPSERT_BATCH_SIZE = 250

export interface SnapshotOutcome {
  snapshotDate: string
  rows: number
}

export interface DailySnapshotsResult {
  snapshotDate: string
  workload: SnapshotOutcome
  portfolio: SnapshotOutcome
  warnings: string[]
}

/** Découpe un tableau en lots, pour des écritures Supabase par batch. */
function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size))
  }
  return batches
}

/** Écrit le snapshot du jour pour les deux tables. Idempotent. */
export async function persistDailySnapshots(referenceDate: string): Promise<DailySnapshotsResult> {
  const capturedAt = new Date().toISOString()
  const sources = await loadPlanChargeSources()
  const warnings = [...sources.warnings]

  const workload = await persistWorkloadSnapshot(referenceDate, capturedAt, sources.projects, sources.obRoster, warnings)
  const portfolio = await persistPortfolioSnapshot(referenceDate, capturedAt, sources, warnings)

  return { snapshotDate: referenceDate, workload, portfolio, warnings }
}

async function persistWorkloadSnapshot(
  snapshotDate: string,
  capturedAt: string,
  projects: Awaited<ReturnType<typeof loadPlanChargeSources>>['projects'],
  obRoster: Awaited<ReturnType<typeof loadPlanChargeSources>>['obRoster'],
  warnings: string[],
): Promise<SnapshotOutcome> {
  const activeProjectsByOwner = countActiveProjectsByOwner(projects)

  // Une ligne par implémenteur du roster, plus toute personne portant des
  // dossiers actifs sans y être inscrite.
  const owners = new Set<string>(obRoster.map(member => member.name))
  for (const owner of Object.keys(activeProjectsByOwner)) {
    owners.add(owner)
  }

  const rows: {
    snapshot_date: string
    owner: string
    active_projects: number
    capacity: number
    charge_pct: number | null
    captured_at: string
  }[] = []

  for (const owner of owners) {
    const active = activeProjectsByOwner[owner] ?? 0
    const member = obRoster.find(m => m.name === owner)

    let capacity: number
    if (member) {
      capacity = Math.round(effectiveCapacity(member.maxProjects, member.availability))
    } else {
      capacity = CAPACITY_THRESHOLD
      warnings.push(
        `${owner} porte des projets actifs sans être au roster OB : capacité de repli ${CAPACITY_THRESHOLD} appliquée.`,
      )
    }

    let chargePct: number | null
    if (capacity > 0) {
      chargePct = Math.round((active / capacity) * 100)
    } else {
      chargePct = null
      if (active > 0) {
        warnings.push(
          `${owner} porte ${active} dossier(s) actif(s) avec une capacité nulle : charge non calculable, surcharge probable.`,
        )
      }
    }

    rows.push({
      snapshot_date: snapshotDate,
      owner,
      active_projects: active,
      capacity,
      charge_pct: chargePct,
      captured_at: capturedAt,
    })
  }

  for (const batch of chunk(rows, UPSERT_BATCH_SIZE)) {
    const { error } = await supabaseAdmin
      .from(WORKLOAD_TABLE)
      .upsert(batch, { onConflict: 'snapshot_date,owner' })
    if (error) throw new Error(`Supabase ${WORKLOAD_TABLE} upsert failed: ${error.message}`)
  }

  return { snapshotDate, rows: rows.length }
}

async function persistPortfolioSnapshot(
  snapshotDate: string,
  capturedAt: string,
  sources: Awaited<ReturnType<typeof loadPlanChargeSources>>,
  warnings: string[],
): Promise<SnapshotOutcome> {
  const csmAccounts = buildCsmAccountRows({
    accounts: sources.accounts,
    projects: sources.projects,
    csmDirectory: sources.csmDirectory,
    csmNames: sources.csmRoster.map(member => member.name),
    ticketsByAccountName: sources.ticketsByAccountName,
  })

  interface Aggregate {
    clientAccounts: number
    liveAccounts: number
    valuedMrr: number
    valuedAccounts: number
    churnedAccountsCumulative: number
  }

  const byCsm = new Map<string, Aggregate>()
  const emptyAggregate = (): Aggregate => ({
    clientAccounts: 0,
    liveAccounts: 0,
    valuedMrr: 0,
    valuedAccounts: 0,
    churnedAccountsCumulative: 0,
  })

  // Chaque CSM du roster reçoit une ligne, même à portefeuille vide. Un zéro
  // est une donnée : sans lui, l'historique d'un CSM qui démarre ou dont le
  // portefeuille a été vidé présenterait un trou impossible à distinguer d'une
  // absence de mesure. Symétrique du snapshot de charge, qui sème déjà tous
  // les implémenteurs du roster.
  for (const member of sources.csmRoster) {
    byCsm.set(member.name, emptyAggregate())
  }

  for (const row of csmAccounts.rows) {
    // Un portefeuille sans porteur identifié est un portefeuille réel :
    // l'historique doit le capter, pas le jeter.
    const csmName = row.csmName ?? UNASSIGNED_CSM_NAME
    const aggregate = byCsm.get(csmName) ?? emptyAggregate()

    if (row.status === 'client') {
      aggregate.clientAccounts += 1
      if (row.live) aggregate.liveAccounts += 1
      if (row.mrr > 0) {
        aggregate.valuedMrr += row.mrr
        aggregate.valuedAccounts += 1
      }
    } else if (row.status === 'former_client') {
      aggregate.churnedAccountsCumulative += 1
    }

    byCsm.set(csmName, aggregate)
  }

  const rows = Array.from(byCsm.entries()).map(([csmName, aggregate]) => ({
    snapshot_date: snapshotDate,
    csm_name: csmName,
    client_accounts: aggregate.clientAccounts,
    live_accounts: aggregate.liveAccounts,
    valued_mrr: aggregate.valuedMrr,
    valued_accounts: aggregate.valuedAccounts,
    churned_accounts_cumulative: aggregate.churnedAccountsCumulative,
    captured_at: capturedAt,
  }))

  for (const batch of chunk(rows, UPSERT_BATCH_SIZE)) {
    const { error } = await supabaseAdmin
      .from(PORTFOLIO_TABLE)
      .upsert(batch, { onConflict: 'snapshot_date,csm_name' })
    if (error) throw new Error(`Supabase ${PORTFOLIO_TABLE} upsert failed: ${error.message}`)
  }

  return { snapshotDate, rows: rows.length }
}
