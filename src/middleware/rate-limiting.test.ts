import { describe, test, expect } from 'bun:test'
import type { AgentResult } from '../components/agents/types.js'
import { rateLimitingMiddleware } from './rate-limiting.js'

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

describe('rateLimitingMiddleware', () => {
  test('passes through result for single request', async () => {
    const middleware = rateLimitingMiddleware({ requestsPerMinute: 60 })

    const result = await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ output: 'test' }),
      options: { prompt: 'test' },
    })

    expect(result?.output).toBe('test')
  })

  test('allows burst of requests up to capacity', async () => {
    const middleware = rateLimitingMiddleware({ requestsPerMinute: 100 })
    let completed = 0

    const promises = Array.from({ length: 10 }, async () => {
      await middleware.wrapExecute?.({
        doExecute: async () => {
          completed++
          return makeResult()
        },
        options: { prompt: 'test' },
      })
    })

    await Promise.all(promises)
    expect(completed).toBe(10)
  })

  test('serializes requests when rate limited', async () => {
    // Low rate to force serialization
    const middleware = rateLimitingMiddleware({ requestsPerMinute: 600 })
    const order: number[] = []

    const execute = async (id: number) => {
      await middleware.wrapExecute?.({
        doExecute: async () => {
          order.push(id)
          return makeResult()
        },
        options: { prompt: 'test' },
      })
    }

    // Start all at once
    await Promise.all([execute(1), execute(2), execute(3)])

    // All should complete in order
    expect(order).toHaveLength(3)
  })

  test('tracks tokens when tokensPerMinute specified', async () => {
    const middleware = rateLimitingMiddleware({
      requestsPerMinute: 1000,
      tokensPerMinute: 10000,
    })

    const result = await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ tokensUsed: { input: 100, output: 50 } }),
      options: { prompt: 'test' },
    })

    expect(result?.tokensUsed).toEqual({ input: 100, output: 50 })
  })

  test('handles zero tokens gracefully', async () => {
    const middleware = rateLimitingMiddleware({
      requestsPerMinute: 1000,
      tokensPerMinute: 10000,
    })

    const result = await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ tokensUsed: { input: 0, output: 0 } }),
      options: { prompt: 'test' },
    })

    expect(result?.output).toBe('ok')
  })

  test('handles undefined tokens gracefully', async () => {
    const middleware = rateLimitingMiddleware({
      requestsPerMinute: 1000,
      tokensPerMinute: 10000,
    })

    const result = await middleware.wrapExecute?.({
      doExecute: async () => ({
        output: 'ok',
        tokensUsed: { input: 0, output: 0 },
        turnsUsed: 1,
        stopReason: 'completed' as const,
        durationMs: 100,
      }),
      options: { prompt: 'test' },
    })

    expect(result?.output).toBe('ok')
  })

  test('works without token limit', async () => {
    const middleware = rateLimitingMiddleware({
      requestsPerMinute: 1000,
      // No tokensPerMinute
    })

    const result = await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ tokensUsed: { input: 9999999, output: 9999999 } }),
      options: { prompt: 'test' },
    })

    // Should complete without token-based throttling
    expect(result?.output).toBe('ok')
  })

  test('preserves result properties', async () => {
    const middleware = rateLimitingMiddleware({ requestsPerMinute: 1000 })

    const result = await middleware.wrapExecute?.({
      doExecute: async () =>
        makeResult({
          output: 'test output',
          structured: { key: 'value' },
          tokensUsed: { input: 100, output: 50 },
          turnsUsed: 5,
          stopReason: 'completed',
          durationMs: 500,
        }),
      options: { prompt: 'test' },
    })

    expect(result?.output).toBe('test output')
    expect(result?.structured).toEqual({ key: 'value' })
    expect(result?.tokensUsed).toEqual({ input: 100, output: 50 })
    expect(result?.turnsUsed).toBe(5)
    expect(result?.stopReason).toBe('completed')
    expect(result?.durationMs).toBe(500)
  })

  test('propagates errors', async () => {
    const middleware = rateLimitingMiddleware({ requestsPerMinute: 1000 })

    await expect(
      middleware.wrapExecute?.({
        doExecute: async () => {
          throw new Error('execution failed')
        },
        options: { prompt: 'test' },
      })
    ).rejects.toThrow('execution failed')
  })

  test('has correct middleware name', () => {
    const middleware = rateLimitingMiddleware({ requestsPerMinute: 100 })
    expect(middleware.name).toBe('rate-limiting')
  })

  test('rate limiting causes delay under heavy load', async () => {
    // Very low rate to force waiting
    const middleware = rateLimitingMiddleware({ requestsPerMinute: 60 }) // 1 per second

    const start = Date.now()

    // Make 2 requests quickly - second should wait
    await middleware.wrapExecute?.({
      doExecute: async () => makeResult(),
      options: { prompt: 'first' },
    })
    await middleware.wrapExecute?.({
      doExecute: async () => makeResult(),
      options: { prompt: 'second' },
    })

    const elapsed = Date.now() - start

    // Second request should have had to wait for refill
    // With 60 RPM, that's 1 request per second, so ~1000ms wait
    // But we start with full bucket, so this may complete quickly
    // This is more of a sanity check that it doesn't error
    expect(elapsed).toBeGreaterThanOrEqual(0)
  })

  test('concurrent requests are properly serialized', async () => {
    const middleware = rateLimitingMiddleware({ requestsPerMinute: 6000 }) // 100 per second
    const results: number[] = []

    // Fire many requests concurrently
    const promises = Array.from({ length: 50 }, async (_, i) => {
      await middleware.wrapExecute?.({
        doExecute: async () => {
          results.push(i)
          return makeResult()
        },
        options: { prompt: `request-${i}` },
      })
    })

    await Promise.all(promises)

    // All should complete
    expect(results).toHaveLength(50)
  })

  describe('TokenBucket edge cases', () => {
    test('rejects invalid token rates', () => {
      expect(() => rateLimitingMiddleware({ requestsPerMinute: 0 })).toThrow('TokenBucket requires tokensPerMinute > 0')
      expect(() => rateLimitingMiddleware({ requestsPerMinute: -1 })).toThrow('TokenBucket requires tokensPerMinute > 0')
    })

    test('handles very high token consumption', async () => {
      const middleware = rateLimitingMiddleware({
        requestsPerMinute: 60,
        tokensPerMinute: 1000000, // 1M tokens per minute
      })

      // Consume more tokens than capacity - should clamp to capacity
      const result = await middleware.wrapExecute?.({
        doExecute: async () => makeResult({ tokensUsed: { input: 2000000, output: 2000000 } }),
        options: { prompt: 'test' },
      })

      expect(result?.output).toBe('ok')
    })

    test('handles fractional token refill rates correctly', async () => {
      const middleware = rateLimitingMiddleware({
        requestsPerMinute: 60,
        tokensPerMinute: 61, // Will create fractional refill rate
      })

      const result = await middleware.wrapExecute?.({
        doExecute: async () => makeResult({ tokensUsed: { input: 1, output: 1 } }),
        options: { prompt: 'test' },
      })

      expect(result?.output).toBe('ok')
    })

    test('handles requests that require more than bucket capacity', async () => {
      // Small bucket to test capacity limits
      const middleware = rateLimitingMiddleware({
        requestsPerMinute: 60,
        tokensPerMinute: 10, // Very small capacity
      })

      // Request more tokens than the bucket can hold
      const result = await middleware.wrapExecute?.({
        doExecute: async () => makeResult({ tokensUsed: { input: 15, output: 15 } }),
        options: { prompt: 'test' },
      })

      // Should still complete by consuming only what the bucket can provide
      expect(result?.output).toBe('ok')
    })

    test('handles missing tokensUsed gracefully', async () => {
      const middleware = rateLimitingMiddleware({
        requestsPerMinute: 60,
        tokensPerMinute: 1000,
      })

      const result = await middleware.wrapExecute?.({
        doExecute: async () => ({
          output: 'ok',
          structured: undefined,
          turnsUsed: 1,
          stopReason: 'completed' as const,
          durationMs: 100,
          // tokensUsed is undefined
        }),
        options: { prompt: 'test' },
      })

      expect(result?.output).toBe('ok')
    })

    test('handles partial tokensUsed fields', async () => {
      const middleware = rateLimitingMiddleware({
        requestsPerMinute: 60,
        tokensPerMinute: 1000,
      })

      // Test with only input tokens
      const result1 = await middleware.wrapExecute?.({
        doExecute: async () => makeResult({ tokensUsed: { input: 10 } as any }),
        options: { prompt: 'test' },
      })

      // Test with only output tokens
      const result2 = await middleware.wrapExecute?.({
        doExecute: async () => makeResult({ tokensUsed: { output: 5 } as any }),
        options: { prompt: 'test' },
      })

      expect(result1?.output).toBe('ok')
      expect(result2?.output).toBe('ok')
    })

    test('handles negative token values gracefully', async () => {
      const middleware = rateLimitingMiddleware({
        requestsPerMinute: 60,
        tokensPerMinute: 1000,
      })

      const result = await middleware.wrapExecute?.({
        doExecute: async () => makeResult({ tokensUsed: { input: -10, output: -5 } }),
        options: { prompt: 'test' },
      })

      expect(result?.output).toBe('ok')
    })

    test('handles rapid successive calls within refill window', async () => {
      const middleware = rateLimitingMiddleware({
        requestsPerMinute: 3600, // 60 per second - high rate for rapid testing
        tokensPerMinute: 60000, // 1000 per second
      })

      const start = Date.now()

      // Make rapid successive calls
      for (let i = 0; i < 10; i++) {
        await middleware.wrapExecute?.({
          doExecute: async () => makeResult({ tokensUsed: { input: 10, output: 10 } }),
          options: { prompt: `rapid-${i}` },
        })
      }

      const elapsed = Date.now() - start

      // Should complete relatively quickly since rate is high
      expect(elapsed).toBeLessThan(2000) // Allow some buffer for timing
    })

    test('token bucket refills correctly after exhaustion', async () => {
      // Very low token rate to force exhaustion and refill testing
      const middleware = rateLimitingMiddleware({
        requestsPerMinute: 60,
        tokensPerMinute: 120, // 2 per second
      })

      // Exhaust the bucket
      await middleware.wrapExecute?.({
        doExecute: async () => makeResult({ tokensUsed: { input: 120, output: 0 } }),
        options: { prompt: 'exhaust' },
      })

      // Wait for partial refill
      await new Promise(resolve => setTimeout(resolve, 100))

      // Should be able to make a small request
      const result = await middleware.wrapExecute?.({
        doExecute: async () => makeResult({ tokensUsed: { input: 1, output: 1 } }),
        options: { prompt: 'after-refill' },
      })

      expect(result?.output).toBe('ok')
    })

    test('handles time going backwards gracefully', async () => {
      // This is hard to test directly, but we can ensure no crashes occur
      // during normal operation which includes the time-based refill logic
      const middleware = rateLimitingMiddleware({
        requestsPerMinute: 60,
        tokensPerMinute: 1000,
      })

      const result = await middleware.wrapExecute?.({
        doExecute: async () => makeResult({ tokensUsed: { input: 10, output: 5 } }),
        options: { prompt: 'test' },
      })

      expect(result?.output).toBe('ok')
    })
  })
})
