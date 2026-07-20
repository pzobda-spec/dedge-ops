import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { logProjectEvent } from '@/lib/onboarding/events'
import { getOnboardingProjectByIdOrZohoId } from '@/lib/onboarding/projects'
import { enabledProductKeys, isCommercialPlan, OPTION_KEYS } from '@/lib/onboarding/workspace'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireRole(req, ['admin', 'onboarder', 'support', 'commercial_readonly'])
    const project = await getOnboardingProjectByIdOrZohoId(params.id)
    if (!project) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
    const { data: workspace, error } = await supabaseAdmin.from('onboarding_projects')
      .select('commercial_plan,customer_tier,customer_type,dmbook_only,enabled_options,csm_name,csm_email,csm_assignment_status,csm_assignment_points,csm_assignment_reason')
      .eq('id', project.id).single()
    if (error) throw error
    const { data: products, error: productsError } = await supabaseAdmin.from('project_product_updates').select('*').eq('project_id', project.id).order('product_key')
    if (productsError) throw productsError
    return NextResponse.json({ workspace, products: products ?? [] })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole(req, ['admin', 'onboarder'])
    const project = await getOnboardingProjectByIdOrZohoId(params.id)
    if (!project) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const commercialPlan = body.commercial_plan
    if (!isCommercialPlan(commercialPlan)) return NextResponse.json({ error: 'Plan commercial invalide' }, { status: 400 })
    const requestedOptions = typeof body.enabled_options === 'object' && body.enabled_options !== null ? body.enabled_options as Record<string, unknown> : {}
    const enabledOptions = Object.fromEntries(OPTION_KEYS.map(key => [key, requestedOptions[key] === true]))
    const update = {
      commercial_plan: commercialPlan,
      customer_tier: typeof body.customer_tier === 'string' ? body.customer_tier : null,
      customer_type: typeof body.customer_type === 'string' ? body.customer_type : null,
      dmbook_only: body.dmbook_only === true,
      enabled_options: enabledOptions,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabaseAdmin.from('onboarding_projects').update(update).eq('id', project.id)
    if (error) throw error
    await logProjectEvent({ project_id: project.id, event_type: 'note_added', event_label: 'Configuration projet mise à jour', actor_email: user.email, metadata: { ...update, enabled_products: enabledProductKeys(commercialPlan, enabledOptions) } })
    return NextResponse.json({ workspace: update })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
