import { describe, test, expect, mock } from 'bun:test'
import { ThrottleController } from './throttle.js'
import type { RateLimitMonitor } from './monitor.js'
import type { RateLimitStatus } from './types.js'

function createMockMonitor(overrides: {
  capacity?: { requests: number; inputTokens: number; outputTokens: number; overall: number }
  status?: Partial<RateLimitStatus>
  resetMs?: number
} = {}): RateLimitMonitor {
  const defaultCapacity = { requests: 1, inputTokens: 1, outputTokens: 1, overall: 1 }
  const capacity = overrides.capacity ?? defaultCapacity

  const now = new Date()
  const resetTime = new Date(now.getTime() + (overrides.resetMs ?? 1000))
  const defaultStatus: RateLimitStatus = {
    provider: 'anthropic',
    model: 'claude-sonnet-4',
    requests: { limit: 100, remaining: 80, resetsAt: resetTime },
    inputTokens: { limit: 1_000_000, remaining: 800_000, resetsAt: resetTime },
    outputTokens: { limit: 100_000, remaining: 90_000, resetsAt: resetTime },
    lastQueried: now,
    stale: false,
    ...overrides.status,
  }

  return {
    getRemainingCapacity: mock(async () => capacity),
    getStatus: mock(async () => defaultStatus),
  } as unknown as RateLimitMonitor
}

describe('ThrottleController', () => {
  describe('acquire with sufficient capacity', () => {
    test('returns 0 delay when capacity is full', async () => {
      const monitor = createMockMonitor({ capacity: { requests: 1, inputTokens: 1, outputTokens: 1, overall: 1 } })
      const controller = new ThrottleController(monitor)

      const delay = await controller.acquire('anthropic', 'claude-sonnet-4')
      expect(delay).toBe(0)
    })

    test('returns 0 delay when above target utilization', async () => {
      const monitor = createMockMonitor({ capacity: { requests: 0.5, inputTokens: 0.5, outputTokens: 0.5, overall: 0.5 } })
      const controller = new ThrottleController(monitor, { targetUtilization: 0.8 })

      const delay = await controller.acquire('anthropic', 'claude-sonnet-4')
      expect(delay).toBe(0)
    })

    test('returns 0 delay when capacity is high', async () => {
      const monitor = createMockMonitor({ capacity: { requests: 0.9, inputTokens: 0.9, outputTokens: 0.9, overall: 0.9 } })
      const controller = new ThrottleController(monitor)

      const delay = await controller.acquire('anthropic', 'claude-sonnet-4')
      expect(delay).toBe(0)
    })
  })

  describe('acquire with low capacity', () => {
    test('calls monitor.getRemainingCapacity', async () => {
      const monitor = createMockMonitor({ capacity: { requests: 0.5, inputTokens: 0.5, outputTokens: 0.5, overall: 0.5 } })
      const controller = new ThrottleController(monitor, { targetUtilization: 0.8 })

      await controller.acquire('anthropic', 'claude-sonnet-4')
      expect(monitor.getRemainingCapacity).toHaveBeenCalledWith('anthropic', 'claude-sonnet-4')
    })

    test('respects minDelayMs', async () => {
      const monitor = createMockMonitor({ capacity: { requests: 0.5, inputTokens: 0.5, outputTokens: 0.5, overall: 0.5 } })
      const controller = new ThrottleController(monitor, { minDelayMs: 50 })

      const delay = await controller.acquire('anthropic', 'claude-sonnet-4')
      expect(delay).toBeGreaterThanOrEqual(0)
    })

    test('delays on consecutive calls when capacity is low', async () => {
      const monitor = createMockMonitor({ capacity: { requests: 0.1, inputTokens: 0.1, outputTokens: 0.1, overall: 0.1 } })
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

    test('different backoff strategies produce different calculations', async () => {
      const monitor = createMockMonitor({ capacity: { requests: 0.05, inputTokens: 0.05, outputTokens: 0.05, overall: 0.05 } })

      const linearController = new ThrottleController(monitor, {
        backoffStrategy: 'linear',
        targetUtilization: 0.8,
      })
      const exponentialController = new ThrottleController(monitor, {
        backoffStrategy: 'exponential',
        targetUtilization: 0.8,
      })

      await linearController.acquire('anthropic', 'claude-sonnet-4')
      await exponentialController.acquire('anthropic', 'claude-sonnet-4')

      expect(linearController['config'].backoffStrategy).toBe('linear')
      expect(exponentialController['config'].backoffStrategy).toBe('exponential')
    })

    test('linear backoff produces lower delays than exponential', async () => {
      const monitor = createMockMonitor({ capacity: { requests: 0.1, inputTokens: 0.1, outputTokens: 0.1, overall: 0.1 } })
      
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

  describe('acquire with exhausted capacity', () => {
    test('calls getStatus when capacity exhausted and blockOnLimit is true', async () => {
      const resetTime = Date.now() + 50
      const monitor = createMockMonitor({
        capacity: { requests: 0, inputTokens: 0, outputTokens: 0, overall: 0 },
        status: {
          requests: { limit: 100, remaining: 0, resetsAt: new Date(resetTime) },
          inputTokens: { limit: 1_000_000, remaining: 0, resetsAt: new Date(resetTime) },
          outputTokens: { limit: 100_000, remaining: 0, resetsAt: new Date(resetTime) },
        },
      })

      const controller = new ThrottleController(monitor, { blockOnLimit: true })
      await controller.acquire('anthropic', 'claude-sonnet-4')

      expect(monitor.getStatus).toHaveBeenCalledWith('anthropic', 'claude-sonnet-4')
    })

    test('throws when blockOnLimit is false', async () => {
      const monitor = createMockMonitor({ capacity: { requests: 0, inputTokens: 0, outputTokens: 0, overall: 0 } })
      const controller = new ThrottleController(monitor, { blockOnLimit: false })

      await expect(controller.acquire('anthropic', 'claude-sonnet-4')).rejects.toThrow(
        'Rate limit exceeded for anthropic/claude-sonnet-4'
      )
    })
  })

  describe('request spacing', () => {
    test('updates lastRequestTime after acquire', async () => {
      const monitor = createMockMonitor({ capacity: { requests: 1, inputTokens: 1, outputTokens: 1, overall: 1 } })
      const controller = new ThrottleController(monitor)

      expect(controller['lastRequestTime']).toBe(0)

      await controller.acquire('anthropic', 'claude-sonnet-4')
      expect(controller['lastRequestTime']).toBeGreaterThan(0)
    })
  })
})
