import { NextRequest, NextResponse } from 'next/server'
import { openai } from '@/lib/openai/client'

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

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(userContent) },
    ],
    response_format: { type: 'json_object' },
  })

  const result = JSON.parse(completion.choices[0].message.content || '{}')
  return NextResponse.json(result)
}
