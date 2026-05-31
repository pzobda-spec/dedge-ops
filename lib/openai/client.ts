import OpenAI from 'openai'
import { createHash } from 'crypto'

export const OPENAI_CHAT_MODEL = 'gpt-4o-mini'
const ALLOWED_OPENAI_CHAT_MODELS = new Set<string>([OPENAI_CHAT_MODEL])
const CHAT_COMPLETION_CACHE_TTL_MS = 15 * 60 * 1000

type ChatCompletionResult = Awaited<ReturnType<OpenAI['chat']['completions']['create']>>

let _openai: OpenAI | null = null
const chatCompletionCache = new Map<string, { expiresAt: number; value: Promise<ChatCompletionResult> }>()

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

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

function getChatCompletionCacheKey(input: unknown): string {
  return createHash('sha256').update(stableStringify(input)).digest('hex')
}

function pruneExpiredChatCompletionCache(now: number): void {
  for (const [key, entry] of chatCompletionCache.entries()) {
    if (entry.expiresAt <= now) chatCompletionCache.delete(key)
  }
}

// Keep backward compat export — lazily initialised
export const openai = {
  chat: {
    completions: {
      create: (...args: Parameters<OpenAI['chat']['completions']['create']>) => {
        const input = args[0]
        assertAllowedOpenAIChatModel(input?.model)

        if (input && 'stream' in input && input.stream) {
          return getOpenAIClient().chat.completions.create(...args)
        }

        const now = Date.now()
        pruneExpiredChatCompletionCache(now)
        const key = getChatCompletionCacheKey(input)
        const cached = chatCompletionCache.get(key)
        if (cached && cached.expiresAt > now) return cached.value

        const value = getOpenAIClient().chat.completions.create(...args) as Promise<ChatCompletionResult>
        chatCompletionCache.set(key, { expiresAt: now + CHAT_COMPLETION_CACHE_TTL_MS, value })
        value.catch(() => chatCompletionCache.delete(key))
        return value
      },
    },
  },
} as unknown as OpenAI
