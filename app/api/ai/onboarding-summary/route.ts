import { NextRequest, NextResponse } from 'next/server'
import { canAccessRestrictedOps } from '@/lib/auth/access'
import { getSessionUserEmail } from '@/lib/auth/session'
import { getProjectTimeline } from '@/lib/onboarding/events'
import { getOnboardingProjectByIdOrZohoId } from '@/lib/onboarding/projects'
import { openai } from '@/lib/openai/client'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function isFresh(timestamp: string | null): boolean {
  if (!timestamp) return false
  return Date.now() - new Date(timestamp).getTime() < 24 * 60 * 60 * 1000
}

export async function POST(req: NextRequest) {
  const email = await getSessionUserEmail()
  if (!canAccessRestrictedOps(email)) {
    return NextResponse.json({ error: 'Accès restreint' }, { status: 403 })
  }

  const body = await req.json()
  const projectId = String(body.project_id ?? '')
  const force = body.force === true
  if (!projectId) return NextResponse.json({ error: 'project_id requis' }, { status: 400 })

  const project = await getOnboardingProjectByIdOrZohoId(projectId)
  if (!project) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })

  if (!force && project.executive_summary && isFresh(project.executive_summary_generated_at)) {
    return NextResponse.json({
      summary: project.executive_summary,
      generated_at: project.executive_summary_generated_at,
      cached: true,
    })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY non configurée' }, { status: 503 })
  }

  const events = (await getProjectTimeline(project.id)).slice(0, 20)
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 260,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: 'Tu rédiges des résumés exécutifs en français pour des projets onboarding D-EDGE. Réponds uniquement avec 3 phrases courtes.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          instruction: 'Rédige exactement 3 phrases. Format attendu: Le projet X est à Y%. [Dernière étape clé]. [Prochaine étape]. [Risque si présent].',
          project,
          events,
        }),
      },
    ],
  })

  const text = completion.choices[0]?.message?.content?.trim() ?? ''

  const generatedAt = new Date().toISOString()
  const { error } = await supabaseAdmin
    .from('onboarding_projects')
    .update({
      executive_summary: text,
      executive_summary_generated_at: generatedAt,
      updated_at: generatedAt,
    })
    .eq('id', project.id)

  if (error) throw new Error(error.message)

  return NextResponse.json({ summary: text, generated_at: generatedAt, cached: false })
}
