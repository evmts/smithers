import type { AgentResult, CLIExecutionOptions } from '../components/agents/types.js'
import type { SmithersMiddleware } from './types.js'

export interface CacheStore<T> {
  get: (key: string) => T | null | Promise<T | null>
  set: (key: string, value: T, ttlSeconds?: number) => void | Promise<void>
}

export interface LRUCacheOptions {
  max: number
}

export class LRUCache<T = AgentResult> implements CacheStore<T> {
  private cache = new Map<string, { value: T; expiresAt?: number }>()
  private max: number

  constructor(options: LRUCacheOptions) {
    this.max = options.max
  }

  get(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }
    this.cache.delete(key)
    this.cache.set(key, entry)
    return entry.value
  }

  set(key: string, value: T, ttlSeconds?: number): void {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.max) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }
    const entry: { value: T; expiresAt?: number } = { value }
    if (ttlSeconds) {
      entry.expiresAt = Date.now() + ttlSeconds * 1000
    }
    this.cache.set(key, entry)
  }
}

export interface CachingMiddlewareOptions {
  cache: CacheStore<AgentResult>
  ttl?: number
  keyFn?: (options: CLIExecutionOptions) => string
}

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>()
  const replacer = (_key: string, val: unknown) => {
    if (typeof val === 'function' || typeof val === 'symbol') {
      return undefined
    }
    if (val && typeof val === 'object') {
      if (seen.has(val)) return '[circular]'
      seen.add(val)
      if ('safeParse' in (val as Record<string, unknown>)) {
        return '[zod-schema]'
      }
    }
    return val
  }
  return JSON.stringify(value, replacer)
}

function defaultCacheKey(options: CLIExecutionOptions): string {
  const { onProgress: _onProgress, onToolCall: _onToolCall, schema, ...rest } = options
  return stableStringify({ ...rest, schema: schema ? '[schema]' : undefined })
}

export function cachingMiddleware(options: CachingMiddlewareOptions): SmithersMiddleware {
  const keyFn = options.keyFn ?? defaultCacheKey

  return {
    name: 'caching',
    wrapExecute: async ({ doExecute, options: executionOptions }) => {
      const key = keyFn(executionOptions)
      const cached = await options.cache.get(key)
      if (cached) {
        return cached
      }

      const result = await doExecute()
      await options.cache.set(key, result, options.ttl)
      return result
    },
  }
}
