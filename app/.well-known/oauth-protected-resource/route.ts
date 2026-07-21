import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from 'mcp-handler'

export const dynamic = 'force-dynamic'

const supabaseIssuer = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`
const handler = protectedResourceHandler({
  authServerUrls: [supabaseIssuer],
  resourceUrl: process.env.MCP_RESOURCE_URL,
})
const corsHandler = metadataCorsOptionsRequestHandler()

export { handler as GET, corsHandler as OPTIONS }
