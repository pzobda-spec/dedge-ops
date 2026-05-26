import { NextRequest, NextResponse } from 'next/server'
import { createJsonCompletion } from '@/lib/openai/json'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { month, year, metrics, comparisonMetrics, topProducts, channelBreakdown } = body

  const result = await createJsonCompletion({
    systemPrompt: `You are preparing a monthly support analysis for an All Hands presentation at a hospitality CRM company.
Go beyond the numbers — explain what they mean operationally.
Return a JSON object with:
- executiveSummary: string (2-3 sentences)
- keyNumbers: { label: string, value: string, trend: string }[]
- attentionPoints: string[]
- operationalAnalysis: string (paragraph)
- allHandsMessage: string (what to say in the meeting — 4-5 sentences, confident tone)
Language: French.
Return only valid JSON, no markdown.`,
    userContent: {
      month,
      year,
      metrics,
      comparisonMetrics,
      topProducts,
      channelBreakdown,
    },
  })

  return NextResponse.json(result)
}
