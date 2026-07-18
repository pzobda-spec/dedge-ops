import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import {
  acuityEnterpriseErrorDetails,
  fetchAcuityEnterpriseCatalog,
} from '@/lib/acuity/enterprise'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ['admin'])
    const catalog = await fetchAcuityEnterpriseCatalog()
    return NextResponse.json({ configured: true, ...catalog })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse

    const details = acuityEnterpriseErrorDetails(error)
    return NextResponse.json(
      {
        configured: details.code !== 'ACUITY_ENTERPRISE_NOT_CONFIGURED',
        code: details.code,
        error: details.message,
      },
      { status: details.status }
    )
  }
}
