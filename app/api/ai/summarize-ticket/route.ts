import { NextRequest, NextResponse } from 'next/server'
import { openai } from '@/lib/openai/client'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { ticketId, subject, clientName, segment, productArea, conversationHistory, ageHours } = body

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a senior SaaS support analyst for a hospitality CRM company.
Summarize the support ticket clearly and concisely.
Return a JSON object with these fields:
- clientIssue: string
- productArea: string
- context: string
- alreadyChecked: string[]
- currentBlocker: string
- recommendedAction: string
- missingInformation: string[]
Respond in the same language as the ticket (French or English).
Return only valid JSON, no markdown.`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          ticketId,
          subject,
          clientName,
          segment,
          productArea,
          conversationHistory,
          ageHours,
        }),
      },
    ],
    response_format: { type: 'json_object' },
  })

  const result = JSON.parse(completion.choices[0].message.content || '{}')
  return NextResponse.json(result)
}
