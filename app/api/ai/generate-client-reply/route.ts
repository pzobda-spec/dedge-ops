import { NextRequest, NextResponse } from 'next/server'
import { openai } from '@/lib/openai/client'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { ticketId, subject, clientName, segment, productArea, issueDescription, tone } = body

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are writing a professional customer support reply for a hospitality CRM company.
Rules:
- Be clear and concise
- Never overpromise or give ETAs unless certain
- Never blame the client
- If technical investigation is needed, say so clearly
- Keep a professional but human tone
- Match the language of the input (French or English)
Return a JSON object with:
- subject: string (email subject if needed)
- body: string (the full reply)
- tone: string (the tone used)
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
          tone,
        }),
      },
    ],
    response_format: { type: 'json_object' },
  })

  const result = JSON.parse(completion.choices[0].message.content || '{}')
  return NextResponse.json(result)
}
