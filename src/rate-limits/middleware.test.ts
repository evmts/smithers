import { describe, test, expect, mock } from 'bun:test'
import { rateLimitingMiddleware } from './middleware.js'
import type { RateLimitMonitor } from './monitor.js'
import type { RateLimitStatus } from './types.js'
import type { AgentResult } from '../components/agents/types.js'

function createMockMonitor(overrides: {
  capacity?: { requests: number; inputTokens: number; outputTokens: number; overall: number }
  status?: Partial<RateLimitStatus>
} = {}): RateLimitMonitor {
  const defaultCapacity = { requests: 1, inputTokens: 1, outputTokens: 1, overall: 1 }
  const capacity = overrides.capacity ?? defaultCapacity

  const now = new Date()
  const defaultStatus: RateLimitStatus = {
    provider: 'anthropic',
    model: 'claude-sonnet-4',
    requests: { limit: 100, remaining: 80, resetsAt: new Date(now.getTime() + 1000) },
    inputTokens: { limit: 1_000_000, remaining: 800_000, resetsAt: new Date(now.getTime() + 1000) },
    outputTokens: { limit: 100_000, remaining: 90_000, resetsAt: new Date(now.getTime() + 1000) },
    lastQueried: now,
    stale: false,
    ...overrides.status,
  }

  return {
    getRemainingCapacity: mock(async () => capacity),
    getStatus: mock(async () => defaultStatus),
  } as unknown as RateLimitMonitor
}

function createMockResult(): AgentResult {
  return {
    output: 'test output',
    cost: { input: 0.01, output: 0.02, total: 0.03 },
  }
}

describe('rateLimitingMiddleware', () => {
  test('has correct name', () => {
    const monitor = createMockMonitor()
    const middleware = rateLimitingMiddleware({ monitor })

    expect(middleware.name).toBe('rate-limiting')
  })

  test('wrapExecute calls doExecute', async () => {
    const monitor = createMockMonitor()
    const middleware = rateLimitingMiddleware({ monitor })

    const doExecute = mock(async () => createMockResult())
    const result = await middleware.wrapExecute!({
      doExecute,
      options: { prompt: 'test', model: 'claude-sonnet-4' },
    })

    expect(doExecute).toHaveBeenCalled()
    expect(result.output).toBe('test output')
  })

  test('uses default anthropic provider when modelToProvider not provided', async () => {
    const monitor = createMockMonitor()
    const middleware = rateLimitingMiddleware({ monitor })

    await middleware.wrapExecute!({
      doExecute: async () => createMockResult(),
      options: { prompt: 'test', model: 'some-model' },
    })

    expect(monitor.getRemainingCapacity).toHaveBeenCalledWith('anthropic', 'some-model')
  })

  test('uses custom modelToProvider mapping', async () => {
    const monitor = createMockMonitor()
    const middleware = rateLimitingMiddleware({
      monitor,
      modelToProvider: (model) => (model.startsWith('gpt') ? 'openai' : 'anthropic'),
    })

    await middleware.wrapExecute!({
      doExecute: async () => createMockResult(),
      options: { prompt: 'test', model: 'gpt-4' },
    })

    expect(monitor.getRemainingCapacity).toHaveBeenCalledWith('openai', 'gpt-4')
  })

  test('defaults to sonnet when model not specified', async () => {
    const monitor = createMockMonitor()
    const middleware = rateLimitingMiddleware({ monitor })

    await middleware.wrapExecute!({
      doExecute: async () => createMockResult(),
      options: { prompt: 'test' },
    })

    expect(monitor.getRemainingCapacity).toHaveBeenCalledWith('anthropic', 'sonnet')
  })

  test('applies throttle delay when capacity is low', async () => {
    // capacity 0.05 < (1 - 0.8) = 0.2, triggers delay
    const monitor = createMockMonitor({
      capacity: { requests: 0.05, inputTokens: 0.05, outputTokens: 0.05, overall: 0.05 },
    })
    const middleware = rateLimitingMiddleware({
      monitor,
      throttle: { targetUtilization: 0.8, minDelayMs: 50, maxDelayMs: 200 },
    })

    const startTime = Date.now()
    await middleware.wrapExecute!({
      doExecute: async () => createMockResult(),
      options: { prompt: 'test', model: 'claude-sonnet-4' },
    })
    const elapsed = Date.now() - startTime

    expect(elapsed).toBeGreaterThanOrEqual(40)
  })

  test('no delay when capacity is full', async () => {
    const monitor = createMockMonitor({
      capacity: { requests: 1, inputTokens: 1, outputTokens: 1, overall: 1 },
    })
    const middleware = rateLimitingMiddleware({ monitor })

    const startTime = Date.now()
    await middleware.wrapExecute!({
      doExecute: async () => createMockResult(),
      options: { prompt: 'test', model: 'claude-sonnet-4' },
    })
    const elapsed = Date.now() - startTime

    expect(elapsed).toBeLessThan(50)
  })

  test('propagates errors from doExecute', async () => {
    const monitor = createMockMonitor()
    const middleware = rateLimitingMiddleware({ monitor })

    await expect(
      middleware.wrapExecute!({
        doExecute: async () => {
          throw new Error('Execution failed')
        },
        options: { prompt: 'test', model: 'claude-sonnet-4' },
      })
    ).rejects.toThrow('Execution failed')
  })

  test('throws when rate limit exceeded and blockOnLimit is false', async () => {
    const monitor = createMockMonitor({
      capacity: { requests: 0, inputTokens: 0, outputTokens: 0, overall: 0 },
    })
    const middleware = rateLimitingMiddleware({
      monitor,
      throttle: { blockOnLimit: false },
    })

    await expect(
      middleware.wrapExecute!({
        doExecute: async () => createMockResult(),
        options: { prompt: 'test', model: 'claude-sonnet-4' },
      })
    ).rejects.toThrow('Rate limit exceeded')
  })
})
