import { NextRequest, NextResponse } from 'next/server'
import { openai } from '@/lib/openai/client'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    ticketId,
    subject,
    clientName,
    segment,
    productArea,
    issueDescription,
    alreadyChecked,
    examples,
  } = body

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are preparing a technical escalation ticket for an engineering team.
Be precise, factual and structured.
Return a JSON object with:
- title: string
- context: string
- clientImpact: string
- productModule: string
- expectedBehavior: string
- actualBehavior: string
- stepsAlreadyChecked: string[]
- clientExamples: string[]
- availableLogsOrIds: string
- missingInformation: string[]
- urgencyLevel: "critical" | "high" | "medium" | "low"
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
          issueDescription,
          alreadyChecked,
          examples,
        }),
      },
    ],
    response_format: { type: 'json_object' },
  })

  const result = JSON.parse(completion.choices[0].message.content || '{}')
  return NextResponse.json(result)
}
