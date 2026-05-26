import { NextRequest, NextResponse } from 'next/server'
import { createJsonCompletion } from '@/lib/openai/json'

export const dynamic = 'force-dynamic'

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

  const result = await createJsonCompletion({
    systemPrompt: `You are preparing a technical escalation ticket for an engineering team.
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
    userContent: {
      ticketId,
      subject,
      clientName,
      segment,
      productArea,
      issueDescription,
      alreadyChecked,
      examples,
    },
  })

  return NextResponse.json(result)
}
