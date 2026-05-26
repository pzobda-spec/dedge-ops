import { openai } from './client'

interface JsonCompletionInput {
  systemPrompt: string
  userContent: unknown
  model?: string
}

export async function createJsonCompletion<T = Record<string, unknown>>({
  systemPrompt,
  userContent,
  model = 'gpt-4o',
}: JsonCompletionInput): Promise<T> {
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(userContent) },
    ],
    response_format: { type: 'json_object' },
  })

  return JSON.parse(completion.choices[0].message.content || '{}') as T
}
