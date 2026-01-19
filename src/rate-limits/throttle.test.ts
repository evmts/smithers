import { describe, test, expect, mock } from 'bun:test'
import { ThrottleController } from './throttle.js'
import type { RateLimitMonitor } from './monitor.js'
import type { RateLimitStatus } from './types.js'

function createMockMonitor(capacity: number, resetMs = 1000): RateLimitMonitor {
  const now = new Date()
  const resetAt = new Date(Date.now() + resetMs)
  
  return {
    getRemainingCapacity: mock(async () => ({
      requests: capacity,
      inputTokens: capacity,
      outputTokens: capacity,
      overall: capacity,
    })),
    getStatus: mock(async (): Promise<RateLimitStatus> => ({
      provider: 'anthropic',
      model: 'claude-sonnet-4',
      requests: { limit: 1000, remaining: 0, resetsAt: resetAt },
      inputTokens: { limit: 100000, remaining: 0, resetsAt: resetAt },
      outputTokens: { limit: 50000, remaining: 0, resetsAt: resetAt },
      lastQueried: now,
      stale: false,
    })),
  } as unknown as RateLimitMonitor
}

describe('ThrottleController', () => {
  test('acquire returns 0 delay when capacity is high', async () => {
    const monitor = createMockMonitor(0.9)
    const controller = new ThrottleController(monitor)

    const delay = await controller.acquire('anthropic', 'claude-sonnet-4')
    expect(delay).toBe(0)
  })

  test('acquire delays on consecutive calls when capacity is low', async () => {
    const monitor = createMockMonitor(0.1)
    const controller = new ThrottleController(monitor, {
      targetUtilization: 0.8,
      minDelayMs: 10,
      maxDelayMs: 30,
    })

    await controller.acquire('anthropic', 'claude-sonnet-4')
    const start = Date.now()
    await controller.acquire('anthropic', 'claude-sonnet-4')
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(10)
  })

  test('throws when capacity is 0 and blockOnLimit is false', async () => {
    const monitor = createMockMonitor(0)
    const controller = new ThrottleController(monitor, { blockOnLimit: false })

    await expect(controller.acquire('anthropic', 'claude-sonnet-4')).rejects.toThrow(
      'Rate limit exceeded'
    )
  })

  test('linear backoff produces lower delays than exponential', async () => {
    const monitor = createMockMonitor(0.1)
    
    const linearController = new ThrottleController(monitor, {
      backoffStrategy: 'linear',
      minDelayMs: 0,
      maxDelayMs: 1000,
    })
    
    const expController = new ThrottleController(monitor, {
      backoffStrategy: 'exponential',
      minDelayMs: 0,
      maxDelayMs: 1000,
    })

    const linearDelay = await linearController.acquire('anthropic', 'claude-sonnet-4')
    const expDelay = await expController.acquire('anthropic', 'claude-sonnet-4')

    expect(linearDelay).toBeLessThanOrEqual(expDelay)
  })
})
