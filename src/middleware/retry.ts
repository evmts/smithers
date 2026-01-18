import type { AgentResult } from '../components/agents/types.js'
import type { SmithersMiddleware } from './types.js'

export type RetryBackoff = 'exponential' | 'linear'

export interface RetryMiddlewareOptions {
  maxRetries?: number
  retryOn?: (error: Error) => boolean
  backoff?: RetryBackoff
  baseDelayMs?: number
}

function calculateBackoff(attempt: number, backoff: RetryBackoff, baseDelayMs: number): number {
  if (backoff === 'linear') {
    return baseDelayMs * (attempt + 1)
  }
  return baseDelayMs * Math.pow(2, attempt)
}

export function retryMiddleware(options: RetryMiddlewareOptions = {}): SmithersMiddleware {
  const maxRetries = options.maxRetries ?? 3
  const backoff = options.backoff ?? 'exponential'
  const baseDelayMs = options.baseDelayMs ?? 250
  const retryOn = options.retryOn ?? (() => true)

  return {
    name: 'retry',
    wrapExecute: async ({ doExecute }) => {
      let lastError: Error | null = null
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
          return await doExecute()
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          if (attempt >= maxRetries || !retryOn(lastError)) {
            throw lastError
          }
          const delay = calculateBackoff(attempt, backoff, baseDelayMs)
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
      throw lastError ?? new Error('Retry middleware failed without error')
    },
    transformResult: (result: AgentResult) => result,
  }
}
