import type { ProviderClient, RateLimitStatus } from '../types.js'

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 5 / 1_000_000, output: 15 / 1_000_000 },
  'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

function parseResetToDate(value: string | null): Date {
  if (!value) return new Date()
  const trimmed = value.trim()
  const date = new Date(trimmed)
  if (!Number.isNaN(date.getTime())) return date

  const match = trimmed.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/)
  if (!match) return new Date()
  const amount = Number(match[1])
  const unit = match[2]
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  }
  const offsetMs = amount * (multipliers[unit] ?? 0)
  return new Date(Date.now() + offsetMs)
}

export function createOpenAIClient(config: { apiKey: string; organization?: string; baseUrl?: string }): ProviderClient {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL

  return {
    provider: 'openai',

    async queryStatus(model: string): Promise<RateLimitStatus> {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          ...(config.organization ? { 'OpenAI-Organization': config.organization } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1,
          messages: [{ role: 'user', content: '.' }],
        }),
      })

      return this.parseHeaders(response.headers, model)
    },

    parseHeaders(headers: Headers | undefined, model?: string): RateLimitStatus {
      const now = new Date()
      const parseNumber = (value: string | null) => (value ? Number(value) : 0)

      const requestsLimit = parseNumber(headers?.get('x-ratelimit-limit-requests') ?? null)
      const requestsRemaining = parseNumber(headers?.get('x-ratelimit-remaining-requests') ?? null)
      const tokensLimit = parseNumber(headers?.get('x-ratelimit-limit-tokens') ?? null)
      const tokensRemaining = parseNumber(headers?.get('x-ratelimit-remaining-tokens') ?? null)

      return {
        provider: 'openai',
        model: model ?? 'unknown',
        requests: {
          limit: requestsLimit,
          remaining: requestsRemaining,
          resetsAt: parseResetToDate(headers?.get('x-ratelimit-reset-requests') ?? null),
        },
        inputTokens: {
          limit: tokensLimit,
          remaining: tokensRemaining,
          resetsAt: parseResetToDate(headers?.get('x-ratelimit-reset-tokens') ?? null),
        },
        outputTokens: {
          limit: 0,
          remaining: 0,
          resetsAt: now,
        },
        lastQueried: now,
        stale: false,
      }
    },

    estimateCost(model: string, tokens: { input: number; output: number }): { input: number; output: number; total: number } {
      const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['gpt-4o']
      const input = tokens.input * pricing.input
      const output = tokens.output * pricing.output
      return { input, output, total: input + output }
    },
  }
}
