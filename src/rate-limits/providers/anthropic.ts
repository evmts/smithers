import Anthropic from '@anthropic-ai/sdk'
import type { ProviderClient, RateLimitStatus } from '../types.js'

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
  'claude-sonnet-4': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  'claude-haiku-3-5': { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
}

const FALLBACK_MODEL = 'claude-haiku-3-5'

export function createAnthropicClient(config: { apiKey: string; baseUrl?: string }): ProviderClient {
  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  })

  return {
    provider: 'anthropic',

    async queryStatus(model: string): Promise<RateLimitStatus> {
      const response = await client.messages.create({
        model: FALLBACK_MODEL,
        max_tokens: 1,
        messages: [{ role: 'user', content: '.' }],
      })

      const headers = (response as { _response?: { headers?: Headers } })._response?.headers
      return this.parseHeaders(headers, model)
    },

    parseHeaders(headers: Headers | undefined, model?: string): RateLimitStatus {
      const now = new Date()
      const parseDate = (value: string | null) => (value ? new Date(value) : now)
      const parseNumber = (value: string | null) => (value ? Number(value) : 0)

      return {
        provider: 'anthropic',
        model: model ?? 'unknown',
        requests: {
          limit: parseNumber(headers?.get('anthropic-ratelimit-requests-limit') ?? null),
          remaining: parseNumber(headers?.get('anthropic-ratelimit-requests-remaining') ?? null),
          resetsAt: parseDate(headers?.get('anthropic-ratelimit-requests-reset') ?? null),
        },
        inputTokens: {
          limit: parseNumber(headers?.get('anthropic-ratelimit-input-tokens-limit') ?? null),
          remaining: parseNumber(headers?.get('anthropic-ratelimit-input-tokens-remaining') ?? null),
          resetsAt: parseDate(headers?.get('anthropic-ratelimit-input-tokens-reset') ?? null),
        },
        outputTokens: {
          limit: parseNumber(headers?.get('anthropic-ratelimit-output-tokens-limit') ?? null),
          remaining: parseNumber(headers?.get('anthropic-ratelimit-output-tokens-remaining') ?? null),
          resetsAt: parseDate(headers?.get('anthropic-ratelimit-output-tokens-reset') ?? null),
        },
        lastQueried: now,
        stale: false,
      }
    },

    estimateCost(model: string, tokens: { input: number; output: number }): { input: number; output: number; total: number } {
      const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['claude-sonnet-4']!
      const input = tokens.input * pricing.input
      const output = tokens.output * pricing.output
      return { input, output, total: input + output }
    },
  }
}
