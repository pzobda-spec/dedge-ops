import { revalidateTag } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import {
  acuityEnterpriseErrorDetails,
  offerAcuityClassTimes,
  isAcuityEnterpriseOutcomeUnknown,
  validateOfferClassTimesInput,
} from '@/lib/acuity/enterprise'
import {
  AcuityOperationError,
  completeAcuityOperation,
  requireIdempotencyKey,
  requireSameOrigin,
  reserveAcuityOperation,
} from '@/lib/acuity/operations'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let operationId: string | null = null
  try {
    const user = await requireRole(req, ['admin'])
    requireSameOrigin(req)
    const body: unknown = await req.json().catch(() => null)
    const input = validateOfferClassTimesInput(body)
    const reservation = await reserveAcuityOperation({
      idempotencyKey: requireIdempotencyKey(req),
      action: 'offer_class_times',
      payload: input,
      actorEmail: user.email,
    })
    if (reservation.replay) {
      return NextResponse.json(reservation.replay.body, { status: reservation.replay.status })
    }
    operationId = reservation.id

    const result = await offerAcuityClassTimes(input)
    const fullyPublished = result.fullyMatched
    const visibilityReady = !input.makePublic || result.visibilityUpdated
    const partial = !fullyPublished || !visibilityReady
    const uncertain = (
      result.times.length > result.matchedSlots ||
      (result.errors.length === 0 && result.matchedSlots < input.dates.length)
    )
    if (uncertain) {
      result.warnings.push(
        'La réponse Acuity ne permet pas de confirmer toutes les dates. Rechargez les sessions avant toute nouvelle tentative.'
      )
    }
    const responseStatus = partial ? (result.matchedSlots > 0 ? 207 : 422) : 201
    const responseBody: Record<string, unknown> = {
      published: result.matchedSlots,
      requested: input.dates.length,
      partial,
      uncertain,
      ...result,
    }

    await completeAcuityOperation({
      id: operationId,
      status: uncertain ? 'unknown' : partial ? 'partial' : 'succeeded',
      responseStatus,
      responseBody,
      appointmentTypeId: input.appointmentTypeID,
      classIds: result.times
        .map(time => Number(time.id))
        .filter(id => Number.isSafeInteger(id) && id > 0),
    })
    try {
      revalidateTag('acuity-sessions')
    } catch {
      console.error('Unable to revalidate Acuity sessions after publication', {
        operationId,
      })
    }
    console.info('Acuity Enterprise class times offered', {
      actor: user.email,
      appointmentTypeId: input.appointmentTypeID,
      calendarId: input.calendarID,
      dates: input.dates.length,
      createdTimes: result.times.length,
      errors: result.errors.length,
      warnings: result.warnings.length,
    })

    return NextResponse.json(responseBody, { status: responseStatus })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse

    const details = error instanceof AcuityOperationError
      ? { status: error.status, code: error.code, message: error.message }
      : acuityEnterpriseErrorDetails(error)
    const uncertain = isAcuityEnterpriseOutcomeUnknown(error)
    const responseBody = {
      code: details.code,
      error: uncertain
        ? `${details.message} L’issue est incertaine : rechargez les sessions avant toute nouvelle tentative.`
        : details.message,
      uncertain,
    }
    if (operationId) {
      await completeAcuityOperation({
        id: operationId,
        status: uncertain ? 'unknown' : 'failed',
        responseStatus: details.status,
        responseBody,
      })
    }
    return NextResponse.json(responseBody, { status: details.status })
  }
}
