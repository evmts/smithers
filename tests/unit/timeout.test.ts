import { describe, expect, test, beforeEach } from 'bun:test'
import { createIterationTimeout, clearIterationTimeout, type IterationTimeoutConfig } from '../../src/orchestrator/timeout.js'

describe('Iteration Timeout', () => {
  const mockPromise = () => new Promise(resolve => setTimeout(resolve, 100))

  beforeEach(() => {
    // Clear any active timeouts
    clearIterationTimeout()
  })

  describe('createIterationTimeout', () => {
    test('should delay execution for specified timeout', async () => {
      const config: IterationTimeoutConfig = {
        timeoutMs: 50,
        enabled: true
      }

      const start = Date.now()
      await createIterationTimeout(config)
      const elapsed = Date.now() - start

      expect(elapsed).toBeGreaterThanOrEqual(45) // Account for timer precision
      expect(elapsed).toBeLessThan(100)
    })

    test('should not delay when disabled', async () => {
      const config: IterationTimeoutConfig = {
        timeoutMs: 100,
        enabled: false
      }

      const start = Date.now()
      await createIterationTimeout(config)
      const elapsed = Date.now() - start

      expect(elapsed).toBeLessThan(50)
    })

    test('should not delay when timeout is 0', async () => {
      const config: IterationTimeoutConfig = {
        timeoutMs: 0,
        enabled: true
      }

      const start = Date.now()
      await createIterationTimeout(config)
      const elapsed = Date.now() - start

      expect(elapsed).toBeLessThan(50)
    })

    test('should be cancellable', async () => {
      const config: IterationTimeoutConfig = {
        timeoutMs: 200,
        enabled: true
      }

      const timeoutPromise = createIterationTimeout(config)

      // Cancel after a short delay
      setTimeout(() => clearIterationTimeout(), 50)

      const start = Date.now()
      await timeoutPromise
      const elapsed = Date.now() - start

      expect(elapsed).toBeLessThan(100) // Should complete early due to cancellation
    })

    test('should handle multiple concurrent calls safely', async () => {
      const config: IterationTimeoutConfig = {
        timeoutMs: 50,
        enabled: true
      }

      const start = Date.now()

      // Start multiple timeouts - only the latest should be active
      const promises = [
        createIterationTimeout(config),
        createIterationTimeout(config),
        createIterationTimeout(config)
      ]

      await Promise.all(promises)
      const elapsed = Date.now() - start

      expect(elapsed).toBeGreaterThanOrEqual(45)
      expect(elapsed).toBeLessThan(100)
    })
  })

  describe('clearIterationTimeout', () => {
    test('should clear active timeout', async () => {
      const config: IterationTimeoutConfig = {
        timeoutMs: 200,
        enabled: true
      }

      const timeoutPromise = createIterationTimeout(config)
      clearIterationTimeout()

      const start = Date.now()
      await timeoutPromise
      const elapsed = Date.now() - start

      expect(elapsed).toBeLessThan(100) // Should complete immediately
    })

    test('should be safe to call when no timeout is active', () => {
      expect(() => clearIterationTimeout()).not.toThrow()
    })
  })

  describe('integration scenarios', () => {
    test('should work with Ralph loop throttling', async () => {
      const config: IterationTimeoutConfig = {
        timeoutMs: 25,
        enabled: true
      }

      const iterations = 3
      const start = Date.now()

      // Simulate Ralph iterations
      for (let i = 0; i < iterations; i++) {
        await createIterationTimeout(config)
        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      const elapsed = Date.now() - start
      const expectedMinTime = iterations * 25 + iterations * 10 - 20 // Account for precision

      expect(elapsed).toBeGreaterThanOrEqual(expectedMinTime)
    })

    test('should prevent runaway costs by throttling iterations', async () => {
      const config: IterationTimeoutConfig = {
        timeoutMs: 100,
        enabled: true
      }

      const maxIterations = 5
      const maxAllowedTime = maxIterations * 150 // 100ms timeout + 50ms buffer per iteration

      const start = Date.now()

      for (let i = 0; i < maxIterations; i++) {
        await createIterationTimeout(config)
      }

      const elapsed = Date.now() - start

      expect(elapsed).toBeLessThan(maxAllowedTime * 2) // Ensure we're not taking unreasonably long
      expect(elapsed).toBeGreaterThanOrEqual(maxIterations * 90) // But we are throttling
    })
  })
})