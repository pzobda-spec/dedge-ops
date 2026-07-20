import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { logProjectEvent } from '@/lib/onboarding/events'
import { getOnboardingProjectByIdOrZohoId } from '@/lib/onboarding/projects'
import { enabledProductKeys, isCommercialPlan, isProjectProductKey, isProjectProductStatus } from '@/lib/onboarding/workspace'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole(req, ['admin', 'onboarder'])
    const project = await getOnboardingProjectByIdOrZohoId(params.id)
    if (!project) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    if (!isProjectProductKey(body.product_key) || !isProjectProductStatus(body.status)) {
      return NextResponse.json({ error: 'Produit ou statut invalide' }, { status: 400 })
    }
    const { data: config, error: configError } = await supabaseAdmin.from('onboarding_projects').select('commercial_plan,enabled_options').eq('id', project.id).single()
    if (configError) throw configError
    const plan = isCommercialPlan(config.commercial_plan) ? config.commercial_plan : null
    const options = (config.enabled_options ?? {}) as Record<string, boolean>
    if (!enabledProductKeys(plan, options).includes(body.product_key)) {
      return NextResponse.json({ error: 'Ce produit ou cette option n’est pas activé sur le projet' }, { status: 400 })
    }
    const comment = typeof body.comment === 'string' && body.comment.trim() ? body.comment.trim() : null
    const { data, error } = await supabaseAdmin.from('project_product_updates').upsert({
      project_id: project.id, product_key: body.product_key, status: body.status,
      comment, updated_by: user.email, updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id,product_key' }).select('*').single()
    if (error) throw error
    await logProjectEvent({ project_id: project.id, event_type: 'note_added', event_label: 'Avancement produit mis à jour', actor_email: user.email, metadata: { product_key: body.product_key, status: body.status, comment } })
    return NextResponse.json({ product: data })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
