import type { AgentResult } from '../components/agents/types.js'
import type { SmithersMiddleware } from './types.js'

export interface RateLimitingOptions {
  requestsPerMinute: number
  tokensPerMinute?: number
}

class TokenBucket {
  private readonly capacity: number
  private readonly refillRatePerMs: number
  private tokens: number
  private lastRefillMs: number
  private queue: Promise<void>

  constructor(tokensPerMinute: number) {
    if (tokensPerMinute <= 0) {
      throw new Error('TokenBucket requires tokensPerMinute > 0')
    }
    this.capacity = tokensPerMinute
    this.refillRatePerMs = tokensPerMinute / 60000
    this.tokens = tokensPerMinute
    this.lastRefillMs = Date.now()
    this.queue = Promise.resolve()
  }

  consume(count: number): Promise<void> {
    this.queue = this.queue.then(() => this.consumeInternal(count))
    return this.queue
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefillMs
    if (elapsed <= 0) return
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRatePerMs)
    this.lastRefillMs = now
  }

  private async consumeInternal(count: number): Promise<void> {
    const needed = Math.min(count, this.capacity)
    while (true) {
      this.refill()
      if (this.tokens >= needed) {
        this.tokens -= needed
        return
      }
      const deficit = needed - this.tokens
      const waitMs = Math.ceil(deficit / this.refillRatePerMs)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  }
}

function totalTokensUsed(result: AgentResult): number {
  return (result.tokensUsed?.input ?? 0) + (result.tokensUsed?.output ?? 0)
}

export function rateLimitingMiddleware(options: RateLimitingOptions): SmithersMiddleware {
  const requestBucket = new TokenBucket(options.requestsPerMinute)
  const tokenBucket = options.tokensPerMinute ? new TokenBucket(options.tokensPerMinute) : null

  return {
    name: 'rate-limiting',
    wrapExecute: async ({ doExecute }) => {
      await requestBucket.consume(1)
      const result = await doExecute()
      if (tokenBucket) {
        const tokens = totalTokensUsed(result)
        if (tokens > 0) {
          await tokenBucket.consume(tokens)
        }
      }
      return result
    },
  }
}
