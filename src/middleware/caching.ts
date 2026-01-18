import type { AgentResult, CLIExecutionOptions } from '../components/agents/types.js'
import type { SmithersMiddleware } from './types.js'

export interface CacheStore {
  get: (key: string) => AgentResult | null | Promise<AgentResult | null>
  set: (key: string, value: AgentResult, ttlMs?: number) => void | Promise<void>
  delete?: (key: string) => void | Promise<void>
}

export interface LRUCacheOptions {
  max: number
  ttlMs?: number
}

type CacheEntry = {
  value: AgentResult
  expiresAt?: number
}

export class LRUCache implements CacheStore {
  private readonly max: number
  private readonly ttlMs?: number
  private readonly store = new Map<string, CacheEntry>()

  constructor(options: LRUCacheOptions) {
    this.max = options.max
    this.ttlMs = options.ttlMs
  }

  get(key: string): AgentResult | null {
    const entry = this.store.get(key)
    if (!entry) return null

    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.store.delete(key)
      return null
    }

    this.store.delete(key)
    this.store.set(key, entry)
    return entry.value
  }

  set(key: string, value: AgentResult, ttlMs?: number): void {
    const expiresAt = (ttlMs ?? this.ttlMs) !== undefined
      ? Date.now() + (ttlMs ?? this.ttlMs!)
      : undefined

    if (this.store.has(key)) {
      this.store.delete(key)
    }

    this.store.set(key, { value, expiresAt })

    while (this.store.size > this.max) {
      const oldestKey = this.store.keys().next().value
      if (oldestKey === undefined) break
      this.store.delete(oldestKey)
    }
  }

  delete(key: string): void {
    this.store.delete(key)
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
  return `{${entries.join(',')}}`
}

function defaultCacheKey(options: CLIExecutionOptions): string {
  return stableStringify(options)
}

export function cachingMiddleware(options: {
  cache: CacheStore
  ttl?: number
  keyFn?: (opts: CLIExecutionOptions) => string
}): SmithersMiddleware {
  return {
    name: 'caching',
    wrapExecute: async (doExecute, opts) => {
      const key = options.keyFn ? options.keyFn(opts) : defaultCacheKey(opts)
      const cached = await options.cache.get(key)
      if (cached) return cached

      const result = await doExecute()
      await options.cache.set(key, result, options.ttl)
      return result
    },
  }
}
