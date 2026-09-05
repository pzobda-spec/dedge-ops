/**
 * Lecture des compteurs de tickets Desk par compte, pour la santé de compte du
 * dashboard CSM. Module d'I/O : seule brique autorisée à interroger Supabase
 * pour ce besoin, le calcul lui-même reste dans `lib/csm/dashboard.ts`.
 */

import { supabaseAdmin } from '@/lib/supabase/server'

export interface TicketHealthCounts {
  open: number
  last6m: number
}

/** Statuts Desk considérés comme "ouverts", quelle que soit leur date de création. */
const OPEN_STATUSES = ['Open', 'Pending']

/** Postgres : relation absente (table pas encore migrée). */
function isMissingTableError(error: { code?: string; message?: string }): boolean {
  return error.code === '42P01'
}

/** Normalisation stricte de nom de compte pour comparaison (majuscules, trim, espaces réduits). */
function normalizeAccountName(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ')
}

/** Date de référence moins 6 mois, au format ISO complet (minuit UTC). */
function sixMonthsBefore(referenceDate: string): string {
  const [year, month, day] = referenceDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCMonth(date.getUTCMonth() - 6)
  return date.toISOString()
}

/**
 * Tickets par nom de compte Desk normalisé : ouverts à l'instant T, et volume
 * sur les 6 derniers mois.
 *
 * `ticket_analytics` ne conserve que 12 mois d'historique glissant : la
 * fenêtre de 6 mois demandée ici est donc toujours entièrement couverte.
 */
export async function loadTicketCountsByAccountName(
  referenceDate: string,
  warnings: string[],
): Promise<Map<string, TicketHealthCounts>> {
  const counts = new Map<string, TicketHealthCounts>()

  const [openResult, recentResult] = await Promise.all([
    supabaseAdmin.from('ticket_analytics').select('client_name,status,created_at').in('status', OPEN_STATUSES),
    supabaseAdmin
      .from('ticket_analytics')
      .select('client_name,status,created_at')
      .gte('created_at', sixMonthsBefore(referenceDate)),
  ])

  if (openResult.error) {
    if (isMissingTableError(openResult.error)) {
      warnings.push('Table ticket_analytics absente : santé de compte CSM sans données de tickets.')
      return new Map()
    }
    throw new Error(openResult.error.message)
  }
  if (recentResult.error) {
    if (isMissingTableError(recentResult.error)) {
      warnings.push('Table ticket_analytics absente : santé de compte CSM sans données de tickets.')
      return new Map()
    }
    throw new Error(recentResult.error.message)
  }

  for (const row of openResult.data ?? []) {
    const clientName = (row as { client_name: string | null }).client_name
    if (!clientName) continue
    const key = normalizeAccountName(clientName)
    const entry = counts.get(key) ?? { open: 0, last6m: 0 }
    entry.open += 1
    counts.set(key, entry)
  }

  for (const row of recentResult.data ?? []) {
    const clientName = (row as { client_name: string | null }).client_name
    if (!clientName) continue
    const key = normalizeAccountName(clientName)
    const entry = counts.get(key) ?? { open: 0, last6m: 0 }
    entry.last6m += 1
    counts.set(key, entry)
  }

  return counts
}
