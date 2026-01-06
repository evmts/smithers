import type { RateLimitConfig, TokenBucketState, TokenEstimate } from './types.js'

/**
 * Rate limit error with retry information
 */
export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs: number,
    public readonly limitType: 'rpm' | 'itpm' | 'otpm' | 'queue_full' | 'timeout'
  ) {
    super(message)
    this.name = 'RateLimitError'
  }
}

interface QueuedRequest {
  resolve: () => void
  reject: (error: Error) => void
  inputTokens: number
  outputTokens: number
  enqueuedAt: number
}

interface Bucket {
  tokens: number
  lastRefill: number
}

/**
 * Token bucket rate limiter implementing Anthropic's rate limit model
 *
 * Uses continuous token replenishment (not discrete windows).
 * Tokens replenish smoothly over time based on the per-minute rate.
 *
 * @example
 * ```ts
 * const limiter = new TokenBucketRateLimiter({ rpm: 60, itpm: 100000 })
 *
 * // Acquire permission before making a request
 * await limiter.acquire({ inputTokens: 5000, outputTokens: 1000 })
 *
 * // Make API call...
 * ```
 */
export class TokenBucketRateLimiter {
  private config: Required<RateLimitConfig>
  private buckets: {
    rpm: Bucket
    itpm: Bucket
    otpm: Bucket
  }
  private queue: QueuedRequest[] = []
  private processingQueue = false

  constructor(config: RateLimitConfig = {}) {
    // Default to Anthropic Tier 1 limits if not specified
    this.config = {
      rpm: config.rpm ?? 60,
      itpm: config.itpm ?? 100000,
      otpm: config.otpm ?? 20000,
      queueWhenLimited: config.queueWhenLimited ?? true,
      maxQueueSize: config.maxQueueSize ?? 100,
      queueTimeoutMs: config.queueTimeoutMs ?? 60000,
    }

    // Initialize buckets at full capacity
    const now = Date.now()
    this.buckets = {
      rpm: { tokens: this.config.rpm, lastRefill: now },
      itpm: { tokens: this.config.itpm, lastRefill: now },
      otpm: { tokens: this.config.otpm, lastRefill: now },
    }
  }

  /**
   * Refill tokens based on elapsed time
   * Uses continuous replenishment: tokens/minute / 60000 * elapsedMs
   */
  private refillBucket(bucket: Bucket, capacity: number): void {
    const now = Date.now()
    const elapsed = now - bucket.lastRefill
    const tokensToAdd = (capacity / 60000) * elapsed
    bucket.tokens = Math.min(capacity, bucket.tokens + tokensToAdd)
    bucket.lastRefill = now
  }

  /**
   * Calculate wait time needed for a bucket to have enough tokens
   */
  private calculateWaitTime(
    bucket: Bucket,
    needed: number,
    perMinuteRate: number
  ): number {
    this.refillBucket(bucket, perMinuteRate)
    if (bucket.tokens >= needed) return 0

    const deficit = needed - bucket.tokens
    const msPerToken = 60000 / perMinuteRate
    return Math.ceil(deficit * msPerToken)
  }

  /**
   * Attempt to acquire rate limit permission
   * Returns immediately if tokens available, otherwise queues or rejects
   *
   * @param estimate - Estimated token usage for the request
   * @throws RateLimitError if rate limited and queueWhenLimited is false
   */
  async acquire(estimate: TokenEstimate): Promise<void> {
    const inputTokens = estimate.inputTokens ?? 1000 // Estimate if not provided
    const outputTokens = estimate.outputTokens ?? 500

    // Check all buckets
    const rpmWait = this.calculateWaitTime(this.buckets.rpm, 1, this.config.rpm)
    const itpmWait = this.calculateWaitTime(
      this.buckets.itpm,
      inputTokens,
      this.config.itpm
    )
    const otpmWait = this.calculateWaitTime(
      this.buckets.otpm,
      outputTokens,
      this.config.otpm
    )

    const maxWait = Math.max(rpmWait, itpmWait, otpmWait)

    if (maxWait === 0) {
      // Tokens available, consume and proceed
      this.buckets.rpm.tokens -= 1
      this.buckets.itpm.tokens -= inputTokens
      this.buckets.otpm.tokens -= outputTokens
      return
    }

    // Need to wait
    if (!this.config.queueWhenLimited) {
      const limitType =
        rpmWait >= itpmWait && rpmWait >= otpmWait
          ? 'rpm'
          : itpmWait >= otpmWait
            ? 'itpm'
            : 'otpm'
      throw new RateLimitError(
        `Rate limit exceeded for ${limitType}. Wait ${maxWait}ms.`,
        maxWait,
        limitType
      )
    }

    // Queue the request
    if (this.queue.length >= this.config.maxQueueSize) {
      throw new RateLimitError('Rate limit queue full', maxWait, 'queue_full')
    }

    return new Promise((resolve, reject) => {
      this.queue.push({
        resolve,
        reject,
        inputTokens,
        outputTokens,
        enqueuedAt: Date.now(),
      })
      this.processQueue()
    })
  }

  /**
   * Process queued requests as tokens become available
   */
  private async processQueue(): Promise<void> {
    if (this.processingQueue || this.queue.length === 0) return
    this.processingQueue = true

    while (this.queue.length > 0) {
      const next = this.queue[0]

      // Check for timeout
      const waitedMs = Date.now() - next.enqueuedAt
      if (waitedMs > this.config.queueTimeoutMs) {
        this.queue.shift()
        next.reject(
          new RateLimitError(
            `Rate limit queue timeout after ${waitedMs}ms`,
            0,
            'timeout'
          )
        )
        continue
      }

      // Calculate wait time
      const rpmWait = this.calculateWaitTime(this.buckets.rpm, 1, this.config.rpm)
      const itpmWait = this.calculateWaitTime(
        this.buckets.itpm,
        next.inputTokens,
        this.config.itpm
      )
      const otpmWait = this.calculateWaitTime(
        this.buckets.otpm,
        next.outputTokens,
        this.config.otpm
      )
      const maxWait = Math.max(rpmWait, itpmWait, otpmWait)

      if (maxWait > 0) {
        // Wait for tokens to replenish (poll every 100ms max)
        await new Promise((r) => setTimeout(r, Math.min(maxWait, 100)))
        continue
      }

      // Tokens available - consume and resolve
      this.queue.shift()
      this.buckets.rpm.tokens -= 1
      this.buckets.itpm.tokens -= next.inputTokens
      this.buckets.otpm.tokens -= next.outputTokens
      next.resolve()
    }

    this.processingQueue = false
  }

  /**
   * Get current bucket state (for monitoring)
   */
  getState(): TokenBucketState {
    // Refill all buckets before returning state
    this.refillBucket(this.buckets.rpm, this.config.rpm)
    this.refillBucket(this.buckets.itpm, this.config.itpm)
    this.refillBucket(this.buckets.otpm, this.config.otpm)

    return {
      rpm: { ...this.buckets.rpm },
      itpm: { ...this.buckets.itpm },
      otpm: { ...this.buckets.otpm },
    }
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.queue.length
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<RateLimitConfig> {
    return { ...this.config }
  }

  /**
   * Update configuration (e.g., if user's tier changes)
   */
  updateConfig(newConfig: Partial<RateLimitConfig>): void {
    if (newConfig.rpm !== undefined) {
      this.config.rpm = newConfig.rpm
      // Don't exceed new capacity
      this.buckets.rpm.tokens = Math.min(this.buckets.rpm.tokens, newConfig.rpm)
    }
    if (newConfig.itpm !== undefined) {
      this.config.itpm = newConfig.itpm
      this.buckets.itpm.tokens = Math.min(this.buckets.itpm.tokens, newConfig.itpm)
    }
    if (newConfig.otpm !== undefined) {
      this.config.otpm = newConfig.otpm
      this.buckets.otpm.tokens = Math.min(this.buckets.otpm.tokens, newConfig.otpm)
    }
    if (newConfig.queueWhenLimited !== undefined) {
      this.config.queueWhenLimited = newConfig.queueWhenLimited
    }
    if (newConfig.maxQueueSize !== undefined) {
      this.config.maxQueueSize = newConfig.maxQueueSize
    }
    if (newConfig.queueTimeoutMs !== undefined) {
      this.config.queueTimeoutMs = newConfig.queueTimeoutMs
    }
  }

  /**
   * Reset all buckets to full capacity
   */
  reset(): void {
    const now = Date.now()
    this.buckets.rpm = { tokens: this.config.rpm, lastRefill: now }
    this.buckets.itpm = { tokens: this.config.itpm, lastRefill: now }
    this.buckets.otpm = { tokens: this.config.otpm, lastRefill: now }
  }
}
