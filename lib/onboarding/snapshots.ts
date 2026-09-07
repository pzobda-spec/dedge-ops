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

/** Fenêtre de rattrapage, en jours. Plafond, pas objectif. */
export const SNAPSHOT_BACKFILL_WINDOW_DAYS = 7

export interface SnapshotOutcome {
  snapshotDate: string
  rows: number
  /** Dates comblées lors de ce passage. */
  backfilledDates: string[]
  /** Dates manquantes hors fenêtre, non comblées. */
  beyondWindowDates: string[]
}

export interface DailySnapshotsResult {
  snapshotDate: string
  workload: SnapshotOutcome
  portfolio: SnapshotOutcome
  warnings: string[]
}

export interface SnapshotReconciliation {
  /** Dates à écrire, la date du jour incluse, de la plus ancienne à la plus récente. */
  toWrite: string[]
  /** Dates manquantes à combler, hors date du jour. Sous-ensemble de `toWrite`. */
  toBackfill: string[]
  /**
   * Dates manquantes au-delà de la fenêtre, NON comblées. Au-delà de sept
   * jours, un trou n'est plus un incident de livraison, c'est un cron arrêté,
   * et cela se traite autrement qu'un rattrapage silencieux.
   */
  beyondWindow: string[]
}

/** Décale une date 'YYYY-MM-DD' de `days` jours calendaires, via Date.UTC. */
function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const d = String(shifted.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Réconcilie l'historique attendu sur la fenêtre de rattrapage avec les dates
 * déjà présentes en base. Fonction pure : aucune horloge, aucun accès réseau.
 */
export function reconcileSnapshotDates(input: {
  /** Date métier du jour, 'YYYY-MM-DD'. */
  referenceDate: string
  /** Dates déjà présentes en base, 'YYYY-MM-DD', dans n'importe quel ordre. */
  existingDates: readonly string[]
  /** Défaut SNAPSHOT_BACKFILL_WINDOW_DAYS. */
  windowDays?: number
  /**
   * Date du premier snapshot jamais écrit. Avant elle, une absence n'est pas un
   * trou : l'historique n'avait pas commencé. `null` si la table est vide.
   */
  firstEverDate?: string | null
}): SnapshotReconciliation {
  const { referenceDate, existingDates, windowDays = SNAPSHOT_BACKFILL_WINDOW_DAYS, firstEverDate = null } = input

  const existing = new Set(existingDates)

  // Fenêtre = `windowDays` jours calendaires précédant referenceDate, plus
  // referenceDate elle-même, de la plus ancienne à la plus récente.
  const windowDates: string[] = []
  for (let offset = windowDays; offset >= 0; offset--) {
    windowDates.push(shiftDate(referenceDate, -offset))
  }

  const toWrite: string[] = []
  const toBackfill: string[] = []

  for (const date of windowDates) {
    if (date === referenceDate) {
      // La date du jour est toujours réécrite, présente ou non.
      toWrite.push(date)
      continue
    }

    if (existing.has(date)) continue

    // Sans premier snapshot connu, aucune absence antérieure au jour n'est
    // un trou : l'historique n'avait simplement pas commencé.
    if (!firstEverDate) continue
    if (date < firstEverDate) continue

    toWrite.push(date)
    toBackfill.push(date)
  }

  // Trous au-delà de la fenêtre : entre firstEverDate et le début de fenêtre.
  const beyondWindow: string[] = []
  if (firstEverDate) {
    const windowStart = windowDates[0]
    for (let date = firstEverDate; date < windowStart; date = shiftDate(date, 1)) {
      if (!existing.has(date)) beyondWindow.push(date)
    }
  }

  toWrite.sort()
  toBackfill.sort()
  beyondWindow.sort()

  return { toWrite, toBackfill, beyondWindow }
}

/** Découpe un tableau en lots, pour des écritures Supabase par batch. */
function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size))
  }
  return batches
}

/** Charge les dates déjà présentes sur la fenêtre élargie et la plus ancienne jamais écrite. */
async function loadExistingDates(
  table: string,
  windowStart: string,
): Promise<{ existingDates: string[]; firstEverDate: string | null }> {
  const [windowResult, firstResult] = await Promise.all([
    supabaseAdmin.from(table).select('snapshot_date').gte('snapshot_date', windowStart),
    supabaseAdmin.from(table).select('snapshot_date').order('snapshot_date', { ascending: true }).limit(1),
  ])

  if (windowResult.error) throw new Error(`Supabase ${table} select failed: ${windowResult.error.message}`)
  if (firstResult.error) throw new Error(`Supabase ${table} select failed: ${firstResult.error.message}`)

  const existingDates = Array.from(
    new Set((windowResult.data ?? []).map(row => (row as { snapshot_date: string }).snapshot_date)),
  )
  const firstEverDate = firstResult.data?.[0]
    ? (firstResult.data[0] as { snapshot_date: string }).snapshot_date
    : null

  return { existingDates, firstEverDate }
}

/**
 * Écrit le snapshot du jour pour les deux tables, et comble les dates
 * manquées des sept derniers jours.
 *
 * La livraison des crons Vercel est en « best effort » : une invocation
 * échouée n'est jamais rejouée, et un même run peut au contraire être
 * déclenché deux fois. L'upsert traite déjà le doublon ; sans ce mécanisme, un
 * run manqué laisserait un trou définitif dans l'historique. Le cron devient
 * donc réconciliateur : à chaque passage, il comble les dates absentes de la
 * fenêtre de rattrapage. Un rattrapage écrit une date passée avec les valeurs
 * mesurées maintenant — approximation assumée et seule alternative à un trou
 * définitif — jamais avec celles, perdues, du jour manqué ; il ne doit donc
 * jamais écraser une date déjà présente.
 */
export async function persistDailySnapshots(referenceDate: string): Promise<DailySnapshotsResult> {
  const capturedAt = new Date().toISOString()
  const sources = await loadPlanChargeSources()
  const warnings = [...sources.warnings]

  const windowStart = shiftDate(referenceDate, -SNAPSHOT_BACKFILL_WINDOW_DAYS)

  const [workloadExisting, portfolioExisting] = await Promise.all([
    loadExistingDates(WORKLOAD_TABLE, windowStart),
    loadExistingDates(PORTFOLIO_TABLE, windowStart),
  ])

  const workloadReconciliation = reconcileSnapshotDates({
    referenceDate,
    existingDates: workloadExisting.existingDates,
    firstEverDate: workloadExisting.firstEverDate,
  })
  const portfolioReconciliation = reconcileSnapshotDates({
    referenceDate,
    existingDates: portfolioExisting.existingDates,
    firstEverDate: portfolioExisting.firstEverDate,
  })

  const workload = await persistWorkloadSnapshot(
    referenceDate,
    capturedAt,
    sources.projects,
    sources.obRoster,
    warnings,
    workloadReconciliation,
  )
  const portfolio = await persistPortfolioSnapshot(
    referenceDate,
    capturedAt,
    sources,
    warnings,
    portfolioReconciliation,
  )

  return { snapshotDate: referenceDate, workload, portfolio, warnings }
}

/** Ajoute les warnings de rattrapage communs aux deux tables. */
function addReconciliationWarnings(tableLabel: string, reconciliation: SnapshotReconciliation, warnings: string[]): void {
  if (reconciliation.toBackfill.length > 0) {
    warnings.push(
      `${tableLabel} : dates comblées ${reconciliation.toBackfill.join(', ')} — valeurs mesurées au moment de la collecte, pas du jour comblé.`,
    )
  }
  if (reconciliation.beyondWindow.length > 0) {
    // Borné volontairement : un cron arrêté plusieurs mois produirait sinon un
    // avertissement de plusieurs centaines de dates, illisible dans la page qui
    // les affiche. On donne le volume et les bornes, la table porte le détail.
    const count = reconciliation.beyondWindow.length
    const oldest = reconciliation.beyondWindow[0]
    const newest = reconciliation.beyondWindow[count - 1]
    const span = count === 1 ? `le ${oldest}` : `du ${oldest} au ${newest}`
    warnings.push(
      `${tableLabel} : ${count} date(s) manquante(s) hors fenêtre de rattrapage, ${span} — au-delà de ${SNAPSHOT_BACKFILL_WINDOW_DAYS} jours, un trou n'est plus un incident de livraison mais un cron arrêté, à traiter autrement qu'un rattrapage silencieux.`,
    )
  }
}

async function persistWorkloadSnapshot(
  snapshotDate: string,
  capturedAt: string,
  projects: Awaited<ReturnType<typeof loadPlanChargeSources>>['projects'],
  obRoster: Awaited<ReturnType<typeof loadPlanChargeSources>>['obRoster'],
  warnings: string[],
  reconciliation: SnapshotReconciliation,
): Promise<SnapshotOutcome> {
  const activeProjectsByOwner = countActiveProjectsByOwner(projects)

  // Une ligne par implémenteur du roster, plus toute personne portant des
  // dossiers actifs sans y être inscrite.
  const owners = new Set<string>(obRoster.map(member => member.name))
  for (const owner of Object.keys(activeProjectsByOwner)) {
    owners.add(owner)
  }

  const baseRows: {
    owner: string
    active_projects: number
    capacity: number
    charge_pct: number | null
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

    baseRows.push({ owner, active_projects: active, capacity, charge_pct: chargePct })
  }

  let totalRows = 0

  // Date du jour : upsert classique, rafraîchit une mesure existante.
  if (reconciliation.toWrite.includes(snapshotDate)) {
    const rows = baseRows.map(row => ({
      ...row,
      snapshot_date: snapshotDate,
      captured_at: capturedAt,
      is_backfilled: false,
    }))
    for (const batch of chunk(rows, UPSERT_BATCH_SIZE)) {
      const { error } = await supabaseAdmin
        .from(WORKLOAD_TABLE)
        .upsert(batch, { onConflict: 'snapshot_date,owner' })
      if (error) throw new Error(`Supabase ${WORKLOAD_TABLE} upsert failed: ${error.message}`)
    }
    totalRows += rows.length
  }

  // Dates rattrapées : ON CONFLICT DO NOTHING, ne recalcule jamais une date existante.
  for (const date of reconciliation.toBackfill) {
    const rows = baseRows.map(row => ({
      ...row,
      snapshot_date: date,
      captured_at: capturedAt,
      is_backfilled: true,
    }))
    for (const batch of chunk(rows, UPSERT_BATCH_SIZE)) {
      const { error } = await supabaseAdmin
        .from(WORKLOAD_TABLE)
        .upsert(batch, { onConflict: 'snapshot_date,owner', ignoreDuplicates: true })
      if (error) throw new Error(`Supabase ${WORKLOAD_TABLE} upsert failed: ${error.message}`)
    }
    totalRows += rows.length
  }

  addReconciliationWarnings(WORKLOAD_TABLE, reconciliation, warnings)

  return {
    snapshotDate,
    rows: totalRows,
    backfilledDates: reconciliation.toBackfill,
    beyondWindowDates: reconciliation.beyondWindow,
  }
}

async function persistPortfolioSnapshot(
  snapshotDate: string,
  capturedAt: string,
  sources: Awaited<ReturnType<typeof loadPlanChargeSources>>,
  warnings: string[],
  reconciliation: SnapshotReconciliation,
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

  const baseRows = Array.from(byCsm.entries()).map(([csmName, aggregate]) => ({
    csm_name: csmName,
    client_accounts: aggregate.clientAccounts,
    live_accounts: aggregate.liveAccounts,
    valued_mrr: aggregate.valuedMrr,
    valued_accounts: aggregate.valuedAccounts,
    churned_accounts_cumulative: aggregate.churnedAccountsCumulative,
  }))

  let totalRows = 0

  // Date du jour : upsert classique, rafraîchit une mesure existante.
  if (reconciliation.toWrite.includes(snapshotDate)) {
    const rows = baseRows.map(row => ({
      ...row,
      snapshot_date: snapshotDate,
      captured_at: capturedAt,
      is_backfilled: false,
    }))
    for (const batch of chunk(rows, UPSERT_BATCH_SIZE)) {
      const { error } = await supabaseAdmin
        .from(PORTFOLIO_TABLE)
        .upsert(batch, { onConflict: 'snapshot_date,csm_name' })
      if (error) throw new Error(`Supabase ${PORTFOLIO_TABLE} upsert failed: ${error.message}`)
    }
    totalRows += rows.length
  }

  // Dates rattrapées : ON CONFLICT DO NOTHING, ne recalcule jamais une date existante.
  for (const date of reconciliation.toBackfill) {
    const rows = baseRows.map(row => ({
      ...row,
      snapshot_date: date,
      captured_at: capturedAt,
      is_backfilled: true,
    }))
    for (const batch of chunk(rows, UPSERT_BATCH_SIZE)) {
      const { error } = await supabaseAdmin
        .from(PORTFOLIO_TABLE)
        .upsert(batch, { onConflict: 'snapshot_date,csm_name', ignoreDuplicates: true })
      if (error) throw new Error(`Supabase ${PORTFOLIO_TABLE} upsert failed: ${error.message}`)
    }
    totalRows += rows.length
  }

  addReconciliationWarnings(PORTFOLIO_TABLE, reconciliation, warnings)

  return {
    snapshotDate,
    rows: totalRows,
    backfilledDates: reconciliation.toBackfill,
    beyondWindowDates: reconciliation.beyondWindow,
  }
}
