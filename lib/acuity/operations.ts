import 'server-only'

import { createHash } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase/server'

export type AcuityOperationAction = 'create_appointment_type' | 'offer_class_times'
export type AcuityOperationStatus = 'pending' | 'succeeded' | 'partial' | 'failed' | 'unknown'

interface StoredOperation {
  id: string
  action: AcuityOperationAction
  request_hash: string
  status: AcuityOperationStatus
  response_status: number | null
  response_body: Record<string, unknown> | null
}

export interface AcuityOperationReservation {
  id: string
  replay: null | {
    status: number
    body: Record<string, unknown>
  }
}

export class AcuityOperationError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'AcuityOperationError'
    this.status = status
    this.code = code
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => (
      `${JSON.stringify(key)}:${stableJson(record[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function requestHash(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get('idempotency-key')?.trim() ?? ''
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(key)) {
    throw new AcuityOperationError(
      400,
      'INVALID_IDEMPOTENCY_KEY',
      'Une clé Idempotency-Key valide est requise.'
    )
  }
  return key
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get('origin')
  if (!origin) {
    throw new AcuityOperationError(403, 'INVALID_ORIGIN', 'Origine de la requête manquante.')
  }

  const allowedOrigins = new Set<string>()
  try {
    allowedOrigins.add(new URL(request.url).origin)
  } catch {
    // The request URL is supplied by Next.js and should always be valid.
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    try {
      allowedOrigins.add(new URL(process.env.NEXT_PUBLIC_APP_URL).origin)
    } catch {
      // A malformed optional app URL must not widen the allowlist.
    }
  }

  let normalizedOrigin = ''
  try {
    normalizedOrigin = new URL(origin).origin
  } catch {
    throw new AcuityOperationError(403, 'INVALID_ORIGIN', 'Origine de la requête invalide.')
  }
  if (!allowedOrigins.has(normalizedOrigin)) {
    throw new AcuityOperationError(403, 'INVALID_ORIGIN', 'Origine de la requête refusée.')
  }
}

export async function reserveAcuityOperation(args: {
  idempotencyKey: string
  action: AcuityOperationAction
  payload: unknown
  actorEmail: string
}): Promise<AcuityOperationReservation> {
  const hash = requestHash(args.payload)
  const { data, error } = await supabaseAdmin
    .from('acuity_enterprise_operations')
    .insert({
      idempotency_key: args.idempotencyKey,
      action: args.action,
      request_hash: hash,
      actor_email: args.actorEmail,
      status: 'pending',
    })
    .select('id')
    .single()

  if (!error && data) return { id: data.id, replay: null }
  if (error?.code !== '23505') {
    throw new AcuityOperationError(
      503,
      'ACUITY_OPERATIONS_UNAVAILABLE',
      'Le journal sécurisé des publications Acuity n’est pas disponible.'
    )
  }

  const existingResult = await supabaseAdmin
    .from('acuity_enterprise_operations')
    .select('id, action, request_hash, status, response_status, response_body')
    .eq('idempotency_key', args.idempotencyKey)
    .single()
  if (existingResult.error || !existingResult.data) {
    throw new AcuityOperationError(
      503,
      'ACUITY_OPERATIONS_UNAVAILABLE',
      'Impossible de vérifier cette publication Acuity.'
    )
  }

  const existing = existingResult.data as StoredOperation
  if (existing.action !== args.action || existing.request_hash !== hash) {
    throw new AcuityOperationError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'Cette clé de publication a déjà été utilisée pour une autre opération.'
    )
  }
  if (existing.status === 'pending') {
    throw new AcuityOperationError(
      409,
      'OPERATION_IN_PROGRESS',
      'Cette publication est déjà en cours. Rechargez le catalogue dans quelques instants.'
    )
  }
  if (!existing.response_status || !existing.response_body) {
    throw new AcuityOperationError(
      409,
      'OPERATION_ALREADY_PROCESSED',
      'Cette publication a déjà été traitée. Rechargez le catalogue avant de recommencer.'
    )
  }

  return {
    id: existing.id,
    replay: {
      status: existing.response_status,
      body: { ...existing.response_body, replayed: true },
    },
  }
}

export async function completeAcuityOperation(args: {
  id: string
  status: Exclude<AcuityOperationStatus, 'pending'>
  responseStatus: number
  responseBody: Record<string, unknown>
  appointmentTypeId?: number
  classIds?: number[]
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('acuity_enterprise_operations')
      .update({
        status: args.status,
        response_status: args.responseStatus,
        response_body: args.responseBody,
        appointment_type_id: args.appointmentTypeId ?? null,
        class_ids: args.classIds ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', args.id)
    if (!error) return

    // Do not turn a successful upstream mutation into a retryable client error.
    // The still-pending reservation prevents the same idempotency key being replayed.
    console.error('Unable to complete Acuity operation audit', { operationId: args.id })
  } catch {
    console.error('Unable to reach Acuity operation audit store', { operationId: args.id })
  }
}
