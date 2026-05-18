import { NextRequest, NextResponse } from 'next/server'
import { openai } from '@/lib/openai/client'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { ticketId, subject, productArea, resolution, conversationSummary } = body

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are creating an internal knowledge base article from a resolved support ticket for a hospitality CRM.
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
Return only valid JSON, no markdown.`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          ticketId,
          subject,
          productArea,
          resolution,
          conversationSummary,
        }),
      },
    ],
    response_format: { type: 'json_object' },
  })

  const result = JSON.parse(completion.choices[0].message.content || '{}')
  return NextResponse.json(result)
}
