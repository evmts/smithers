import type { SmithersMiddleware } from './types.js'

export interface RetryOptions {
  maxRetries?: number
  retryOn?: (error: Error) => boolean
  backoff?: 'exponential' | 'linear' | 'constant'
  baseDelay?: number
  onRetry?: (error: Error, attempt: number, maxRetries: number, delayMs: number) => void
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function retryMiddleware(options: RetryOptions = {}): SmithersMiddleware {
  const maxRetries = options.maxRetries ?? 3
  const baseDelay = options.baseDelay ?? 1000
  const backoff = options.backoff ?? 'exponential'

  return {
    name: 'retry',
    wrapExecute: async (doExecute) => {
      let lastError: Error | null = null

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await doExecute()
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          const shouldRetry = options.retryOn ? options.retryOn(lastError) : true

          if (!shouldRetry || attempt >= maxRetries) {
            throw lastError
          }

          const delayMs = backoff === 'constant'
            ? baseDelay
            : backoff === 'linear'
              ? baseDelay * (attempt + 1)
              : baseDelay * Math.pow(2, attempt)

          options.onRetry?.(lastError, attempt + 1, maxRetries, delayMs)
          await delay(delayMs)
        }
      }

      throw lastError ?? new Error('Retry middleware failed without error')
    },
  }
}
