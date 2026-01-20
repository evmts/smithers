import { describe, test, expect } from 'bun:test'
import type { AgentResult, CLIExecutionOptions } from '../components/agents/types.js'
import { cachingMiddleware, LRUCache, type CacheStore } from './caching.js'

function makeResult(overrides?: Partial<AgentResult>): AgentResult {
  return {
    output: 'ok',
    structured: undefined,
    tokensUsed: { input: 10, output: 5 },
    turnsUsed: 1,
    stopReason: 'completed',
    durationMs: 100,
    ...overrides,
  }
}

describe('LRUCache', () => {
  test('stores and retrieves values', () => {
    const cache = new LRUCache<string>({ max: 10 })
    cache.set('key', 'value')
    expect(cache.get('key')).toBe('value')
  })

  test('returns null for missing keys', () => {
    const cache = new LRUCache<string>({ max: 10 })
    expect(cache.get('nonexistent')).toBeNull()
  })

  test('evicts oldest entry when full', () => {
    const cache = new LRUCache<string>({ max: 2 })
    cache.set('a', '1')
    cache.set('b', '2')
    cache.set('c', '3')

    expect(cache.get('a')).toBeNull()
    expect(cache.get('b')).toBe('2')
    expect(cache.get('c')).toBe('3')
  })

  test('LRU updates order on access', () => {
    const cache = new LRUCache<string>({ max: 2 })
    cache.set('a', '1')
    cache.set('b', '2')

    // Access 'a' to make it recently used
    cache.get('a')

    // Now 'b' is oldest, should be evicted
    cache.set('c', '3')

    expect(cache.get('a')).toBe('1')
    expect(cache.get('b')).toBeNull()
    expect(cache.get('c')).toBe('3')
  })

  test('overwrites existing key without eviction', () => {
    const cache = new LRUCache<string>({ max: 2 })
    cache.set('a', '1')
    cache.set('b', '2')
    cache.set('a', 'updated')

    expect(cache.get('a')).toBe('updated')
    expect(cache.get('b')).toBe('2')
  })

  test('expires entries after TTL', async () => {
    const cache = new LRUCache<string>({ max: 10 })
    cache.set('key', 'value', 0.05) // 50ms TTL

    expect(cache.get('key')).toBe('value')
    await new Promise((r) => setTimeout(r, 60))
    expect(cache.get('key')).toBeNull()
  })

  test('entries without TTL do not expire', async () => {
    const cache = new LRUCache<string>({ max: 10 })
    cache.set('key', 'value')

    await new Promise((r) => setTimeout(r, 20))
    expect(cache.get('key')).toBe('value')
  })

  test('handles max=1 correctly', () => {
    const cache = new LRUCache<string>({ max: 1 })
    cache.set('a', '1')
    cache.set('b', '2')

    expect(cache.get('a')).toBeNull()
    expect(cache.get('b')).toBe('2')
  })
})

describe('cachingMiddleware', () => {
  test('caches results by prompt', async () => {
    const cache = new LRUCache<AgentResult>({ max: 10 })
    const middleware = cachingMiddleware({ cache })
    const options: CLIExecutionOptions = { prompt: 'test prompt' }
    let calls = 0

    const execute = async () => {
      calls += 1
      return makeResult({ output: `run-${calls}` })
    }

    const first = await middleware.wrapExecute?.({ doExecute: execute, options })
    const second = await middleware.wrapExecute?.({ doExecute: execute, options })

    expect(calls).toBe(1)
    expect(first?.output).toBe('run-1')
    expect(second?.output).toBe('run-1')
  })

  test('different prompts produce different cache keys', async () => {
    const cache = new LRUCache<AgentResult>({ max: 10 })
    const middleware = cachingMiddleware({ cache })
    let calls = 0

    const execute = async () => {
      calls += 1
      return makeResult({ output: `run-${calls}` })
    }

    await middleware.wrapExecute?.({ doExecute: execute, options: { prompt: 'prompt1' } })
    await middleware.wrapExecute?.({ doExecute: execute, options: { prompt: 'prompt2' } })

    expect(calls).toBe(2)
  })

  test('different models produce different cache keys', async () => {
    const cache = new LRUCache<AgentResult>({ max: 10 })
    const middleware = cachingMiddleware({ cache })
    let calls = 0

    const execute = async () => {
      calls += 1
      return makeResult({ output: `run-${calls}` })
    }

    await middleware.wrapExecute?.({
      doExecute: execute,
      options: { prompt: 'test', model: 'sonnet' },
    })
    await middleware.wrapExecute?.({
      doExecute: execute,
      options: { prompt: 'test', model: 'opus' },
    })

    expect(calls).toBe(2)
  })

  test('respects custom keyFn', async () => {
    const cache = new LRUCache<AgentResult>({ max: 10 })
    const middleware = cachingMiddleware({
      cache,
      keyFn: (opts) => opts.prompt.split(' ')[0], // First word only
    })
    let calls = 0

    const execute = async () => {
      calls += 1
      return makeResult({ output: `run-${calls}` })
    }

    await middleware.wrapExecute?.({
      doExecute: execute,
      options: { prompt: 'test hello' },
    })
    await middleware.wrapExecute?.({
      doExecute: execute,
      options: { prompt: 'test world' },
    })

    expect(calls).toBe(1) // Same first word = same key
  })

  test('respects TTL option', async () => {
    const cache = new LRUCache<AgentResult>({ max: 10 })
    const middleware = cachingMiddleware({ cache, ttl: 0.05 }) // 50ms TTL
    const options: CLIExecutionOptions = { prompt: 'ttl-test' }
    let calls = 0

    const execute = async () => {
      calls += 1
      return makeResult({ output: `run-${calls}` })
    }

    await middleware.wrapExecute?.({ doExecute: execute, options })
    expect(calls).toBe(1)

    await new Promise((r) => setTimeout(r, 60))
    await middleware.wrapExecute?.({ doExecute: execute, options })
    expect(calls).toBe(2)
  })

  test('ignores onProgress callback in cache key', async () => {
    const cache = new LRUCache<AgentResult>({ max: 10 })
    const middleware = cachingMiddleware({ cache })
    let calls = 0

    const execute = async () => {
      calls += 1
      return makeResult({ output: `run-${calls}` })
    }

    await middleware.wrapExecute?.({
      doExecute: execute,
      options: { prompt: 'test', onProgress: () => {} },
    })
    await middleware.wrapExecute?.({
      doExecute: execute,
      options: { prompt: 'test', onProgress: () => {} },
    })

    expect(calls).toBe(1)
  })

  test('works with async cache store', async () => {
    const store: CacheStore<AgentResult> = {
      storage: new Map<string, AgentResult>(),
      async get(key: string) {
        return this.storage.get(key) ?? null
      },
      async set(key: string, value: AgentResult) {
        this.storage.set(key, value)
      },
    } as CacheStore<AgentResult> & { storage: Map<string, AgentResult> }

    const middleware = cachingMiddleware({ cache: store })
    let calls = 0

    const execute = async () => {
      calls += 1
      return makeResult({ output: `run-${calls}` })
    }

    await middleware.wrapExecute?.({ doExecute: execute, options: { prompt: 'async' } })
    await middleware.wrapExecute?.({ doExecute: execute, options: { prompt: 'async' } })

    expect(calls).toBe(1)
  })

  test('has correct middleware name', () => {
    const cache = new LRUCache<AgentResult>({ max: 10 })
    const middleware = cachingMiddleware({ cache })
    expect(middleware.name).toBe('caching')
  })
})
