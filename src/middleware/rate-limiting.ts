import type { SmithersMiddleware } from './types.js'

interface TokenBucketOptions {
  requestsPerMinute: number
  tokensPerMinute?: number
}

class TokenBucket {
  private readonly requestCapacity: number
  private readonly tokenCapacity?: number
  private requestTokens: number
  private tokenTokens: number
  private lastRefill: number

  constructor(options: TokenBucketOptions) {
    this.requestCapacity = options.requestsPerMinute
    if (options.tokensPerMinute !== undefined) {
      this.tokenCapacity = options.tokensPerMinute
    }
    this.requestTokens = options.requestsPerMinute
    this.tokenTokens = options.tokensPerMinute ?? Infinity
    this.lastRefill = Date.now()
  }

  private refill() {
    const now = Date.now()
    const elapsedMinutes = (now - this.lastRefill) / 60000
    if (elapsedMinutes <= 0) return

    this.requestTokens = Math.min(
      this.requestCapacity,
      this.requestTokens + elapsedMinutes * this.requestCapacity
    )

    if (this.tokenCapacity !== undefined) {
      this.tokenTokens = Math.min(
        this.tokenCapacity,
        this.tokenTokens + elapsedMinutes * this.tokenCapacity
      )
    }

    this.lastRefill = now
  }

  async acquire(): Promise<void> {
    while (true) {
      this.refill()
      const hasRequestToken = this.requestTokens >= 1
      const hasTokenBudget = this.tokenCapacity === undefined || this.tokenTokens >= 0

      if (hasRequestToken && hasTokenBudget) {
        this.requestTokens -= 1
        return
      }

      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  consumeTokens(tokens: number) {
    if (this.tokenCapacity === undefined) return
    this.refill()
    this.tokenTokens -= tokens
  }
}

export function rateLimitingMiddleware(options: {
  requestsPerMinute: number
  tokensPerMinute?: number
}): SmithersMiddleware {
  const limiter = new TokenBucket(options)

  return {
    name: 'rate-limiting',
    wrapExecute: async (doExecute) => {
      await limiter.acquire()
      const result = await doExecute()
      const totalTokens = (result.tokensUsed?.input ?? 0) + (result.tokensUsed?.output ?? 0)
      limiter.consumeTokens(totalTokens)
      return result
    },
  }
}
