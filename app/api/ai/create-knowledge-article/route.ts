import { NextRequest, NextResponse } from 'next/server'
import { createJsonCompletion } from '@/lib/openai/json'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { ticketId, subject, productArea, resolution, conversationSummary, additionalInstructions } = body

  const systemPrompt = `You are creating an internal knowledge base article from a support ticket for a hospitality CRM.
Return a JSON object with:
- title: string
- productArea: string
- problem: string
- symptoms: string[]
- commonCauses: string[]
- checksToPerform: string[]
- resolution: string
- clientReplyTemplate: string
Language: French.
Return only valid JSON, no markdown.`

  const userContent: Record<string, unknown> = {
    ticketId,
    subject,
    productArea,
    resolution,
    conversationSummary,
  }
  if (additionalInstructions) {
    userContent.additionalInstructions = additionalInstructions
  }

  const result = await createJsonCompletion({ systemPrompt, userContent })
  return NextResponse.json(result)
}
