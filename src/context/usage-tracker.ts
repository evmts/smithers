import type {
  UsageLimitConfig,
  UsageStats,
  StorageAdapter,
  UsageReport,
  BudgetCheckResult,
} from './types.js'

/**
 * Pricing per million tokens by model
 * Updated pricing as of 2025
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
  'claude-opus-4-5-20251101': { input: 15, output: 75 },
  'claude-haiku-3-5-20241022': { input: 0.8, output: 4 },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
  'claude-3-opus-20240229': { input: 15, output: 75 },
  'claude-3-sonnet-20240229': { input: 3, output: 15 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  // Default fallback (Sonnet pricing)
  default: { input: 3, output: 15 },
}

/**
 * Error thrown when budget is exceeded
 */
export class BudgetExceededError extends Error {
  constructor(
    message: string,
    public readonly metric: 'inputTokens' | 'outputTokens' | 'totalTokens' | 'cost',
    public readonly current: number,
    public readonly limit: number
  ) {
    super(message)
    this.name = 'BudgetExceededError'
  }
}

/**
 * Calculate cost for a model
 */
function calculateCost(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  model: string
): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['default']

  // Cache-read tokens are 90% cheaper
  const cacheReadCost = (cacheReadTokens / 1_000_000) * pricing.input * 0.1
  const uncachedInputTokens = Math.max(0, inputTokens - cacheReadTokens)
  const inputCost = (uncachedInputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output

  return inputCost + cacheReadCost + outputCost
}

/**
 * Get window boundaries based on window type
 */
function getWindowBoundaries(window: UsageLimitConfig['window']): {
  start: Date
  end: Date
} {
  const now = new Date()
  let start: Date
  let end: Date

  switch (window) {
    case 'hour':
      start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours()
      )
      end = new Date(start.getTime() + 60 * 60 * 1000)
      break
    case 'day':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
      break
    case 'week':
      const dayOfWeek = now.getDay()
      start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - dayOfWeek
      )
      end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
      break
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      break
    case 'all-time':
    default:
      start = new Date(0)
      end = new Date(8640000000000000) // Max date
      break
  }

  return { start, end }
}

/**
 * Usage tracker with budget enforcement and optional persistence
 *
 * Supports pause-and-wait behavior when budget is exceeded.
 *
 * @example
 * ```ts
 * const tracker = new UsageTracker({
 *   maxCostUsd: 10,
 *   window: 'day',
 * })
 *
 * // Check budget before request
 * const { allowed, reason } = tracker.checkBudget()
 * if (!allowed) {
 *   // Wait for budget (blocks until resumed or window resets)
 *   await tracker.waitForBudget()
 * }
 *
 * // Report usage after request
 * tracker.reportUsage({ inputTokens: 1000, outputTokens: 500 })
 * ```
 */
export class UsageTracker {
  private config: Required<UsageLimitConfig>
  private stats: UsageStats
  private storage?: StorageAdapter
  private storageKey: string

  // Pause-and-wait support
  private paused = false
  private waitingPromises: Array<{
    resolve: () => void
    reject: (error: Error) => void
  }> = []
  private pauseReason?: string

  // Callback for pause events
  private onPausedCallback?: (info: { reason: string; resume: () => void }) => void

  constructor(
    config: UsageLimitConfig = {},
    storage?: StorageAdapter,
    keyPrefix: string = 'smithers_usage'
  ) {
    this.config = {
      maxInputTokens: config.maxInputTokens ?? Infinity,
      maxOutputTokens: config.maxOutputTokens ?? Infinity,
      maxTotalTokens: config.maxTotalTokens ?? Infinity,
      maxCostUsd: config.maxCostUsd ?? Infinity,
      window: config.window ?? 'all-time',
    }

    this.storage = storage
    this.storageKey = `${keyPrefix}_${this.config.window}`

    const { start, end } = getWindowBoundaries(this.config.window)
    this.stats = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: 0,
      requestCount: 0,
      windowStart: start,
      windowEnd: end,
    }
  }

  /**
   * Set callback for pause events
   */
  setOnPausedCallback(
    callback: (info: { reason: string; resume: () => void }) => void
  ): void {
    this.onPausedCallback = callback
  }

  /**
   * Load stats from persistent storage
   */
  async load(): Promise<void> {
    if (!this.storage) return

    try {
      const data = await this.storage.get(this.storageKey)
      if (data) {
        const parsed = JSON.parse(data)

        // Check if we're still in the same window
        const { start } = getWindowBoundaries(this.config.window)
        const storedStart = new Date(parsed.windowStart)

        if (storedStart.getTime() === start.getTime()) {
          // Same window, restore stats
          this.stats = {
            ...parsed,
            windowStart: new Date(parsed.windowStart),
            windowEnd: new Date(parsed.windowEnd),
          }
        }
        // If different window, keep the fresh stats we initialized with
      }
    } catch (error) {
      console.warn('Failed to load usage stats from storage:', error)
    }
  }

  /**
   * Save stats to persistent storage
   */
  private async save(): Promise<void> {
    if (!this.storage) return

    try {
      await this.storage.set(this.storageKey, JSON.stringify(this.stats))
    } catch (error) {
      console.warn('Failed to save usage stats to storage:', error)
    }
  }

  /**
   * Check if within budget limits
   */
  checkBudget(): BudgetCheckResult {
    // Refresh window if needed
    this.refreshWindow()

    if (this.stats.inputTokens >= this.config.maxInputTokens) {
      return {
        allowed: false,
        reason: `Input token limit exceeded (${this.stats.inputTokens}/${this.config.maxInputTokens})`,
      }
    }
    if (this.stats.outputTokens >= this.config.maxOutputTokens) {
      return {
        allowed: false,
        reason: `Output token limit exceeded (${this.stats.outputTokens}/${this.config.maxOutputTokens})`,
      }
    }
    if (this.stats.totalTokens >= this.config.maxTotalTokens) {
      return {
        allowed: false,
        reason: `Total token limit exceeded (${this.stats.totalTokens}/${this.config.maxTotalTokens})`,
      }
    }
    if (this.stats.costUsd >= this.config.maxCostUsd) {
      return {
        allowed: false,
        reason: `Cost limit exceeded ($${this.stats.costUsd.toFixed(4)}/$${this.config.maxCostUsd})`,
      }
    }

    return { allowed: true }
  }

  /**
   * Wait for budget to become available
   * Resolves when either:
   * - resume() is called (e.g., user increases limit)
   * - Window expires and stats reset
   */
  async waitForBudget(): Promise<void> {
    const budgetCheck = this.checkBudget()
    if (budgetCheck.allowed) {
      return // Already have budget
    }

    // Pause and wait
    this.paused = true
    this.pauseReason = budgetCheck.reason

    // Notify via callback
    if (this.onPausedCallback) {
      this.onPausedCallback({
        reason: budgetCheck.reason!,
        resume: () => this.resume(),
      })
    }

    return new Promise((resolve, reject) => {
      this.waitingPromises.push({ resolve, reject })

      // Also check periodically for window expiration
      const checkInterval = setInterval(() => {
        this.refreshWindow()
        const newCheck = this.checkBudget()
        if (newCheck.allowed) {
          clearInterval(checkInterval)
          this.resume()
        }
      }, 10000) // Check every 10 seconds
    })
  }

  /**
   * Resume execution after pause
   * Called when user increases limit or resets usage
   */
  resume(): void {
    if (!this.paused) return

    this.paused = false
    this.pauseReason = undefined

    // Resolve all waiting promises
    const promises = this.waitingPromises
    this.waitingPromises = []
    for (const { resolve } of promises) {
      resolve()
    }
  }

  /**
   * Report usage from a completed request
   */
  reportUsage(usage: UsageReport): void {
    // Refresh window if needed
    this.refreshWindow()

    this.stats.inputTokens += usage.inputTokens
    this.stats.outputTokens += usage.outputTokens
    this.stats.totalTokens += usage.inputTokens + usage.outputTokens
    this.stats.cacheReadTokens += usage.cacheReadTokens ?? 0
    this.stats.cacheCreationTokens += usage.cacheCreationTokens ?? 0
    this.stats.requestCount += 1

    // Calculate cost if not provided
    if (usage.costUsd !== undefined) {
      this.stats.costUsd += usage.costUsd
    } else {
      this.stats.costUsd += calculateCost(
        usage.inputTokens,
        usage.outputTokens,
        usage.cacheReadTokens ?? 0,
        usage.model ?? 'default'
      )
    }

    // Persist
    this.save()
  }

  /**
   * Get current usage stats
   */
  getStats(): UsageStats {
    this.refreshWindow()
    return { ...this.stats }
  }

  /**
   * Reset usage stats
   */
  reset(): void {
    const { start, end } = getWindowBoundaries(this.config.window)
    this.stats = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: 0,
      requestCount: 0,
      windowStart: start,
      windowEnd: end,
    }
    this.save()

    // Resume any waiting requests since we now have budget
    this.resume()
  }

  /**
   * Update limits (e.g., user increases budget)
   */
  updateLimits(newLimits: Partial<UsageLimitConfig>): void {
    if (newLimits.maxInputTokens !== undefined) {
      this.config.maxInputTokens = newLimits.maxInputTokens
    }
    if (newLimits.maxOutputTokens !== undefined) {
      this.config.maxOutputTokens = newLimits.maxOutputTokens
    }
    if (newLimits.maxTotalTokens !== undefined) {
      this.config.maxTotalTokens = newLimits.maxTotalTokens
    }
    if (newLimits.maxCostUsd !== undefined) {
      this.config.maxCostUsd = newLimits.maxCostUsd
    }

    // Check if we now have budget and can resume
    const check = this.checkBudget()
    if (check.allowed && this.paused) {
      this.resume()
    }
  }

  /**
   * Check if current window has expired and reset if needed
   */
  private refreshWindow(): void {
    const now = new Date()
    if (now >= this.stats.windowEnd) {
      this.reset()
    }
  }

  /**
   * Get usage as percentage of limits (for warnings)
   */
  getUsagePercentages(): {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    cost: number
  } {
    return {
      inputTokens: (this.stats.inputTokens / this.config.maxInputTokens) * 100,
      outputTokens: (this.stats.outputTokens / this.config.maxOutputTokens) * 100,
      totalTokens: (this.stats.totalTokens / this.config.maxTotalTokens) * 100,
      cost: (this.stats.costUsd / this.config.maxCostUsd) * 100,
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<UsageLimitConfig> {
    return { ...this.config }
  }

  /**
   * Check if currently paused
   */
  isPaused(): boolean {
    return this.paused
  }

  /**
   * Get pause reason if paused
   */
  getPauseReason(): string | undefined {
    return this.pauseReason
  }
}
