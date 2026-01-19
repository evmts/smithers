import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { RateLimitStore } from './store.js'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import type { RateLimitStatus } from './types.js'

function createMockStatus(overrides: Partial<RateLimitStatus> = {}): RateLimitStatus {
  const now = new Date()
  const resetTime = new Date(now.getTime() + 60_000)
  return {
    provider: 'anthropic',
    model: 'claude-sonnet-4',
    requests: { limit: 100, remaining: 80, resetsAt: resetTime },
    inputTokens: { limit: 1_000_000, remaining: 800_000, resetsAt: resetTime },
    outputTokens: { limit: 100_000, remaining: 90_000, resetsAt: resetTime },
    lastQueried: now,
    stale: false,
    ...overrides,
  }
}

describe('RateLimitStore', () => {
  describe('in-memory cache', () => {
    test('get returns null for unknown key', () => {
      const store = new RateLimitStore({ ttlMs: 10_000 })
      expect(store.get('anthropic', 'unknown-model')).toBeNull()
    })

    test('set and get round-trip', () => {
      const store = new RateLimitStore({ ttlMs: 10_000 })
      const status = createMockStatus()

      store.set(status)
      const retrieved = store.get('anthropic', 'claude-sonnet-4')

      expect(retrieved).not.toBeNull()
      expect(retrieved!.provider).toBe('anthropic')
      expect(retrieved!.model).toBe('claude-sonnet-4')
      expect(retrieved!.requests.remaining).toBe(80)
      expect(retrieved!.stale).toBe(false)
    })

    test('different provider/model combinations are isolated', () => {
      const store = new RateLimitStore({ ttlMs: 10_000 })

      store.set(createMockStatus({ provider: 'anthropic', model: 'claude-sonnet-4' }))
      store.set(createMockStatus({ provider: 'anthropic', model: 'claude-haiku-3-5', requests: { limit: 200, remaining: 150, resetsAt: new Date() } }))
      store.set(createMockStatus({ provider: 'openai', model: 'gpt-4', requests: { limit: 50, remaining: 40, resetsAt: new Date() } }))

      expect(store.get('anthropic', 'claude-sonnet-4')!.requests.remaining).toBe(80)
      expect(store.get('anthropic', 'claude-haiku-3-5')!.requests.remaining).toBe(150)
      expect(store.get('openai', 'gpt-4')!.requests.remaining).toBe(40)
    })

    test('stale flag is set when entry exceeds ttl', async () => {
      const store = new RateLimitStore({ ttlMs: 50 })
      const status = createMockStatus()

      store.set(status)
      expect(store.get('anthropic', 'claude-sonnet-4')!.stale).toBe(false)

      await Bun.sleep(60)
      expect(store.get('anthropic', 'claude-sonnet-4')!.stale).toBe(true)
    })

    test('updating existing entry resets stale flag', async () => {
      const store = new RateLimitStore({ ttlMs: 50 })

      store.set(createMockStatus())
      await Bun.sleep(60)
      expect(store.get('anthropic', 'claude-sonnet-4')!.stale).toBe(true)

      store.set(createMockStatus({ requests: { limit: 100, remaining: 70, resetsAt: new Date() } }))
      const updated = store.get('anthropic', 'claude-sonnet-4')
      expect(updated!.stale).toBe(false)
      expect(updated!.requests.remaining).toBe(70)
    })
  })

  describe('database persistence', () => {
    let db: SmithersDB

    beforeAll(async () => {
      db = await createSmithersDB({ reset: true })
    })

    afterAll(() => {
      db.close()
    })

    test('persists snapshots to database', () => {
      const store = new RateLimitStore({ ttlMs: 10_000, db })
      const status = createMockStatus()

      store.set(status)

      const rows = db.db.query<Record<string, unknown>>(
        'SELECT * FROM rate_limit_snapshots WHERE provider = ? AND model = ?',
        ['anthropic', 'claude-sonnet-4']
      )

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const row = rows[rows.length - 1]
      expect(row.requests_limit).toBe(100)
      expect(row.requests_remaining).toBe(80)
      expect(row.input_tokens_limit).toBe(1_000_000)
    })

    test('stores tier information', () => {
      const store = new RateLimitStore({ ttlMs: 10_000, db })
      const status = createMockStatus({ tier: 'tier-4' })

      store.set(status)

      const rows = db.db.query<{ tier: string }>(
        'SELECT tier FROM rate_limit_snapshots WHERE provider = ? AND model = ? ORDER BY captured_at DESC LIMIT 1',
        ['anthropic', 'claude-sonnet-4']
      )

      expect(rows[0].tier).toBe('tier-4')
    })

    test('handles null tier gracefully', () => {
      const store = new RateLimitStore({ ttlMs: 10_000, db })
      const status = createMockStatus()
      delete (status as any).tier

      store.set(status)

      const rows = db.db.query<{ tier: string | null }>(
        'SELECT tier FROM rate_limit_snapshots WHERE provider = ? AND model = ? ORDER BY captured_at DESC LIMIT 1',
        ['anthropic', 'claude-sonnet-4']
      )

      expect(rows[0].tier).toBeNull()
    })
  })
})
