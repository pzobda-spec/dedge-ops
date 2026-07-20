import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { logProjectEvent } from '@/lib/onboarding/events'
import { getOnboardingProjectByIdOrZohoId } from '@/lib/onboarding/projects'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type CapacityRow = { csm_name: string; csm_email: string | null; monthly_capacity_points: number }

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole(req, ['admin', 'onboarder'])
    const project = await getOnboardingProjectByIdOrZohoId(params.id)
    if (!project) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
    const body = await req.json().catch(() => ({})) as { accept_csm?: string }
    const { data: config, error: configError } = await supabaseAdmin.from('onboarding_projects')
      .select('customer_tier,customer_type,dmbook_only').eq('id', project.id).single()
    if (configError) throw configError
    if (!config.customer_tier || !config.customer_type) {
      return NextResponse.json({ error: 'Renseignez le tier client et le type Individuel/Groupe avant de suggérer un CSM.' }, { status: 400 })
    }
    const { data: rules, error: rulesError } = await supabaseAdmin.from('csm_assignment_rules').select('tier,customer_type,dmbook_only,points').eq('tier', config.customer_tier)
    if (rulesError) throw rulesError
    const rule = (rules ?? []).find(row =>
      (row.customer_type === config.customer_type || row.customer_type === '*') &&
      (row.dmbook_only === config.dmbook_only || (config.customer_tier !== 'Bronze' && row.dmbook_only === false)),
    )
    if (!rule) return NextResponse.json({ error: 'Aucune règle de points ne correspond à ce projet.' }, { status: 400 })
    const points = Number(rule.points)
    const rollingStart = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const { data: assignments, error: assignmentError } = await supabaseAdmin.from('onboarding_projects').select('csm_name,csm_assignment_points').gte('csm_assigned_at', rollingStart).not('csm_name', 'is', null)
    if (assignmentError) throw assignmentError
    const loads = new Map<string, number>()
    for (const row of assignments ?? []) loads.set(row.csm_name, (loads.get(row.csm_name) ?? 0) + Number(row.csm_assignment_points ?? 0))
    const { data: capacityRows, error: capacityError } = await supabaseAdmin.from('csm_capacity_rules').select('csm_name,csm_email,monthly_capacity_points').eq('active', true)
    if (capacityError) throw capacityError
    const candidates = ((capacityRows ?? []) as CapacityRow[]).map(row => {
      const used = loads.get(row.csm_name) ?? 0
      const capacity = Number(row.monthly_capacity_points)
      return { ...row, used_points: used, remaining_points: capacity - used, projected_points: used + points }
    }).filter(row => row.projected_points <= Number(row.monthly_capacity_points)).sort((a, b) => a.projected_points - b.projected_points || a.csm_name.localeCompare(b.csm_name, 'fr'))
    const suggestion = candidates[0] ?? null
    if (body.accept_csm) {
      const selected = candidates.find(row => row.csm_name === body.accept_csm)
      if (!selected) return NextResponse.json({ error: 'Ce CSM n’a pas assez de capacité ou n’est pas actif.' }, { status: 400 })
      const reason = `${config.customer_tier} ${config.customer_type}${config.dmbook_only ? ' · DmBook seul' : ''} — ${points} points`
      const { error } = await supabaseAdmin.from('onboarding_projects').update({ csm_name: selected.csm_name, csm_email: selected.csm_email, csm_assignment_points: points, csm_assignment_status: 'assigned', csm_assignment_reason: reason, csm_assigned_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', project.id)
      if (error) throw error
      await logProjectEvent({ project_id: project.id, event_type: 'note_added', event_label: `CSM attribué : ${selected.csm_name}`, actor_email: user.email, metadata: { csm_name: selected.csm_name, points, reason } })
      return NextResponse.json({ assigned: selected, points, reason })
    }
    return NextResponse.json({ points, rule, suggestion, candidates })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
