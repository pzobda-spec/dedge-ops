import { NextRequest, NextResponse } from 'next/server'
import { openai } from '@/lib/openai/client'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { month, year, metrics, comparisonMetrics, topProducts, channelBreakdown } = body

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are preparing a monthly support analysis for an All Hands presentation at a hospitality CRM company.
Go beyond the numbers — explain what they mean operationally.
Return a JSON object with:
- executiveSummary: string (2-3 sentences)
- keyNumbers: { label: string, value: string, trend: string }[]
- attentionPoints: string[]
- operationalAnalysis: string (paragraph)
- allHandsMessage: string (what to say in the meeting — 4-5 sentences, confident tone)
Language: French.
Return only valid JSON, no markdown.`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          month,
          year,
          metrics,
          comparisonMetrics,
          topProducts,
          channelBreakdown,
        }),
      },
    ],
    response_format: { type: 'json_object' },
  })

  const result = JSON.parse(completion.choices[0].message.content || '{}')
  return NextResponse.json(result)
}
