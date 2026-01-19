import type { Provider, RateLimitStatus } from './types.js'
import type { SmithersDB } from '../db/index.js'
import { uuid } from '../db/utils.js'

export interface RateLimitStoreConfig {
  ttlMs: number
  db?: SmithersDB | undefined
}

export class RateLimitStore {
  private ttlMs: number
  private db?: SmithersDB | undefined
  private cache: Map<string, RateLimitStatus>

  constructor(config: RateLimitStoreConfig) {
    this.ttlMs = config.ttlMs
    this.db = config.db
    this.cache = new Map()
  }

  get(provider: Provider, model: string): RateLimitStatus | null {
    const key = `${provider}:${model}`
    const entry = this.cache.get(key)
    if (!entry) return null

    const ageMs = Date.now() - entry.lastQueried.getTime()
    const stale = ageMs > this.ttlMs
    return { ...entry, stale }
  }

  set(status: RateLimitStatus): void {
    const key = `${status.provider}:${status.model}`
    const stored = {
      ...status,
      lastQueried: status.lastQueried ?? new Date(),
      stale: false,
    }
    this.cache.set(key, stored)
    this.persistSnapshot(stored)
  }

  private persistSnapshot(status: RateLimitStatus): void {
    if (!this.db) return

    const now = new Date()
    const toIso = (value: Date | undefined) => (value ? value.toISOString() : null)

    this.db.db.run(
      `INSERT INTO rate_limit_snapshots (
        id,
        provider,
        model,
        requests_limit,
        requests_remaining,
        requests_reset_at,
        input_tokens_limit,
        input_tokens_remaining,
        input_tokens_reset_at,
        output_tokens_limit,
        output_tokens_remaining,
        output_tokens_reset_at,
        tier,
        captured_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        status.provider,
        status.model,
        status.requests.limit,
        status.requests.remaining,
        toIso(status.requests.resetsAt),
        status.inputTokens.limit,
        status.inputTokens.remaining,
        toIso(status.inputTokens.resetsAt),
        status.outputTokens.limit,
        status.outputTokens.remaining,
        toIso(status.outputTokens.resetsAt),
        status.tier ?? null,
        now.toISOString(),
      ]
    )
  }
}
