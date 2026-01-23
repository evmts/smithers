import { describe, test, expect, jest, beforeEach, afterEach } from 'bun:test'
import { sleep } from '../../src/utils/sleep'

describe('sleep utility', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('should resolve after specified milliseconds', async () => {
    const duration = 1000
    const sleepPromise = sleep(duration)

    // Fast forward time
    jest.advanceTimersByTime(duration)

    await expect(sleepPromise).resolves.toBeUndefined()
  })

  test('should not resolve before specified time', async () => {
    const duration = 1000
    const sleepPromise = sleep(duration)

    // Advance time by less than duration
    jest.advanceTimersByTime(duration - 1)

    // Promise should still be pending
    const resolved = await Promise.race([
      sleepPromise.then(() => true),
      Promise.resolve(false)
    ])

    expect(resolved).toBe(false)
  })

  test('should handle zero duration', async () => {
    const sleepPromise = sleep(0)
    jest.advanceTimersByTime(0)
    await expect(sleepPromise).resolves.toBeUndefined()
  })

  test('should handle negative duration as zero', async () => {
    const sleepPromise = sleep(-100)
    jest.advanceTimersByTime(0)
    await expect(sleepPromise).resolves.toBeUndefined()
  })

  test('should work with real timers for small durations', async () => {
    jest.useRealTimers()
    const start = Date.now()
    await sleep(10)
    const end = Date.now()

    // Allow some tolerance for timer precision
    expect(end - start).toBeGreaterThanOrEqual(8)
  })
})