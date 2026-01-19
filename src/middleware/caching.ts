import type { AgentResult, CLIExecutionOptions } from '../components/agents/types.js'
import type { SmithersMiddleware } from './types.js'

export interface CacheStore<T> {
  get: (key: string) => T | null | Promise<T | null>
  set: (key: string, value: T, ttlSeconds?: number) => void | Promise<void>
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
