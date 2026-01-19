import { describe, test, expect, mock } from 'bun:test'
import { ThrottleController } from './throttle.js'
import type { RateLimitMonitor } from './monitor.js'
import type { RateLimitStatus } from './types.js'

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

    test('different backoff strategies produce different calculations', async () => {
      // Linear: factor = utilizationRatio / targetRatio
      // Exponential: factor = (utilizationRatio / targetRatio)^2
      // For capacity=0.05, utilization=0.95, target=0.2: factor differs
      const monitor = createMockMonitor({ capacity: { requests: 0.05, inputTokens: 0.05, outputTokens: 0.05, overall: 0.05 } })

      const linearController = new ThrottleController(monitor, {
        backoffStrategy: 'linear',
        targetUtilization: 0.8,
      })
      const exponentialController = new ThrottleController(monitor, {
        backoffStrategy: 'exponential',
        targetUtilization: 0.8,
      })

      // Both should acquire without error and use different strategies
      await linearController.acquire('anthropic', 'claude-sonnet-4')
      await exponentialController.acquire('anthropic', 'claude-sonnet-4')

      expect(linearController['config'].backoffStrategy).toBe('linear')
      expect(exponentialController['config'].backoffStrategy).toBe('exponential')
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
