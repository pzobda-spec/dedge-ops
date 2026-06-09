import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { getProjectTimeline } from '@/lib/onboarding/events'
import {
  getOnboardingProjectByIdOrZohoId,
  type ProjectStatusReport,
} from '@/lib/onboarding/projects'
import { createJsonCompletion } from '@/lib/openai/json'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getTodoistCommentsForZohoProject } from '@/lib/todoist/projectComments'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface RequestBody {
  project_id?: unknown
  force?: unknown
}

interface GeneratedReport {
  tldr?: unknown
  current_status?: unknown
  key_updates?: unknown
  risks?: unknown
  next_steps?: unknown
}

function isFresh(timestamp: string | null): boolean {
  if (!timestamp) return false
  return Date.now() - new Date(timestamp).getTime() < 4 * 60 * 60 * 1000
}

function stringList(value: unknown, maximumItems: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim())
    .slice(0, maximumItems)
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Rapport OpenAI invalide: ${field} manquant`)
  }
  return value.trim()
}

function parseReport(value: GeneratedReport, sourceCommentCount: number): ProjectStatusReport {
  return {
    tldr: requiredText(value.tldr, 'tldr'),
    current_status: requiredText(value.current_status, 'current_status'),
    key_updates: stringList(value.key_updates, 6),
    risks: stringList(value.risks, 5),
    next_steps: stringList(value.next_steps, 6),
    source_comment_count: sourceCommentCount,
  }
}

function compactCommentContent(content: string): string {
  return content.length > 1_200 ? `${content.slice(0, 1_200)}…` : content
}

function getErrorStatus(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: unknown }).status
    if (typeof status === 'number' && status >= 400 && status < 500) return 503
  }
  return 500
}

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ['admin', 'onboarder', 'support'])
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide ou manquant' }, { status: 400 })
  }

  const projectId = String(body.project_id ?? '')
  const force = body.force === true
  if (!projectId) return NextResponse.json({ error: 'project_id requis' }, { status: 400 })

  try {
    const project = await getOnboardingProjectByIdOrZohoId(projectId)
    if (!project) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })

    if (!force && project.status_report && isFresh(project.status_report_generated_at)) {
      return NextResponse.json({
        report: project.status_report,
        generated_at: project.status_report_generated_at,
        cached: true,
      })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY non configurée' }, { status: 503 })
    }

    const zohoProjectId = project.zoho_project_id ?? project.id
    const [events, allComments] = await Promise.all([
      getProjectTimeline(project.id),
      getTodoistCommentsForZohoProject(zohoProjectId),
    ])
    const comments = allComments.slice(0, 150).map(comment => ({
      task: comment.task_name,
      author: comment.author ?? 'Todoist',
      posted_at: comment.posted_at,
      content: compactCommentContent(comment.content),
    }))

    const generated = await createJsonCompletion<GeneratedReport>({
      systemPrompt: [
        'Tu es un directeur de projet onboarding hôtelier D-EDGE.',
        'Analyse les données structurées du projet, sa timeline et les notes Todoist.',
        'Réponds en français avec un JSON strict contenant exactement:',
        'tldr (string, 2 phrases maximum), current_status (string),',
        'key_updates (string[]), risks (string[]), next_steps (string[]).',
        'Les prochaines étapes doivent être concrètes et actionnables.',
        'N’invente aucune information. Si un risque ou une étape n’est pas documenté, indique-le clairement.',
      ].join(' '),
      userContent: {
        instruction: 'Produis un état des lieux opérationnel à date, en privilégiant les informations les plus récentes.',
        project: {
          hotel_name: project.hotel_name,
          product: project.product,
          owner: project.owner,
          zoho_status: project.zoho_status,
          start_date: project.start_date,
          target_go_live: project.target_go_live,
          actual_go_live: project.actual_go_live,
          executive_summary: project.executive_summary,
          last_synced_at: project.last_synced_at,
        },
        recent_events: events.slice(0, 30),
        todoist_comments: comments,
        source_comment_count: allComments.length,
      },
    })

    const report = parseReport(generated, allComments.length)
    const generatedAt = new Date().toISOString()
    const { error } = await supabaseAdmin
      .from('onboarding_projects')
      .update({
        status_report: report,
        status_report_generated_at: generatedAt,
        updated_at: generatedAt,
      })
      .eq('id', project.id)

    if (error) throw new Error(error.message)

    return NextResponse.json({
      report,
      generated_at: generatedAt,
      cached: false,
    })
  } catch (error) {
    console.error('[ai/project-status-report] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Impossible de générer l’état des lieux' },
      { status: getErrorStatus(error) },
    )
  }
}
