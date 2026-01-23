import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { renderHook, act } from '@testing-library/react'
import { createElement } from 'react'
import { useIterationTimeout } from '../../src/hooks/useIterationTimeout.js'
import { SmithersProvider } from '../../src/components/SmithersProvider.js'
import { SmithersDB } from '../../src/db/index.js'
import { clearIterationTimeout } from '../../src/orchestrator/timeout.js'

// Mock SmithersDB for testing
const createMockDB = (): SmithersDB => {
  const state = new Map()

  return {
    state: {
      get: (key: string) => state.get(key),
      set: (key: string, value: any, source?: string) => {
        state.set(key, value)
      }
    },
    db: {
      prepare: () => ({
        get: () => null,
        all: () => []
      }),
      exec: () => {},
      run: () => ({ changes: 0, lastInsertRowid: 0 })
    }
  } as any
}

const TestWrapper = ({ children, db }: { children: any, db: SmithersDB }) =>
  createElement(SmithersProvider, {
    db,
    executionId: 'test-execution',
    config: { maxIterations: 10 }
  }, children)

describe('useIterationTimeout', () => {
  let mockDB: SmithersDB

  beforeEach(() => {
    mockDB = createMockDB()
    clearIterationTimeout()
  })

  afterEach(() => {
    clearIterationTimeout()
  })

  test('should return default configuration', () => {
    const { result } = renderHook(
      () => useIterationTimeout(),
      {
        wrapper: ({ children }) => createElement(TestWrapper, { children, db: mockDB })
      }
    )

    expect(result.current.config.timeoutMs).toBe(1000)
    expect(result.current.config.enabled).toBe(false)
    expect(result.current.isEnabled).toBe(false)
  })

  test('should use initial configuration', () => {
    const initialConfig = {
      timeoutMs: 500,
      enabled: true
    }

    const { result } = renderHook(
      () => useIterationTimeout(initialConfig),
      {
        wrapper: ({ children }) => createElement(TestWrapper, { children, db: mockDB })
      }
    )

    expect(result.current.config.timeoutMs).toBe(500)
    expect(result.current.config.enabled).toBe(true)
    expect(result.current.isEnabled).toBe(true)
  })

  test('should update configuration', () => {
    const { result } = renderHook(
      () => useIterationTimeout({ timeoutMs: 100, enabled: false }),
      {
        wrapper: ({ children }) => createElement(TestWrapper, { children, db: mockDB })
      }
    )

    act(() => {
      result.current.updateConfig({ enabled: true, timeoutMs: 200 })
    })

    expect(result.current.config.enabled).toBe(true)
    expect(result.current.config.timeoutMs).toBe(200)
    expect(result.current.isEnabled).toBe(true)
  })

  test('should validate configuration updates', () => {
    const { result } = renderHook(
      () => useIterationTimeout(),
      {
        wrapper: ({ children }) => createElement(TestWrapper, { children, db: mockDB })
      }
    )

    expect(() => {
      act(() => {
        result.current.updateConfig({ timeoutMs: -100 })
      })
    }).toThrow('Timeout must be non-negative')
  })

  test('should provide waitForTimeout function', async () => {
    const { result } = renderHook(
      () => useIterationTimeout({ timeoutMs: 50, enabled: true }),
      {
        wrapper: ({ children }) => createElement(TestWrapper, { children, db: mockDB })
      }
    )

    const start = Date.now()
    await act(async () => {
      await result.current.waitForTimeout()
    })
    const elapsed = Date.now() - start

    expect(elapsed).toBeGreaterThanOrEqual(45)
    expect(elapsed).toBeLessThan(100)
  })

  test('should not delay when disabled', async () => {
    const { result } = renderHook(
      () => useIterationTimeout({ timeoutMs: 100, enabled: false }),
      {
        wrapper: ({ children }) => createElement(TestWrapper, { children, db: mockDB })
      }
    )

    const start = Date.now()
    await act(async () => {
      await result.current.waitForTimeout()
    })
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(50)
  })

  test('should handle concurrent timeout calls', async () => {
    const { result } = renderHook(
      () => useIterationTimeout({ timeoutMs: 50, enabled: true }),
      {
        wrapper: ({ children }) => createElement(TestWrapper, { children, db: mockDB })
      }
    )

    const start = Date.now()

    await act(async () => {
      await Promise.all([
        result.current.waitForTimeout(),
        result.current.waitForTimeout(),
        result.current.waitForTimeout()
      ])
    })

    const elapsed = Date.now() - start

    // Should complete in roughly one timeout period since they share state
    expect(elapsed).toBeGreaterThanOrEqual(45)
    expect(elapsed).toBeLessThan(100)
  })
})