import { describe, test, expect, beforeEach } from 'bun:test'
import { RateLimitStore } from './store.js'
import type { RateLimitStatus } from './types.js'

function createStatus(overrides: Partial<RateLimitStatus> = {}): RateLimitStatus {
  const now = new Date()
  return {
    provider: 'anthropic',
    model: 'claude-sonnet-4',
    requests: { limit: 1000, remaining: 900, resetsAt: now },
    inputTokens: { limit: 100000, remaining: 90000, resetsAt: now },
    outputTokens: { limit: 50000, remaining: 45000, resetsAt: now },
    lastQueried: now,
    stale: false,
    ...overrides,
  }
}

describe('RateLimitStore', () => {
  let store: RateLimitStore

  beforeEach(() => {
    store = new RateLimitStore({ ttlMs: 1000 })
  })

  test('get returns null for missing entry', () => {
    const result = store.get('anthropic', 'claude-sonnet-4')
    expect(result).toBeNull()
  })

  test('set and get returns cached status', () => {
    const status = createStatus()
    store.set(status)

    const result = store.get('anthropic', 'claude-sonnet-4')
    expect(result).not.toBeNull()
    expect(result!.requests.limit).toBe(1000)
    expect(result!.stale).toBe(false)
  })

  test('get marks entry as stale after TTL', async () => {
    const shortTtlStore = new RateLimitStore({ ttlMs: 10 })
    const status = createStatus()
    shortTtlStore.set(status)

    await Bun.sleep(15)

    const result = shortTtlStore.get('anthropic', 'claude-sonnet-4')
    expect(result).not.toBeNull()
    expect(result!.stale).toBe(true)
  })

  test('stores different provider/model combinations separately', () => {
    store.set(createStatus({ provider: 'anthropic', model: 'claude-sonnet-4' }))
    store.set(createStatus({ provider: 'openai', model: 'gpt-4o', requests: { limit: 500, remaining: 400, resetsAt: new Date() } }))

    const anthropic = store.get('anthropic', 'claude-sonnet-4')
    const openai = store.get('openai', 'gpt-4o')

    expect(anthropic!.requests.limit).toBe(1000)
    expect(openai!.requests.limit).toBe(500)
  })
})
