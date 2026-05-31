import OpenAI from 'openai'

export const OPENAI_CHAT_MODEL = 'gpt-4o-mini'
const ALLOWED_OPENAI_CHAT_MODELS = new Set<string>([OPENAI_CHAT_MODEL])

let _openai: OpenAI | null = null

export function assertAllowedOpenAIChatModel(model: unknown): void {
  if (typeof model !== 'string' || !ALLOWED_OPENAI_CHAT_MODELS.has(model)) {
    throw new Error(`OpenAI chat model not allowed: ${String(model)}. Use ${OPENAI_CHAT_MODEL}.`)
  }
}

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
      create: (...args: Parameters<OpenAI['chat']['completions']['create']>) => {
        assertAllowedOpenAIChatModel(args[0]?.model)
        return getOpenAIClient().chat.completions.create(...args)
      },
    },
  },
} as unknown as OpenAI
