import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { supabaseAdmin } from '@/lib/supabase/server'
import { fetchTicketMetrics, type ZohoTicketMetrics } from '@/lib/zoho/client'
import { persistDailyTicketSnapshotIfHistoryComplete } from '@/lib/zoho/ticketAnalyticsSnapshots'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const TABLE_NAME = 'ticket_analytics'
const TICKETS_PER_RUN = 200
const CONCURRENCY = 8

interface TicketCandidate {
  id: string
  first_contact_resolution: boolean | null
}

interface MetricPatch {
  id: string
  first_response_time_ms?: number | null
  first_contact_resolution?: boolean | null
  metrics_synced_at: string
  metrics_sync_error: string | null
}

function hasValidCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`)
}

export async function GET(request: NextRequest) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runSync()
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ['admin'])
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse()
  }
  return runSync()
}

async function runSync() {
  try {
    const result = await syncFirstResponseMetrics()
    return NextResponse.json(result)
  } catch (error) {
    console.error('[cron/sync-ticket-first-response]', errorMessage(error))
    return errorResponse()
  }
}

async function syncFirstResponseMetrics(): Promise<{
  processed: number
  with_first_response: number
  without_first_response: number
  failed: number
  snapshot: Awaited<ReturnType<typeof persistDailyTicketSnapshotIfHistoryComplete>>
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .select('id,first_contact_resolution')
    .order('metrics_synced_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })
    .limit(TICKETS_PER_RUN)
  if (error) throw new Error(`Supabase metric candidates failed: ${error.message}`)

  const candidates = (data ?? []) as TicketCandidate[]
  const now = new Date().toISOString()
  const patches: MetricPatch[] = []

  for (let index = 0; index < candidates.length; index += CONCURRENCY) {
    const batch = candidates.slice(index, index + CONCURRENCY)
    const results = await Promise.all(batch.map(async ticket => {
      try {
        const metrics = await fetchTicketMetrics(ticket.id)
        return metricPatch(ticket.id, metrics, now, ticket.first_contact_resolution)
      } catch (metricError) {
        return {
          id: ticket.id,
          metrics_synced_at: now,
          metrics_sync_error: errorMessage(metricError).slice(0, 500),
        } satisfies MetricPatch
      }
    }))
    patches.push(...results)
  }

  const metricPatches = patches.filter((patch): patch is MetricPatch & {
    first_response_time_ms: number | null
    first_contact_resolution: boolean | null
  } => 'first_response_time_ms' in patch)
  const fetchErrorPatches = patches.filter(patch => !('first_response_time_ms' in patch))

  if (metricPatches.length > 0) {
    const { error: upsertError } = await supabaseAdmin
      .from(TABLE_NAME)
      .upsert(metricPatches, { onConflict: 'id' })
    if (upsertError) throw new Error(`Supabase metric upsert failed: ${upsertError.message}`)
  }
  if (fetchErrorPatches.length > 0) {
    const { error: errorUpsertError } = await supabaseAdmin
      .from(TABLE_NAME)
      .upsert(fetchErrorPatches, { onConflict: 'id' })
    if (errorUpsertError) throw new Error(`Supabase metric error upsert failed: ${errorUpsertError.message}`)
  }

  const failed = patches.filter(patch => patch.metrics_sync_error).length
  const withFirstResponse = patches.filter(patch => patch.first_response_time_ms !== null && patch.first_response_time_ms !== undefined).length
  const snapshot = await persistDailyTicketSnapshotIfHistoryComplete()
  return {
    processed: patches.length,
    with_first_response: withFirstResponse,
    without_first_response: patches.length - withFirstResponse - failed,
    failed,
    snapshot,
  }
}

function metricPatch(
  id: string,
  payload: ZohoTicketMetrics,
  syncedAt: string,
  currentFcr: boolean | null,
): MetricPatch & { first_response_time_ms: number | null; first_contact_resolution: boolean | null } {
  const metrics = unwrapMetrics(payload)
  const firstResponseTime = parseDurationMs(metrics.firstResponseTime)
  const reopenCount = finiteNumber(metrics.reopenCount)
  return {
    id,
    first_response_time_ms: firstResponseTime,
    first_contact_resolution: reopenCount === null ? currentFcr : reopenCount === 0,
    metrics_synced_at: syncedAt,
    metrics_sync_error: metrics.firstResponseTime != null && firstResponseTime === null
      ? `Format firstResponseTime non reconnu: ${String(metrics.firstResponseTime).slice(0, 80)}`
      : null,
  }
}

function unwrapMetrics(payload: ZohoTicketMetrics): ZohoTicketMetrics {
  const data = payload.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as ZohoTicketMetrics
  }
  return payload
}

function parseDurationMs(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const numeric = finiteNumber(value)
  if (numeric !== null) return numeric >= 0 ? Math.round(numeric) : null
  if (typeof value !== 'string') return null

  const zohoHours = value.match(/^(\d+):(\d{2})\s+hrs$/i)
  if (zohoHours) {
    return ((Number(zohoHours[1]) * 60) + Number(zohoHours[2])) * 60_000
  }

  const clock = value.match(/^(\d+):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/)
  if (clock) {
    const milliseconds = Number((clock[4] ?? '').padEnd(3, '0'))
    return ((Number(clock[1]) * 60 * 60) + (Number(clock[2]) * 60) + Number(clock[3])) * 1_000 + milliseconds
  }

  const iso = value.match(/^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i)
  if (iso) {
    return Math.round(((Number(iso[1] ?? 0) * 60 * 60) + (Number(iso[2] ?? 0) * 60) + Number(iso[3] ?? 0)) * 1_000)
  }
  return null
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorResponse() {
  return NextResponse.json(
    {
      error: 'La synchronisation des temps de première réponse a échoué.',
      code: 'TICKET_FIRST_RESPONSE_SYNC_FAILED',
    },
    { status: 500 },
  )
}
