import { describe, test, expect } from 'bun:test'
import type { AgentResult } from '../components/agents/types.js'
import { retryMiddleware } from './retry.js'

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

describe('retryMiddleware', () => {
  test('returns result on success without retries', async () => {
    const middleware = retryMiddleware({ maxRetries: 3, baseDelayMs: 0 })
    let attempts = 0

    const execute = async () => {
      attempts += 1
      return makeResult({ output: 'success' })
    }

    const result = await middleware.wrapExecute?.({
      doExecute: execute,
      options: { prompt: 'test' },
    })

    expect(attempts).toBe(1)
    expect(result?.output).toBe('success')
  })

  test('retries on failure and recovers', async () => {
    const middleware = retryMiddleware({ maxRetries: 2, baseDelayMs: 0 })
    let attempts = 0

    const execute = async () => {
      attempts += 1
      if (attempts < 3) {
        throw new Error('boom')
      }
      return makeResult({ output: 'recovered' })
    }

    const result = await middleware.wrapExecute?.({
      doExecute: execute,
      options: { prompt: 'test' },
    })

    expect(attempts).toBe(3)
    expect(result?.output).toBe('recovered')
  })

  test('throws after maxRetries exceeded', async () => {
    const middleware = retryMiddleware({ maxRetries: 2, baseDelayMs: 0 })
    let attempts = 0

    const execute = async () => {
      attempts += 1
      throw new Error('persistent failure')
    }

    await expect(
      middleware.wrapExecute?.({ doExecute: execute, options: { prompt: 'test' } })
    ).rejects.toThrow('persistent failure')

    expect(attempts).toBe(3) // initial + 2 retries
  })

  test('respects retryOn predicate - skip retry', async () => {
    const middleware = retryMiddleware({
      maxRetries: 3,
      baseDelayMs: 0,
      retryOn: (err) => !err.message.includes('fatal'),
    })
    let attempts = 0

    const execute = async () => {
      attempts += 1
      throw new Error('fatal error')
    }

    await expect(
      middleware.wrapExecute?.({ doExecute: execute, options: { prompt: 'test' } })
    ).rejects.toThrow('fatal error')

    expect(attempts).toBe(1) // No retries
  })

  test('respects retryOn predicate - allow retry', async () => {
    const middleware = retryMiddleware({
      maxRetries: 2,
      baseDelayMs: 0,
      retryOn: (err) => err.message.includes('transient'),
    })
    let attempts = 0

    const execute = async () => {
      attempts += 1
      if (attempts < 2) {
        throw new Error('transient error')
      }
      return makeResult({ output: 'recovered' })
    }

    const result = await middleware.wrapExecute?.({
      doExecute: execute,
      options: { prompt: 'test' },
    })

    expect(attempts).toBe(2)
    expect(result?.output).toBe('recovered')
  })

  test('calls onRetry callback with correct parameters', async () => {
    const retryLog: Array<{ attempt: number; error: string; delayMs: number }> = []

    const middleware = retryMiddleware({
      maxRetries: 2,
      baseDelayMs: 100,
      backoff: 'exponential',
      onRetry: (attempt, error, delayMs) => {
        retryLog.push({ attempt, error: error.message, delayMs })
      },
    })

    let attempts = 0
    const execute = async () => {
      attempts += 1
      if (attempts <= 2) {
        throw new Error(`error-${attempts}`)
      }
      return makeResult()
    }

    await middleware.wrapExecute?.({ doExecute: execute, options: { prompt: 'test' } })

    expect(retryLog).toEqual([
      { attempt: 1, error: 'error-1', delayMs: 100 }, // 100 * 2^0
      { attempt: 2, error: 'error-2', delayMs: 200 }, // 100 * 2^1
    ])
  })

  test('exponential backoff calculation', async () => {
    const delays: number[] = []

    const middleware = retryMiddleware({
      maxRetries: 4,
      baseDelayMs: 10,
      backoff: 'exponential',
      onRetry: (_attempt, _error, delayMs) => {
        delays.push(delayMs)
      },
    })

    let attempts = 0
    const execute = async () => {
      attempts += 1
      if (attempts <= 4) throw new Error('fail')
      return makeResult()
    }

    await middleware.wrapExecute?.({ doExecute: execute, options: { prompt: 'test' } })

    // Exponential: base * 2^attempt (attempt 0-indexed)
    // 10*2^0=10, 10*2^1=20, 10*2^2=40, 10*2^3=80
    expect(delays).toEqual([10, 20, 40, 80])
  })

  test('linear backoff calculation', async () => {
    const delays: number[] = []

    const middleware = retryMiddleware({
      maxRetries: 3,
      baseDelayMs: 10,
      backoff: 'linear',
      onRetry: (_attempt, _error, delayMs) => {
        delays.push(delayMs)
      },
    })

    let attempts = 0
    const execute = async () => {
      attempts += 1
      if (attempts <= 3) throw new Error('fail')
      return makeResult()
    }

    await middleware.wrapExecute?.({ doExecute: execute, options: { prompt: 'test' } })

    // Linear: base * (attempt + 1) where attempt is 0-indexed
    // 10*1=10, 10*2=20, 10*3=30
    expect(delays).toEqual([10, 20, 30])
  })

  test('defaults to exponential backoff', async () => {
    const delays: number[] = []

    const middleware = retryMiddleware({
      maxRetries: 2,
      baseDelayMs: 5,
      onRetry: (_attempt, _error, delayMs) => {
        delays.push(delayMs)
      },
    })

    let attempts = 0
    const execute = async () => {
      attempts += 1
      if (attempts <= 2) throw new Error('fail')
      return makeResult()
    }

    await middleware.wrapExecute?.({ doExecute: execute, options: { prompt: 'test' } })

    expect(delays).toEqual([5, 10]) // exponential
  })

  test('defaults to maxRetries of 3', async () => {
    const middleware = retryMiddleware({ baseDelayMs: 0 })
    let attempts = 0

    const execute = async () => {
      attempts += 1
      throw new Error('fail')
    }

    await expect(
      middleware.wrapExecute?.({ doExecute: execute, options: { prompt: 'test' } })
    ).rejects.toThrow()

    expect(attempts).toBe(4) // 1 initial + 3 retries
  })

  test('wraps non-Error throws', async () => {
    const middleware = retryMiddleware({ maxRetries: 1, baseDelayMs: 0 })
    let attempts = 0
    let caughtError: Error | null = null

    const execute = async () => {
      attempts += 1
      throw 'string error'
    }

    try {
      await middleware.wrapExecute?.({ doExecute: execute, options: { prompt: 'test' } })
    } catch (e) {
      caughtError = e as Error
    }

    expect(caughtError).toBeInstanceOf(Error)
    expect(caughtError?.message).toBe('string error')
  })

  test('has correct middleware name', () => {
    const middleware = retryMiddleware()
    expect(middleware.name).toBe('retry')
  })

  test('actual delay timing with constant backoff', async () => {
    const middleware = retryMiddleware({
      maxRetries: 1,
      baseDelayMs: 50,
      backoff: 'linear',
    })

    let attempts = 0
    const execute = async () => {
      attempts += 1
      if (attempts < 2) throw new Error('fail')
      return makeResult()
    }

    const start = Date.now()
    await middleware.wrapExecute?.({ doExecute: execute, options: { prompt: 'test' } })
    const elapsed = Date.now() - start

    // Should have waited approximately 50ms (linear: 50 * 1)
    expect(elapsed).toBeGreaterThanOrEqual(40)
    expect(elapsed).toBeLessThan(150)
  })
})
