import OpenAI from 'openai'

let _openai: OpenAI | null = null

export function getOpenAIClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'placeholder',
    })
  }
  return _openai
}

// Keep backward compat export — lazily initialised
export const openai = {
  chat: {
    completions: {
      create: (...args: Parameters<OpenAI['chat']['completions']['create']>) =>
        getOpenAIClient().chat.completions.create(...args),
    },
  },
} as unknown as OpenAI
