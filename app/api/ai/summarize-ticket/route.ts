import { NextRequest, NextResponse } from 'next/server'
import { createJsonCompletion } from '@/lib/openai/json'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { ticketId, subject, clientName, segment, productArea, conversationHistory, ageHours } = body

  const result = await createJsonCompletion({
    systemPrompt: `You are a senior SaaS support analyst for a hospitality CRM company.
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
    userContent: {
      ticketId,
      subject,
      clientName,
      segment,
      productArea,
      conversationHistory,
      ageHours,
    },
  })

  return NextResponse.json(result)
}
