import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import {
  acuityEnterpriseErrorDetails,
  createAcuityClassAppointmentType,
  isAcuityEnterpriseOutcomeUnknown,
  validateCreateClassAppointmentTypeInput,
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
    const input = validateCreateClassAppointmentTypeInput(body)
    const reservation = await reserveAcuityOperation({
      idempotencyKey: requireIdempotencyKey(req),
      action: 'create_appointment_type',
      payload: input,
      actorEmail: user.email,
    })
    if (reservation.replay) {
      return NextResponse.json(reservation.replay.body, { status: reservation.replay.status })
    }
    operationId = reservation.id

    const appointmentType = await createAcuityClassAppointmentType(input)
    const responseBody: Record<string, unknown> = { appointmentType }
    await completeAcuityOperation({
      id: operationId,
      status: 'succeeded',
      responseStatus: 201,
      responseBody,
      appointmentTypeId: appointmentType.id,
    })

    console.info('Acuity Enterprise appointment type created', {
      actor: user.email,
      appointmentTypeId: appointmentType.id,
    })

    return NextResponse.json(responseBody, { status: 201 })
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
        ? `${details.message} L’issue est incertaine : rechargez le catalogue avant toute nouvelle tentative.`
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
