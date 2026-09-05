import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { isAvailability, isObRole } from '@/lib/onboarding/capacityModel'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ['admin', 'onboarder'])

    const body = await req.json().catch(() => ({})) as Record<string, unknown>

    const kind = body.kind
    if (kind !== 'ob' && kind !== 'csm') {
      return NextResponse.json({ error: 'kind doit valoir "ob" ou "csm".' }, { status: 400 })
    }

    const name = body.name
    if (typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'name est obligatoire.' }, { status: 400 })
    }

    const availability = body.availability
    if (!isAvailability(availability)) {
      return NextResponse.json({ error: 'availability invalide.' }, { status: 400 })
    }

    if (kind === 'ob') {
      const role = body.role
      if (!isObRole(role)) {
        return NextResponse.json({ error: 'role invalide.' }, { status: 400 })
      }

      const maxProjects = body.max_projects
      if (typeof maxProjects !== 'number' || !Number.isInteger(maxProjects) || maxProjects < 0) {
        return NextResponse.json(
          { error: 'max_projects doit être un entier positif ou nul.' },
          { status: 400 },
        )
      }

      const { data, error } = await supabaseAdmin
        .from('ob_capacity_rules')
        .update({
          role,
          max_projects: maxProjects,
          availability,
          updated_at: new Date().toISOString(),
        })
        .eq('owner', name)
        .select()

      if (error) throw error
      if (!data || data.length === 0) {
        return NextResponse.json({ error: 'Membre OB introuvable.' }, { status: 404 })
      }

      return NextResponse.json({ member: data[0] }, { status: 200 })
    }

    const monthlyCapacityPoints = body.monthly_capacity_points
    if (typeof monthlyCapacityPoints !== 'number' || !Number.isFinite(monthlyCapacityPoints) || monthlyCapacityPoints < 0) {
      return NextResponse.json(
        { error: 'monthly_capacity_points doit être un nombre positif ou nul.' },
        { status: 400 },
      )
    }

    // `active` est conservée pour compatibilité : elle est encore filtrée par
    // app/api/onboarding/projects/[id]/csm-suggestion/route.ts. La source de
    // vérité du plan de charge est `availability`.
    const active = availability === 'full' || availability === 'relache'

    const { data, error } = await supabaseAdmin
      .from('csm_capacity_rules')
      .update({
        monthly_capacity_points: monthlyCapacityPoints,
        availability,
        active,
        updated_at: new Date().toISOString(),
      })
      .eq('csm_name', name)
      .select()

    if (error) throw error
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Membre CSM introuvable.' }, { status: 404 })
    }

    return NextResponse.json({ member: data[0] }, { status: 200 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
