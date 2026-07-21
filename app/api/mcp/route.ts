import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { z } from 'zod'
import { MCP_READ_SCOPE, requireMcpActor, verifyMcpToken } from '@/lib/mcp/auth'
import {
  applyMeetingOutcome,
  getMcpProjectContext,
  meetingOutcomeSchema,
  previewMeetingOutcome,
  searchMcpProjects,
} from '@/lib/mcp/onboarding'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function result(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

function toolError(error: unknown) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
  }
}

const handler = createMcpHandler(
  server => {
    server.registerTool(
      'search_projects',
      {
        title: 'Rechercher des projets Onboarding',
        description: 'Recherche les projets D-EDGE Ops par hôtel, identifiant Zoho ou chargé de projet. À utiliser avant toute écriture si le projet n’est pas identifié sans ambiguïté.',
        inputSchema: {
          query: z.string().trim().min(1).max(300),
          limit: z.number().int().min(1).max(20).default(10),
        },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async ({ query, limit }, extra) => {
        try {
          requireMcpActor(extra)
          return result({ projects: await searchMcpProjects(query, limit) })
        } catch (error) { return toolError(error) }
      },
    )

    server.registerTool(
      'get_project_context',
      {
        title: 'Lire le contexte complet d’un projet',
        description: 'Retourne le cockpit, les produits, décisions, actions, événements de timeline et rendez-vous Google Calendar déjà liés au projet.',
        inputSchema: { project: z.string().trim().min(1).max(500) },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async ({ project }, extra) => {
        try {
          requireMcpActor(extra)
          return result(await getMcpProjectContext(project))
        } catch (error) { return toolError(error) }
      },
    )

    server.registerTool(
      'preview_meeting_outcome',
      {
        title: 'Prévisualiser un compte rendu de rendez-vous',
        description: 'Résout le projet et prévisualise sans écrire une note de rendez-vous, ses décisions, actions, mises à jour produit et son lien Calendar. Retourne un jeton valable 15 minutes requis pour appliquer exactement ces changements.',
        inputSchema: {
          project: z.string().trim().min(1).max(500),
          ...meetingOutcomeSchema.shape,
        },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async ({ project, ...outcome }, extra) => {
        try {
          const actor = requireMcpActor(extra, true)
          return result(await previewMeetingOutcome(project, outcome, actor.email))
        } catch (error) { return toolError(error) }
      },
    )

    server.registerTool(
      'record_meeting_outcome',
      {
        title: 'Enregistrer un compte rendu de rendez-vous',
        description: 'Applique atomiquement la prévisualisation précédemment confirmée. Ne jamais appeler sans montrer la prévisualisation à l’utilisateur et obtenir son accord explicite.',
        inputSchema: {
          project_id: z.string().trim().min(1).max(500),
          confirmation_token: z.string().trim().min(20),
          ...meetingOutcomeSchema.shape,
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async ({ project_id, confirmation_token, ...outcome }, extra) => {
        try {
          const actor = requireMcpActor(extra, true)
          return result(await applyMeetingOutcome(project_id, outcome, confirmation_token, actor.email))
        } catch (error) { return toolError(error) }
      },
    )
  },
  { serverInfo: { name: 'dedge-ops-onboarding', version: '0.1.0' } },
  { basePath: '/api', maxDuration: 60, disableSse: true },
)

const authenticatedHandler = withMcpAuth(handler, verifyMcpToken, {
  required: true,
  requiredScopes: [MCP_READ_SCOPE],
  resourceMetadataPath: '/.well-known/oauth-protected-resource',
  resourceUrl: process.env.MCP_RESOURCE_URL,
})

export { authenticatedHandler as GET, authenticatedHandler as POST, authenticatedHandler as DELETE }
